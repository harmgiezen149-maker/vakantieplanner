import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nachten, nachtenPerJaar, reisStatistiek, maakVerslag } from '../lib/reisverslag.js';

const verblijf = (o) => ({
  id: o.id || Math.random().toString(36).slice(2),
  name: o.name || 'Ergens',
  startDate: o.startDate ?? null,
  endDate: o.endDate ?? null,
  periodLabel: o.periodLabel ?? null,
  score: o.score ?? null,
  country: o.country ?? null,
  type: o.type ?? null,
  tripTitle: o.tripTitle ?? null,
});

// ── nachten ─────────────────────────────────────────────────────────

test('een verblijf van 10 t/m 14 augustus is vier nachten', () => {
  assert.equal(nachten('2026-08-10', '2026-08-14'), 4);
});

test('één nacht telt als één', () => {
  assert.equal(nachten('2026-08-10', '2026-08-11'), 1);
});

test('dezelfde dag aankomen en vertrekken is nul nachten', () => {
  assert.equal(nachten('2026-08-10', '2026-08-10'), 0);
});

test('zonder einddatum valt er niets te tellen', () => {
  assert.equal(nachten('2026-08-10', null), 0);
  assert.equal(nachten(null, '2026-08-14'), 0);
});

test('een omgekeerde periode levert geen negatieve nachten op', () => {
  assert.equal(nachten('2026-08-14', '2026-08-10'), 0);
});

test('een zomertijdwissel verschuift het aantal nachten niet', () => {
  // In maart gaat de klok een uur vooruit; met lokale tijd zou dit 6,96 dagen
  // worden en na afronding kloppen — maar niet meer bij een langere periode.
  assert.equal(nachten('2026-03-25', '2026-04-01'), 7);
  assert.equal(nachten('2026-10-20', '2026-11-03'), 14);
});

// ── nachten per jaar ────────────────────────────────────────────────

test('een reis over oud en nieuw wordt over twee jaren verdeeld', () => {
  const uit = nachtenPerJaar('2025-12-28', '2026-01-04');
  assert.deepEqual(uit, { 2025: 4, 2026: 3 });
  assert.equal(uit[2025] + uit[2026], nachten('2025-12-28', '2026-01-04'));
});

test('een gewone reis zit in één jaar', () => {
  assert.deepEqual(nachtenPerJaar('2026-08-10', '2026-08-14'), { 2026: 4 });
});

// ── per reis ────────────────────────────────────────────────────────

test('cijfers tellen mee, ontbrekende cijfers niet', () => {
  const reis = {
    id: 'r1', naam: 'Vogezen', periode: 'aug 2026', kleur: '#000',
    stays: [
      verblijf({ startDate: '2026-08-01', endDate: '2026-08-08', score: 8, country: 'Frankrijk' }),
      verblijf({ startDate: '2026-08-08', endDate: '2026-08-11', score: 6, country: 'Frankrijk' }),
      verblijf({ startDate: '2026-08-11', endDate: '2026-08-13', score: null, country: 'Duitsland' }),
    ],
  };
  const st = reisStatistiek(reis);
  assert.equal(st.nachten, 12, '7 + 3 + 2');
  assert.equal(st.gemiddeldCijfer, 7, 'gemiddelde van 8 en 6 — de derde telt niet mee');
  assert.equal(st.aantalBeoordeeld, 2);
  assert.equal(st.aantalVerblijven, 3, 'maar hij telt wél als verblijf');
  assert.deepEqual(st.landen, [
    { naam: 'Frankrijk', aantal: 2 },
    { naam: 'Duitsland', aantal: 1 },
  ]);
});

test('zonder enig cijfer is er geen gemiddelde en geen beste verblijf', () => {
  const st = reisStatistiek({
    id: 'r', naam: 'x', stays: [verblijf({ startDate: '2026-08-01', endDate: '2026-08-03' })],
  });
  assert.equal(st.gemiddeldCijfer, null, 'null, niet 0 — 0 zou "slecht" betekenen');
  assert.equal(st.besteVerblijf, null);
});

test('bij een gelijk cijfer wint het langste verblijf', () => {
  const st = reisStatistiek({
    id: 'r', naam: 'x', stays: [
      verblijf({ name: 'Kort', startDate: '2026-08-01', endDate: '2026-08-02', score: 9 }),
      verblijf({ name: 'Lang', startDate: '2026-08-02', endDate: '2026-08-09', score: 9 }),
    ],
  });
  assert.equal(st.besteVerblijf.naam, 'Lang');
});

// ── het hele verslag ────────────────────────────────────────────────

test('een leeg logboek geeft een leeg maar bruikbaar verslag', () => {
  const v = maakVerslag([]);
  assert.deepEqual(v.reizen, []);
  assert.deepEqual(v.jaren, []);
  assert.equal(v.totaal.aantalReizen, 0);
  assert.equal(v.totaal.nachten, 0);
  assert.equal(v.totaal.gemiddeldCijfer, null);
  assert.equal(v.totaal.eersteJaar, null);
});

