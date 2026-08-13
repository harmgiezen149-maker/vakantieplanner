import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  nachten, nachtenPerJaar, nachtenPerMaand, reisStatistiek, maakVerslag,
  gewogenGemiddelde, vulJarenAan, groepeerLegeJaren, cijferPerLand, cijferVerdeling,
  afstandVanReis, maandVerdeling, nieuweLanden, terugkerendePlekken,
} from '../lib/reisverslag.js';
import { groepeerReizen } from '../lib/stayLog.js';

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
  coords: o.coords ?? null,
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
    { naam: 'Frankrijk', aantal: 2, nachten: 10 },
    { naam: 'Duitsland', aantal: 1, nachten: 2 },
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
  // De jaren ertussen worden aangevuld, dus de reeks loopt door.
  assert.equal(v.jaren[0].jaar, 2003);
  assert.equal(v.jaren[v.jaren.length - 1].jaar, 2026);
  assert.equal(v.jaren.length, 24);
  const perJaar = Object.fromEntries(v.jaren.map(j => [j.jaar, j]));
  assert.equal(perJaar[2003].nachten, 0);
  assert.equal(perJaar[2003].reizen, 1);
  assert.equal(perJaar[2026].nachten, 7);
  assert.equal(perJaar[2026].reizen, 1);
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

test('een reis over de jaargrens telt in beide jaren mee', () => {
  const v = maakVerslag([
    verblijf({ startDate: '2025-12-28', endDate: '2026-01-04', score: 8 }),
  ]);
  assert.equal(v.totaal.aantalReizen, 1, 'als reis is het er één');
  const perJaar = Object.fromEntries(v.jaren.map(j => [j.jaar, j]));
  assert.equal(perJaar[2025].nachten, 4);
  assert.equal(perJaar[2026].nachten, 3);
  // Het getal moet de balk niet tegenspreken: beide jaren hebben één stukje,
  // dus beide jaren tellen één reis.
  assert.equal(perJaar[2025].reizen, 1);
  assert.equal(perJaar[2026].reizen, 1);
});

