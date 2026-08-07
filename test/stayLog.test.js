import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groepeerReizen, tripStayId, stayFromTripStay } from '../lib/stayLog.js';
import { stayTypeLabel, countryFlag, STAY_TYPES } from '../lib/stayTypes.js';
import { sanitizeStay } from '../lib/stayValidation.js';

const verblijf = (over = {}) => ({
  id: 'v1', name: 'Camping', coords: [48, 6], startDate: '2026-07-25', endDate: '2026-08-01', ...over,
});

// ── Reizen groeperen ────────────────────────────────────────────────
// Valkuil 14: reizen zijn afgeleid, niet opgeslagen.

test('aansluitende verblijven vormen één reis', () => {
  const reizen = groepeerReizen([
    verblijf({ id: 'a', startDate: '2026-07-25', endDate: '2026-08-01' }),
    verblijf({ id: 'b', startDate: '2026-08-01', endDate: '2026-08-08' }),
  ]);
  assert.equal(reizen.length, 1);
  assert.equal(reizen[0].stays.length, 2);
});

test('een gat van meer dan vijf dagen begint een nieuwe reis', () => {
  const reizen = groepeerReizen([
    verblijf({ id: 'a', startDate: '2026-07-01', endDate: '2026-07-08' }),
    verblijf({ id: 'b', startDate: '2026-07-20', endDate: '2026-07-27' }),
  ]);
  assert.equal(reizen.length, 2);
});

test('een gat van precies vijf dagen hoort er nog bij', () => {
  const reizen = groepeerReizen([
    verblijf({ id: 'a', startDate: '2026-07-01', endDate: '2026-07-08' }),
    verblijf({ id: 'b', startDate: '2026-07-13', endDate: '2026-07-20' }),
  ]);
  assert.equal(reizen.length, 1);
});

test('twee verschillende reistitels worden nooit samengevoegd', () => {
  // Sluiten in de tijd aan, maar horen bij verschillende gearchiveerde reizen
  const reizen = groepeerReizen([
    verblijf({ id: 'a', startDate: '2026-07-25', endDate: '2026-08-01', tripTitle: 'Vogezen' }),
    verblijf({ id: 'b', startDate: '2026-08-01', endDate: '2026-08-08', tripTitle: 'Elzas' }),
  ]);
  assert.equal(reizen.length, 2);
  assert.equal(reizen[0].naam, 'Vogezen');
  assert.equal(reizen[1].naam, 'Elzas');
});

test('overlappende periodes tellen als dezelfde reis', () => {
  const reizen = groepeerReizen([
    verblijf({ id: 'a', startDate: '2026-07-25', endDate: '2026-08-05' }),
    verblijf({ id: 'b', startDate: '2026-08-01', endDate: '2026-08-08' }),
  ]);
  assert.equal(reizen.length, 1);
});

test('zonder titel krijgt een reis een naam uit de maand en het jaar', () => {
  const eenMaand = groepeerReizen([verblijf({ startDate: '2026-07-05', endDate: '2026-07-12' })]);
  assert.equal(eenMaand[0].naam, 'jul 2026');

  const tweeMaanden = groepeerReizen([verblijf({ startDate: '2026-07-25', endDate: '2026-08-08' })]);
  assert.equal(tweeMaanden[0].naam, 'jul—aug 2026');
});

test('verblijven zonder datum komen los te staan, zonder route', () => {
  const reizen = groepeerReizen([
    verblijf({ id: 'a' }),
    { id: 'b', name: 'Ooit', coords: [50, 5], periodLabel: 'zomer 2003' },
  ]);
  const los = reizen.filter(r => r.los);
  assert.equal(los.length, 1);
  assert.equal(los[0].naam, 'zomer 2003');
});

test('elke reis krijgt een eigen kleur en de verblijven staan op datum', () => {
  const reizen = groepeerReizen([
    verblijf({ id: 'b', startDate: '2026-08-01', endDate: '2026-08-08' }),
    verblijf({ id: 'a', startDate: '2026-07-25', endDate: '2026-08-01' }),
  ]);
  assert.equal(reizen[0].stays[0].id, 'a', 'vroegste verblijf eerst');
  assert.ok(reizen[0].kleur);
});

