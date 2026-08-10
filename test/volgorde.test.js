import test from 'node:test';
import assert from 'node:assert/strict';

import {
  hemelsbreed, optimaliseerVolgorde, canoniekeVolgorde, herstelMatrix, kostenUitMatrix,
  isWandelbaar, kiesVervoer, WANDEL_DREMPEL_M,
} from '../lib/volgorde.js';

// Een vierkant van ~1 km, met de hoeken linksom genummerd:
//
//   A ---- B
//   |      |
//   D ---- C
//
const A = [48.000, 6.000];
const B = [48.000, 6.014];
const C = [47.990, 6.014];
const D = [47.990, 6.000];

const item = (id, coords) => ({ id, coords });

// ── Hemelsbreed ─────────────────────────────────────────────────────

test('hemelsbreed rekent in meters en is symmetrisch', () => {
  const heen = hemelsbreed(A, B);
  assert.ok(heen > 900 && heen < 1200, `verwacht ~1 km, kreeg ${Math.round(heen)} m`);
  assert.equal(Math.round(heen), Math.round(hemelsbreed(B, A)));
  assert.equal(hemelsbreed(A, A), 0);
});

test('hemelsbreed valt niet om over rommel', () => {
  assert.equal(hemelsbreed(null, A), 0);
  assert.equal(hemelsbreed(A, undefined), 0);
});

// ── De kortste route ────────────────────────────────────────────────

test('een kruislingse volgorde wordt een rondje', () => {
  // A → C → B → D kruist zichzelf; het rondje A-B-C-D is korter.
  const uit = optimaliseerVolgorde([item('a', A), item('c', C), item('b', B), item('d', D)]);
  assert.ok(uit.na < uit.voor, 'de nieuwe volgorde moet korter zijn');
  // Buren in het vierkant: geen enkele stap mag een diagonaal zijn.
  const buren = { a: ['b', 'd'], b: ['a', 'c'], c: ['b', 'd'], d: ['a', 'c'] };
  for (let i = 1; i < uit.ids.length; i++) {
    assert.ok(buren[uit.ids[i - 1]].includes(uit.ids[i]),
      `${uit.ids[i - 1]} → ${uit.ids[i]} is een diagonaal: ${uit.ids.join(' → ')}`);
  }
});

test('een volgorde die al de kortste is blijft ongemoeid', () => {
  const in_ = [item('a', A), item('b', B), item('c', C), item('d', D)];
  const uit = optimaliseerVolgorde(in_);
  assert.deepEqual(uit.ids, ['a', 'b', 'c', 'd']);
  assert.equal(uit.na, uit.voor);
});

test('de gulzige route wordt naderhand rechtgetrokken', () => {
  // Dichtstbijzijnde buur loopt hier vast: vanaf het verblijf is P1 het
  // dichtst bij, maar dan moet je aan het eind het hele stuk naar P4 terug.
  // Andersom beginnen (P3 → P2 → P1 → P4) is ruim een kilometer korter.
  const B0 = [48.000, 6.000];
  const P1 = [48.010, 6.000];
  const P2 = [48.010, 6.015];
  const P3 = [48.000, 6.015];
  const P4 = [48.040, 6.0075];
  const uit = optimaliseerVolgorde(
    [item('p1', P1), item('p2', P2), item('p3', P3), item('p4', P4)],
    { begin: B0 },
  );
  assert.deepEqual(uit.ids, ['p3', 'p2', 'p1', 'p4']);
  assert.ok(uit.voor - uit.na > 1000, `verwacht >1 km winst, kreeg ${Math.round(uit.voor - uit.na)} m`);
});

test('het verblijf telt mee als vertrek- en eindpunt', () => {
  // Vanaf D vlakbij is D-C-B-A het rondje; vanaf B juist B-A-D-C… dus de
  // volgorde moet verschillen als het verblijf verschuift.
  const stops = [item('a', A), item('b', B), item('c', C), item('d', D)];
  const vanafA = optimaliseerVolgorde(stops, { begin: [48.0005, 6.0005], eind: [48.0005, 6.0005] });
  const vanafC = optimaliseerVolgorde(stops, { begin: [47.9895, 6.0135], eind: [47.9895, 6.0135] });
  assert.equal(vanafA.ids[0], 'a', 'vanaf het verblijf bij A begin je bij A');
  assert.equal(vanafC.ids[0], 'c', 'vanaf het verblijf bij C begin je bij C');
});

// ── Start- en eindpunt ──────────────────────────────────────────────

test('het startanker staat vooraan en het eindanker achteraan', () => {
  const uit = optimaliseerVolgorde(
    [item('a', A), item('b', B), item('c', C), item('d', D)],
    { start: 'c', stop: 'b' },
  );
  assert.equal(uit.ids[0], 'c');
  assert.equal(uit.ids[uit.ids.length - 1], 'b');
});

