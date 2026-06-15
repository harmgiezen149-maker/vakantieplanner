// Wandelroutes rond een punt, via OpenStreetMap route-relaties (route=hiking
// / route=foot). Geeft naam, lengte (km) en geschatte wandeltijd terug.
//
// POST { lat, lng, rMin, rMax } → { routes: [{ name, lengthKm, durationMin,
//   coords: [lat,lng] (startpunt), distKm, network, symbol, website }] }

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

let calls = [];
function rateLimited() {
  const now = Date.now();
  calls = calls.filter(t => now - t < 60_000);
  if (calls.length >= 12) return true;
  calls.push(now);
  return false;
}

function toStr(v) {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  return '';
}

function haversineKm([lat1, lng1], [lat2, lng2]) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.osm.jp/api/interpreter',
];

function shuffled(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Lengte uit OSM-tags halen (distance is meestal in km, soms met "km"/"m")
function parseLengthKm(tags) {
  const raw = toStr(tags.distance || tags.length || tags['osmc:length']).trim();
  if (!raw) return null;
  const m = /([\d.,]+)\s*(km|m)?/i.exec(raw.replace(',', '.'));
  if (!m) return null;
  const val = parseFloat(m[1]);
  if (!isFinite(val)) return null;
  const unit = (m[2] || 'km').toLowerCase();
  return unit === 'm' ? val / 1000 : val;
}

// Wandeltijd schatten: Naismith vereenvoudigd ~ 4,5 km/u op vlak terrein.
// (Zonder hoogtedata houden we het op een nuchtere gemiddelde snelheid.)
function estimateMinutes(km) {
  if (!km) return null;
  return Math.round((km / 4.5) * 60);
}

async function fetchHikingRoutes(lat, lng, radiusM) {
  const around = `(around:${radiusM},${lat},${lng})`;
  // Relaties met route=hiking of route=foot, met een naam
  const query = `
[out:json][timeout:25];
(
  relation["route"~"^(hiking|foot)$"]["name"]${around};
);
out tags center 80;`;

  for (const endpoint of shuffled(OVERPASS_ENDPOINTS)) {
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'VakantiePlanner/1.0 (familie-vakantieplanner)',
        },
        body: 'data=' + encodeURIComponent(query),
        signal: AbortSignal.timeout(22_000),
      });
      if (!res.ok) continue;
      return await res.json();
    } catch {
      // volgende endpoint
    }
  }
  return null;
}

async function handle(request, latRaw, lngRaw, rMinRaw, rMaxRaw) {
  const expectedPin = process.env.FAMILY_PIN;
  if (expectedPin) {
    const pin = request.headers.get('X-Family-Pin')
      ?? new URL(request.url).searchParams.get('pin');
    if (pin !== expectedPin) {
      return Response.json({ error: 'unauthorized' }, { status: 401 });
    }
  }
  if (rateLimited()) {
    return Response.json({ error: 'rate_limited' }, { status: 429 });
  }

  const lat = Number(latRaw);
  const lng = Number(lngRaw);
  let rMax = Math.round(Number(rMaxRaw) || 20000);
  if (!isFinite(lat) || !isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return Response.json({ error: 'invalid_coords' }, { status: 400 });
  }
  rMax = Math.min(Math.max(rMax, 2000), 50000);
  let rMinKm = Math.max(0, Number(rMinRaw) || 0) / 1000;
  if (rMinKm * 1000 >= rMax) rMinKm = 0;

  const data = await fetchHikingRoutes(lat, lng, rMax);
  if (!data) {
    return Response.json({ error: 'overpass_failed' }, { status: 502 });
  }

  const seen = new Set();
  const routes = [];
  for (const el of data.elements || []) {
    const tags = el.tags || {};
    const name = toStr(tags.name).trim();
    if (!name || seen.has(name.toLowerCase())) continue;

    const cLat = el.center?.lat;
    const cLng = el.center?.lon;
    if (cLat == null || cLng == null) continue;

    const distKm = haversineKm([lat, lng], [cLat, cLng]);
    if (distKm < rMinKm) continue;

    seen.add(name.toLowerCase());
    const lengthKm = parseLengthKm(tags);
    routes.push({
      name: name.slice(0, 90),
      lengthKm: lengthKm ? Math.round(lengthKm * 10) / 10 : null,
      durationMin: estimateMinutes(lengthKm),
      coords: [cLat, cLng],
      distKm: Math.round(distKm * 10) / 10,
      network: toStr(tags.network) || null,           // bv. lwn/rwn/nwn
      symbol: toStr(tags['osmc:symbol'] || tags.symbol) || null,
      website: toStr(tags.website || tags['contact:website']) || null,
      roundtrip: toStr(tags.roundtrip) === 'yes',
    });
  }

  // Sorteer: routes met bekende lengte eerst (relevanter), dan op nabijheid
  routes.sort((a, b) => {
    const al = a.lengthKm == null, bl = b.lengthKm == null;
    if (al !== bl) return al ? 1 : -1;
    return a.distKm - b.distKm;
  });

  return Response.json({ routes: routes.slice(0, 40) });
}

export async function POST(request) {
  let body;
  try { body = await request.json(); }
  catch { return Response.json({ error: 'invalid_json' }, { status: 400 }); }
  return handle(request, body.lat, body.lng, body.rMin, body.rMax ?? body.radius);
}

export async function GET(request) {
  const p = new URL(request.url).searchParams;
  return handle(request, p.get('lat'), p.get('lng'), p.get('rmin'), p.get('rmax') ?? p.get('radius'));
}
