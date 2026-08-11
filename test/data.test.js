import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDays, isTripConfigured, applyLocationOverride, formatDateRange,
  formatPeriod, getMapsLink, formatDistance, formatDuration, staysWithColors,
  huidigVerblijf, verblijfPerActiviteit,
} from '../lib/data.js';

const reis = (over = {}) => ({
  title: 'Vogezen 2026',
  startDate: '2026-07-25',
  endDate: '2026-08-08',
  stays: [
    { id: 's1', name: 'Camping du Lac', startDate: '2026-07-25', endDate: '2026-08-01', coords: [48.07, 6.87] },
    { id: 's2', name: 'Gite Vallee', startDate: '2026-08-01', endDate: '2026-08-08', coords: [48.2, 7.1] },
  ],
  ...over,
});

// ── buildDays ───────────────────────────────────────────────────────

test('bouwt één dag per kalenderdag, grenzen inbegrepen', () => {
  const dagen = buildDays(reis());
  assert.equal(dagen.length, 15); // 25 juli t/m 8 augustus
  assert.equal(dagen[0].key, '2026-07-25');
  assert.equal(dagen[14].key, '2026-08-08');
});

test('eerste en laatste dag krijgen een label', () => {
  const dagen = buildDays(reis());
  assert.equal(dagen[0].label, 'Aankomstdag');
  assert.equal(dagen[dagen.length - 1].label, 'Vertrek');
});

test('een dag die in twee verblijven valt is een wisseldag', () => {
  const dagen = buildDays(reis());
  const wissel = dagen.find(d => d.key === '2026-08-01');
  assert.equal(wissel.label, 'Wisseldag');
  // Begint bij het oude verblijf, eindigt bij het nieuwe
  assert.equal(wissel.startStay.id, 's1');
  assert.equal(wissel.endStay.id, 's2');
  assert.deepEqual(wissel.startCoords, [48.07, 6.87]);
  assert.deepEqual(wissel.endCoords, [48.2, 7.1]);
});

test('geen reis ingesteld levert geen dagen op', () => {
  assert.deepEqual(buildDays(null), []);
  assert.deepEqual(buildDays({ startDate: null, endDate: null, stays: [] }), []);
  // Einddatum vóór begindatum is geen geldige reis
  assert.deepEqual(buildDays({ startDate: '2026-08-08', endDate: '2026-07-25', stays: [] }), []);
});

test('de veiligheidsklep kapt af op 90 dagen', () => {
  const dagen = buildDays({ startDate: '2026-01-01', endDate: '2026-12-31', stays: [] });
  assert.equal(dagen.length, 90);
});

test('isTripConfigured kijkt naar periode, niet naar verblijven', () => {
  assert.equal(isTripConfigured(reis()), true);
  assert.equal(isTripConfigured({ startDate: '2026-07-25', endDate: '2026-08-08' }), true);
  assert.equal(isTripConfigured({ startDate: '2026-07-25' }), false);
  assert.equal(isTripConfigured(null), false);
});

test('verblijven krijgen elk een eigen kleur', () => {
  const met = staysWithColors(reis());
  assert.equal(met.length, 2);
  assert.ok(met[0].color && met[1].color);
  assert.notEqual(met[0].color, met[1].color);
});

// ── applyLocationOverride ───────────────────────────────────────────
// Valkuil 2: `undefined` betekent "niet gewijzigd", `null` betekent "wissen".

test('override vervangt alleen wat er in staat', () => {
  const activiteit = { id: 'g_hike', name: 'Dagwandeling', coords: [1, 2] };
  const uit = applyLocationOverride(activiteit, { g_hike: { name: 'Eigen naam' } });
  assert.equal(uit.name, 'Eigen naam');
  assert.deepEqual(uit.coords, [1, 2], 'coords ongemoeid want niet in de override');
});

test('null in een override wist het veld, undefined laat het staan', () => {
  const activiteit = { id: 'g_hike', name: 'Dagwandeling', coords: [1, 2] };
  const gewist = applyLocationOverride(activiteit, { g_hike: { coords: null } });
  assert.equal(gewist.coords, null);

  const ongemoeid = applyLocationOverride(activiteit, { g_hike: { coords: undefined } });
  assert.deepEqual(ongemoeid.coords, [1, 2]);
});

test('zonder override verandert er niets', () => {
  const activiteit = { id: 'g_hike', name: 'Dagwandeling' };
  assert.deepEqual(applyLocationOverride(activiteit, {}), activiteit);
  assert.deepEqual(applyLocationOverride(activiteit, null), activiteit);
});

// ── Datumopmaak ─────────────────────────────────────────────────────