test('een anker wint van het algoritme, ook als dat langer rijden is', () => {
  // Zonder anker begint hij bij A (naast het verblijf); met start=c niet.
  const stops = [item('a', A), item('b', B), item('c', C), item('d', D)];
  const bij = { begin: [48.0005, 6.0005], eind: [48.0005, 6.0005] };
  const vrij = optimaliseerVolgorde(stops, bij);
  const vast = optimaliseerVolgorde(stops, { ...bij, start: 'c' });
  assert.equal(vrij.ids[0], 'a');
  assert.equal(vast.ids[0], 'c');
  assert.ok(vast.na > vrij.na, 'het anker mag een langere route opleveren');
});

test('hetzelfde id als start én eind levert maar één anker op', () => {
  const uit = optimaliseerVolgorde(
    [item('a', A), item('c', C), item('b', B), item('d', D)],
    { start: 'b', stop: 'b' },
  );
  assert.equal(uit.ids[0], 'b');
  assert.equal(uit.ids.filter(id => id === 'b').length, 1, 'niet twee keer in de lijst');
  assert.equal(uit.ids.length, 4);
});

test('een anker dat niet op de dag staat wordt genegeerd', () => {
  const uit = optimaliseerVolgorde(
    [item('a', A), item('c', C), item('b', B), item('d', D)],
    { start: 'bestaat-niet' },
  );
  assert.equal(uit.ids.length, 4);
  assert.ok(uit.na < uit.voor);
});

// ── Zonder locatie ──────────────────────────────────────────────────

test('activiteiten zonder locatie blijven achteraan, in hun eigen volgorde', () => {
  const uit = optimaliseerVolgorde([
    item('geen1', null), item('a', A), item('c', C),
    item('geen2', undefined), item('b', B), item('d', D),
  ]);
  assert.deepEqual(uit.ids.slice(-2), ['geen1', 'geen2']);
  assert.equal(uit.zonderLocatie, 2);
});

test('alles zonder locatie laat de lijst met rust', () => {
  const uit = optimaliseerVolgorde([item('x', null), item('y', null)]);
  assert.deepEqual(uit.ids, ['x', 'y']);
  assert.equal(uit.voor, 0);
  assert.equal(uit.na, 0);
});

// ── Randgevallen ────────────────────────────────────────────────────

test('nul, één en twee activiteiten vallen niet om', () => {
  assert.deepEqual(optimaliseerVolgorde([]).ids, []);
  assert.deepEqual(optimaliseerVolgorde(null).ids, []);
  assert.deepEqual(optimaliseerVolgorde([item('a', A)]).ids, ['a']);
  assert.deepEqual(optimaliseerVolgorde([item('a', A), item('b', B)]).ids, ['a', 'b']);
});

test('rommelige coördinaten tellen als "geen locatie"', () => {
  const uit = optimaliseerVolgorde([
    item('kapot', [48, 'zes']), item('a', A), item('c', C), item('b', B),
  ]);
  assert.equal(uit.ids[uit.ids.length - 1], 'kapot');
  assert.equal(uit.zonderLocatie, 1);
});

// ── Echte rijafstanden ──────────────────────────────────────────────

test('een eigen kosten-functie geeft een andere volgorde dan hemelsbreed', () => {
  const stops = [item('a', A), item('b', B), item('c', C), item('d', D)];
  // Doe alsof er tussen A en C een tunnel ligt en de rest bergpassen zijn:
  // dan is de diagonaal juist het goedkoopst.
  const tunnel = (x, y) => {
    const paar = [x, y];
    const isAC = paar.includes(A) && paar.includes(C);
    const isBD = paar.includes(B) && paar.includes(D);
    if (isAC || isBD) return 100;
    return 10000;
  };
  const echt = optimaliseerVolgorde(stops, { kosten: tunnel });
  const vogel = optimaliseerVolgorde(stops, {});
  assert.notDeepEqual(echt.ids, vogel.ids, 'de matrix moet de volgorde bepalen');
  // A en C horen naast elkaar te staan, net als B en D.
  const pos = Object.fromEntries(echt.ids.map((id, i) => [id, i]));
  assert.equal(Math.abs(pos.a - pos.c), 1);
  assert.equal(Math.abs(pos.b - pos.d), 1);
});

test('kostenUitMatrix zoekt op coördinaat op en valt terug bij een gat', () => {
  const punten = [A, B];
  const kosten = kostenUitMatrix(punten, [[0, 4200], [4200, 0]]);
  assert.equal(kosten(A, B), 4200);
  // C staat niet in de matrix → hemelsbreed
  assert.ok(Math.abs(kosten(A, C) - hemelsbreed(A, C)) < 0.001);
});

// ── Te voet of met de auto? ─────────────────────────────────────────

