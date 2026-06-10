// Omgevingssuggesties rond een verblijf.
// Primair via Geoapify Places (GEOAPIFY_API_KEY env, gratis tier), met de
// publieke Overpass-servers (OpenStreetMap) als reserve. De publieke
// Overpass-servers weigeren of vertragen Vercel's gedeelde IP's vaak,
// vandaar dat Geoapify de aanbevolen route is — zie README.
//
// POST { lat, lng, radius } of GET ?lat=&lng=&radius=[&pin=]
// → { suggestions: [{ name, category, emoji, coords, distKm }] }

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// ── Rate limit (per serverless instance) ────────────────────────────
let calls = [];
function rateLimited() {
  const now = Date.now();
  calls = calls.filter(t => now - t < 60_000);
  if (calls.length >= 10) return true;
  calls.push(now);
  return false;
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

// ── Soorten: classificatie → app-categorie + emoji + cap ────────────
// osm: matcht op OSM-tags (Overpass); geo: matcht op Geoapify-categorieën
const KINDS = [
  { category: 'shops',   emoji: '🛒', cap: 8,
    osm: t => t.shop === 'supermarket',
    geo: c => c.includes('commercial.supermarket') },
  { category: 'food',    emoji: '🧺', cap: 5,
    osm: t => t.amenity === 'marketplace',
    geo: c => c.includes('commercial.marketplace') },
  { category: 'nature',  emoji: '🌄', cap: 10,
    osm: t => t.tourism === 'viewpoint',
    geo: c => c.some(x => x.includes('viewpoint')) },
  { category: 'culture', emoji: '🏛️', cap: 10,
    osm: t => t.tourism === 'museum',
    geo: c => c.includes('entertainment.museum') },
  { category: 'culture', emoji: '🏰', cap: 8,
    osm: t => t.historic === 'castle',
    geo: c => c.some(x => x.includes('castle')) },
  { category: 'nature',  emoji: '🦌', cap: 4,
    osm: t => t.tourism === 'zoo',
    geo: c => c.includes('entertainment.zoo') },
  { category: 'culture', emoji: '🎢', cap: 4,
    osm: t => t.tourism === 'theme_park',
    geo: c => c.includes('entertainment.theme_park') },
  { category: 'water',   emoji: '🏊', cap: 8,
    osm: t => t.leisure === 'swimming_pool' || t.leisure === 'water_park',
    geo: c => c.some(x => x.includes('swimming_pool') || x.includes('water_park')) },
  { category: 'water',   emoji: '🏖️', cap: 5,
    osm: t => t.natural === 'beach',
    geo: c => c.some(x => x === 'beach' || x.startsWith('beach.')) },
  { category: 'culture', emoji: '⭐', cap: 12,
    osm: t => t.tourism === 'attraction',
    geo: c => c.some(x => x.startsWith('tourism.attraction') || x.startsWith('tourism.sights')) },
];

// Bouw suggestielijst uit ruwe kandidaten [{name, coords, kind}]
function buildSuggestions(candidates, origin) {
  const seen = new Set();
  const perKind = new Map();
  const out = [];
  for (const c of candidates) {
    const key = c.name.toLowerCase();
    if (seen.has(key)) continue;
    const kindKey = c.kind.category + c.kind.emoji;
    const used = perKind.get(kindKey) || 0;
    if (used >= c.kind.cap) continue;
    seen.add(key);
    perKind.set(kindKey, used + 1);
    out.push({
      name: c.name.slice(0, 80),
      category: c.kind.category,
      emoji: c.kind.emoji,
      coords: c.coords,
      distKm: Math.round(haversineKm(origin, c.coords) * 10) / 10,
    });
  }
  out.sort((a, b) => a.distKm - b.distKm);
  return out.slice(0, 60);
}

// ── Bron 1: Geoapify Places ─────────────────────────────────────────
const GEOAPIFY_CATEGORIES = [
  'commercial.supermarket',
  'commercial.marketplace',
  'entertainment.museum',
  'entertainment.zoo',
  'entertainment.theme_park',
  'tourism.attraction',
  'tourism.sights',
  'sport.swimming_pool',
  'beach',
].join(',');

async function fetchGeoapify(lat, lng, radius, apiKey) {
  const url = `https://api.geoapify.com/v2/places` +
    `?categories=${encodeURIComponent(GEOAPIFY_CATEGORIES)}` +
    `&filter=circle:${lng},${lat},${radius}` +
    `&limit=300&apiKey=${apiKey}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`geoapify_${res.status}`);
  const data = await res.json();

  const candidates = [];
  for (const f of data.features || []) {
    const p = f.properties || {};
    const name = (p.name || '').trim();
    if (!name) continue;
    const cats = p.categories || [];
    const kind = KINDS.find(k => k.geo(cats));
    if (!kind) continue;
    const cLat = p.lat ?? f.geometry?.coordinates?.[1];
    const cLng = p.lon ?? f.geometry?.coordinates?.[0];
    if (cLat == null || cLng == null) continue;
    candidates.push({ name, coords: [cLat, cLng], kind });
  }
  return candidates;
}

// ── Bron 2: Overpass (reserve) ──────────────────────────────────────
const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];

function shuffled(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildOverpassQuery(lat, lng, radius) {
  const around = `(around:${radius},${lat},${lng})`;
  return `
[out:json][timeout:12];
(
  node["shop"="supermarket"]${around};
  node["amenity"="marketplace"]${around};
  node["tourism"~"^(viewpoint|museum|zoo|theme_park|attraction)$"]${around};
  way["tourism"~"^(museum|zoo|theme_park|attraction)$"]${around};
  node["historic"="castle"]${around};
  way["historic"="castle"]${around};
  node["leisure"~"^(swimming_pool|water_park)$"]["access"!="private"]["name"]${around};
  way["leisure"~"^(swimming_pool|water_park)$"]["access"!="private"]["name"]${around};
  node["natural"="beach"]["name"]${around};
  way["natural"="beach"]["name"]${around};
);
out center 400;`;
}

async function fetchOverpass(lat, lng, radius, errors) {
  const query = buildOverpassQuery(lat, lng, radius);
  for (const endpoint of shuffled(OVERPASS_ENDPOINTS)) {
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
      if (!res.ok) {
        errors.push(`${new URL(endpoint).hostname}: ${res.status}`);
        continue;
      }
      const data = await res.json();
      const candidates = [];
      for (const el of data.elements || []) {
        const tags = el.tags || {};
        const name = (tags.name || '').trim();
        if (!name) continue;
        const kind = KINDS.find(k => k.osm(tags));
        if (!kind) continue;
        const cLat = el.lat ?? el.center?.lat;
        const cLng = el.lon ?? el.center?.lon;
        if (cLat == null || cLng == null) continue;
        candidates.push({ name, coords: [cLat, cLng], kind });
      }
      return candidates;
    } catch (err) {
      const msg = String(err?.message ?? err).toLowerCase().includes('abort')
        ? 'timeout' : String(err?.message ?? err);
      errors.push(`${new URL(endpoint).hostname}: ${msg}`);
    }
  }
  return null;
}

// ── Handler ─────────────────────────────────────────────────────────
async function handle(request, latRaw, lngRaw, radiusRaw) {
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
  let radius = Math.round(Number(radiusRaw) || 20000);
  if (!isFinite(lat) || !isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return Response.json({ error: 'invalid_coords' }, { status: 400 });
  }
  radius = Math.min(Math.max(radius, 2000), 35000); // 2–35 km

  const errors = [];

  // 1. Geoapify (aanbevolen, betrouwbaar vanaf Vercel)
  const apiKey = process.env.GEOAPIFY_API_KEY;
  if (apiKey) {
    try {
      const candidates = await fetchGeoapify(lat, lng, radius, apiKey);
      return Response.json({
        suggestions: buildSuggestions(candidates, [lat, lng]),
        source: 'geoapify',
      });
    } catch (err) {
      errors.push(`geoapify: ${String(err?.message ?? err)}`);
      // val door naar Overpass
    }
  }

  // 2. Overpass (reserve; publieke servers weigeren Vercel-IP's regelmatig)
  const candidates = await fetchOverpass(lat, lng, radius, errors);
  if (candidates) {
    return Response.json({
      suggestions: buildSuggestions(candidates, [lat, lng]),
      source: 'overpass',
    });
  }

  const hint = apiKey
    ? ''
    : ' — Tip: stel GEOAPIFY_API_KEY in op Vercel voor een betrouwbare bron, zie README';
  return Response.json(
    { error: 'suggest_failed', detail: errors.join(' | ') + hint },
    { status: 502 },
  );
}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'invalid_json' }, { status: 400 });
  }
  return handle(request, body.lat, body.lng, body.radius);
}

export async function GET(request) {
  const p = new URL(request.url).searchParams;
  return handle(request, p.get('lat'), p.get('lng'), p.get('radius'));
}
