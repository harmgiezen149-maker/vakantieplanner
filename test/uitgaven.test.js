import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  naarCenten, formatEuro, totaal, perCategorie, perPersoon,
  verdeel, verrekening, binnenPeriode,
} from '../lib/uitgaven.js';

// Een kasboek mag geen cent kwijtraken. Daarom staat alles in hele centen als
// integer — deze tests bewaken dat die keuze ook echt overal doorwerkt.

// ── invoer omzetten ─────────────────────────────────────────────────

test('een komma en een punt betekenen hetzelfde', () => {
  assert.equal(naarCenten('12,50'), 1250);
  assert.equal(naarCenten('12.50'), 1250);
});

test('euroteken en spaties worden genegeerd', () => {
  assert.equal(naarCenten('€ 12,50'), 1250);
  assert.equal(naarCenten(' 7 '), 700);
});

test('een heel getal is gewoon dat aantal euro', () => {
  assert.equal(naarCenten('12'), 1200);
  assert.equal(naarCenten(12), 1200);
});

test('een kommagetal als number wordt netjes afgerond', () => {
  // 0.29 * 100 === 28.999999999999996 — zonder afronding zou dit 28 cent worden
  assert.equal(naarCenten(0.29), 29);
  assert.equal(naarCenten(1.15), 115);
  assert.equal(naarCenten(8.7), 870);
});

test('meer dan twee decimalen wordt afgerond', () => {
  assert.equal(naarCenten('0.005'), 1, 'een halve cent naar boven');
  assert.equal(naarCenten('0.004'), 0);
});

test('onleesbare invoer geeft null, geen nul', () => {
  // Anders sluipt er stilzwijgend een uitgave van € 0,00 in de lijst
  assert.equal(naarCenten('appel'), null);
  assert.equal(naarCenten(''), null);
  assert.equal(naarCenten(null), null);
  assert.equal(naarCenten('.'), null);
  assert.equal(naarCenten('1,2,3'), null);
  assert.equal(naarCenten(Infinity), null);
});

test('0.1 + 0.2 blijft precies 30 cent', () => {
  // De hele reden dat er in centen wordt gerekend
  assert.equal(naarCenten('0,10') + naarCenten('0,20'), 30);
});

test('bedragen worden Nederlands getoond', () => {
  assert.equal(formatEuro(1250), '€ 12,50');
  assert.equal(formatEuro(700), '€ 7,00');
  assert.equal(formatEuro(5), '€ 0,05');
  assert.equal(formatEuro(0), '€ 0,00');
  assert.equal(formatEuro(-1250), '−€ 12,50');
  assert.equal(formatEuro(123456789).startsWith('€ 1.234.567'), true, 'duizendtallen gescheiden');
  assert.equal(formatEuro('geen getal'), '–');
});

// ── optellen ────────────────────────────────────────────────────────

const lijst = [
  { id: '1', datum: '2026-08-10', bedrag: 4550, categorie: 'boodschappen', betaaldDoor: 'Harm' },
  { id: '2', datum: '2026-08-10', bedrag: 1200, categorie: 'eten', betaaldDoor: 'Anna' },
  { id: '3', datum: '2026-08-11', bedrag: 8000, categorie: 'boodschappen', betaaldDoor: 'Harm' },
  { id: '4', datum: '2026-08-12', bedrag: 2500, categorie: 'entree', betaaldDoor: null },
];

test('het totaal telt alles op', () => {
  assert.equal(totaal(lijst), 16250);
  assert.equal(totaal([]), 0);
  assert.equal(totaal(null), 0);
});

test('een kapot bedrag telt als nul in plaats van NaN', () => {
  assert.equal(totaal([{ bedrag: 100 }, { bedrag: 'veel' }, { bedrag: null }, {}]), 100);
});

test('per categorie, aflopend op bedrag', () => {
  const uit = perCategorie(lijst);
  assert.deepEqual(uit, [
    { naam: 'boodschappen', bedrag: 12550 },
    { naam: 'entree', bedrag: 2500 },
    { naam: 'eten', bedrag: 1200 },
  ]);
});

