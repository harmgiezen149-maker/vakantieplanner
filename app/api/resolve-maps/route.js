import { meldServerFout } from '@/app/api/fouten/route';
import { cacheSleutel, uitCache, naarCache, TTL } from '@/lib/geoCache';
import { parseMapsUrl, coordsUitHtml, splitsPlaceAdres, zoekLadder, adresLabel } from '@/lib/mapsLink';

// Lost Google Maps-links op naar naam + coördinaten.
// Korte links (maps.app.goo.gl) vereisen het volgen van de redirect —
// dat kan niet vanuit de browser (CORS), dus dat doen we hier server-side.
//
// POST { url, naamHint? } → { name, coords: [lat, lng], description, finalUrl, bron }
//
// `bron` zegt hoe zeker het coördinaat is, en dat is geen sier:
//
//   'link'    uit de URL zelf         — exact, dit is de speld
//   'pagina'  uit de HTML van de kaart — exact
//   'adres'   opgezocht bij het adres  — bij benadering, de UI zegt dat erbij
//
// Waaróm die derde nodig is: de URL waar een korte deel-link op uitkomt bevat
// wél de naam en het volledige adres maar géén coördinaten. Het `@lat,lng` dat
// je uit de adresbalk van een browser kopieert wordt pas door de kaartpagina
// zélf toegevoegd. Zie lib/mapsLink.js.

export const dynamic = 'force-dynamic';
// Elke andere trage route zet dit ook (hiking, suggest, weer, whats-here, de
// back-uproutes). Zonder deze regel kapt Vercel af op 10 s, en deze route doet
// redirects volgen plus tot vier Nominatim-zoekopdrachten die van elkaar een
// seconde afstand moeten houden.
export const maxDuration = 30;

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

// Het hele verzoek moet ruim binnen maxDuration blijven. Is het budget op, dan
// geven we terug wat we hebben in plaats van tegen de tijdslimiet aan te lopen
// en de client een 504 zonder JSON te sturen — dan zou hij niet eens kunnen
// zeggen wat er misging.
const TOTAAL_BUDGET_MS = 24_000;

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

const NOMINATIM_HEADERS = {
  'User-Agent': 'VakantiePlanner/1.0 (familie-vakantieplanner)',
  'Accept-Language': 'nl,en,fr,de',
};

const wacht = (ms) => new Promise(r => setTimeout(r, ms));

