// Lost Google Maps-links op naar naam + coördinaten.
// Korte links (maps.app.goo.gl) vereisen het volgen van de redirect —
// dat kan niet vanuit de browser (CORS), dus dat doen we hier server-side.
//
// POST { url } → { name, coords: [lat, lng], finalUrl }

export const dynamic = 'force-dynamic';

const ALLOWED_HOSTS = new Set([
  'maps.app.goo.gl',
  'goo.gl',
  'g.co',
  'maps.google.com',
  'www.google.com',
  'google.com',
  'www.google.nl',
  'google.nl',
]);

let calls = [];
function rateLimited() {
  const now = Date.now();
  calls = calls.filter(t => now - t < 60_000);
  if (calls.length >= 20) return true;
  calls.push(now);
  return false;
}

// Haal naam + coördinaten uit een (volledige) Google Maps-URL
function parseMapsUrl(urlStr) {
  let name = null;
  let coords = null;

  const placeMatch = /\/place\/([^/@?]+)/.exec(urlStr);
  if (placeMatch) {
    try {
      name = decodeURIComponent(placeMatch[1]).replace(/\+/g, ' ').trim();
    } catch { /* laat null */ }
  }

  // Voorkeur: het exacte plek-anker (!3d..!4d..), dan kaartcentrum (@..),
  // dan q=lat,lng
  const pin = /!3d(-?\d{1,2}\.\d+)!4d(-?\d{1,3}\.\d+)/.exec(urlStr);
  const at = /@(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)/.exec(urlStr);
  const q = /[?&]q=(-?\d{1,2}\.\d+)(?:,|%2C)(-?\d{1,3}\.\d+)/.exec(urlStr);
  const m = pin || at || q;
  if (m) {
    const lat = Number(m[1]);
    const lng = Number(m[2]);
    if (isFinite(lat) && isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
      coords = [lat, lng];
    }
  }

  return { name, coords };
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

  let url;
  try {
    url = new URL(String(body.url || '').trim());
  } catch {
    return Response.json({ error: 'invalid_url' }, { status: 400 });
  }
  if (!['http:', 'https:'].includes(url.protocol) || !ALLOWED_HOSTS.has(url.hostname)) {
    return Response.json({ error: 'unsupported_host' }, { status: 400 });
  }

  // Volg de redirect-keten naar de volledige Maps-URL
  let finalUrl = url.toString();
  try {
    const res = await fetch(finalUrl, {
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 (VakantiePlanner/1.0)' },
      signal: AbortSignal.timeout(10_000),
    });
    if (res.url) finalUrl = res.url;
    // Soms zit de echte URL nog in de HTML (consent-pagina's e.d.) —
    // probeer dan een google.com/maps-URL uit de body te vissen.
    if (!parseMapsUrl(finalUrl).coords) {
      const text = await res.text();
      const m = /https:\/\/www\.google\.[a-z.]+\/maps\/[^"'\\\s]+/.exec(text);
      if (m) finalUrl = m[0].replace(/\\u0026/g, '&').replace(/&amp;/g, '&');
    }
  } catch {
    return Response.json({ error: 'resolve_failed' }, { status: 502 });
  }

  let { name, coords } = parseMapsUrl(finalUrl);

  // Vangnet: sommige deel-links uit de Maps-app komen uit op een URL met wél
  // een plaatsnaam maar zonder coördinaten. Zoek die naam dan op — beter een
  // locatie bij benadering dan een foutmelding.
  if (!coords && name) {
    try {
      const zoek = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(name)}&format=json&limit=1`,
        {
          headers: {
            'User-Agent': 'VakantiePlanner/1.0 (familie-vakantieplanner)',
            'Accept-Language': 'nl,en,fr,de',
          },
          signal: AbortSignal.timeout(8_000),
        },
      );
      if (zoek.ok) {
        const treffers = await zoek.json();
        const t = treffers?.[0];
        if (t) coords = [parseFloat(t.lat), parseFloat(t.lon)];
      }
    } catch {
      // vangnet mag falen
    }
  }

  if (!coords) {
    return Response.json({ error: 'no_coords_found', finalUrl }, { status: 422 });
  }

  // Verrijk met een omschrijving (type + plaats) via reverse-geocoding
  let description = null;
  let resolvedName = name;
  try {
    const rev = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${coords[0]}&lon=${coords[1]}&zoom=18&addressdetails=1`,
      { headers: { 'User-Agent': 'VakantiePlanner/1.0 (familie-vakantieplanner)' }, signal: AbortSignal.timeout(8_000) },
    );
    if (rev.ok) {
      const d = await rev.json();
      const a = d.address || {};
      const place = a.village || a.town || a.city || a.hamlet || a.municipality || null;
      const typ = d.type ? String(d.type).replace(/_/g, ' ') : null;
      description = [typ, place].filter(Boolean).join(' · ') || null;
      // Als de URL geen naam gaf, gebruik de Nominatim-naam
      if (!resolvedName && d.name) resolvedName = String(d.name).slice(0, 80);
    }
  } catch {
    // omschrijving is optioneel
  }

  return Response.json({ name: resolvedName, coords, description, finalUrl });
}
