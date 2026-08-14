import { test } from 'node:test';
import assert from 'node:assert/strict';
import { plekNaarParams, plekUitParams, MAX_NAAM } from '../lib/deelPlek.js';

const uit = (qs) => plekUitParams(new URLSearchParams(qs));

const KILEFJORDEN = {
  naam: 'Kilefjorden Camping',
  coords: [58.4667, 7.79582],
  label: 'Ivelandsvegen 2, 4737 Hornnes, Noorwegen',
  website: 'https://maps.app.goo.gl/2q7numaRM3yqhQkXA',
};

// ── heen en weer ────────────────────────────────────────────────────

test('een plek overleeft de rondrit door de URL', () => {
  assert.deepEqual(uit(plekNaarParams(KILEFJORDEN)), KILEFJORDEN);
});

test('zonder website blijft die parameter weg', () => {
  const qs = plekNaarParams({ ...KILEFJORDEN, website: null });
  assert.ok(!qs.includes('site='), `parameter lekt: ${qs}`);
  assert.equal(uit(qs).website, null);
});

test('zonder naam blijft die parameter weg', () => {
  const qs = plekNaarParams({ coords: [52.1, 5.1] });
  assert.ok(!qs.includes('naam='));
  assert.deepEqual(uit(qs), { naam: null, coords: [52.1, 5.1], label: null, website: null });
});

// ── de leeskant is invoer van buiten ────────────────────────────────

test('onleesbare coördinaten leveren niets op', () => {
  assert.equal(uit('lat=abc&lng=7.8'), null);
  assert.equal(uit('lat=58.4&lng='), null);
  assert.equal(uit('naam=Camping'), null, 'zonder plek valt er niets voor te vullen');
  assert.equal(uit(''), null);
});

test('een coördinaat buiten de aarde wordt geweigerd', () => {
  assert.equal(uit('lat=200&lng=7.8'), null);
  assert.equal(uit('lat=58.4&lng=-181'), null);
  assert.equal(uit('lat=-91&lng=0'), null);
});

test('de randen van de aarde mogen nog wel', () => {
  assert.deepEqual(uit('lat=90&lng=180').coords, [90, 180]);
  assert.deepEqual(uit('lat=-90&lng=-180').coords, [-90, -180]);
  assert.deepEqual(uit('lat=0&lng=0').coords, [0, 0], 'nul is een geldig coördinaat');
});

test('een te lange naam wordt geklemd', () => {
  const lang = 'C'.repeat(200);
  assert.equal(uit(`lat=52&lng=5&naam=${lang}`).naam.length, MAX_NAAM);
});

test('een gevaarlijke website wordt geweigerd zonder de rest mee te slepen', () => {
  const p = uit('lat=58.4667&lng=7.79582&naam=Camping&site=javascript:alert(1)');
  assert.equal(p.website, null);
  assert.equal(p.naam, 'Camping', 'de plek blijft gewoon bruikbaar');
  assert.deepEqual(p.coords, [58.4667, 7.79582]);
});

test('een website zonder schema krijgt https ervoor', () => {
  assert.equal(uit('lat=52&lng=5&site=kilefjorden.no').website, 'https://kilefjorden.no/');
});

test('witruimte-namen tellen niet als naam', () => {
  assert.equal(uit('lat=52&lng=5&naam=%20%20').naam, null);
});

test('iets zonder .get() valt niet om', () => {
  assert.equal(plekUitParams(null), null);
  assert.equal(plekUitParams({}), null);
  assert.equal(plekUitParams('lat=52'), null);
});