test('het aantal reizen per jaar is altijd gelijk aan het aantal stukjes in de balk', () => {
  const v = maakVerslag([
    verblijf({ startDate: '2025-07-01', endDate: '2025-07-08', score: 7 }),
    verblijf({ startDate: '2025-12-28', endDate: '2026-01-04', score: 8 }),
  ]);
  for (const j of v.jaren) assert.equal(j.reizen, j.delen.length, `jaar ${j.jaar}`);
  const perJaar = Object.fromEntries(v.jaren.map(j => [j.jaar, j]));
  assert.equal(perJaar[2025].reizen, 2, 'zomer én kerst hadden nachten in 2025');
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

// ── gewogen gemiddelde ──────────────────────────────────────────────

test('een lang verblijf weegt zwaarder dan een kort', () => {
  const stays = [
    verblijf({ startDate: '2026-07-26', endDate: '2026-08-08', score: 8 }), // 13 nachten
    verblijf({ startDate: '2026-08-08', endDate: '2026-08-15', score: 3 }), //  7 nachten
  ];
  assert.equal(gewogenGemiddelde(stays), 6.3, '(8·13 + 3·7) / 20');
  // Het ongewogen cijfer blijft bestaan en is een ander getal.
  assert.equal(maakVerslag(stays).totaal.gemiddeldCijfer, 5.5);
});

test('een beoordeeld verblijf van nul nachten telt mee met gewicht één', () => {
  const stays = [
    verblijf({ startDate: '2026-08-01', endDate: '2026-08-02', score: 10 }), // 1 nacht
    verblijf({ startDate: '2026-08-05', endDate: '2026-08-05', score: 4 }),  // 0 nachten
  ];
  assert.equal(gewogenGemiddelde(stays), 7, 'zonder klem zou de 4 verdampen');
});

test('zonder cijfers is er geen gewogen gemiddelde', () => {
  assert.equal(gewogenGemiddelde([verblijf({ startDate: '2026-08-01', endDate: '2026-08-04' })]), null);
  assert.equal(gewogenGemiddelde([]), null);
});

// ── tellen in nachten ───────────────────────────────────────────────

test('landen worden gesorteerd op nachten, niet op aantal verblijven', () => {
  const v = maakVerslag([
    // Noorwegen: drie korte verblijven, samen 6 nachten
    verblijf({ startDate: '2019-07-01', endDate: '2019-07-03', country: 'Noorwegen' }),
    verblijf({ startDate: '2019-07-03', endDate: '2019-07-05', country: 'Noorwegen' }),
    verblijf({ startDate: '2019-07-05', endDate: '2019-07-07', country: 'Noorwegen' }),
    // Denemarken: één lang verblijf van 10 nachten
    verblijf({ startDate: '2019-07-07', endDate: '2019-07-17', country: 'Denemarken' }),
  ]);
  assert.deepEqual(v.totaal.landen, [
    { naam: 'Denemarken', aantal: 1, nachten: 10 },
    { naam: 'Noorwegen', aantal: 3, nachten: 6 },
  ], 'meer nachten wint van meer verblijven');
});

test('een verblijf zonder land telt nergens in mee', () => {
  const v = maakVerslag([
    verblijf({ startDate: '2026-08-01', endDate: '2026-08-04', country: 'Frankrijk' }),
    verblijf({ startDate: '2026-08-04', endDate: '2026-08-06', country: null }),
  ]);
  assert.deepEqual(v.totaal.landen, [{ naam: 'Frankrijk', aantal: 1, nachten: 3 }]);
});

// ── lege jaren ──────────────────────────────────────────────────────

test('vulJarenAan sluit de gaten tussen het eerste en het laatste jaar', () => {
  assert.deepEqual(vulJarenAan([2013, 2016]), [2013, 2014, 2015, 2016]);
  assert.deepEqual(vulJarenAan([2019]), [2019], 'één jaar blijft één jaar');
  assert.deepEqual(vulJarenAan([]), []);
  assert.deepEqual(vulJarenAan([2016, 2013]), [2013, 2014, 2015, 2016], 'volgorde maakt niet uit');
});

test('een overgeslagen jaar staat in de balk met nul nachten', () => {
  const v = maakVerslag([
    verblijf({ startDate: '2019-07-01', endDate: '2019-07-08', score: 8 }),
    verblijf({ startDate: '2021-07-01', endDate: '2021-07-05', score: 7 }),
  ]);
  assert.deepEqual(v.jaren.map(j => j.jaar), [2019, 2020, 2021]);
  const leeg = v.jaren.find(j => j.jaar === 2020);
  assert.equal(leeg.nachten, 0);
  assert.equal(leeg.reizen, 0);
  assert.deepEqual(leeg.delen, []);
});

test('een lange reeks lege jaren wordt tot één regel samengevouwen', () => {
  const jaren = [
    { jaar: 2003, nachten: 7 },
    ...Array.from({ length: 9 }, (_, i) => ({ jaar: 2004 + i, nachten: 0 })),
    { jaar: 2013, nachten: 19 },
  ];
  const rijen = groepeerLegeJaren(jaren);
  assert.deepEqual(rijen.map(r => r.type), ['jaar', 'gat', 'jaar']);
  assert.equal(rijen[1].van, 2004);
  assert.equal(rijen[1].tot, 2012);
  assert.equal(rijen[1].aantal, 9);
});

test('één of twee lege jaren blijven gewoon los staan', () => {
  const rijen = groepeerLegeJaren([
    { jaar: 2019, nachten: 27 },
    { jaar: 2020, nachten: 0 },
    { jaar: 2021, nachten: 18 },
  ]);
  assert.deepEqual(rijen.map(r => r.type), ['jaar', 'jaar', 'jaar']);
  assert.equal(rijen[1].jaar.jaar, 2020, 'covid hoort zichtbaar te blijven');
});

// ── cijfers per land en de verdeling ────────────────────────────────

test('cijferPerLand laat landen zonder enkel cijfer weg', () => {
  const uit = cijferPerLand([
    verblijf({ startDate: '2026-08-01', endDate: '2026-08-08', country: 'Frankrijk', score: 8 }),
    verblijf({ startDate: '2026-08-08', endDate: '2026-08-11', country: 'Frankrijk', score: 7 }),
    verblijf({ startDate: '2026-08-11', endDate: '2026-08-13', country: 'Luxemburg', score: null }),
  ]);
  assert.equal(uit.length, 1);
  assert.deepEqual(uit[0], { land: 'Frankrijk', gemiddeld: 7.5, aantal: 2, nachten: 10 });
});

test('cijferPerLand sorteert op nachten', () => {
  const uit = cijferPerLand([
    verblijf({ startDate: '2026-08-01', endDate: '2026-08-03', country: 'Luxemburg', score: 9 }),
    verblijf({ startDate: '2026-08-03', endDate: '2026-08-13', country: 'Frankrijk', score: 6 }),
  ]);
  assert.deepEqual(uit.map(x => x.land), ['Frankrijk', 'Luxemburg'], 'niet op cijfer');
});

test('de cijferverdeling heeft altijd tien vakjes, ook de lege', () => {
  const uit = cijferVerdeling([
    verblijf({ score: 8 }), verblijf({ score: 8 }), verblijf({ score: 3 }),
  ]);
  assert.equal(uit.length, 10);
  assert.deepEqual(uit.map(x => x.cijfer), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.equal(uit[7].aantal, 2, 'twee achten');
  assert.equal(uit[2].aantal, 1, 'één drie');
  assert.equal(uit[0].aantal, 0, 'nooit een 1 gegeven');
});

test('een cijfer buiten de schaal telt niet mee', () => {
  const uit = cijferVerdeling([
    verblijf({ score: 0 }), verblijf({ score: 11 }), verblijf({ score: 7.5 }), verblijf({ score: null }),
  ]);
  assert.equal(uit.reduce((n, x) => n + x.aantal, 0), 0);
});

// ── afstand ─────────────────────────────────────────────────────────

test('één verblijf is nul kilometer', () => {
  assert.equal(afstandVanReis([verblijf({ coords: [48.17, 6.74] })]), 0);
  assert.equal(afstandVanReis([]), 0);
});

test('de afstand loopt langs de verblijven in volgorde', () => {
  // Eén graad breedte is ongeveer 111 km.
  const km = afstandVanReis([
    verblijf({ coords: [48, 6] }),
    verblijf({ coords: [49, 6] }),
    verblijf({ coords: [50, 6] }),
  ]);
  assert.ok(km > 215 && km < 228, `twee keer ~111 km, kreeg ${km}`);
});

test('een verblijf zonder coördinaten wordt overgeslagen zonder de rest te breken', () => {
  const km = afstandVanReis([
    verblijf({ coords: [48, 6] }),
    verblijf({ coords: null }),
    verblijf({ coords: [49, 6] }),
  ]);
  assert.ok(km > 105 && km < 118, `de sprong 48→49 blijft over, kreeg ${km}`);
});

test('de totale kilometers zijn de som over de reizen, niet over alle verblijven', () => {
  const v = maakVerslag([
    verblijf({ startDate: '2019-07-01', endDate: '2019-07-08', coords: [48, 6] }),
    verblijf({ startDate: '2019-07-08', endDate: '2019-07-15', coords: [49, 6] }),
    // Jaren later, dus een andere reis: de sprong ertussen telt niet mee.
    verblijf({ startDate: '2024-07-01', endDate: '2024-07-08', coords: [60, 6] }),
  ]);
  assert.ok(v.totaal.kilometers > 105 && v.totaal.kilometers < 118,
    `alleen de rit binnen reis 1, kreeg ${v.totaal.kilometers}`);
});

// ── maanden ─────────────────────────────────────────────────────────

test('nachtenPerMaand verdeelt een reis over de maandgrens', () => {
  assert.deepEqual(nachtenPerMaand('2026-07-28', '2026-08-03'), { 7: 4, 8: 2 });
});

test('de maandverdeling telt op tot het totaal aantal nachten', () => {
  const stays = [
    verblijf({ startDate: '2026-07-26', endDate: '2026-08-08' }),
    verblijf({ startDate: '2025-12-28', endDate: '2026-01-04' }),
  ];
  const rij = maandVerdeling(stays);
  assert.equal(rij.length, 12);
  const som = rij.reduce((n, x) => n + x.nachten, 0);
  assert.equal(som, maakVerslag(stays).totaal.nachten);
  assert.equal(rij[11].nachten, 4, 'december');
  assert.equal(rij[0].nachten, 3, 'januari');
});

// ── nieuw land ──────────────────────────────────────────────────────

test('een land is maar één keer nieuw', () => {
  const stays = [
    verblijf({ startDate: '2019-07-01', endDate: '2019-07-08', country: 'Noorwegen' }),
    verblijf({ startDate: '2021-07-01', endDate: '2021-07-08', country: 'Denemarken' }),
    verblijf({ startDate: '2024-07-01', endDate: '2024-07-08', country: 'Noorwegen' }),
  ];
  const uit = nieuweLanden(groepeerReizen(stays));
  assert.deepEqual(uit.map(x => x.landen), [['Noorwegen'], ['Denemarken']]);
  assert.deepEqual(uit.map(x => x.jaar), ['2019', '2021']);
});

test('een reis zonder nieuw land komt niet in de lijst', () => {
  const uit = nieuweLanden(groepeerReizen([
    verblijf({ startDate: '2019-07-01', endDate: '2019-07-08', country: 'Zweden' }),
    verblijf({ startDate: '2021-07-01', endDate: '2021-07-08', country: 'Zweden' }),
  ]));
  assert.equal(uit.length, 1);
});

// ── terugkerende plekken ────────────────────────────────────────────

test('twee verblijven op dezelfde plek in verschillende reizen zijn een terugkeer', () => {
  const uit = terugkerendePlekken([
    verblijf({ name: 'Natuurcamping', startDate: '2018-07-16', endDate: '2018-08-03', coords: [55.5, 9.5] }),
    verblijf({ name: 'Natuurcamping', startDate: '2021-07-19', endDate: '2021-07-31', coords: [55.5, 9.5] }),
  ]);
  assert.equal(uit.length, 1);
  assert.equal(uit[0].keren, 2);
  assert.equal(uit[0].spreidingKm, 0);
  assert.deepEqual(uit[0].bezoeken.map(b => b.jaar), ['2018', '2021']);
});

test('binnen dezelfde reis verhuizen is geen terugkeer', () => {
  const uit = terugkerendePlekken([
    verblijf({ startDate: '2026-07-26', endDate: '2026-08-01', coords: [48.1, 6.7] }),
    verblijf({ startDate: '2026-08-01', endDate: '2026-08-08', coords: [48.1, 6.7] }),
  ]);
  assert.deepEqual(uit, []);
});

test('de drempel bepaalt wat als dezelfde plek geldt', () => {
  // ~22 km uit elkaar (0,2 graad breedte).
  const stays = [
    verblijf({ startDate: '2019-07-01', endDate: '2019-07-08', coords: [61.0, 9.0] }),
    verblijf({ startDate: '2024-07-01', endDate: '2024-07-08', coords: [61.2, 9.0] }),
  ];
  assert.equal(terugkerendePlekken(stays, 25).length, 1, 'binnen de drempel');
  assert.equal(terugkerendePlekken(stays, 10).length, 0, 'erbuiten');
});

test('de spreiding laat zien of het echt dezelfde plek was', () => {
  const uit = terugkerendePlekken([
    verblijf({ startDate: '2019-07-01', endDate: '2019-07-08', coords: [61.0, 9.0] }),
    verblijf({ startDate: '2024-07-01', endDate: '2024-07-08', coords: [61.2, 9.0] }),
  ]);
  assert.ok(uit[0].spreidingKm > 20 && uit[0].spreidingKm < 24, `kreeg ${uit[0].spreidingKm}`);
});

test('een verblijf zonder coördinaten kan nooit een terugkeer zijn', () => {
  assert.deepEqual(terugkerendePlekken([
    verblijf({ startDate: '2019-07-01', endDate: '2019-07-08', coords: null }),
    verblijf({ startDate: '2024-07-01', endDate: '2024-07-08', coords: null }),
  ]), []);
});

// ── langste en kortste ──────────────────────────────────────────────

test('het langste en het kortste verblijf worden in nachten gemeten', () => {
  const t = maakVerslag([
    verblijf({ name: 'Lang', startDate: '2013-07-08', endDate: '2013-07-27' }),
    verblijf({ name: 'Kort', startDate: '2019-08-01', endDate: '2019-08-02' }),
    verblijf({ name: 'Middel', startDate: '2021-07-01', endDate: '2021-07-08' }),
  ]).totaal;
  assert.deepEqual(t.langsteVerblijf, { naam: 'Lang', nachten: 19 });
  assert.deepEqual(t.kortsteVerblijf, { naam: 'Kort', nachten: 1 });
});

test('een verblijf zonder nachten is niet het kortste maar ongemeten', () => {
  const t = maakVerslag([
    verblijf({ name: 'Dagje', startDate: '2026-08-05', endDate: '2026-08-05' }),
    verblijf({ name: 'Week', startDate: '2026-07-01', endDate: '2026-07-08' }),
  ]).totaal;
  assert.deepEqual(t.kortsteVerblijf, { naam: 'Week', nachten: 7 });
});

test('zonder gemeten verblijven is er geen langste of kortste', () => {
  const t = maakVerslag([verblijf({ periodLabel: 'zomer 2003', score: 7 })]).totaal;
  assert.equal(t.langsteVerblijf, null);
  assert.equal(t.kortsteVerblijf, null);
});

test('een jaar met een reis maar zonder nachten verdwijnt niet in een gat', () => {
  // "zomer 2003": je weet niet meer hoeveel nachten, maar je bent er geweest.
  const jaren = [
    { jaar: 2003, nachten: 0, reizen: 1 },
    ...Array.from({ length: 9 }, (_, i) => ({ jaar: 2004 + i, nachten: 0, reizen: 0 })),
    { jaar: 2013, nachten: 19, reizen: 1 },
  ];
  const rijen = groepeerLegeJaren(jaren);
  assert.deepEqual(rijen.map(r => r.type), ['jaar', 'gat', 'jaar']);
  assert.equal(rijen[0].jaar.jaar, 2003, 'het jaar zelf blijft staan');
  assert.equal(rijen[1].van, 2004);
  assert.equal(rijen[1].aantal, 9);
});
