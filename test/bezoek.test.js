import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  dagBinnenVerblijf, bezoekPerVerblijf, maakBezoek, voegBezoekToe,
} from '../lib/bezoek.js';

const stay = (o) => ({ id: o.id || 's1', name: o.name || 'Camping', ...o });

// ── Welke dag hoort bij welk verblijf ───────────────────────────────

test('de aankomst- en de vertrekdag horen er allebei bij', () => {
  const s = stay({ startDate: '2026-08-10', endDate: '2026-08-14' });
  assert.equal(dagBinnenVerblijf('2026-08-10', s), true, 'aankomstdag');
  assert.equal(dagBinnenVerblijf('2026-08-14', s), true, 'vertrekdag — je bent er die ochtend nog');
  assert.equal(dagBinnenVerblijf('2026-08-12', s), true);
});

test('dagen ervoor en erna horen er niet bij', () => {
  const s = stay({ startDate: '2026-08-10', endDate: '2026-08-14' });
  assert.equal(dagBinnenVerblijf('2026-08-09', s), false);
  assert.equal(dagBinnenVerblijf('2026-08-15', s), false);
});

test('een verblijf van één dag werkt ook zonder einddatum', () => {
  const s = stay({ startDate: '2026-08-10', endDate: null });
  assert.equal(dagBinnenVerblijf('2026-08-10', s), true);
  assert.equal(dagBinnenVerblijf('2026-08-11', s), false);
});

test('zonder begindatum valt er niets te koppelen', () => {
  assert.equal(dagBinnenVerblijf('2026-08-10', stay({})), false);
  assert.equal(dagBinnenVerblijf(null, stay({ startDate: '2026-08-10' })), false);
});

// ── Bezoek per verblijf ─────────────────────────────────────────────

const acts = {
  a1: { id: 'a1', name: 'Meer', emoji: '🏊', visited: true, coords: [48, 6] },
  a2: { id: 'a2', name: 'Markt', emoji: '🧺', visited: true },
  a3: { id: 'a3', name: 'Nog niet geweest', emoji: '🏰' },
  a4: { id: 'a4', name: 'Bij het tweede verblijf', emoji: '⛰️', visited: true },
};

const stays = [
  stay({ id: 's1', startDate: '2026-08-10', endDate: '2026-08-12' }),
  stay({ id: 's2', startDate: '2026-08-12', endDate: '2026-08-15' }),
];

test('alleen aangevinkte activiteiten komen erin', () => {
  const uit = bezoekPerVerblijf(
    { '2026-08-10': ['a1', 'a3'], '2026-08-11': ['a2'] }, acts, stays);
  assert.deepEqual(uit.s1.map(b => b.name), ['Meer', 'Markt']);
  assert.equal(uit.s1.some(b => b.name === 'Nog niet geweest'), false);
});

test('elke activiteit hoort bij het verblijf van die dag', () => {
  const uit = bezoekPerVerblijf(
    { '2026-08-10': ['a1'], '2026-08-14': ['a4'] }, acts, stays);
  assert.deepEqual(uit.s1.map(b => b.id), ['a1']);
  assert.deepEqual(uit.s2.map(b => b.id), ['a4']);
});

test('een wisseldag telt bij allebei de verblijven', () => {
  // 12 augustus is de vertrekdag van s1 én de aankomstdag van s2
  const uit = bezoekPerVerblijf({ '2026-08-12': ['a1'] }, acts, stays);
  assert.deepEqual(uit.s1.map(b => b.id), ['a1']);
  assert.deepEqual(uit.s2.map(b => b.id), ['a1']);
});

test('twee keer dezelfde activiteit levert één regel op, met de eerste datum', () => {
  const uit = bezoekPerVerblijf(
    { '2026-08-11': ['a1'], '2026-08-10': ['a1'] }, acts, stays);
  assert.equal(uit.s1.length, 1);
  assert.equal(uit.s1[0].datum, '2026-08-10', 'de vroegste dag telt');
});

test('het resultaat staat op datum', () => {
  const uit = bezoekPerVerblijf(
    { '2026-08-11': ['a2'], '2026-08-10': ['a1'] }, acts, stays);
  assert.deepEqual(uit.s1.map(b => b.datum), ['2026-08-10', '2026-08-11']);
});

test('een leeg plan geeft per verblijf een lege lijst, geen undefined', () => {
  const uit = bezoekPerVerblijf({}, acts, stays);
  assert.deepEqual(uit.s1, []);
  assert.deepEqual(uit.s2, []);
});

test('rommel in het plan valt niet om', () => {
  const uit = bezoekPerVerblijf(
    { '2026-08-10': 'geen array', '2026-08-11': ['bestaat-niet'] }, acts, stays);
  assert.deepEqual(uit.s1, []);
});

test('zonder invoer komt er een leeg object terug', () => {
  assert.deepEqual(bezoekPerVerblijf(null, null, null), {});
  assert.deepEqual(bezoekPerVerblijf({}, {}, []), {});
});

// ── De momentopname ─────────────────────────────────────────────────

test('een bezoek bewaart alleen wat het logboek nodig heeft', () => {
  const b = maakBezoek({
    id: 'a1', name: 'Meer', emoji: '🏊', category: 'water', note: 'koud',
    coords: [48.1, 6.9], visited: true, routeGeometry: [[1, 2]], mapsQuery: 'x',
  }, '2026-08-10');
  assert.deepEqual(b, {
    id: 'a1', name: 'Meer', emoji: '🏊', category: 'water',
    note: 'koud', coords: [48.1, 6.9], datum: '2026-08-10',
  });
  assert.equal(b.routeGeometry, undefined, 'geen geometrie mee — dat is planner-spul');
});

test('een onzinnige datum wordt niet bewaard', () => {
  assert.equal(maakBezoek({ id: 'a' }, 'gisteren').datum, null);
  assert.equal(maakBezoek({ id: 'a' }).datum, null);
});

test('een activiteit zonder naam krijgt een nette vervanging', () => {
  assert.equal(maakBezoek({ id: 'a' }).name, 'Activiteit');
  assert.equal(maakBezoek({ id: 'a' }).coords, null);
});

// ── Samenvoegen ─────────────────────────────────────────────────────

test('wat er al stond blijft staan', () => {
  const bestaand = [{ id: 'a1', name: 'Meer', datum: '2026-08-10', note: 'zelf aangepast' }];
  const uit = voegBezoekToe(bestaand, [{ id: 'a1', name: 'Meer', datum: '2026-08-11', note: null }]);
  assert.equal(uit.length, 1);
  assert.equal(uit[0].note, 'zelf aangepast', 'de bestaande regel wint');
});

test('nieuwe bezoeken komen erbij', () => {
  const uit = voegBezoekToe(
    [{ id: 'a1', datum: '2026-08-10' }],
    [{ id: 'a2', datum: '2026-08-11' }, { id: 'a3', datum: '2026-08-09' }]);
  assert.deepEqual(uit.map(b => b.id), ['a3', 'a1', 'a2'], 'op datum gesorteerd');
});

test('bezoeken zonder datum komen achteraan', () => {
  const uit = voegBezoekToe([], [{ id: 'a1' }, { id: 'a2', datum: '2026-08-10' }]);
  assert.deepEqual(uit.map(b => b.id), ['a2', 'a1']);
});

test('lege invoer geeft een lege lijst', () => {
  assert.deepEqual(voegBezoekToe(null, null), []);
  assert.deepEqual(voegBezoekToe([], [{ naamloos: true }]), [], 'zonder id geen regel');
});
