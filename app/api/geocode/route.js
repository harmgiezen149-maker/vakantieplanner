import { NextResponse } from 'next/server';
import { cacheSleutel, uitCache, naarCache, TTL } from '@/lib/geoCache';

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
  // Eén decimaal (~11 km) is ruim genoeg: we vragen alleen naar het land
  // (zoom=5), en dat verandert niet binnen zo'n vak. Het scheelt het
  // verblijvenlogboek een hoop wachten, want dat werkt bestaande verblijven
  // sequentieel bij met ~1,1 s ertussen (Nominatim: 1 verzoek per seconde).
  const sleutel = cacheSleutel('reverse', [lat, lng], 1);
  const bewaard = await uitCache(sleutel);
  if (bewaard) return NextResponse.json(bewaard);

  const url = 'https://nominatim.openstreetmap.org/reverse?' +
    `lat=${lat}&lon=${lng}&format=json&zoom=5&addressdetails=1`;
  const res = await fetch(url, { headers: NOMINATIM_HEADERS });
  if (!res.ok) {
    return NextResponse.json({ error: `OpenStreetMap fout ${res.status}` }, { status: 502 });
  }
  const raw = await res.json();
  const addr = raw?.address || {};
  const payload = {
    country: addr.country || null,
    countryCode: addr.country_code ? String(addr.country_code).toUpperCase() : null,
    label: raw?.display_name || null,
  };
  // Alleen bewaren als er echt een land uit kwam; een leeg antwoord wil je
  // niet een half jaar vasthouden.
  if (payload.country) await naarCache(sleutel, payload, TTL.reverse);
  return NextResponse.json(payload);
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

  const sleutel = cacheSleutel('geocode', [q]);
  const bewaard = await uitCache(sleutel);
  if (bewaard) return NextResponse.json(bewaard);

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

    // Nul resultaten niet bewaren: dat is vaak een half ingetypte zoekterm.
    if (results.length) await naarCache(sleutel, { results }, TTL.geocode);
    return NextResponse.json({ results });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
