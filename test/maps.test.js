import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractUrl, labelBeforeUrl, isGoogleMapsUrl, isShortMapsUrl,
  parseMapsUrlClient, COORDS_RE,
} from '../lib/maps.js';

// Valkuil 13: de deelknop van de Maps-app plakt de naam (en vaak het adres)
// vóór de link. Dit ging eerder mis en kostte een productie-bug.

test('vist de link uit een geplakte deeltekst', () => {
  assert.equal(
    extractUrl('Camping Les Deux Lacs\nhttps://maps.app.goo.gl/abc123'),
    'https://maps.app.goo.gl/abc123',
  );
  assert.equal(
    extractUrl('Bekijk Camping X op Google Maps: https://maps.app.goo.gl/abc'),
    'https://maps.app.goo.gl/abc',
  );
  assert.equal(extractUrl('https://maps.app.goo.gl/abc'), 'https://maps.app.goo.gl/abc');
});

test('leestekens die per ongeluk meekomen gaan eraf', () => {
  assert.equal(extractUrl('Kijk hier: https://maps.app.goo.gl/abc.'), 'https://maps.app.goo.gl/abc');
  assert.equal(extractUrl('(https://maps.app.goo.gl/abc)'), 'https://maps.app.goo.gl/abc');
});

test('een gewone zoekterm bevat geen link', () => {
  assert.equal(extractUrl('Camping de la Plage'), null);
  assert.equal(extractUrl(''), null);
  assert.equal(extractUrl(null), null);
});

test('de naam vóór de link wordt uitgekleed', () => {
  assert.equal(
    labelBeforeUrl('Camping Les Deux Lacs\nhttps://maps.app.goo.gl/abc'),
    'Camping Les Deux Lacs',
  );
  assert.equal(
    labelBeforeUrl('Bekijk Camping du Lac op Google Maps: https://maps.app.goo.gl/abc'),
    'Camping du Lac',
  );
  // Een invoerveld van één regel maakt van regeleindes spaties; de komma
  // scheidt dan nog de naam van het adres
  assert.equal(
    labelBeforeUrl('Gite Vallee, Route du Lac 12, 88400 https://maps.app.goo.gl/abc'),
    'Gite Vallee',
  );
  assert.equal(labelBeforeUrl('https://maps.app.goo.gl/abc'), null);
});

test('herkent Maps-links en onderscheidt korte van volledige', () => {
  assert.equal(isGoogleMapsUrl('https://maps.app.goo.gl/abc'), true);
  assert.equal(isGoogleMapsUrl('https://www.google.com/maps/place/X/@48.07,6.87,15z'), true);
  assert.equal(isGoogleMapsUrl('https://www.booking.com/hotel/fr/x.html'), false);
  assert.equal(isGoogleMapsUrl('geen url'), false);

  assert.equal(isShortMapsUrl('https://maps.app.goo.gl/abc'), true);
  assert.equal(isShortMapsUrl('https://www.google.com/maps/place/X'), false);
});

test('haalt naam en coördinaten uit een volledige Maps-URL', () => {
  const uitAnker = parseMapsUrlClient(
    'https://www.google.com/maps/place/Camping+Belle+Vue/data=!4m6!3m5!8m2!3d48.0703!4d6.8479',
  );
  assert.deepEqual(uitAnker.coords, [48.0703, 6.8479]);
  assert.equal(uitAnker.name, 'Camping Belle Vue');

  const uitCentrum = parseMapsUrlClient('https://www.google.com/maps/place/Lac/@48.0703,6.8479,15z');
  assert.deepEqual(uitCentrum.coords, [48.0703, 6.8479]);

  const zonder = parseMapsUrlClient('https://www.google.com/maps/place/Camping+Belle+Vue/');
  assert.equal(zonder.coords, null);
  assert.equal(zonder.name, 'Camping Belle Vue');
});

test('kale coördinaten worden herkend', () => {
  assert.ok(COORDS_RE.test('48.0703, 6.8479'));
  assert.ok(COORDS_RE.test('-33.8688,151.2093'));
  assert.equal(COORDS_RE.test('48, 6'), false, 'zonder decimalen is het geen coördinaat');
  assert.equal(COORDS_RE.test('Camping 48.07'), false);
});
