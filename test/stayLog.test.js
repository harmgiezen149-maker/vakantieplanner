import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  groepeerReizen, tripStayId, stayFromTripStay, hernoemReis, verwerkReisInLogboek,
} from '../lib/stayLog.js';
import { maakBezoek, handmatigBezoek } from '../lib/bezoek.js';
import { stayTypeLabel, countryFlag, STAY_TYPES } from '../lib/stayTypes.js';
import { sanitizeStay, schoneWebsite } from '../lib/stayValidation.js';

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

// ── Website van een verblijf ────────────────────────────────────────
// Dit veld wordt een aanklikbare link op de pagina, dus wat hier doorheen
// komt bepaalt waar iemand met één tik terechtkomt.

test('een adres zonder schema krijgt https ervoor', () => {
  assert.equal(schoneWebsite('campingdesmessires.fr'), 'https://campingdesmessires.fr/');
  assert.equal(schoneWebsite('www.example.com/plek'), 'https://www.example.com/plek');
});

test('http en https blijven zoals ze zijn', () => {
  assert.equal(schoneWebsite('https://example.com/'), 'https://example.com/');
  assert.equal(schoneWebsite('http://example.com/'), 'http://example.com/');
});

test('alleen http(s) komt erdoor', () => {
  // Een javascript:-adres in een href is een gat, geen website
  assert.equal(schoneWebsite('javascript:alert(1)'), null);
  assert.equal(schoneWebsite('data:text/html,<script>x</script>'), null);
  assert.equal(schoneWebsite('ftp://example.com'), null);
  assert.equal(schoneWebsite('  JavaScript:alert(1)  '), null);
});

test('iets dat geen adres is levert niets op', () => {
  assert.equal(schoneWebsite('gewoon wat tekst'), null);
  assert.equal(schoneWebsite('camping'), null, 'één woord is geen hostnaam');
  assert.equal(schoneWebsite(''), null);
  assert.equal(schoneWebsite('   '), null);
  assert.equal(schoneWebsite(null), null);
  assert.equal(schoneWebsite(42), null);
});

test('de website gaat mee door de opschoning van een verblijf', () => {
  assert.equal(sanitizeStay({ website: 'example.com' }).website, 'https://example.com/');
  assert.equal(sanitizeStay({ website: 'javascript:alert(1)' }).website, null);
  assert.equal(sanitizeStay({}).website, null);
});

// ── Een reis hernoemen ──────────────────────────────────────────────
//
// Reizen zijn afgeleid en hebben geen id in het datamodel; de naam belandt
// daarom als tripTitle op de verblijven zelf.

const logboek = () => ([
  { id: 's1', name: 'Camping Oslo', startDate: '2019-07-05', endDate: '2019-07-12' },
  { id: 's2', name: 'Camping Bergen', startDate: '2019-07-12', endDate: '2019-07-20' },
  { id: 's3', name: 'Camping Lille', startDate: '2019-09-01', endDate: '2019-09-05' },
]);

test('hernoemen zet de titel op alle verblijven van die reis', () => {
  const lijst = logboek();
  const reis = groepeerReizen(lijst)[0];
  const uit = hernoemReis(lijst, reis.id, 'Noorwegen 2019');
  assert.deepEqual(uit.map(s => s.tripTitle ?? null), ['Noorwegen 2019', 'Noorwegen 2019', null]);
  assert.equal(groepeerReizen(uit)[0].naam, 'Noorwegen 2019');
});

test('de andere reizen blijven ongemoeid', () => {
  const lijst = logboek();
  const reis = groepeerReizen(lijst)[0];
  const uit = hernoemReis(lijst, reis.id, 'Noorwegen 2019');
  assert.equal(uit[2].name, 'Camping Lille');
  assert.ok(!uit[2].tripTitle, 'het verblijf van de andere reis krijgt geen titel');
  assert.equal(groepeerReizen(uit)[1].naam, 'sep 2019', 'afgeleide naam blijft');
});

test('een lege naam brengt de afgeleide naam terug', () => {
  const lijst = hernoemReis(logboek(), groepeerReizen(logboek())[0].id, 'Noorwegen 2019');
  const terug = hernoemReis(lijst, groepeerReizen(lijst)[0].id, '   ');
  assert.equal(terug[0].tripTitle, null);
  assert.equal(groepeerReizen(terug)[0].naam, 'jul 2019');
});

test('een onbekend reis-id verandert niets', () => {
  const lijst = logboek();
  assert.deepEqual(hernoemReis(lijst, 'bestaat_niet', 'Iets'), lijst);
});