test('geen lijst meegeven valt niet om', () => {
  assert.equal(maakVerslag(undefined).totaal.aantalVerblijven, 0);
  assert.equal(maakVerslag(null).totaal.aantalVerblijven, 0);
});

test('twee losstaande periodes worden twee reizen', () => {
  const v = maakVerslag([
    verblijf({ startDate: '2025-07-01', endDate: '2025-07-08', score: 7, country: 'Frankrijk' }),
    verblijf({ startDate: '2026-08-01', endDate: '2026-08-08', score: 9, country: 'Italië' }),
  ]);
  assert.equal(v.totaal.aantalReizen, 2);
  assert.equal(v.totaal.nachten, 14);
  assert.equal(v.totaal.gemiddeldCijfer, 8);
  assert.deepEqual(v.jaren.map(j => j.jaar), [2025, 2026]);
  assert.deepEqual(v.jaren.map(j => j.nachten), [7, 7]);
  assert.deepEqual(v.jaren.map(j => j.reizen), [1, 1]);
});

test('een verblijf zonder enig jaar telt mee als verblijf maar niet als reis', () => {
  const v = maakVerslag([
    verblijf({ startDate: '2026-08-01', endDate: '2026-08-08', score: 8 }),
    verblijf({ name: 'Ooit in Spanje', score: 6, country: 'Spanje' }),
  ]);
  assert.equal(v.totaal.aantalReizen, 1, 'zonder jaar weet je niet wanneer');
  assert.equal(v.totaal.aantalVerblijven, 2, 'maar je bent er wel geweest');
  assert.equal(v.totaal.gemiddeldCijfer, 7, 'en het cijfer telt gewoon mee');
  assert.equal(v.reizen.filter(r => r.los).length, 1);
});

// ── Losse periode uit het hoofd ─────────────────────────────────────
// "zomer 2003" is geen datum, maar je weet wél in welk jaar je er was. Dat
// mag niet buiten de statistiek vallen — dat was precies de klacht.

test('een losse periode met een jaartal telt als reis in dat jaar', () => {
  const v = maakVerslag([
    verblijf({ name: 'Camping van vroeger', periodLabel: 'zomer 2003', score: 8, country: 'Frankrijk' }),
  ]);
  assert.equal(v.totaal.aantalReizen, 1);
  assert.deepEqual(v.jaren.map(j => j.jaar), [2003]);
  assert.equal(v.jaren[0].reizen, 1);
  assert.equal(v.jaren[0].nachten, 0, 'het aantal nachten weten we niet — verzinnen is erger');
  assert.equal(v.totaal.eersteJaar, 2003);
});

test('losse en gedateerde reizen staan door elkaar in dezelfde jarenlijst', () => {
  const v = maakVerslag([
    verblijf({ periodLabel: 'voorjaar 2003', score: 7 }),
    verblijf({ startDate: '2026-08-01', endDate: '2026-08-08', score: 9 }),
  ]);
  assert.equal(v.totaal.aantalReizen, 2);
  assert.deepEqual(v.jaren.map(j => j.jaar), [2003, 2026]);
  assert.deepEqual(v.jaren.map(j => j.nachten), [0, 7]);
  assert.deepEqual(v.jaren.map(j => j.reizen), [1, 1]);
  assert.equal(v.totaal.eersteJaar, 2003);
  assert.equal(v.totaal.laatsteJaar, 2026);
});

test('een periodetekst zonder jaartal levert niets op', () => {
  const v = maakVerslag([verblijf({ name: 'Ooit', periodLabel: 'lang geleden', score: 5 })]);
  assert.equal(v.totaal.aantalReizen, 0, 'geen jaar, dus geen plek in de tijdlijn');
  assert.equal(v.totaal.aantalVerblijven, 1);
  assert.deepEqual(v.jaren, []);
});

test('een getal dat geen jaartal is wordt niet als jaar gelezen', () => {
  const v = maakVerslag([verblijf({ periodLabel: 'huisje 42, week 7', score: 6 })]);
  assert.deepEqual(v.jaren, [], 'alleen 19xx en 20xx tellen als jaartal');
});

test('een reis over de jaargrens telt bij het jaar waarin hij eindigt', () => {
  const v = maakVerslag([
    verblijf({ startDate: '2025-12-28', endDate: '2026-01-04', score: 8 }),
  ]);
  assert.equal(v.totaal.aantalReizen, 1);
  const perJaar = Object.fromEntries(v.jaren.map(j => [j.jaar, j]));
  assert.equal(perJaar[2025].nachten, 4);
  assert.equal(perJaar[2026].nachten, 3);
  assert.equal(perJaar[2025].reizen, 0, 'de reis zelf hoort bij het eindjaar');
  assert.equal(perJaar[2026].reizen, 1);
});

test('landen worden geteld, niet dubbel geteld', () => {
  const v = maakVerslag([
    verblijf({ startDate: '2026-08-01', endDate: '2026-08-04', country: 'Frankrijk' }),
    verblijf({ startDate: '2026-08-04', endDate: '2026-08-07', country: 'Frankrijk' }),
    verblijf({ startDate: '2026-08-07', endDate: '2026-08-09', country: 'Zwitserland' }),
  ]);
  assert.equal(v.totaal.landen.length, 2);
  assert.equal(v.totaal.landen[0].naam, 'Frankrijk');
  assert.equal(v.totaal.landen[0].aantal, 2);
});

