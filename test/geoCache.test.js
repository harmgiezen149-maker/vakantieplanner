import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  cacheSleutel, rond, magOpslaan, CACHE_VERSIE, MAX_CACHE_BYTES, TTL,
} from '../lib/geoCache.js';

// De cache mag nooit het verkeerde antwoord teruggeven. Alles hangt aan de
// sleutel: te grof en je krijgt de suggesties van de buurgemeente, te fijn en
// hij slaat nooit aan.

test('dezelfde vraag geeft dezelfde sleutel', () => {
  const a = cacheSleutel('suggest', [48.0712, 6.4521, 20000]);
  const b = cacheSleutel('suggest', [48.0712, 6.4521, 20000]);
  assert.equal(a, b);
});

test('coördinaten worden afgerond op het opgegeven aantal decimalen', () => {
  assert.equal(
    cacheSleutel('suggest', [48.0712, 6.4589], 2),
    cacheSleutel('suggest', [48.0736, 6.4611], 2),
    'binnen ~1 km is het dezelfde omgeving',
  );
  assert.notEqual(
    cacheSleutel('whatsHere', [48.0712, 6.4589], 4),
    cacheSleutel('whatsHere', [48.0736, 6.4611], 4),
    'op vier decimalen is dat wél een andere plek',
  );
});

test('een andere straal is een andere sleutel', () => {
  assert.notEqual(
    cacheSleutel('suggest', [48.07, 6.45, 20000]),
    cacheSleutel('suggest', [48.07, 6.45, 50000]),
  );
});

test('het scheidingsteken maakt losse velden niet uitwisselbaar', () => {
  // Zonder scheidingsteken plakken beide gevallen tot "1.234"
  assert.notEqual(
    cacheSleutel('x', [1.23, 4], 2),
    cacheSleutel('x', [1.2, 34], 2),
  );
});

test('negatieve nul telt als nul', () => {
  assert.equal(rond(-0.0001, 2), 0);
  assert.equal(
    cacheSleutel('reverse', [-0.001, 0.001], 1),
    cacheSleutel('reverse', [0, 0], 1),
    'de evenaar mag geen twee sleutels krijgen',
  );
});

test('negatieve coördinaten overleven het afronden', () => {
  assert.equal(rond(-33.8688, 2), -33.87);
  assert.ok(cacheSleutel('suggest', [-33.8688, 151.2093]).includes('-33.87'));
});

test('zoektermen worden genormaliseerd', () => {
  const a = cacheSleutel('geocode', ['  Gérardmer   Frankrijk ']);
  const b = cacheSleutel('geocode', ['gérardmer frankrijk']);
  assert.equal(a, b, 'hoofdletters en dubbele spaties zijn dezelfde zoekopdracht');
});

test('een zoekterm wordt afgekapt, maar blijft onderscheidend', () => {
  const lang = 'a'.repeat(500);
  const sleutel = cacheSleutel('geocode', [lang]);
  assert.ok(sleutel.length < 200, 'geen sleutel van een halve kilobyte');
  assert.notEqual(cacheSleutel('geocode', ['b'.repeat(500)]), sleutel);
});

test('de versie zit in de sleutel', () => {
  assert.ok(cacheSleutel('suggest', [1, 2]).startsWith(`cache:v${CACHE_VERSIE}:suggest:`));
});

test('twee routes met dezelfde coördinaten botsen niet', () => {
  assert.notEqual(
    cacheSleutel('suggest', [48.07, 6.45]),
    cacheSleutel('hiking', [48.07, 6.45]),
  );
});

test('onzin-coördinaten geven geen stiekem gelijke sleutel', () => {
  const a = cacheSleutel('suggest', [NaN, 6.45]);
  const b = cacheSleutel('suggest', [48.07, 6.45]);
  assert.notEqual(a, b);
});

test('kleine antwoorden mogen worden bewaard, te grote niet', () => {
  assert.equal(magOpslaan({ suggestions: [{ name: 'Kasteel' }] }), true);
  assert.equal(magOpslaan({ blob: 'x'.repeat(MAX_CACHE_BYTES + 1) }), false);
});

test('de omvang telt in bytes, niet in tekens', () => {
  // 'é' is twee bytes; op tekenlengte zou dit er nog net in passen
  const bijnaVol = 'é'.repeat(Math.floor(MAX_CACHE_BYTES / 2) + 10);
  assert.equal(magOpslaan(bijnaVol), false);
});

test('een leeg of onserialiseerbaar antwoord wordt niet bewaard', () => {
  assert.equal(magOpslaan(''), false);
  assert.equal(magOpslaan(undefined), false);
  const kringloop = {};
  kringloop.zelf = kringloop;
  assert.equal(magOpslaan(kringloop), false);
});

test('de bewaartermijnen staan in de goede verhouding', () => {
  // Een land verandert niet; een POI rond een klikpunt wel eens
  assert.ok(TTL.reverse > TTL.suggest, 'landen mogen het langst blijven staan');
  assert.ok(TTL.suggest > TTL.whatsHere);
  assert.ok(Object.values(TTL).every(t => t > 0 && Number.isInteger(t)));
});