test('twee aansluitende reizen verschillende namen geven trekt ze uit elkaar', () => {
  // Zonder titels plakt de automaat deze twee aan elkaar (gat van 1 dag).
  const aaneen = [
    { id: 'x', name: 'Eerste', startDate: '2026-08-01', endDate: '2026-08-05' },
    { id: 'y', name: 'Tweede', startDate: '2026-08-06', endDate: '2026-08-10' },
  ];
  assert.equal(groepeerReizen(aaneen).length, 1, 'eerst één reis');
  const gesplitst = aaneen.map(s => (s.id === 'y' ? { ...s, tripTitle: 'Tweede reis' } : { ...s, tripTitle: 'Eerste reis' }));
  assert.equal(groepeerReizen(gesplitst).length, 2);
});

// ── Een reis in het logboek verwerken ───────────────────────────────
//
// Het geval dat hier centraal staat is echt gebeurd, op 16 augustus 2026: de
// twee campings van de zomerreis stonden al in het logboek, dus werden ze
// overgeslagen — en daarmee verdwenen vijftien net aangevinkte bezoeken, want
// direct daarna werd de planning gewist.

const reisVerblijf = (over = {}) => ({
  id: 'stay_1', name: 'Domaine des Messires', coords: [48.1, 6.7],
  startDate: '2026-07-26', endDate: '2026-08-08', ...over,
});

const bezoekje = (id, datum, naam = 'Iets') =>
  maakBezoek({ id, name: naam, emoji: '📍', category: 'custom', coords: null }, datum);

test('een verblijf dat er nog niet staat komt erbij, mét zijn bezoeken', () => {
  const s = reisVerblijf();
  const uit = verwerkReisInLogboek([], [s], { title: 'ZomerVakantie 2026' }, {
    stay_1: [bezoekje('custom_1', '2026-07-27', 'Eguisheim')],
  });
  assert.equal(uit.added, 1);
  assert.equal(uit.bijgewerkt, 0);
  assert.equal(uit.stays.length, 1);
  assert.equal(uit.stays[0].id, tripStayId(s));
  assert.equal(uit.stays[0].tripTitle, 'ZomerVakantie 2026');
  assert.deepEqual(uit.stays[0].bezocht.map(b => b.id), ['custom_1']);
});

test('een verblijf dat er al staat krijgt zijn nieuwe bezoeken erbij', () => {
  // Dít is de bug. Voorheen: added 0, bijgewerkt bestond niet, niets bewaard.
  const s = reisVerblijf();
  const bestaand = {
    id: tripStayId(s), name: 'Domaine des Messires', source: 'trip',
    bezocht: [bezoekje('custom_oud', '2026-07-27')],
  };
  const uit = verwerkReisInLogboek([bestaand], [s], {}, {
    stay_1: [
      bezoekje('custom_oud', '2026-07-27'),
      bezoekje('custom_nieuw', '2026-08-11', 'Place Guillaume II'),
    ],
  });
  assert.equal(uit.added, 0, 'er komt geen verblijf bij');
  assert.equal(uit.bijgewerkt, 1, 'maar er is wél iets veranderd');
  assert.deepEqual(uit.stays[0].bezocht.map(b => b.id), ['custom_oud', 'custom_nieuw']);
});

test('het echte incident: twee bestaande campings, vijftien nieuwe bezoeken', () => {
  const messires = reisVerblijf();
  const clervaux = reisVerblijf({
    id: 'stay_2', name: 'Camping Clervaux', startDate: '2026-08-08', endDate: '2026-08-15',
  });
  const stays = [
    { id: tripStayId(messires), name: 'Domaine des Messires', score: 8, source: 'trip',
      bezocht: Array.from({ length: 9 }, (_, i) => bezoekje(`oud_m_${i}`, '2026-07-30')) },
    { id: tripStayId(clervaux), name: 'Camping Clervaux', score: 3, source: 'trip',
      bezocht: Array.from({ length: 3 }, (_, i) => bezoekje(`oud_c_${i}`, '2026-08-09')) },
  ];
  const uit = verwerkReisInLogboek(stays, [messires, clervaux], {}, {
    stay_1: stays[0].bezocht,
    stay_2: [
      ...stays[1].bezocht,
      ...Array.from({ length: 15 }, (_, i) => bezoekje(`nieuw_${i}`, '2026-08-11')),
    ],
  });
  assert.equal(uit.added, 0);
  assert.equal(uit.bijgewerkt, 1, 'alleen Clervaux kreeg er iets bij');
  assert.equal(uit.stays[0].bezocht.length, 9, 'Messires ongewijzigd');
  assert.equal(uit.stays[1].bezocht.length, 18, '3 + 15');
});

