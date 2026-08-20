import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  dagBinnenVerblijf, bezoekPerVerblijf, maakBezoek, voegBezoekToe, handmatigBezoek, pasBezoekAan,
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

// ── Zelf toevoegen ──────────────────────────────────────────────────

test('een handmatig bezoek krijgt een eigen id', () => {
  const b = handmatigBezoek({ name: 'Kasteel van Bouillon' });
  assert.match(b.id, /^hand_/, 'eigen ruimte, botst niet met een activiteit-id');
  assert.equal(b.name, 'Kasteel van Bouillon');
});

test('twee handmatige bezoeken achter elkaar krijgen verschillende ids', () => {
  const ids = new Set(
    Array.from({ length: 200 }, () => handmatigBezoek({ name: 'x' }).id));
  assert.equal(ids.size, 200, 'binnen dezelfde milliseconde mogen ze niet samenvallen');
});

test('een handmatig bezoek wordt net zo opgeschoond als een bezoek uit de planning', () => {
  const b = handmatigBezoek({
    name: 'N'.repeat(200), emoji: '🏰', category: 'culture',
    note: 'x'.repeat(500), coords: [49.79, 5.06], datum: '2003-07-14',
  });
  assert.equal(b.name.length, 90);
  assert.equal(b.note.length, 300);
  assert.deepEqual(b.coords, [49.79, 5.06]);
  assert.equal(b.datum, '2003-07-14');
  assert.equal(b.emoji, '🏰');
  assert.equal(b.category, 'culture');
});

test('zonder bruikbare invoer blijft er een nette lege regel over', () => {
  const b = handmatigBezoek({ datum: 'zomer 2003', coords: [49.79] });
  assert.equal(b.name, 'Activiteit');
  assert.equal(b.datum, null, 'geen ISO-datum, dus geen datum');
  assert.equal(b.coords, null, 'één getal is geen coördinaat');
  assert.match(b.id, /^hand_/, 'wel altijd een id — zonder id slaat voegBezoekToe hem over');
});

test('een handmatig bezoek komt in de lijst tussen de rest op datum', () => {
  const bestaand = [
    { id: 'a1', name: 'Meer', datum: '2003-07-10' },
    { id: 'a2', name: 'Markt', datum: '2003-07-20' },
  ];
  const uit = voegBezoekToe(bestaand, [handmatigBezoek({ name: 'Kasteel', datum: '2003-07-14' })]);
  assert.deepEqual(uit.map(b => b.name), ['Meer', 'Kasteel', 'Markt']);
});

test('bijwerken uit de planning laat een handmatige regel staan', () => {
  const hand = handmatigBezoek({ name: 'Kasteel', datum: '2026-08-11' });
  const uitPlanning = bezoekPerVerblijf({ '2026-08-10': ['a1'] }, acts, stays).s1;
  const uit = voegBezoekToe([hand], uitPlanning);
  assert.deepEqual(uit.map(b => b.name), ['Meer', 'Kasteel']);
  assert.equal(uit.filter(b => b.name === 'Kasteel').length, 1, 'en niet dubbel');
});

// ── een bezoek bijwerken ────────────────────────────────────────────

const rij = () => [
  maakBezoek({ id: 'a', name: 'Kasteel', emoji: '🏰', category: 'culture', coords: [50, 5] }, '2026-08-01'),
  maakBezoek({ id: 'b', name: 'Museum', emoji: '🏛️', category: 'culture' }, '2026-08-09'),
];

test('naam, datum en notitie zijn achteraf recht te zetten', () => {
  const uit = pasBezoekAan(rij(), 'a', { name: 'Kasteel van Bouillon', note: 'mooi uitzicht' });
  const a = uit.find(b => b.id === 'a');
  assert.equal(a.name, 'Kasteel van Bouillon');
  assert.equal(a.note, 'mooi uitzicht');
  assert.equal(a.datum, '2026-08-01', 'wat je niet meestuurt blijft staan');
});

test('het id blijft, want daarop dedupliceert voegBezoekToe', () => {
  const uit = pasBezoekAan(rij(), 'a', { name: 'Anders', id: 'kaper' });
  assert.ok(uit.some(b => b.id === 'a'));
  assert.ok(!uit.some(b => b.id === 'kaper'), 'een id in de patch wordt genegeerd');
});

test('een gewijzigde datum verplaatst de regel in de lijst', () => {
  const uit = pasBezoekAan(rij(), 'b', { datum: '2026-07-04' });
  assert.deepEqual(uit.map(b => b.id), ['b', 'a']);
});

test('een datum wissen zet de regel achteraan', () => {
  const uit = pasBezoekAan(rij(), 'a', { datum: null });
  assert.deepEqual(uit.map(b => b.id), ['b', 'a']);
  assert.equal(uit[1].datum, null);
});

test('de coördinaten blijven staan bij het bijwerken', () => {
  const uit = pasBezoekAan(rij(), 'a', { name: 'Anders' });
  assert.deepEqual(uit.find(b => b.id === 'a').coords, [50, 5]);
});

test('de klemmen op naam en notitie gelden ook bij bijwerken', () => {
  const uit = pasBezoekAan(rij(), 'a', { name: 'N'.repeat(200), note: 'x'.repeat(500) });
  const a = uit.find(b => b.id === 'a');
  assert.equal(a.name.length, 90);
  assert.equal(a.note.length, 300);
});

test('een onbekend id laat de lijst met rust, ook de volgorde', () => {
  // Bewust door elkaar: raakt er niets, dan hoort er ook niets te verschuiven.
  const voor = [...rij()].reverse();
  const uit = pasBezoekAan(voor, 'bestaat-niet', { name: 'Hoi' });
  assert.deepEqual(uit.map(b => b.id), voor.map(b => b.id), 'ongewijzigde volgorde');
  assert.deepEqual(uit.map(b => b.name), voor.map(b => b.name));
});

test('bijwerken zonder id of lijst valt niet om', () => {
  assert.deepEqual(pasBezoekAan([], 'a', { name: 'x' }), []);
  assert.deepEqual(pasBezoekAan(null, 'a', { name: 'x' }), []);
  assert.deepEqual(pasBezoekAan(rij(), null, { name: 'x' }).length, 2);
});
