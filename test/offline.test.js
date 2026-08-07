import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { bewaarLokaal, leesLokaal, wisLokaal, formatMoment, MAX_LEEFTIJD_MS } from '../lib/offline.js';

// Een nagemaakte localStorage, zodat deze module in plain Node te testen is.
// Zo blijft de regel uit CLAUDE.md staan: alleen pure logica in de tests.
function zetOpslag(kapot = false) {
  const inhoud = new Map();
  globalThis.window = {
    localStorage: {
      getItem: (k) => (inhoud.has(k) ? inhoud.get(k) : null),
      setItem: (k, v) => {
        if (kapot) throw new Error('QuotaExceededError');
        inhoud.set(k, v);
      },
      removeItem: (k) => inhoud.delete(k),
    },
  };
  return inhoud;
}

beforeEach(() => { zetOpslag(); });

const NU = Date.parse('2026-08-07T20:00:00Z');

test('wat je bewaart lees je terug', () => {
  bewaarLokaal('trip', { plan: { a: 1 } }, NU);
  const uit = leesLokaal('trip', NU);
  assert.deepEqual(uit.data, { plan: { a: 1 } });
  assert.equal(uit.op, NU);
});

test('zonder kopie komt er null terug', () => {
  assert.equal(leesLokaal('bestaatniet', NU), null);
});

test('een kopie van vlak voor de grens is nog bruikbaar', () => {
  bewaarLokaal('trip', { x: 1 }, NU);
  const netBinnen = NU + MAX_LEEFTIJD_MS - 1000;
  assert.notEqual(leesLokaal('trip', netBinnen), null);
});

test('een te oude kopie wordt niet meer getoond', () => {
  // Een planning van vorige maand is geen hulp maar een valstrik
  bewaarLokaal('trip', { x: 1 }, NU);
  const teOud = NU + MAX_LEEFTIJD_MS + 1000;
  assert.equal(leesLokaal('trip', teOud), null);
});

test('twee sleutels zitten elkaar niet in de weg', () => {
  bewaarLokaal('trip', { welke: 'planning' }, NU);
  bewaarLokaal('inpakken', { welke: 'lijst' }, NU);
  assert.equal(leesLokaal('trip', NU).data.welke, 'planning');
  assert.equal(leesLokaal('inpakken', NU).data.welke, 'lijst');
});

test('wissen haalt hem echt weg', () => {
  bewaarLokaal('trip', { x: 1 }, NU);
  wisLokaal('trip');
  assert.equal(leesLokaal('trip', NU), null);
});

test('een volle localStorage laat de app niet omvallen', () => {
  zetOpslag(true);
  assert.equal(bewaarLokaal('trip', { x: 1 }, NU), false, 'meldt dat het niet lukte');
  assert.equal(leesLokaal('trip', NU), null, 'en er is dan gewoon geen kopie');
});

test('rommel in de opslag wordt genegeerd in plaats van gegooid', () => {
  const inhoud = zetOpslag();
  inhoud.set('offline:trip', 'geen json');
  assert.equal(leesLokaal('trip', NU), null);
  inhoud.set('offline:trip', JSON.stringify({ zonder: 'velden' }));
  assert.equal(leesLokaal('trip', NU), null);
  inhoud.set('offline:trip', JSON.stringify({ op: 'geen getal', data: {} }));
  assert.equal(leesLokaal('trip', NU), null);
});

test('data die false of null is telt nog steeds als kopie', () => {
  // `data === undefined` is "niets bewaard"; `null` en `false` zijn echte waarden
  bewaarLokaal('a', null, NU);
  bewaarLokaal('b', false, NU);
  assert.equal(leesLokaal('a', NU).data, null);
  assert.equal(leesLokaal('b', NU).data, false);
});

test('zonder window (op de server) gebeurt er niets', () => {
  const bewaard = globalThis.window;
  delete globalThis.window;
  assert.equal(bewaarLokaal('trip', { x: 1 }, NU), false);
  assert.equal(leesLokaal('trip', NU), null);
  assert.doesNotThrow(() => wisLokaal('trip'));
  globalThis.window = bewaard;
});

// ── het tijdstip in de balk ─────────────────────────────────────────

test('vandaag, gisteren en eerder worden verschillend genoemd', () => {
  const nu = new Date('2026-08-07T20:00:00').getTime();
  assert.ok(formatMoment(new Date('2026-08-07T08:12:00').getTime(), nu).startsWith('vandaag'));
  assert.ok(formatMoment(new Date('2026-08-06T19:40:00').getTime(), nu).startsWith('gisteren'));
  const ouder = formatMoment(new Date('2026-08-03T14:05:00').getTime(), nu);
  assert.ok(!ouder.startsWith('vandaag') && !ouder.startsWith('gisteren'));
  assert.ok(ouder.includes('aug'));
});

test('een onzinnig tijdstip geeft een lege tekst, geen "Invalid Date"', () => {
  assert.equal(formatMoment(NaN), '');
  assert.equal(formatMoment('geen getal'), '');
});
