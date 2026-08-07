// Wandelroutes rond een punt, via OpenStreetMap route-relaties (route=hiking
// / route=foot). Geeft naam, lengte (km) en geschatte wandeltijd terug.
//
// POST { lat, lng, rMin, rMax } → { routes: [{ name, lengthKm, durationMin,
//   coords: [lat,lng] (startpunt), distKm, network, symbol, website }] }

import { cacheSleutel, uitCache, naarCache, TTL } from '@/lib/geoCache';

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
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass.osm.ch/api/interpreter',
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

async function overpassQuery(query, errors) {
  for (const endpoint of shuffled(OVERPASS_ENDPOINTS)) {
    const host = new URL(endpoint).hostname;
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'VakantiePlanner/1.0 (familie-vakantieplanner)',
        },
        body: 'data=' + encodeURIComponent(query),
        signal: AbortSignal.timeout(13_000),
      });
      if (!res.ok) { errors?.push(`${host}: ${res.status}`); continue; }
      return await res.json();
    } catch (err) {
      const msg = String(err?.message ?? err).toLowerCase().includes('abort') ? 'timeout' : String(err?.message ?? err);
      errors?.push(`${host}: ${msg}`);
    }
  }
  return null;
}

// Fase 1 (snel, betrouwbaar): routes + tags + zwaartepunt, zonder geometrie.
async function fetchHikingRoutes(lat, lng, radiusM, errors) {
  const around = `(around:${radiusM},${lat},${lng})`;
  const query = `
[out:json][timeout:12];
(
  relation["route"~"^(hiking|foot)$"]["name"]${around};
);
out tags center 80;`;
  return overpassQuery(query, errors);
}

// Fase 2 (zwaarder, optioneel): geometrie van specifieke relaties ophalen.
async function fetchGeometry(ids) {
  if (ids.length === 0) return null;
  const idList = ids.join(',');
  const query = `
[out:json][timeout:12];
relation(id:${idList});
out geom;`;
  return overpassQuery(query);
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

  // Cachesleutel op de geklemde waarden, niet op de ruwe invoer — anders
  // krijgen rMax=99999 en rMax=50000 twee sleutels voor hetzelfde antwoord.
  const sleutel = cacheSleutel('hiking', [lat, lng, rMinKm, rMax]);
  const bewaard = await uitCache(sleutel);
  if (bewaard) return Response.json(bewaard);

  const errors = [];
  const data = await fetchHikingRoutes(lat, lng, rMax, errors);
  if (!data) {
    return Response.json({ error: 'overpass_failed', detail: errors.join(' | ') }, { status: 502 });
  }

  const seen = new Set();
  let routes = [];
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
    const tagLengthKm = parseLengthKm(tags);
    routes.push({
      id: el.id,
      name: name.slice(0, 90),
      lengthKm: tagLengthKm ? Math.round(tagLengthKm * 10) / 10 : null,
      lengthEstimated: false,
      durationMin: estimateMinutes(tagLengthKm),
      coords: [cLat, cLng],
      distKm: Math.round(distKm * 10) / 10,
      network: toStr(tags.network) || null,
      website: toStr(tags.website || tags['contact:website']) || null,
      roundtrip: toStr(tags.roundtrip) === 'yes',
      segments: null,
    });
  }

  // Sorteer op nabijheid en beperk tot een werkbaar aantal
  routes.sort((a, b) => a.distKm - b.distKm);
  routes = routes.slice(0, 25);

  // Fase 2: probeer geometrie + (indien nodig) lengte toe te voegen.
  // Mislukt dit of duurt het te lang, dan tonen we gewoon de lijst zonder lijnen.
  try {
    const geom = await fetchGeometry(routes.map(r => r.id));
    if (geom) {
      const byId = new Map();
      for (const el of geom.elements || []) {
        if (el.type !== 'relation') continue;
        const segments = [];
        let geomLengthKm = 0;
        for (const m of el.members || []) {
          if (m.type !== 'way' || !Array.isArray(m.geometry)) continue;
          const pts = m.geometry
            .filter(g => g && isFinite(g.lat) && isFinite(g.lon))
            .map(g => [g.lat, g.lon]);
          if (pts.length >= 2) {
            segments.push(pts);
            for (let i = 1; i < pts.length; i++) geomLengthKm += haversineKm(pts[i - 1], pts[i]);
          }
        }
        byId.set(el.id, { segments, geomLengthKm });
      }
      routes = routes.map(r => {
        const g = byId.get(r.id);
        if (!g || g.segments.length === 0) return r;
        const start = g.segments[0][0];
        const lengthKm = r.lengthKm ?? (g.geomLengthKm > 0 ? Math.round(g.geomLengthKm * 10) / 10 : null);
        return {
          ...r,
          segments: g.segments,
          coords: start,
          lengthKm: lengthKm ? Math.round(lengthKm * 10) / 10 : null,
          lengthEstimated: r.lengthKm == null && lengthKm != null,
          durationMin: estimateMinutes(lengthKm),
        };
      });
    }
  } catch {
    // geometrie optioneel — lijst blijft bruikbaar
  }

  // Met geometrie erbij loopt dit antwoord makkelijk over het plafond van
  // geoCache; dan slaat naarCache stil over en werkt de route als vanouds.
  await naarCache(sleutel, { routes }, TTL.hiking);
  return Response.json({ routes });
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
