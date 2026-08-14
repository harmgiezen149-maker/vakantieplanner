import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseMapsUrl, coordsUitHtml, splitsPlaceAdres, zoekLadder, adresLabel,
} from '../lib/mapsLink.js';

// De twee URL's uit de echte storing van 14 augustus 2026. De eerste is waar
// een korte deel-link uit de Maps-app op uitkomt, de tweede is wat je uit de
// adresbalk van Chrome kopieert nadat de kaart geladen is. Het verschil tussen
// die twee ís de bug.
const UIT_REDIRECT = 'https://www.google.com/maps/place/Kilefjorden+Camping,+Ivelandsvegen+2,+4737+Hornnes,+Noorwegen/data=!4m2!3m1!1s0x4638151468ffe18f:0x7daead4748c26ff2!18m1!1e1?utm_source=mstt_1&entry=gps&coh=192189&g_st=ac';
const UIT_ADRESBALK = 'https://www.google.com/maps/place/Kilefjorden+Camping,+Ivelandsvegen+2,+4737+Hornnes,+Noorwegen/@58.4667,7.79582,17z/data=!4m6!3m5!1s0x4638151468ffe18f:0x7daead4748c26ff2!8m2!3d58.4667!4d7.79582!16s%2Fg%2F1tg149lx?utm_campaign=ml-ardl';

// ── parseMapsUrl ────────────────────────────────────────────────────

test('de URL waar een korte deel-link op uitkomt heeft wél een naam en géén coördinaten', () => {
  const uit = parseMapsUrl(UIT_REDIRECT);
  assert.equal(uit.name, 'Kilefjorden Camping, Ivelandsvegen 2, 4737 Hornnes, Noorwegen');
  assert.equal(uit.coords, null, 'dit is precies waarom het uitlezen faalde');
});

test('de URL uit de adresbalk geeft naam én coördinaten', () => {
  const uit = parseMapsUrl(UIT_ADRESBALK);
  assert.equal(uit.name, 'Kilefjorden Camping, Ivelandsvegen 2, 4737 Hornnes, Noorwegen');
  assert.deepEqual(uit.coords, [58.4667, 7.79582]);
});

test('het plek-anker wint van het kaartcentrum', () => {
  // @ is waar de kaart naar kijkt, !3d/!4d is waar de speld staat.
  const uit = parseMapsUrl('https://www.google.com/maps/place/X/@50.0,4.0,17z/data=!3d58.4667!4d7.79582');
  assert.deepEqual(uit.coords, [58.4667, 7.79582]);
});

test('een kale coördinaat in /place/ is geen naam', () => {
  const uit = parseMapsUrl('https://www.google.com/maps/place/58.4667,7.79582/@58.4667,7.79582,17z');
  assert.equal(uit.name, null);
  assert.deepEqual(uit.coords, [58.4667, 7.79582]);
});

test('een gecodeerde kaart-URL in continue= wordt alsnog gelezen', () => {
  const uit = parseMapsUrl('https://consent.google.com/m?continue=https%3A%2F%2Fwww.google.com%2Fmaps%2Fplace%2FX%2F%4058.4667%2C7.79582%2C17z');
  assert.deepEqual(uit.coords, [58.4667, 7.79582]);
});

test('onzin levert niets op in plaats van een coördinaat', () => {
  assert.deepEqual(parseMapsUrl('https://example.com/'), { name: null, coords: null });
  assert.deepEqual(parseMapsUrl(''), { name: null, coords: null });
  assert.deepEqual(parseMapsUrl(null), { name: null, coords: null });
});

test('een onmogelijke coördinaat wordt geweigerd', () => {
  assert.equal(parseMapsUrl('https://www.google.com/maps/place/X/data=!3d99.5!4d200.1').coords, null);
});

// ── coordsUitHtml ───────────────────────────────────────────────────

test('het plek-anker in de HTML wint van APP_INITIALIZATION_STATE', () => {
  const html = `<html><body>
    <meta content="https://www.google.com/maps/preview/place/data=!3d58.4667!4d7.79582">
    <script>window.APP_INITIALIZATION_STATE=[[[17,9.9999,49.9999],null,0]];</script>
  </body></html>`;
  assert.deepEqual(coordsUitHtml(html).coords, [58.4667, 7.79582]);
});

test('APP_INITIALIZATION_STATE is [zoom, lengte, breedte] en wordt niet omgedraaid', () => {
  // Kilefjorden ligt op 58,47 N / 7,80 O. Beide getallen zijn kleiner dan 90,
  // dus een verwisseling levert een geldig ogend coördinaat op — ergens in
  // Somalië. Alleen deze test houdt die volgorde vast.
  const html = '<script>window.APP_INITIALIZATION_STATE=[[[17,7.79582,58.4667],null,0]];</script>';
  assert.deepEqual(coordsUitHtml(html).coords, [58.4667, 7.79582]);
});

test('coordsUitHtml meldt dat de pagina de bron was', () => {
  assert.equal(coordsUitHtml('data=!3d58.4667!4d7.79582').bron, 'pagina');
});

test('HTML zonder coördinaten levert null op', () => {
  assert.equal(coordsUitHtml('<html><body>Even geduld…</body></html>'), null);
  assert.equal(coordsUitHtml(''), null);
  assert.equal(coordsUitHtml(null), null);
});

