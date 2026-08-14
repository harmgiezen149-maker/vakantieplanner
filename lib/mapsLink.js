// Het uitlezen van een Google Maps-link: van URL (of van de HTML van de
// kaartpagina) naar een naam en een coördinaat.
//
// Dit zat in app/api/resolve-maps/route.js en staat hier apart omdat het pure
// logica is en dus te testen valt — dezelfde beweging als bij packing.js en
// stayValidation.js. Relatieve imports, want `node --test` draait buiten Next
// om en kent de padalias '@/lib/…' niet. Deze module importeert niets.
//
// Waaróm dit bestand bestaat, in één alinea: een korte deel-link uit de
// Maps-app (maps.app.goo.gl) stuurt door naar een /maps/place/-URL die de naam
// en het volledige adres bevat, maar géén coördinaten. Het `@lat,lng` en
// `!3d/!4d` die je uit de adresbalk van een browser kopieert worden pas door de
// kaartpagina zélf toegevoegd nadat die geladen is. Het adres is dus alles wat
// we hebben, en daar valt prima een coördinaat bij te zoeken.

// ── Uit de URL ──────────────────────────────────────────────────────

const geldig = (lat, lng) =>
  Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;

// Naam + coördinaten uit een (volledige) Google Maps-URL.
export function parseMapsUrl(urlStr) {
  let name = null;
  let coords = null;

  // Ook de percent-gedecodeerde variant meenemen: in een consent- of
  // redirect-URL zit de echte kaart-URL vaak gecodeerd in ?continue=…
  let ontcijferd = String(urlStr || '');
  try { ontcijferd = decodeURIComponent(ontcijferd); } catch { /* laat staan */ }
  const kandidaten = ontcijferd === urlStr ? [urlStr] : [urlStr, ontcijferd];

  for (const kand of kandidaten) {
    if (!kand) continue;

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
        if (geldig(lat, lng)) { coords = [lat, lng]; break; }
      }
    }
  }

  return { name, coords };
}

// ── Uit de HTML van de kaartpagina ──────────────────────────────────

// De kaartpagina halen we in de redirect-keten toch al op, dus kijken we er
// ook in. Twee soorten patroon, en het onderscheid is belangrijk:
//
//   !3d…!4d… en @lat,lng   benoemen zichzelf — geen twijfel over de volgorde
//   APP_INITIALIZATION_STATE  is [zoom, LNG, LAT] — omgekeerd dus
//
// Die laatste staat daarom achteraan: bij een plek als Kilefjorden (58,47 /
// 7,80) liggen lat en lng allebei onder de 90, dus een verwisseling valt niet
// vanzelf op en zou de pin duizend kilometer verderop zetten.
export function coordsUitHtml(html) {
  const tekst = String(html || '');
  if (!tekst) return null;

  const zelfbenoemend = [
    /!3d(-?\d{1,2}(?:\.\d+)?)!4d(-?\d{1,3}(?:\.\d+)?)/,
    /@(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)/,
  ];
  for (const re of zelfbenoemend) {
    const m = re.exec(tekst);
    if (!m) continue;
    const lat = Number(m[1]);
    const lng = Number(m[2]);
    if (geldig(lat, lng)) return { coords: [lat, lng], bron: 'pagina' };
  }

  // window.APP_INITIALIZATION_STATE=[[[17,7.79582,58.4667],…
  const app = /APP_INITIALIZATION_STATE\s*=\s*\[\[\[\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)\s*,\s*(-?\d{1,2}(?:\.\d+)?)\s*\]/.exec(tekst);
  if (app) {
    const lng = Number(app[2]);
    const lat = Number(app[3]);
    if (geldig(lat, lng)) return { coords: [lat, lng], bron: 'pagina' };
  }

  return null;
}

// ── Het adres uit de place-naam ─────────────────────────────────────

// Google zet in /place/ niet alleen de naam maar het hele adres:
//
//   "Kilefjorden Camping, Ivelandsvegen 2, 4737 Hornnes, Noorwegen"
//    naam                 straat           postcode+plaats  land
//
// Dat uit elkaar trekken is de sleutel tot een bruikbare zoekopdracht: als één
// blok is het onvindbaar, in stukken is het precies genoeg.
export function splitsPlaceAdres(volledig) {
  const delen = String(volledig || '')
    .split(',')
    .map(d => d.trim())
    .filter(Boolean);

  if (!delen.length) return { naam: null, straat: null, postcode: null, plaats: null, land: null };
  // Eén stuk zonder komma's is gewoon een naam — daar valt niets aan te splitsen.
  if (delen.length === 1) return { naam: delen[0], straat: null, postcode: null, plaats: null, land: null };

  const naam = delen[0];
  const rest = delen.slice(1);

  // Het land is het laatste stuk, mits het geen huisnummer of postcode bevat.
  let land = null;
  if (rest.length > 1 && !/\d/.test(rest[rest.length - 1])) land = rest.pop();

  // "4737 Hornnes" of "1234 AB Amsterdam": een postcode vooraan het stuk.
  let postcode = null;
  let plaats = null;
  const postcodeStuk = rest.findIndex(d => /^[0-9]{4,6}(\s?[A-Z]{2})?\s+\S/.test(d));
  if (postcodeStuk !== -1) {
    const m = /^([0-9]{4,6}(?:\s?[A-Z]{2})?)\s+(.+)$/.exec(rest[postcodeStuk]);
    postcode = m[1];
    plaats = m[2];
    rest.splice(postcodeStuk, 1);
  } else if (rest.length > 1) {
    // Geen postcode herkend: dan is het laatste overgebleven stuk de plaats.
    plaats = rest.pop();
  }

  const straat = rest.length ? rest.join(', ') : null;
  return { naam, straat, postcode, plaats, land };
}

// De zoekopdrachten die we op volgorde bij Nominatim proberen, van scherp naar
// ruim. Bij de eerste treffer stoppen we; ontbrekende onderdelen laten hun
// sport vervallen, zodat een link met alleen een naam meteen bij de laatste
// sport uitkomt.
//
// **Het land gaat nergens in mee.** De Maps-app levert hem in de taal van de
// telefoon ("Noorwegen", niet "Norge"), en een vrije Nominatim-zoekopdracht
// moet op álle woorden matchen — precies dáárop liep de oude versie stuk, die
// de hele string in één keer opstuurde. Postcode plus plaats is scherp genoeg.
// Het land bewaren we wel apart; het verblijvenlogboek leidt er zijn `country`
// uit af.
export function zoekLadder(onderdelen) {
  const { naam, straat, postcode, plaats } = onderdelen || {};
  const sporten = [];

  if (straat && (postcode || plaats)) {
    const gestructureerd = { street: straat };
    if (postcode) gestructureerd.postalcode = postcode;
    if (plaats) gestructureerd.city = plaats;
    sporten.push({ soort: 'gestructureerd', params: gestructureerd });
  }
  if (naam && plaats) {
    sporten.push({ soort: 'vrij', q: `${naam}, ${plaats}` });
  }
  if (straat && (postcode || plaats)) {
    sporten.push({ soort: 'vrij', q: [straat, [postcode, plaats].filter(Boolean).join(' ')].join(', ') });
  }
  if (naam) {
    sporten.push({ soort: 'vrij', q: naam });
  }

  return sporten;
}

// Wat we in de melding en in de UI laten zien als omschrijving van het adres.
export function adresLabel(onderdelen) {
  const { straat, postcode, plaats, land } = onderdelen || {};
  return [straat, [postcode, plaats].filter(Boolean).join(' '), land]
    .filter(Boolean)
    .join(', ') || null;
}