test('een gemiddelde wordt op één decimaal afgerond', () => {
  const v = maakVerslag([
    verblijf({ startDate: '2026-08-01', endDate: '2026-08-02', score: 8 }),
    verblijf({ startDate: '2026-09-01', endDate: '2026-09-02', score: 7 }),
    verblijf({ startDate: '2026-10-01', endDate: '2026-10-02', score: 9 }),
  ]);
  assert.equal(v.totaal.gemiddeldCijfer, 8);

  const v2 = maakVerslag([
    verblijf({ startDate: '2026-08-01', endDate: '2026-08-02', score: 8 }),
    verblijf({ startDate: '2026-09-01', endDate: '2026-09-02', score: 7 }),
  ]);
  assert.equal(v2.totaal.gemiddeldCijfer, 7.5);
});

// ── Per jaar uitgesplitst naar reis ─────────────────────────────────
//
// Een jaar met twee vakanties toont op /verslag één balk; die moet je kunnen
// opdelen, anders zie je niet dat het twee reizen waren.

const jaarVan = (verslag, jaar) => verslag.jaren.find(j => j.jaar === jaar);

test('twee reizen in één jaar geven twee delen die samen het jaartotaal zijn', () => {
  const verslag = maakVerslag([
    { id: 'a', name: 'Noorwegen', startDate: '2019-07-05', endDate: '2019-07-12' },  // 7 nachten
    { id: 'b', name: 'Ardennen', startDate: '2019-09-01', endDate: '2019-09-05' },   // 4 nachten
  ]);
  const j = jaarVan(verslag, 2019);
  assert.equal(j.nachten, 11);
  assert.equal(j.delen.length, 2);
  assert.equal(j.delen.reduce((n, d) => n + d.nachten, 0), j.nachten);
  assert.deepEqual(j.delen.map(d => d.nachten), [7, 4], 'chronologisch');
  assert.deepEqual(j.delen.map(d => d.naam), ['jul 2019', 'sep 2019']);
});

test('verblijven van dezelfde reis vallen samen in één deel', () => {
  const verslag = maakVerslag([
    { id: 'a', name: 'Oslo', startDate: '2019-07-05', endDate: '2019-07-12' },
    { id: 'b', name: 'Bergen', startDate: '2019-07-12', endDate: '2019-07-20' },
  ]);
  const j = jaarVan(verslag, 2019);
  assert.equal(j.delen.length, 1, 'één reis, dus één stuk');
  assert.equal(j.delen[0].nachten, 15);
});

test('een reis over oud en nieuw levert in allebei de jaren een deel', () => {
  const verslag = maakVerslag([
    { id: 'a', name: 'Oud en nieuw', startDate: '2025-12-28', endDate: '2026-01-04' },
  ]);
  assert.equal(jaarVan(verslag, 2025).delen.length, 1);
  assert.equal(jaarVan(verslag, 2026).delen.length, 1);
  assert.equal(jaarVan(verslag, 2025).delen[0].nachten, 4);
  assert.equal(jaarVan(verslag, 2026).delen[0].nachten, 3);
  assert.equal(
    jaarVan(verslag, 2025).delen[0].id, jaarVan(verslag, 2026).delen[0].id,
    'dezelfde reis aan weerskanten van de jaarwisseling',
  );
});

test('een verblijf uit het hoofd geeft een deel van nul nachten', () => {
  const verslag = maakVerslag([
    { id: 'oud', name: 'Camping Bouillon', periodLabel: 'zomer 2003' },
  ]);
  const j = jaarVan(verslag, 2003);
  assert.equal(j.nachten, 0);
  assert.equal(j.delen.length, 1);
  assert.equal(j.delen[0].nachten, 0);
});

test('de delen tellen in elk jaar precies op tot het jaartotaal', () => {
  const verslag = maakVerslag([
    { id: 'a', startDate: '2024-05-01', endDate: '2024-05-04' },
    { id: 'b', startDate: '2024-08-10', endDate: '2024-08-24' },
    { id: 'c', startDate: '2024-08-24', endDate: '2024-08-28' },
    { id: 'd', startDate: '2025-12-30', endDate: '2026-01-02' },
    { id: 'e', periodLabel: 'zomer 1998' },
  ]);
  for (const j of verslag.jaren) {
    assert.equal(
      j.delen.reduce((n, d) => n + d.nachten, 0), j.nachten,
      `jaar ${j.jaar} klopt niet`,
    );
  }
  assert.equal(jaarVan(verslag, 2024).delen.length, 2, 'mei en augustus apart');
});

test('een hernoemde reis heet in de jaarbalk ook zo', () => {
  const verslag = maakVerslag([
    { id: 'a', startDate: '2019-07-05', endDate: '2019-07-12', tripTitle: 'Noorwegen 2019' },
  ]);
  assert.equal(jaarVan(verslag, 2019).delen[0].naam, 'Noorwegen 2019');
});
