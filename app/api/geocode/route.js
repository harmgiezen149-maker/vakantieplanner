import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// Simpele in-memory rate limiter per server instance
const recentRequests = new Map();
function rateLimitOK(ip) {
  const now = Date.now();
  const arr = (recentRequests.get(ip) || []).filter(t => now - t < 60_000);
  if (arr.length >= 30) return false;
  arr.push(now);
  recentRequests.set(ip, arr);
  return true;
}

const NOMINATIM_HEADERS = {
  'User-Agent': 'VakantiePlanner/1.0 (familie-vakantie planner)',
  'Accept-Language': 'nl,en,fr,de',
};

// Reverse geocoding: coördinaten → land. Gebruikt door het verblijvenlogboek
// om het land automatisch af te leiden uit de locatie van een verblijf.
// Accept-Language zorgt dat er "Frankrijk" terugkomt en niet "France".
async function reverse(lat, lng) {
  const url = 'https://nominatim.openstreetmap.org/reverse?' +
    `lat=${lat}&lon=${lng}&format=json&zoom=5&addressdetails=1`;
  const res = await fetch(url, { headers: NOMINATIM_HEADERS });
  if (!res.ok) {
    return NextResponse.json({ error: `OpenStreetMap fout ${res.status}` }, { status: 502 });
  }
  const raw = await res.json();
  const addr = raw?.address || {};
  return NextResponse.json({
    country: addr.country || null,
    countryCode: addr.country_code ? String(addr.country_code).toUpperCase() : null,
    label: raw?.display_name || null,
  });
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get('q') || '').trim();
  const latRaw = searchParams.get('lat');
  const lngRaw = searchParams.get('lng');

  const ip = request.headers.get('x-forwarded-for') || 'unknown';

  // Reverse-modus: ?lat=&lng=
  if (latRaw != null && lngRaw != null) {
    const lat = Number(latRaw);
    const lng = Number(lngRaw);
    if (!isFinite(lat) || !isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      return NextResponse.json({ error: 'Ongeldige coördinaten' }, { status: 400 });
    }
    if (!rateLimitOK(ip)) {
      return NextResponse.json({ error: 'Te veel zoekopdrachten, wacht even.' }, { status: 429 });
    }
    try {
      return await reverse(lat, lng);
    } catch (e) {
      return NextResponse.json({ error: e.message }, { status: 500 });
    }
  }

  if (!q || q.length < 2) {
    return NextResponse.json({ results: [] });
  }

  if (!rateLimitOK(ip)) {
    return NextResponse.json({ error: 'Te veel zoekopdrachten, wacht even.' }, { status: 429 });
  }

  try {
    // Wereldwijd zoeken — generieke planner, geen landenbeperking
    const url = `https://nominatim.openstreetmap.org/search?` +
      `q=${encodeURIComponent(q)}` +
      `&format=json&limit=6&addressdetails=1`;

    const res = await fetch(url, { headers: NOMINATIM_HEADERS });

    if (!res.ok) {
      return NextResponse.json({ error: `OpenStreetMap fout ${res.status}` }, { status: 502 });
    }

    const raw = await res.json();
    const results = raw.map(r => ({
      name: r.display_name,
      shortName: r.name || r.display_name.split(',')[0],
      lat: parseFloat(r.lat),
      lng: parseFloat(r.lon),
      type: r.type,
      address: r.address || {},
    }));

    return NextResponse.json({ results });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
