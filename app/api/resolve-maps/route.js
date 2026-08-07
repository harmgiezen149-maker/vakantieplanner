import { meldServerFout } from '@/app/api/fouten/route';

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

// Headers die zo veel mogelijk op een gewone telefoonbrowser lijken. Google
// serveert onbekende clients vanaf datacenter-IP's nogal eens een
// toestemmingspagina in plaats van de kaart; het CONSENT-koekje slaat die over.
const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Linux; Android 13; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'nl-NL,nl;q=0.9,en;q=0.8',
  'Cookie': 'CONSENT=YES+; SOCS=CAISAiAD',
};

// Haal naam + coördinaten uit een (volledige) Google Maps-URL
function parseMapsUrl(urlStr) {
  let name = null;
  let coords = null;

  // Ook de percent-gedecodeerde variant meenemen: in een consent- of
  // redirect-URL zit de echte kaart-URL vaak gecodeerd in ?continue=…
  let ontcijferd = urlStr;
  try { ontcijferd = decodeURIComponent(urlStr); } catch { /* laat staan */ }
  const kandidaten = ontcijferd === urlStr ? [urlStr] : [urlStr, ontcijferd];

  for (const kand of kandidaten) {
    if (!name) {
      const placeMatch = /\/place\/([^/@?]+)/.exec(kand);
      if (placeMatch) {
        try {
          const n = decodeURIComponent(placeMatch[1]).replace(/\+/g, ' ').trim();
          // "Camping+X" is een naam; een kale coördinaat niet
          if (n && !/^-?\d+\.\d+,\s*-?\d+\.\d+$/.test(n)) name = n;
        } catch { /* laat null */ }
      }
    }

    if (!coords) {
      // Volgorde is de voorkeursvolgorde: het exacte plek-anker (!3d..!4d..)
      // is nauwkeuriger dan het kaartcentrum (@..), en dat weer nauwkeuriger
      // dan een losse zoekparameter.
      const patronen = [
        /!3d(-?\d{1,2}(?:\.\d+)?)!4d(-?\d{1,3}(?:\.\d+)?)/,
        /@(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)/,
        /[?&](?:q|query|ll|sll|center|daddr|destination)=(-?\d{1,2}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)/,
      ];
      for (const re of patronen) {
        const m = re.exec(kand);
        if (!m) continue;
        const lat = Number(m[1]);
        const lng = Number(m[2]);
        if (isFinite(lat) && isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
          coords = [lat, lng];
          break;
        }
      }
    }
  }

  return { name, coords };
}

// Redirects met de hand volgen in plaats van ze door fetch te laten afhandelen.
// Dat is het hele punt: de volledige kaart-URL staat al in de Location-header
// van de korte link, dus we hoeven de Maps-pagina zélf nooit op te halen — en
// juist dáár zit de toestemmingspagina die het uitlezen liet stuklopen.
// Geeft alle bezochte URL's terug plus de laatste respons (voor het geval we
// alsnog in de HTML moeten kijken).
async function volgRedirects(startUrl, maxHops = 6) {
  const bezocht = [startUrl];
  let huidig = startUrl;
  let laatste = null;

  for (let i = 0; i < maxHops; i++) {
    let res;
    try {
      res = await fetch(huidig, {
        redirect: 'manual',
        headers: BROWSER_HEADERS,
        signal: AbortSignal.timeout(9_000),
      });
    } catch {
      break;
    }
    laatste = res;

    const loc = res.headers.get('location');
    if (res.status >= 300 && res.status < 400 && loc) {
      try {
        huidig = new URL(loc, huidig).toString();
      } catch {
        break;
      }
      bezocht.push(huidig);
      // Zodra een hop coördinaten bevat zijn we klaar — verder kijken heeft
      // geen zin en scheelt een verzoek aan Google.
      if (parseMapsUrl(huidig).coords) break;
      continue;
    }
    break;
  }

  return { bezocht, laatste };
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
  const { bezocht, laatste } = await volgRedirects(url.toString());

  // Van achter naar voren kijken: de laatste hop is het meest specifiek
  let finalUrl = bezocht[bezocht.length - 1];
  let name = null;
  let coords = null;
  for (let i = bezocht.length - 1; i >= 0; i--) {
    const uit = parseMapsUrl(bezocht[i]);
    if (!name && uit.name) name = uit.name;
    if (uit.coords) { coords = uit.coords; finalUrl = bezocht[i]; break; }
  }

  // Nog niets? Dan alsnog in de HTML kijken — daar staat vaak een volledige
  // kaart-URL, soms percent-gecodeerd in een continue=-parameter.
  if (!coords && laatste) {
    try {
      const text = await laatste.text();
      const kandidaten = [
        /https:\/\/www\.google\.[a-z.]+\/maps\/[^"'\\\s<>]+/,
        /https%3A%2F%2Fwww\.google\.[a-z.]+%2Fmaps%2F[^"'\\\s<>&]+/,
      ];
      for (const re of kandidaten) {
        const m = re.exec(text);
        if (!m) continue;
        let kandidaat = m[0].replace(/\\u0026/g, '&').replace(/&amp;/g, '&');
        try { kandidaat = decodeURIComponent(kandidaat); } catch { /* laat staan */ }
        const uit = parseMapsUrl(kandidaat);
        if (!name && uit.name) name = uit.name;
        if (uit.coords) { coords = uit.coords; finalUrl = kandidaat; break; }
      }
    } catch {
      // body lezen mag mislukken
    }
  }

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
    // Dit is het pad dat eerder stilletjes stukging: de gebruiker zag alleen
    // "kon de link niet uitlezen". Nu staat in het foutenlogboek waar de keten
    // strandde, zonder dat iemand het hoeft te melden.
    await meldServerFout(
      'Maps-link niet uit te lezen',
      `hops=${bezocht.length} status=${laatste?.status ?? '-'} eind=${finalUrl}`,
      '/api/resolve-maps',
    );
    // finalUrl meesturen: dan kan de gebruiker hem alsnog met de hand plakken,
    // en zie je in één oogopslag waar de keten strandde.
    return Response.json({
      error: 'no_coords_found',
      finalUrl,
      hops: bezocht.length,
      status: laatste?.status ?? null,
    }, { status: 422 });
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
