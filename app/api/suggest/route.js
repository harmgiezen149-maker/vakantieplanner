// Omgevingssuggesties rond een verblijf, via de Overpass API (OpenStreetMap).
// POST { lat, lng, radius } → { suggestions: [{ name, category, emoji, coords, distKm }] }
//
// Gratis en zonder API-key; fair-use. We beperken het aantal aanvragen
// en resultaten om de publieke Overpass-servers niet te belasten.

export const dynamic = 'force-dynamic';

const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

// Simpele in-memory rate limit (per serverless instance)
let calls = [];
function rateLimited() {
  const now = Date.now();
  calls = calls.filter(t => now - t < 60_000);
  if (calls.length >= 10) return true;
  calls.push(now);
  return false;
}

// OSM-tag → app-categorie + emoji + max aantal resultaten
const KINDS = [
  { match: t => t.shop === 'supermarket', category: 'shops', emoji: '🛒', cap: 8 },
  { match: t => t.amenity === 'marketplace', category: 'food', emoji: '🧺', cap: 5 },
  { match: t => t.tourism === 'viewpoint', category: 'nature', emoji: '🌄', cap: 10 },
  { match: t => t.tourism === 'museum', category: 'culture', emoji: '🏛️', cap: 10 },
  { match: t => t.historic === 'castle', category: 'culture', emoji: '🏰', cap: 8 },
  { match: t => t.tourism === 'zoo', category: 'nature', emoji: '🦌', cap: 4 },
  { match: t => t.tourism === 'theme_park', category: 'culture', emoji: '🎢', cap: 4 },
  { match: t => t.tourism === 'attraction', category: 'culture', emoji: '⭐', cap: 12 },
  { match: t => t.leisure === 'swimming_pool' || t.leisure === 'water_park', category: 'water', emoji: '🏊', cap: 8 },
  { match: t => t.natural === 'beach', category: 'water', emoji: '🏖️', cap: 5 },
];

function classify(tags) {
  for (const k of KINDS) {
    if (k.match(tags)) return k;
  }
  return null;
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

function buildQuery(lat, lng, radius) {
  const around = `(around:${radius},${lat},${lng})`;
  return `
[out:json][timeout:25];
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

export async function POST(request) {
  const expectedPin = process.env.FAMILY_PIN;
  if (expectedPin) {
    const pin = request.headers.get('X-Family-Pin');
    if (pin !== expectedPin) {
      return Response.json({ error: 'unauthorized' }, { status: 401 });
    }
  }

  if (rateLimited()) {
    return Response.json({ error: 'rate_limited' }, { status: 429 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'invalid_json' }, { status: 400 });
  }

  const lat = Number(body.lat);
  const lng = Number(body.lng);
  let radius = Math.round(Number(body.radius) || 20000);
  if (!isFinite(lat) || !isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return Response.json({ error: 'invalid_coords' }, { status: 400 });
  }
  radius = Math.min(Math.max(radius, 2000), 35000); // 2–35 km

  const query = buildQuery(lat, lng, radius);

  let data = null;
  let lastErr = null;
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'data=' + encodeURIComponent(query),
        signal: AbortSignal.timeout(28_000),
      });
      if (!res.ok) { lastErr = `overpass_${res.status}`; continue; }
      data = await res.json();
      break;
    } catch (err) {
      lastErr = String(err?.message ?? err);
    }
  }
  if (!data) {
    return Response.json({ error: 'overpass_failed', detail: lastErr }, { status: 502 });
  }

  // Verwerk elementen → suggesties, dedupliceer op naam, cap per soort
  const seen = new Set();
  const perKind = new Map();
  const suggestions = [];

  for (const el of data.elements || []) {
    const tags = el.tags || {};
    const name = (tags.name || '').trim();
    if (!name) continue;

    const kind = classify(tags);
    if (!kind) continue;

    const key = name.toLowerCase();
    if (seen.has(key)) continue;

    const elLat = el.lat ?? el.center?.lat;
    const elLng = el.lon ?? el.center?.lon;
    if (elLat == null || elLng == null) continue;

    const used = perKind.get(kind.category + kind.emoji) || 0;
    if (used >= kind.cap) continue;

    seen.add(key);
    perKind.set(kind.category + kind.emoji, used + 1);
    suggestions.push({
      name: name.slice(0, 80),
      category: kind.category,
      emoji: kind.emoji,
      coords: [elLat, elLng],
      distKm: Math.round(haversineKm([lat, lng], [elLat, elLng]) * 10) / 10,
    });
  }

  suggestions.sort((a, b) => a.distKm - b.distKm);

  return Response.json({ suggestions: suggestions.slice(0, 60) });
}