test('cijfer, review en foto\'s van een bestaand verblijf blijven ongemoeid', () => {
  const s = reisVerblijf();
  const bestaand = {
    id: tripStayId(s), name: 'Zelf hernoemd', score: 9,
    review: 'Prachtig aan het water.', photos: [{ url: 'x', pathname: 'y' }],
    website: 'https://camping.fr', typeOther: null, type: 'camping_caravan',
    bezocht: [],
  };
  const uit = verwerkReisInLogboek([bestaand], [s], { title: 'Andere reis' }, {
    stay_1: [bezoekje('custom_1', '2026-07-27')],
  });
  const na = uit.stays[0];
  assert.equal(na.name, 'Zelf hernoemd', 'een tweede import hernoemt niet terug');
  assert.equal(na.score, 9);
  assert.equal(na.review, 'Prachtig aan het water.');
  assert.equal(na.type, 'camping_caravan');
  assert.deepEqual(na.photos, [{ url: 'x', pathname: 'y' }]);
  assert.equal(na.bezocht.length, 1);
});

test('een aangepaste bezoekregel wordt niet overschreven', () => {
  const s = reisVerblijf();
  const bestaand = {
    id: tripStayId(s),
    // De gebruiker heeft de datum met de hand goedgezet.
    bezocht: [bezoekje('custom_1', '2026-07-30', 'Eguisheim, met opa')],
  };
  const uit = verwerkReisInLogboek([bestaand], [s], {}, {
    stay_1: [bezoekje('custom_1', '2026-07-27', 'Eguisheim')],
  });
  assert.equal(uit.bijgewerkt, 0, 'niets nieuws, dus niets veranderd');
  assert.equal(uit.stays[0].bezocht[0].datum, '2026-07-30');
  assert.equal(uit.stays[0].bezocht[0].name, 'Eguisheim, met opa');
});

test('een handmatig toegevoegd bezoek overleeft het archiveren', () => {
  const s = reisVerblijf();
  const hand = handmatigBezoek({ name: 'Zwemmen in het meer', datum: '2026-07-28' });
  const uit = verwerkReisInLogboek([{ id: tripStayId(s), bezocht: [hand] }], [s], {}, {
    stay_1: [bezoekje('custom_1', '2026-07-27')],
  });
  assert.equal(uit.bijgewerkt, 1);
  const ids = uit.stays[0].bezocht.map(b => b.id);
  assert.ok(ids.includes(hand.id), 'de hand_-regel staat er nog');
  assert.ok(ids.includes('custom_1'));
});

test('niets nieuws betekent niets veranderd', () => {
  const s = reisVerblijf();
  const bestaand = { id: tripStayId(s), bezocht: [bezoekje('custom_1', '2026-07-27')], updatedAt: 'oud' };
  const uit = verwerkReisInLogboek([bestaand], [s], {}, {
    stay_1: [bezoekje('custom_1', '2026-07-27')],
  });
  assert.equal(uit.added, 0);
  assert.equal(uit.bijgewerkt, 0);
  assert.equal(uit.stays[0].updatedAt, 'oud', 'geen nodeloze updatedAt');
  assert.equal(uit.stays[0], bestaand, 'het object is niet eens vervangen');
});

test('zonder bezoeken werkt archiveren als vanouds', () => {
  const s = reisVerblijf();
  const leeg = verwerkReisInLogboek([], [s], {}, {});
  assert.equal(leeg.added, 1);
  assert.deepEqual(leeg.stays[0].bezocht, []);

  const bestaand = { id: tripStayId(s), score: 7, bezocht: [] };
  const nogmaals = verwerkReisInLogboek([bestaand], [s], {}, {});
  assert.equal(nogmaals.added, 0);
  assert.equal(nogmaals.bijgewerkt, 0);
  assert.equal(nogmaals.stays.length, 1, 'geen dubbele');
});

test('verblijven van andere reizen blijven onaangeroerd', () => {
  const s = reisVerblijf();
  const ander = { id: 'v_2019', name: 'Etnedal Noorwegen', score: 9, bezocht: [] };
  const uit = verwerkReisInLogboek([ander], [s], {}, { stay_1: [bezoekje('custom_1', '2026-07-27')] });
  assert.equal(uit.added, 1);
  assert.equal(uit.stays[0], ander, 'het oude verblijf is niet eens aangeraakt');
  assert.equal(uit.stays.length, 2);
});

test('een lege of ontbrekende lijst valt niet om', () => {
  assert.deepEqual(verwerkReisInLogboek(null, null, {}, {}), { stays: [], added: 0, bijgewerkt: 0 });
  assert.deepEqual(verwerkReisInLogboek([], [], {}), { stays: [], added: 0, bijgewerkt: 0 });
});
