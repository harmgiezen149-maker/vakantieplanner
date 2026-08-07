import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  bepaalOpruiming, datumUitPad, backupPad, valideerMomentopname,
  BACKUP_KEYS, BACKUP_FORMAAT,
} from '../lib/backup.js';

// Valkuil 16: het opruimen verwijdert bestanden. Als dit misrekent ben je
// reservekopieën kwijt die je juist nodig had.

const nu = new Date('2026-08-07T12:00:00Z');

// Zelfde afronding als bepaalOpruiming gebruikt: hele dagen naar beneden.
// Zonder die floor valt een bestand van precies 30 dagen oud er net buiten.
const leeftijdInDagen = (datum) =>
  Math.floor((nu - new Date(`${datum}T00:00:00Z`)) / 86400000);

const padenVoorDagen = (aantal) => {
  const uit = [];
  for (let i = 0; i < aantal; i++) {
    const d = new Date(nu);
    d.setUTCDate(d.getUTCDate() - i);
    uit.push(`reservekopie/${d.toISOString().slice(0, 10)}.json`);
  }
  return uit;
};

test('van een jaar aan dagelijkse kopieën blijft een maand plus één per maand over', () => {
  const { bewaren, verwijderen } = bepaalOpruiming(padenVoorDagen(400), nu);
  assert.equal(bewaren.length + verwijderen.length, 400);

  const datums = bewaren.map(datumUitPad);
  const recent = datums.filter(d => leeftijdInDagen(d) <= 30);
  assert.equal(recent.length, 31, 'vandaag t/m 30 dagen terug');

  const oudereMaanden = new Set(
    datums.filter(d => !recent.includes(d)).map(d => d.slice(0, 7)),
  );
  assert.equal(oudereMaanden.size, 12, 'één per maand, twaalf maanden terug');
});

test('niets ouder dan een jaar blijft bewaard', () => {
  const { bewaren } = bepaalOpruiming(padenVoorDagen(400), nu);
  const oudste = bewaren.map(datumUitPad).sort()[0];
  const leeftijd = leeftijdInDagen(oudste);
  assert.ok(leeftijd <= 366, `oudste bewaarde kopie is ${leeftijd} dagen oud`);
});

test('een verse installatie verliest niets', () => {
  const { bewaren, verwijderen } = bepaalOpruiming(padenVoorDagen(5), nu);
  assert.equal(bewaren.length, 5);
  assert.equal(verwijderen.length, 0);
});

test('paden zonder datum worden met rust gelaten', () => {
  // Bijvoorbeeld de veiligheidskopie van vlak vóór een terugzetactie
  const { bewaren, verwijderen } = bepaalOpruiming(
    ['reservekopie/voor-terugzetten-2026-08-07T10-00-00-000Z.json'], nu,
  );
  assert.deepEqual(bewaren, []);
  assert.deepEqual(verwijderen, [], 'niet herkend = niet verwijderd');
});

test('lege invoer geeft lege uitkomst', () => {
  assert.deepEqual(bepaalOpruiming([], nu), { bewaren: [], verwijderen: [] });
});

test('pad en datum horen bij elkaar', () => {
  assert.equal(backupPad(nu), 'reservekopie/2026-08-07.json');
  assert.equal(datumUitPad('reservekopie/2026-08-07.json'), '2026-08-07');
  assert.equal(datumUitPad('onzin'), null);
});

// ── Validatie vóór terugzetten ──────────────────────────────────────
// Terugzetten overschrijft alles, dus liever hier streng zijn.

test('een geldige momentopname komt erdoor', () => {
  assert.equal(
    valideerMomentopname({ formaat: BACKUP_FORMAAT, documenten: { [BACKUP_KEYS[0]]: {} } }),
    null,
  );
});

test('rommel wordt geweigerd met uitleg', () => {
  assert.match(valideerMomentopname(null), /geldig bestand/);
  assert.match(valideerMomentopname({ documenten: {} }), /Onbekende versie/);
  assert.match(valideerMomentopname({ formaat: 99, documenten: {} }), /Onbekende versie/);
  assert.match(valideerMomentopname({ formaat: BACKUP_FORMAAT }), /geen documenten/);
  assert.match(
    valideerMomentopname({ formaat: BACKUP_FORMAAT, documenten: { iets_anders: 1 } }),
    /geen enkel bekend document/,
  );
});

test('de reservekopie bevat precies de documenten die het waard zijn', () => {
  // Bewust een vaste lijst: een nieuw Redis-document valt buiten de nachtelijke
  // kopie tot iemand hem hier toevoegt, en dan wil je dat die persoon er even
  // over nadenkt in plaats van dat het stilzwijgend goed of fout gaat.
  assert.deepEqual(BACKUP_KEYS, [
    'planner:trip', 'planner:inpakken', 'planner:checklist',
    'planner:verblijven', 'planner:uitgaven',
  ]);
});

test('afgeleide en vluchtige documenten blijven er bewust buiten', () => {
  // planner:fouten is een logboek van storingen, planner:delen een token dat je
  // opnieuw kunt aanmaken, en cache:* is per definitie weggooibaar.
  for (const key of ['planner:fouten', 'planner:delen']) {
    assert.equal(BACKUP_KEYS.includes(key), false, `${key} hoort niet in de kopie`);
  }
  assert.equal(BACKUP_KEYS.some(k => k.startsWith('cache:')), false);
});