// ── splitsPlaceAdres ────────────────────────────────────────────────

test('naam, straat, postcode, plaats en land vallen uit elkaar', () => {
  assert.deepEqual(
    splitsPlaceAdres('Kilefjorden Camping, Ivelandsvegen 2, 4737 Hornnes, Noorwegen'),
    { naam: 'Kilefjorden Camping', straat: 'Ivelandsvegen 2', postcode: '4737', plaats: 'Hornnes', land: 'Noorwegen' },
  );
});

test('een naam zonder komma\'s blijft één naam', () => {
  assert.deepEqual(
    splitsPlaceAdres('Natuurcamping Denemarken'),
    { naam: 'Natuurcamping Denemarken', straat: null, postcode: null, plaats: null, land: null },
  );
});

test('zonder postcode schuift de plaats niet op naar de straat', () => {
  const uit = splitsPlaceAdres('Domaine des Messires, Rue du Lac, Gérardmer, Frankrijk');
  assert.equal(uit.naam, 'Domaine des Messires');
  assert.equal(uit.straat, 'Rue du Lac');
  assert.equal(uit.plaats, 'Gérardmer');
  assert.equal(uit.postcode, null);
  assert.equal(uit.land, 'Frankrijk');
});

test('een Nederlandse postcode met letters wordt herkend', () => {
  const uit = splitsPlaceAdres('De Kleine Wielen, Ouddeel 2, 8926 XE Leeuwarden, Nederland');
  assert.equal(uit.postcode, '8926 XE');
  assert.equal(uit.plaats, 'Leeuwarden');
});

test('zonder land blijft dat veld leeg zonder de rest te verschuiven', () => {
  const uit = splitsPlaceAdres('Camping X, Hoofdstraat 1, 1234 Dorp');
  assert.equal(uit.naam, 'Camping X');
  assert.equal(uit.straat, 'Hoofdstraat 1');
  assert.equal(uit.plaats, 'Dorp');
  assert.equal(uit.land, null);
});

test('een lege invoer valt niet om', () => {
  assert.deepEqual(
    splitsPlaceAdres(''),
    { naam: null, straat: null, postcode: null, plaats: null, land: null },
  );
  assert.equal(splitsPlaceAdres(null).naam, null);
});

// ── zoekLadder ──────────────────────────────────────────────────────

test('de ladder loopt van scherp naar ruim', () => {
  const sporten = zoekLadder(splitsPlaceAdres('Kilefjorden Camping, Ivelandsvegen 2, 4737 Hornnes, Noorwegen'));
  assert.equal(sporten.length, 4);
  assert.deepEqual(sporten[0], {
    soort: 'gestructureerd',
    params: { street: 'Ivelandsvegen 2', postalcode: '4737', city: 'Hornnes' },
  });
  assert.deepEqual(sporten[1], { soort: 'vrij', q: 'Kilefjorden Camping, Hornnes' });
  assert.deepEqual(sporten[2], { soort: 'vrij', q: 'Ivelandsvegen 2, 4737 Hornnes' });
  assert.deepEqual(sporten[3], { soort: 'vrij', q: 'Kilefjorden Camping' });
});

test('het land komt in géén enkele sport voor', () => {
  // Dit is de kern van de fix. De Maps-app levert "Noorwegen" en niet "Norge",
  // en een vrije zoekopdracht moet op álle woorden matchen — dus juist dat
  // woord maakte de hele zoekopdracht onvindbaar.
  const sporten = zoekLadder(splitsPlaceAdres('Kilefjorden Camping, Ivelandsvegen 2, 4737 Hornnes, Noorwegen'));
  const alles = JSON.stringify(sporten);
  assert.ok(!alles.includes('Noorwegen'), `land lekt in de zoekopdracht: ${alles}`);
});

test('alleen een naam levert precies één sport op', () => {
  const sporten = zoekLadder(splitsPlaceAdres('Natuurcamping Denemarken'));
  assert.deepEqual(sporten, [{ soort: 'vrij', q: 'Natuurcamping Denemarken' }]);
});

test('zonder straat vervallen de sporten die er een nodig hebben', () => {
  const sporten = zoekLadder({ naam: 'Camping X', straat: null, postcode: null, plaats: 'Hornnes', land: 'Noorwegen' });
  assert.deepEqual(sporten, [
    { soort: 'vrij', q: 'Camping X, Hornnes' },
    { soort: 'vrij', q: 'Camping X' },
  ]);
});

test('zonder bruikbare onderdelen is de ladder leeg', () => {
  assert.deepEqual(zoekLadder({}), []);
  assert.deepEqual(zoekLadder(null), []);
});

// ── adresLabel ──────────────────────────────────────────────────────

test('het adreslabel is wat de gebruiker moet kunnen nalezen', () => {
  const uit = adresLabel(splitsPlaceAdres('Kilefjorden Camping, Ivelandsvegen 2, 4737 Hornnes, Noorwegen'));
  assert.equal(uit, 'Ivelandsvegen 2, 4737 Hornnes, Noorwegen');
});

test('zonder adres is er geen label', () => {
  assert.equal(adresLabel(splitsPlaceAdres('Natuurcamping Denemarken')), null);
});