test('per persoon slaat uitgaven zonder betaler over', () => {
  const uit = perPersoon(lijst);
  assert.deepEqual(uit.map(x => x.naam), ['Harm', 'Anna']);
  assert.equal(uit[0].bedrag, 12550);
  assert.equal(uit.reduce((s, x) => s + x.bedrag, 0), 13750, 'de € 25 zonder betaler valt weg');
});

// ── verdelen ────────────────────────────────────────────────────────

test('een deelbaar bedrag wordt gelijk verdeeld', () => {
  assert.deepEqual(verdeel(1000, 4), [250, 250, 250, 250]);
});

test('een restcent verdwijnt niet', () => {
  const uit = verdeel(1000, 3);
  assert.deepEqual(uit, [334, 333, 333]);
  assert.equal(uit.reduce((a, b) => a + b, 0), 1000, 'de som moet exact kloppen');
});

test('geen enkele deling laat een cent verdampen', () => {
  for (let bedrag = 0; bedrag <= 200; bedrag++) {
    for (let n = 1; n <= 7; n++) {
      const som = verdeel(bedrag, n).reduce((a, b) => a + b, 0);
      assert.equal(som, bedrag, `${bedrag} cent over ${n} personen`);
    }
  }
});

test('ook een negatief bedrag (een teruggave) verdeelt zonder verlies', () => {
  const uit = verdeel(-1000, 3);
  assert.equal(uit.reduce((a, b) => a + b, 0), -1000);
  assert.ok(uit.every(x => x < 0));
});

test('verdelen over nul of minder personen geeft een lege lijst', () => {
  assert.deepEqual(verdeel(1000, 0), []);
  assert.deepEqual(verdeel(1000, -2), []);
});

// ── verrekenen ──────────────────────────────────────────────────────

test('wie meer betaalde krijgt terug, wie minder betaalde moet bijleggen', () => {
  const uit = verrekening([
    { bedrag: 3000, betaaldDoor: 'Harm' },
    { bedrag: 1000, betaaldDoor: 'Anna' },
  ], ['Harm', 'Anna']);

  const harm = uit.find(x => x.naam === 'Harm');
  const anna = uit.find(x => x.naam === 'Anna');
  assert.equal(harm.betaald, 3000);
  assert.equal(harm.aandeel, 2000);
  assert.equal(harm.saldo, 1000, 'Harm krijgt € 10 terug');
  assert.equal(anna.saldo, -1000, 'Anna legt € 10 bij');
});

test('de saldi heffen elkaar altijd op', () => {
  const uit = verrekening([
    { bedrag: 3333, betaaldDoor: 'A' },
    { bedrag: 1, betaaldDoor: 'B' },
  ], ['A', 'B', 'C']);
  assert.equal(uit.reduce((s, x) => s + x.saldo, 0), 0,
    'anders is er geld bijgekomen of verdwenen');
});

test('een uitgave van iemand die niet meedoet telt niet als betaald', () => {
  const uit = verrekening([
    { bedrag: 3000, betaaldDoor: 'Harm' },
    { bedrag: 900, betaaldDoor: 'Onbekend' },
  ], ['Harm', 'Anna']);
  // Het totaal telt wél mee in het aandeel — de kosten zijn gemaakt
  assert.equal(uit.find(x => x.naam === 'Harm').aandeel, 1950);
  assert.equal(uit.find(x => x.naam === 'Harm').betaald, 3000);
});

test('zonder personen valt er niets te verrekenen', () => {
  assert.deepEqual(verrekening(lijst, []), []);
  assert.deepEqual(verrekening(lijst, null), []);
});

// ── periode ─────────────────────────────────────────────────────────

test('de grenzen van de periode tellen mee', () => {
  const uit = binnenPeriode(lijst, '2026-08-10', '2026-08-11');
  assert.deepEqual(uit.map(u => u.id), ['1', '2', '3']);
});

test('een uitgave zonder datum hoort bij geen enkele reis', () => {
  const uit = binnenPeriode([{ id: 'x', bedrag: 100 }], '2026-08-01', '2026-08-31');
  assert.deepEqual(uit, []);
});

test('zonder grenzen komt alles met een datum terug', () => {
  assert.equal(binnenPeriode(lijst, null, null).length, 4);
});