test('datumbereik in Nederlandse notatie', () => {
  assert.equal(formatDateRange('2026-07-25', '2026-08-08'), '25 jul — 8 aug 2026');
  assert.equal(formatDateRange('2025-12-28', '2026-01-02'), '28 dec 2025 — 2 jan 2026');
  assert.equal(formatDateRange('2026-07-25', '2026-07-25'), '25 jul 2026');
  assert.equal(formatDateRange('2026-07-25', null), '25 jul 2026');
  assert.equal(formatDateRange(null, '2026-07-25'), '25 jul 2026');
  assert.equal(formatDateRange(null, null), '');
});

test('formatPeriod gebruikt dezelfde notatie', () => {
  assert.equal(formatPeriod(reis()), '25 jul — 8 aug 2026');
  assert.equal(formatPeriod({}), '');
});

// ── Kleine opmaakhelpers ────────────────────────────────────────────

test('afstand en duur worden leesbaar afgerond', () => {
  assert.equal(formatDistance(450), '450 m');
  assert.equal(formatDistance(1500), '1.5 km');
  assert.equal(formatDistance(24000), '24 km');
  assert.equal(formatDistance(null), '');

  assert.equal(formatDuration(90), '2 min');
  assert.equal(formatDuration(3600), '1u');
  assert.equal(formatDuration(5400), '1u30');
  assert.equal(formatDuration(null), '');
});

test('Maps-link valt terug op coördinaten als er geen zoekterm is', () => {
  assert.match(getMapsLink({ name: 'X', mapsQuery: 'Camping X' }), /query=Camping%20X/);
  assert.match(getMapsLink({ name: 'X', coords: [48.07, 6.87] }), /query=48\.07,6\.87/);
  assert.equal(getMapsLink({ name: 'X' }), null);
});

// ── Welk verblijf is "nu"? ──────────────────────────────────────────

const V = [
  { id: 'a', name: 'Camping A', startDate: '2026-08-01', endDate: '2026-08-08', coords: [48.00, 7.00] },
  { id: 'b', name: 'Camping B', startDate: '2026-08-08', endDate: '2026-08-15', coords: [48.00, 8.00] },
];

test('vandaag binnen een verblijf geeft dat verblijf', () => {
  assert.equal(huidigVerblijf(V, '2026-08-03').id, 'a');
  assert.equal(huidigVerblijf(V, '2026-08-12').id, 'b');
});

test('op een wisseldag wint het verblijf dat begint', () => {
  // 8 augustus valt in allebei; die dag rijd je naar B, dus daar wil je weten
  // wat er in de buurt is.
  assert.equal(huidigVerblijf(V, '2026-08-08').id, 'b');
});

test('vóór de reis het eerste verblijf, erna het laatste', () => {
  assert.equal(huidigVerblijf(V, '2026-07-01').id, 'a');
  assert.equal(huidigVerblijf(V, '2026-12-25').id, 'b');
});

test('de volgorde van de invoer maakt niet uit', () => {
  assert.equal(huidigVerblijf([V[1], V[0]], '2026-08-03').id, 'a');
});

test('zonder verblijven of zonder datum valt huidigVerblijf niet om', () => {
  assert.equal(huidigVerblijf([], '2026-08-03'), null);
  assert.equal(huidigVerblijf(null, '2026-08-03'), null);
  assert.equal(huidigVerblijf([{ id: 'x' }], '2026-08-03'), null, 'zonder begindatum telt niet mee');
  assert.equal(huidigVerblijf(V, 'onzin').id, 'a', 'zonder bruikbare datum: de eerste');
});

// ── Bij welk verblijf hoort een activiteit? ─────────────────────────

test('elke activiteit gaat naar het dichtstbijzijnde verblijf', () => {
  const acts = [
    { id: 'bij_a', coords: [48.01, 7.02] },
    { id: 'bij_b', coords: [47.98, 7.95] },
    { id: 'midden_maar_net_a', coords: [48.00, 7.49] },
  ];
  const uit = verblijfPerActiviteit(acts, V);
  assert.equal(uit.bij_a, 'a');
  assert.equal(uit.bij_b, 'b');
  assert.equal(uit.midden_maar_net_a, 'a');
});

test('zonder coördinaten hoort een activiteit nergens bij', () => {
  const uit = verblijfPerActiviteit([{ id: 'x' }, { id: 'y', coords: [48] }], V);
  assert.equal(uit.x, null);
  assert.equal(uit.y, null);
});

test('zonder verblijven met locatie hoort alles nergens bij', () => {
  const uit = verblijfPerActiviteit([{ id: 'x', coords: [48, 7] }], [{ id: 'a' }]);
  assert.equal(uit.x, null);
  assert.deepEqual(verblijfPerActiviteit([], V), {});
});

test('met één verblijf hoort alles daarbij', () => {
  const uit = verblijfPerActiviteit(
    [{ id: 'ver_weg', coords: [52.37, 4.90] }], [V[0]],
  );
  assert.equal(uit.ver_weg, 'a');
});
