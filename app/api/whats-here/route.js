// Wat ligt er op/rond een aangeklikt kaartpunt?
// Combineert Nominatim reverse-geocoding (adres/naam van het dichtstbijzijnde
// object) met een kleine Overpass-zoektocht naar benoemde POI's vlakbij,
// zodat de gebruiker een herkenbare plek (kerk, museum, restaurant…) kan kiezen.
//
// GET/POST { lat, lng } → { suggestions: [{ name, kind, emoji, coords, distM }] }

import { cacheSleutel, uitCache, naarCache, TTL } from '@/lib/geoCache';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

let calls = [];
function rateLimited() {
  const now = Date.now();
  calls = calls.filter(t => now - t < 60_000);
  if (calls.length >= 30) return true;
  calls.push(now);
  return false;
}

function haversineM([lat1, lng1], [lat2, lng2]) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toStr(v) {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  return '';
}

// OSM-tags → leesbaar type + emoji
function describe(tags) {
  const t = tags || {};
  if (t.amenity === 'place_of_worship' || t.building === 'church') return { kind: 'Kerk', emoji: '⛪' };
  if (t.tourism === 'museum') return { kind: 'Museum', emoji: '🏛️' };
  if (t.historic === 'castle' || t.castle_type) return { kind: 'Kasteel', emoji: '🏰' };
  if (t.historic === 'monument' || t.historic === 'memorial') return { kind: 'Monument', emoji: '🗿' };
  if (t.historic) return { kind: 'Historisch', emoji: '🏛️' };
  if (t.tourism === 'viewpoint') return { kind: 'Uitkijkpunt', emoji: '🌄' };
  if (t.tourism === 'attraction') return { kind: 'Bezienswaardigheid', emoji: '⭐' };
  if (t.tourism === 'zoo') return { kind: 'Dierenpark', emoji: '🦌' };
  if (t.tourism === 'theme_park') return { kind: 'Pretpark', emoji: '🎢' };
  if (t.amenity === 'restaurant') return { kind: 'Restaurant', emoji: '🍽️' };
  if (t.amenity === 'cafe') return { kind: 'Café', emoji: '☕' };
  if (t.amenity === 'bar' || t.amenity === 'pub') return { kind: 'Bar', emoji: '🍺' };
  if (t.shop === 'supermarket') return { kind: 'Supermarkt', emoji: '🛒' };
  if (t.shop) return { kind: 'Winkel', emoji: '🛍️' };
  if (t.amenity === 'marketplace') return { kind: 'Markt', emoji: '🧺' };
  if (t.leisure === 'swimming_pool' || t.leisure === 'water_park') return { kind: 'Zwembad', emoji: '🏊' };
  if (t.natural === 'beach') return { kind: 'Strand', emoji: '🏖️' };
  if (t.natural === 'peak') return { kind: 'Bergtop', emoji: '⛰️' };
  if (t.leisure === 'park') return { kind: 'Park', emoji: '🌳' };
  if (t.amenity === 'parking') return { kind: 'Parkeren', emoji: '🅿️' };
  return { kind: 'Plek', emoji: '📍' };
}

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

async function nearbyPois(lat, lng) {
  // Benoemde objecten binnen ~250 m van het klikpunt
  const r = 250;
  const around = `(around:${r},${lat},${lng})`;
  const query = `
[out:json][timeout:10];
(
  node["name"]["amenity"]${around};
  node["name"]["tourism"]${around};
  node["name"]["historic"]${around};
  node["name"]["shop"]${around};
  node["name"]["leisure"]${around};
  node["name"]["natural"]${around};
  way["name"]["amenity"]${around};
  way["name"]["tourism"]${around};
  way["name"]["historic"]${around};
  way["name"]["leisure"]${around};
);
out center 60;`;

  for (const endpoint of shuffled(OVERPASS_ENDPOINTS)) {
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'VakantiePlanner/1.0 (familie-vakantieplanner)',
        },
        body: 'data=' + encodeURIComponent(query),
        signal: AbortSignal.timeout(11_000),
      });
      if (!res.ok) continue;
      const data = await res.json();
      const out = [];
      const seen = new Set();
      for (const el of data.elements || []) {
        const tags = el.tags || {};
        const name = toStr(tags.name).trim();
        if (!name || seen.has(name.toLowerCase())) continue;
        const cLat = el.lat ?? el.center?.lat;
        const cLng = el.lon ?? el.center?.lon;
        if (cLat == null || cLng == null) continue;
        seen.add(name.toLowerCase());
        const d = describe(tags);
        out.push({
          name: name.slice(0, 80),
          kind: d.kind,
          emoji: d.emoji,
          coords: [cLat, cLng],
          distM: Math.round(haversineM([lat, lng], [cLat, cLng])),
        });
      }
      out.sort((a, b) => a.distM - b.distM);
      return out.slice(0, 25);
    } catch {
      // volgende endpoint
    }
  }
  return null;
}

async function reverseGeocode(lat, lng) {
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'VakantiePlanner/1.0 (familie-vakantieplanner)' },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const a = data.address || {};
    const name = toStr(data.name)
      || toStr(a.tourism) || toStr(a.historic) || toStr(a.building)
      || toStr(a.amenity) || toStr(a.road)
      || toStr(a.village || a.town || a.city || a.hamlet);
    const place = toStr(a.village || a.town || a.city || a.hamlet || a.municipality);
    const d = describe(a.class ? { [data.category]: data.type } : {});
    return {
      name: (name || 'Gekozen locatie').slice(0, 80),
      kind: d.kind,
      emoji: d.emoji,
      place: place || null,
      coords: [Number(data.lat) || lat, Number(data.lon) || lng],
      distM: 0,
    };
  } catch {
    return null;
  }
}

async function handle(request, latRaw, lngRaw) {
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
  if (!isFinite(lat) || !isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return Response.json({ error: 'invalid_coords' }, { status: 400 });
  }

  // Vier decimalen (~11 m): een klik op de kaart moet precies blijven, anders
  // krijg je de POI's van het huizenblok ernaast te zien.
  const sleutel = cacheSleutel('whatsHere', [lat, lng], 4);
  const bewaard = await uitCache(sleutel);
  if (bewaard) return Response.json(bewaard);

  const [pois, rev] = await Promise.all([
    nearbyPois(lat, lng),
    reverseGeocode(lat, lng),
  ]);

  const suggestions = [];
  // Dichtstbijzijnde benoemde POI's eerst
  if (pois) suggestions.push(...pois);
  // Reverse-geocode-resultaat als extra optie (indien niet al aanwezig)
  if (rev && !suggestions.some(s => s.name.toLowerCase() === rev.name.toLowerCase())) {
    suggestions.unshift(rev);
  }

  const payload = { suggestions, clicked: [lat, lng] };
  // Niets gevonden is meestal Overpass die niet meewerkte, niet een lege plek —
  // dat wil je niet een week vasthouden.
  if (suggestions.length) await naarCache(sleutel, payload, TTL.whatsHere);
  return Response.json(payload);
}

export async function POST(request) {
  let body;
  try { body = await request.json(); }
  catch { return Response.json({ error: 'invalid_json' }, { status: 400 }); }
  return handle(request, body.lat, body.lng);
}

export async function GET(request) {
  const p = new URL(request.url).searchParams;
  return handle(request, p.get('lat'), p.get('lng'));
}