// Vijf stops in een stadscentrum: alles binnen ~800 m
const STAD = [
  [48.0740, 7.3560], [48.0755, 7.3585], [48.0765, 7.3600],
  [48.0752, 7.3548], [48.0738, 7.3592],
];
const CAMPING = [48.0000, 7.2000];   // ruim tien kilometer verderop

test('stops in een centrum zijn wandelbaar', () => {
  assert.equal(isWandelbaar(STAD), true);
});

test('één stop verderop maakt er een rijdag van', () => {
  assert.equal(isWandelbaar([...STAD, [48.1200, 7.4200]]), false);
});

test('de afstand tot het verblijf telt niet mee', () => {
  // Naar de stad rijd je, in de stad loop je. Het verblijf zit dus niet in de
  // lijst die je aan isWandelbaar geeft — maar zelfs als de stops ver van huis
  // liggen, blijft de wandeling onderling kort.
  assert.equal(isWandelbaar(STAD), true);
  assert.ok(hemelsbreed(CAMPING, STAD[0]) > 5000, 'de camping ligt echt ver weg');
  assert.equal(isWandelbaar([...STAD, CAMPING]), false,
    'zet je het verblijf er wél bij, dan kantelt het — daarom doen we dat niet');
});

test('de drempel ligt op de grootste onderlinge afstand', () => {
  // Twee stops net binnen en net buiten de drempel, op dezelfde breedtegraad.
  const graden = (meters) => meters / 111320;
  const a = [48, 6];
  const netBinnen = [48 + graden(WANDEL_DREMPEL_M - 50), 6];
  const netBuiten = [48 + graden(WANDEL_DREMPEL_M + 50), 6];
  assert.equal(isWandelbaar([a, netBinnen]), true);
  assert.equal(isWandelbaar([a, netBuiten]), false);
});

test('nul, één en rommelige punten zijn wandelbaar (er valt niets te rijden)', () => {
  assert.equal(isWandelbaar([]), true);
  assert.equal(isWandelbaar(null), true);
  assert.equal(isWandelbaar([STAD[0]]), true);
  assert.equal(isWandelbaar([STAD[0], null, undefined]), true);
});

test('een eigen keuze wint altijd van de automaat', () => {
  assert.equal(kiesVervoer(STAD, null), 'lopen');
  assert.equal(kiesVervoer(STAD, 'rijden'), 'rijden', 'stad, maar jij wilt rijden');
  const ver = [...STAD, [48.1200, 7.4200]];
  assert.equal(kiesVervoer(ver, null), 'rijden');
  assert.equal(kiesVervoer(ver, 'lopen'), 'lopen', 'ver uit elkaar, maar jij wilt lopen');
  assert.equal(kiesVervoer(STAD, 'onzin'), 'lopen', 'rommel valt terug op de automaat');
});

test('zonder verblijf als begin en eind komt er een andere volgorde uit', () => {
  // Dit is het gedrag waar wandelmodus om draait: de rit vanaf de camping telt
  // niet mee, dus de stop die daar het dichtst bij ligt wint niet vanzelf.
  const stops = STAD.map((c, i) => item(`s${i}`, c));
  const metVerblijf = optimaliseerVolgorde(stops, { begin: CAMPING, eind: CAMPING });
  const zonder = optimaliseerVolgorde(stops, {});
  assert.notDeepEqual(metVerblijf.ids, zonder.ids);
});

// ── Canonieke volgorde en de matrix terugdraaien ────────────────────

test('canoniekeVolgorde sorteert dezelfde verzameling altijd hetzelfde', () => {
  const een = canoniekeVolgorde([C, A, B, D]);
  const twee = canoniekeVolgorde([B, D, C, A]);
  assert.deepEqual(een.punten, twee.punten, 'de volgorde van invoer mag niet uitmaken');
  assert.deepEqual(een.punten[0], D, 'laagste breedtegraad eerst');
});

test('herstelMatrix draait de sortering precies terug', () => {
  const punten = [C, A, B, D];
  const { punten: gesorteerd, index } = canoniekeVolgorde(punten);
  // Een matrix waarvan elke cel zegt welke twee punten hij verbindt
  const nr = (p) => punten.findIndex(q => q === p);
  const matrix = gesorteerd.map(p => gesorteerd.map(q => nr(p) * 10 + nr(q)));
  const terug = herstelMatrix(matrix, index);
  for (let i = 0; i < punten.length; i++) {
    for (let j = 0; j < punten.length; j++) {
      assert.equal(terug[i][j], i * 10 + j, `cel ${i},${j}`);
    }
  }
});

test('herstelMatrix weigert een matrix die niet klopt', () => {
  assert.equal(herstelMatrix([[1, 2]], [0, 1]), null, 'te weinig rijen');
  assert.equal(herstelMatrix([[1], [2]], [0, 1]), null, 'rij van de verkeerde lengte');
  assert.equal(herstelMatrix(null, [0]), null);
});