test('een lege lijst geeft geen reizen', () => {
  assert.deepEqual(groepeerReizen([]), []);
});

// ── Importeren uit een reis ─────────────────────────────────────────

test('de id uit een reis is stabiel, zodat dubbel importeren niets toevoegt', () => {
  const stay = { id: 's1', startDate: '2026-07-25' };
  assert.equal(tripStayId(stay), tripStayId({ ...stay }));
  assert.notEqual(tripStayId(stay), tripStayId({ id: 's1', startDate: '2026-07-26' }));
});

test('een verblijf uit een reis neemt naam, coords en periode over', () => {
  const uit = stayFromTripStay(
    { id: 's1', name: 'Camping du Lac', coords: [48, 6], startDate: '2026-07-25', endDate: '2026-08-01' },
    { title: 'Vogezen 2026' },
  );
  assert.equal(uit.name, 'Camping du Lac');
  assert.equal(uit.tripTitle, 'Vogezen 2026');
  assert.equal(uit.source, 'trip');
  assert.equal(uit.score, null, 'cijfer geef je zelf later');
});

// ── Soorten en landen ───────────────────────────────────────────────

test('bij "anders" wint de eigen omschrijving', () => {
  assert.equal(stayTypeLabel({ type: 'hotel' }), '🏨 Hotel');
  assert.equal(stayTypeLabel({ type: 'anders', typeOther: 'boot' }), '✨ boot');
  assert.equal(stayTypeLabel({ type: 'anders' }), '✨ Anders');
  assert.equal(stayTypeLabel({}), null);
});

test('landcode wordt een vlag', () => {
  assert.equal(countryFlag('FR'), '🇫🇷');
  assert.equal(countryFlag('nl'), '🇳🇱');
  assert.equal(countryFlag('XXX'), '');
  assert.equal(countryFlag(null), '');
});

// ── Opschoning vóór opslag ──────────────────────────────────────────

test('onbekende soort verdwijnt, geldige blijft', () => {
  assert.equal(sanitizeStay({ type: 'kasteel' }).type, null);
  assert.equal(sanitizeStay({ type: 'hotel' }).type, 'hotel');
  assert.ok(STAY_TYPES.some(t => t.id === 'hotel'));
});

test('eigen omschrijving hoort alleen bij "anders"', () => {
  assert.equal(sanitizeStay({ type: 'hotel', typeOther: 'weg hiermee' }).typeOther, null);
  assert.equal(sanitizeStay({ type: 'anders', typeOther: 'boot' }).typeOther, 'boot');
});

test('landcode wordt genormaliseerd of geweigerd', () => {
  assert.equal(sanitizeStay({ countryCode: 'nl' }).countryCode, 'NL');
  assert.equal(sanitizeStay({ countryCode: 'NEDERLAND' }).countryCode, null);
  assert.equal(sanitizeStay({}).countryCode, null);
});

test('cijfer blijft binnen 1 tot 10, datums moeten kloppen', () => {
  assert.equal(sanitizeStay({ score: 8 }).score, 8);
  assert.equal(sanitizeStay({ score: 12 }).score, null);
  assert.equal(sanitizeStay({ score: 0 }).score, null);
  assert.equal(sanitizeStay({ score: 'acht' }).score, null);
  assert.equal(sanitizeStay({ startDate: '25-07-2026' }).startDate, null);
  assert.equal(sanitizeStay({ startDate: '2026-07-25' }).startDate, '2026-07-25');
});

test('onzinnige coördinaten worden geweigerd', () => {
  assert.deepEqual(sanitizeStay({ coords: [48.07, 6.87] }).coords, [48.07, 6.87]);
  assert.equal(sanitizeStay({ coords: [200, 6] }).coords, null);
  assert.equal(sanitizeStay({ coords: ['a', 'b'] }).coords, null);
  assert.equal(sanitizeStay({ coords: [48] }).coords, null);
});

test("foto's zonder url vallen weg", () => {
  const uit = sanitizeStay({ photos: [{ url: 'https://x/1.jpg' }, { caption: 'geen url' }] });
  assert.equal(uit.photos.length, 1);
});