// Redirects met de hand volgen in plaats van ze door fetch te laten afhandelen.
// Dat is het hele punt: de volledige kaart-URL staat al in de Location-header
// van de korte link, dus we hoeven de Maps-pagina zélf nooit op te halen — en
// juist dáár zit de toestemmingspagina die het uitlezen liet stuklopen.
// Geeft alle bezochte URL's terug plus de laatste respons (voor het geval we
// alsnog in de HTML moeten kijken).
async function volgRedirects(startUrl, deadline, maxHops = 6) {
  const bezocht = [startUrl];
  let huidig = startUrl;
  let laatste = null;

  for (let i = 0; i < maxHops; i++) {
    if (Date.now() > deadline) break;
    let res;
    try {
      res = await fetch(huidig, {
        redirect: 'manual',
        headers: BROWSER_HEADERS,
        signal: AbortSignal.timeout(Math.min(9_000, Math.max(1_000, deadline - Date.now()))),
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

// De zoekladder aflopen tot er iets gevonden is. Nominatim staat één verzoek
// per seconde toe (valkuil 15), dus dit gaat sequentieel met ruim een seconde
// ertussen — nooit Promise.all.
async function zoekAdres(sporten, deadline) {
  const geprobeerd = [];
  for (const [i, sport] of sporten.entries()) {
    if (Date.now() > deadline) break;
    if (i > 0) await wacht(1_100);
    if (Date.now() > deadline) break;

    const params = new URLSearchParams({ format: 'json', limit: '1', addressdetails: '1' });
    if (sport.soort === 'gestructureerd') {
      for (const [k, v] of Object.entries(sport.params)) params.set(k, v);
    } else {
      params.set('q', sport.q);
    }
    geprobeerd.push(sport.soort === 'gestructureerd' ? 'gestructureerd' : sport.q);

    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
        headers: NOMINATIM_HEADERS,
        signal: AbortSignal.timeout(Math.min(8_000, Math.max(1_000, deadline - Date.now()))),
      });
      if (!res.ok) continue;
      const treffers = await res.json();
      const t = treffers?.[0];
      if (!t) continue;
      const lat = parseFloat(t.lat);
      const lng = parseFloat(t.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      return { coords: [lat, lng], treffer: t, geprobeerd };
    } catch {
      // deze sport mag mislukken; de volgende krijgt zijn kans
    }
  }
  return { coords: null, treffer: null, geprobeerd };
}

// De sleutel staat op de opgeschoonde URL: de deelknop plakt er per keer andere
// meetparameters achter (g_st, entry, g_ep, skid), en zonder opschonen krijgt
// dezelfde plek dus elke keer een nieuwe sleutel.
function cacheDoel(url) {
  const schoon = new URL(url.toString());
  schoon.search = '';
  schoon.hash = '';
  return cacheSleutel('resolveMaps', [schoon.toString()]);
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

  // De naam die de gebruiker meeplakte. De deelknop van de Maps-app zet naam en
  // adres vóór de link, en die tekst is soms het enige aanknopingspunt.
  const naamHint = String(body.naamHint || '').trim().slice(0, 120) || null;

  const deadline = Date.now() + TOTAAL_BUDGET_MS;
  const sleutel = cacheDoel(url);
  const bewaard = await uitCache(sleutel);
  if (bewaard) return Response.json({ ...bewaard, uitCache: true });

  // Volg de redirect-keten naar de volledige Maps-URL
  const { bezocht, laatste } = await volgRedirects(url.toString(), deadline);

  // ── Bron 1: de URL's in de keten. Van achter naar voren, want de laatste
  //    hop is het meest specifiek.
  let finalUrl = bezocht[bezocht.length - 1];
  let name = null;
  let coords = null;
  let bron = null;
  for (let i = bezocht.length - 1; i >= 0; i--) {
    const uit = parseMapsUrl(bezocht[i]);
    if (!name && uit.name) name = uit.name;
    if (uit.coords) { coords = uit.coords; bron = 'link'; finalUrl = bezocht[i]; break; }
  }

  // ── Bron 2: de HTML van de kaartpagina. Die hebben we vaak toch al
  //    opgehaald, dus kijken we erin voordat we gaan gokken op het adres.
  if (!coords && laatste) {
    try {
      const text = await laatste.text();
      const uitPagina = coordsUitHtml(text);
      if (uitPagina) { coords = uitPagina.coords; bron = 'pagina'; }
      if (!coords) {
        // Soms staat er een volledige kaart-URL in de HTML, soms
        // percent-gecodeerd onder continue=.
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
          if (uit.coords) { coords = uit.coords; bron = 'pagina'; finalUrl = kandidaat; break; }
        }
      }
    } catch {
      // body lezen mag mislukken
    }
  }

  // ── Bron 3: het adres opzoeken. Dit is het pad dat de korte deel-link van de
  //    Maps-app redt: die komt uit op een /place/-URL mét het volledige adres
  //    maar zónder coördinaten. Zie lib/mapsLink.js voor waarom het adres in
  //    stukken de zoekopdracht wél laat slagen en als één blok niet.
  const onderdelen = splitsPlaceAdres(name || naamHint);
  let adres = adresLabel(onderdelen);
  let geprobeerd = [];
  if (!coords) {
    const uit = await zoekAdres(zoekLadder(onderdelen), deadline);
    geprobeerd = uit.geprobeerd;
    if (uit.coords) { coords = uit.coords; bron = 'adres'; }
  }

  if (!coords) {
    // Dit is het pad dat eerder stilletjes stukging: de gebruiker zag alleen
    // "kon de link niet uitlezen". Nu staat in het foutenlogboek waar de keten
    // strandde, zonder dat iemand het hoeft te melden.
    await meldServerFout(
      'Maps-link niet uit te lezen',
      `hops=${bezocht.length} status=${laatste?.status ?? '-'} ` +
      `naam=${name || naamHint || '-'} sporten=${geprobeerd.length} eind=${finalUrl}`,
      '/api/resolve-maps',
    );
    // finalUrl meesturen: dan kan de gebruiker hem alsnog met de hand plakken,
    // en zie je in één oogopslag waar de keten strandde.
    return Response.json({
      error: 'no_coords_found',
      finalUrl,
      naam: name || naamHint || null,
      hops: bezocht.length,
      sporten: geprobeerd.length,
      status: laatste?.status ?? null,
    }, { status: 422 });
  }

  // Verrijk met een omschrijving (type + plaats) via reverse-geocoding.
  // Kwam het coördinaat uit het adres, dan weten we de omschrijving al en
  // hoeven we Nominatim niet nóg een keer lastig te vallen.
  let description = adres;
  let resolvedName = name || naamHint;
  if (bron !== 'adres' && Date.now() < deadline) {
    try {
      const rev = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${coords[0]}&lon=${coords[1]}&zoom=18&addressdetails=1`,
        {
          headers: NOMINATIM_HEADERS,
          signal: AbortSignal.timeout(Math.min(8_000, Math.max(1_000, deadline - Date.now()))),
        },
      );
      if (rev.ok) {
        const d = await rev.json();
        const a = d.address || {};
        const place = a.village || a.town || a.city || a.hamlet || a.municipality || null;
        const typ = d.type ? String(d.type).replace(/_/g, ' ') : null;
        description = [typ, place].filter(Boolean).join(' · ') || description;
        // Als de URL geen naam gaf, gebruik de Nominatim-naam
        if (!resolvedName && d.name) resolvedName = String(d.name).slice(0, 80);
      }
    } catch {
      // omschrijving is optioneel
    }
  }

  // De naam die we teruggeven is de plek, niet het hele adres: "Kilefjorden
  // Camping" en niet "Kilefjorden Camping, Ivelandsvegen 2, 4737 Hornnes,
  // Noorwegen". Dat adres staat in `adres` en `description`.
  const antwoord = {
    name: onderdelen.naam || resolvedName,
    coords,
    description,
    adres,
    land: onderdelen.land,
    finalUrl,
    bron,
  };

  // Alleen geslaagde antwoorden bewaren, en falen mag het verzoek nooit slopen
  // (valkuil 7). Melden via console.warn, niet via het foutenlogboek — dat
  // staat zelf in Redis.
  await naarCache(sleutel, antwoord, TTL.geocode);

  return Response.json(antwoord);
}
