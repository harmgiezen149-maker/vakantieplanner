import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  maakToken, tokenGeldig, magBekijken, publiekePlanning, dagRouteVraag,
} from '../lib/delen.js';

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

// ── De route van één dag ────────────────────────────────────────────
//
// De meekijker vraagt alleen om een dátum; de server zoekt zelf op wat daar
// staat. Deze functie is dat opzoeken.

const CAMPING = [48.0000, 7.2000];
const STAD = [[48.0740, 7.3560], [48.0765, 7.3600], [48.0752, 7.3548]];
const VER = [[48.0600, 6.9500], [48.1400, 7.2650]];

const reis = (extra = {}) => ({
  plan: {
    '2026-08-10': ['c_a', 'c_b', 'c_c'],   // stadsdag
    '2026-08-11': ['v_a', 'v_b'],          // rijdag
    '2026-08-12': ['c_a'],                 // één stop
    '2026-08-13': ['zonder_loc'],          // geen coördinaten
  },
  customActivities: [
    { id: 'c_a', name: 'Parkeergarage', note: 'niet delen', coords: STAD[0] },
    { id: 'c_b', name: 'Markthal', coords: STAD[1] },
    { id: 'c_c', name: 'Unterlinden', coords: STAD[2] },
    { id: 'v_a', name: 'Meer', coords: VER[0] },
    { id: 'v_b', name: 'Dorp', coords: VER[1] },
    { id: 'zonder_loc', name: 'Souvenirs' },
  ],
  locationOverrides: {},
  tripConfig: {
    title: 'Elzas', startDate: '2026-08-09', endDate: '2026-08-13',
    stays: [{
      id: 's1', name: 'Camping', startDate: '2026-08-09', endDate: '2026-08-13',
      coords: CAMPING,
    }],
  },
  ...extra,
});

test('een stadsdag gaat te voet, zonder het verblijf', () => {
  const uit = dagRouteVraag(reis(), '2026-08-10');
  assert.equal(uit.vervoer, 'lopen');
  assert.deepEqual(uit.punten, STAD, 'de rit naar de stad hoort er niet bij');
});

test('een dag met verre stops gaat met de auto, mét het verblijf', () => {
  const uit = dagRouteVraag(reis(), '2026-08-11');
  assert.equal(uit.vervoer, 'rijden');
  assert.deepEqual(uit.punten, [CAMPING, ...VER, CAMPING]);
});

test('een vastgelegde keuze wint van de automaat', () => {
  const uit = dagRouteVraag(
    reis({ routeAnkers: { '2026-08-10': { start: null, eind: null, vervoer: 'rijden' } } }),
    '2026-08-10',
  );
  assert.equal(uit.vervoer, 'rijden');
  assert.deepEqual(uit.punten, [CAMPING, ...STAD, CAMPING]);
});

test('er valt niets te tekenen bij één stop, geen stops of een onbekende dag', () => {
  assert.equal(dagRouteVraag(reis(), '2026-08-12'), null, 'één stop te voet');
  assert.equal(dagRouteVraag(reis(), '2026-08-13'), null, 'geen coördinaten');
  assert.equal(dagRouteVraag(reis(), '2026-08-20'), null, 'dag bestaat niet');
  assert.equal(dagRouteVraag(reis(), 'geen datum'), null);
  assert.equal(dagRouteVraag(null, '2026-08-10'), null);
});

test('een override op een ingebouwde activiteit telt mee', () => {
  const t = reis();
  t.plan['2026-08-10'] = ['g_swim', 'c_b', 'c_c'];
  t.locationOverrides = { g_swim: { coords: STAD[0] } };
  const uit = dagRouteVraag(t, '2026-08-10');
  assert.deepEqual(uit.punten[0], STAD[0], 'het eigen coördinaat van g_swim');
});

test('een ingebouwde activiteit zonder locatie levert geen punt op', () => {
  const t = reis();
  t.plan['2026-08-10'] = ['g_swim', 'c_b', 'c_c'];
  const uit = dagRouteVraag(t, '2026-08-10');
  assert.deepEqual(uit.punten, [STAD[1], STAD[2]]);
});

test('er komt niets terug behalve punten en vervoer', () => {
  const uit = dagRouteVraag(reis(), '2026-08-10');
  assert.deepEqual(Object.keys(uit).sort(), ['punten', 'vervoer']);
  assert.ok(!JSON.stringify(uit).includes('niet delen'), 'geen notities');
  assert.ok(!JSON.stringify(uit).includes('Parkeergarage'), 'geen namen');
});
