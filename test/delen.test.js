import { test } from 'node:test';
import assert from 'node:assert/strict';
import { maakToken, tokenGeldig, magBekijken, publiekePlanning } from '../lib/delen.js';

// Deze route staat open zonder familie-PIN. Twee dingen moeten dus kloppen:
// alleen het juiste, nog geldige token komt erlangs, en wat eruit komt bevat
// niets wat het gezin niet wilde delen.

test('een uuid wordt een token van 32 hex-tekens', () => {
  const t = maakToken('3f2504e0-4f89-11d3-9a0c-0305e82c3301');
  assert.equal(t, '3f2504e04f8911d39a0c0305e82c3301');
  assert.ok(tokenGeldig(t));
});

test('onzin levert geen token op', () => {
  assert.equal(maakToken('hallo'), null);
  assert.equal(maakToken(''), null);
  assert.equal(maakToken(null), null);
  assert.equal(maakToken(undefined), null);
});

test('alleen 32 kleine hex-tekens gelden', () => {
  assert.equal(tokenGeldig('a'.repeat(32)), true);
  assert.equal(tokenGeldig('a'.repeat(31)), false);
  assert.equal(tokenGeldig('a'.repeat(33)), false);
  assert.equal(tokenGeldig('z'.repeat(32)), false);
  assert.equal(tokenGeldig(null), false);
  assert.equal(tokenGeldig(12345), false);
});

const geldig = 'a'.repeat(32);
const ander = 'b'.repeat(32);

test('het juiste token op een actieve link mag kijken', () => {
  assert.equal(magBekijken({ token: geldig, actief: true }, geldig), true);
});

test('een ander token mag niet', () => {
  assert.equal(magBekijken({ token: geldig, actief: true }, ander), false);
});

test('een ingetrokken link werkt niet meer, ook niet met het juiste token', () => {
  assert.equal(magBekijken({ token: geldig, actief: false }, geldig), false,
    'intrekken moet echt intrekken');
});

test('zonder document valt er niets te bekijken', () => {
  assert.equal(magBekijken(null, geldig), false);
  assert.equal(magBekijken(undefined, geldig), false);
  assert.equal(magBekijken({}, geldig), false);
});

test('een leeg of ontbrekend token komt er niet langs', () => {
  assert.equal(magBekijken({ token: geldig, actief: true }, ''), false);
  assert.equal(magBekijken({ token: geldig, actief: true }, null), false);
  assert.equal(magBekijken({ token: geldig, actief: true }, undefined), false);
});

test('een document zonder token laat niemand door', () => {
  // Anders zou magBekijken(doc, '') per ongeluk waar kunnen worden
  assert.equal(magBekijken({ token: null, actief: true }, null), false);
  assert.equal(magBekijken({ token: '', actief: true }, ''), false);
});

// ── wat er gedeeld wordt ────────────────────────────────────────────

const trip = {
  tripConfig: {
    title: 'Vogezen 2026',
    startDate: '2026-08-10', endDate: '2026-08-14',
    stays: [{ id: 's1', name: 'Camping', startDate: '2026-08-10', endDate: '2026-08-14', coords: [48, 6], locationLabel: 'Gérardmer' }],
  },
  plan: { '2026-08-10': ['custom_1', 'g_zwemmen'] },
  customActivities: [
    { id: 'custom_1', name: 'Meer', emoji: '🏊', coords: [48.1, 6.9], note: 'koud' },
    { id: 'custom_9', name: 'Niet ingepland', emoji: '🥐', coords: [48.2, 6.8] },
  ],
  locationOverrides: { g_zwemmen: { coords: [48.3, 6.7], name: 'Ander meer' } },
  suggestExclusions: ['iets'],
  updatedAt: '2026-08-07T10:00:00.000Z',
  updatedBy: 'Harm',
};

test('de naam van wie het bijwerkte gaat niet mee', () => {
  const uit = publiekePlanning(trip);
  const tekst = JSON.stringify(uit);
  assert.equal(uit.updatedBy, undefined);
  assert.ok(!tekst.includes('Harm'), 'geen namen van het gezin in een publieke link');
});

test('alleen ingeplande activiteiten worden gedeeld', () => {
  const uit = publiekePlanning(trip);
  const namen = uit.activiteiten.map(a => a.name);
  assert.deepEqual(namen, ['Meer']);
  assert.ok(!JSON.stringify(uit).includes('Niet ingepland'),
    'de rest van de bibliotheek gaat een bezoeker niets aan');
});

test('overrides van ingeplande activiteiten gaan wél mee', () => {
  const uit = publiekePlanning(trip);
  assert.equal(uit.overrides.g_zwemmen.name, 'Ander meer');
});

test('reistitel, dagen en verblijven komen mee', () => {
  const uit = publiekePlanning(trip);
  assert.equal(uit.tripConfig.title, 'Vogezen 2026');
  assert.deepEqual(uit.plan['2026-08-10'], ['custom_1', 'g_zwemmen']);
  assert.equal(uit.tripConfig.stays[0].name, 'Camping');
});

test('velden die er later bij komen lekken niet automatisch mee', () => {
  const uit = publiekePlanning({ ...trip, geheimNieuwVeld: 'niet delen' });
  assert.ok(!JSON.stringify(uit).includes('niet delen'),
    'publiekePlanning bouwt op wat het kent, niet op wat het krijgt');
});

test('suggestExclusions blijft binnen', () => {
  const uit = publiekePlanning(trip);
  assert.equal(uit.suggestExclusions, undefined);
});

test('een leeg of ontbrekend document valt niet om', () => {
  assert.deepEqual(publiekePlanning(null), { tripConfig: null, plan: {}, activiteiten: [] });
  const leeg = publiekePlanning({});
  assert.deepEqual(leeg.plan, {});
  assert.deepEqual(leeg.activiteiten, []);
});

test('een kapot plan-veld levert geen rommel op', () => {
  const uit = publiekePlanning({ plan: { '2026-08-10': 'geen array' }, customActivities: [] });
  assert.deepEqual(uit.plan, {});
});
