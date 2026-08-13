// Statistiek over het verblijvenlogboek: per reis en over alle jaren heen.
//
// Alles is afgeleid — er wordt niets extra's opgeslagen. Pas je de datums van
// een verblijf aan, dan verschuift de groepering (valkuil 14) en dus ook deze
// cijfers. Dat is de bedoeling.
//
// Relatieve imports, want de tests draaien buiten Next om. `volgorde.js`
// importeert zelf niets, dus dit geeft geen kringloop — en via stayLog → data
// zat hij er toch al in.
import { groepeerReizen, jarenVanVerblijf } from './stayLog.js';
import { hemelsbreed } from './volgorde.js';

// Een nacht hoort bij de dag waarop je gaat slapen. Een verblijf van 10 t/m
// 14 augustus is dus 4 nachten, niet 5 dagen — dat is ook hoe een camping rekent.
export function nachten(startDate, endDate) {
  if (!startDate || !endDate) return 0;
  const a = Date.parse(`${startDate}T00:00:00Z`);
  const b = Date.parse(`${endDate}T00:00:00Z`);
  if (!isFinite(a) || !isFinite(b) || b <= a) return 0;
  return Math.round((b - a) / 86_400_000);
}

// Nachten uitgesplitst naar kalenderjaar. Een reis over oud en nieuw hoort
// niet in zijn geheel bij één jaar.
export function nachtenPerJaar(startDate, endDate) {
  const uit = {};
  const totaal = nachten(startDate, endDate);
  if (!totaal) return uit;
  const start = new Date(`${startDate}T00:00:00Z`);
  for (let i = 0; i < totaal; i++) {
    const d = new Date(start.getTime() + i * 86_400_000);
    const jaar = d.getUTCFullYear();
    uit[jaar] = (uit[jaar] || 0) + 1;
  }
  return uit;
}

// Nachten uitgesplitst naar kalendermaand (1 t/m 12). Zelfde regel als
// nachtenPerJaar: een reis over de maandgrens telt in allebei de maanden.
export function nachtenPerMaand(startDate, endDate) {
  const uit = {};
  const totaal = nachten(startDate, endDate);
  if (!totaal) return uit;
  const start = new Date(`${startDate}T00:00:00Z`);
  for (let i = 0; i < totaal; i++) {
    const d = new Date(start.getTime() + i * 86_400_000);
    const m = d.getUTCMonth() + 1;
    uit[m] = (uit[m] || 0) + 1;
  }
  return uit;
}

function gemiddelde(getallen) {
  if (!getallen.length) return null;
  const som = getallen.reduce((a, b) => a + b, 0);
  return Math.round((som / getallen.length) * 10) / 10;
}

// Hoe zwaar een verblijf meeweegt in het gewogen gemiddelde: het aantal
// nachten, maar **minstens één**. Zonder die klem zou een beoordeeld
// dagbezoek (nul nachten) gewicht nul krijgen en dus stilletjes uit de
// statistiek verdwijnen — een cijfer dat je gaf hoort altijd mee te tellen.
const gewichtVan = (s) => Math.max(nachten(s.startDate, s.endDate), 1);

// Gemiddeld cijfer, gewogen naar het aantal nachten. Twee weken met een 8 en
// een lang weekend met een 3 is geen 5,5: je hebt die twee weken echt gehad.
export function gewogenGemiddelde(stays) {
  const beoordeeld = (stays || []).filter(s => typeof s.score === 'number');
  if (!beoordeeld.length) return null;
  let som = 0;
  let gewicht = 0;
  for (const s of beoordeeld) {
    const g = gewichtVan(s);
    som += s.score * g;
    gewicht += g;
  }
  return Math.round((som / gewicht) * 10) / 10;
}

// Tellen doen we in twee maten tegelijk: hoe vaak iets voorkwam én hoeveel
// nachten je er lag. Die twee vertellen een ander verhaal — achttien korte
// verblijven in Noorwegen zijn minder nachten dan acht lange in Denemarken.
// De sortering volgt de nachten, want dat is wat de pagina bovenaan zet.
function tel(lijst, sleutel) {
  const uit = new Map();
  for (const item of lijst) {
    const k = sleutel(item);
    if (k == null || k === '') continue;
    const vorig = uit.get(k) || { aantal: 0, nachten: 0 };
    uit.set(k, {
      aantal: vorig.aantal + 1,
      nachten: vorig.nachten + nachten(item.startDate, item.endDate),
    });
  }
  // Aflopend op nachten, dan op aantal, dan alfabetisch — zodat de volgorde
  // vast ligt en twee gelijke waarden niet per toeval van plek wisselen.
  return [...uit.entries()]
    .map(([naam, x]) => ({ naam, aantal: x.aantal, nachten: x.nachten }))
    .sort((a, b) => b.nachten - a.nachten
      || b.aantal - a.aantal
      || String(a.naam).localeCompare(String(b.naam)));
}

// ── Cijfers ─────────────────────────────────────────────────────────

// Gemiddeld cijfer per land, gesorteerd op nachten. `aantal` staat erbij en
// dat is geen sierraad: een 3,0 uit één verblijf is iets heel anders dan een
// 8,1 uit achttien, en zonder dat getal leest de lijst als een oordeel over
// het land.
export function cijferPerLand(stays) {
  const perLand = new Map();
  for (const s of stays || []) {
    if (!s?.country || typeof s.score !== 'number') continue;
    if (!perLand.has(s.country)) perLand.set(s.country, []);
    perLand.get(s.country).push(s);
  }
  return [...perLand.entries()]
    .map(([land, lijst]) => ({
      land,
      gemiddeld: gemiddelde(lijst.map(s => s.score)),
      aantal: lijst.length,
      nachten: lijst.reduce((n, s) => n + nachten(s.startDate, s.endDate), 0),
    }))
    .sort((a, b) => b.nachten - a.nachten
      || b.aantal - a.aantal
      || a.land.localeCompare(b.land));
}

// De verdeling van de cijfers, altijd tien vakjes van 1 t/m 10 — ook de lege.
// Een histogram met gaten erin is geen histogram; je moet kunnen zien dat er
// nooit een 1 of een 2 is uitgedeeld.
export function cijferVerdeling(stays) {
  const rij = Array.from({ length: 10 }, (_, i) => ({ cijfer: i + 1, aantal: 0 }));
  for (const s of stays || []) {
    const c = s?.score;
    if (typeof c !== 'number' || !Number.isInteger(c) || c < 1 || c > 10) continue;
    rij[c - 1].aantal += 1;
  }
  return rij;
}

// ── Afstand ─────────────────────────────────────────────────────────

// Hemelsbreed tussen opeenvolgende verblijven, in kilometers. Bewust géén
// echte rijafstand: dat zou voor 38 verblijven tientallen routeaanvragen
// kosten voor een pagina die je één keer per jaar opent. De UI zegt daarom
// "hemelsbreed" — anders leest het als gereden kilometers en klopt het niet.
//
// Een reis met één verblijf is 0 km, en dat is eerlijk: hoe ver je van huis
// reed weet het logboek niet.
export function afstandVanReis(stays) {
  const punten = (stays || [])
    .filter(s => Array.isArray(s?.coords) && s.coords.length === 2)
    .map(s => s.coords);
  let meter = 0;
  for (let i = 1; i < punten.length; i++) meter += hemelsbreed(punten[i - 1], punten[i]);
  return Math.round(meter / 1000);
}

// ── Verhaal ─────────────────────────────────────────────────────────

// Per reis de landen die je daarvóór nog nooit had gezien. De reizen komen
// chronologisch binnen (groepeerReizen sorteert op startdatum), dus "nieuw"
// is gewoon: nog niet eerder langsgekomen.
export function nieuweLanden(groepen) {
  const gezien = new Set();
  const uit = [];
  for (const groep of groepen || []) {
    const landen = [];
    for (const s of groep.stays || []) {
      if (!s?.country || gezien.has(s.country)) continue;
      gezien.add(s.country);
      landen.push(s.country);
    }
    if (landen.length) {
      uit.push({ id: groep.id, reis: groep.naam, jaar: jaarVanGroep(groep), landen });
    }
  }
  return uit;
}

function jaarVanGroep(groep) {
  const stays = groep?.stays || [];
  return eindeVan(stays) || jarenVanVerblijf(stays[0] || {})[0] || null;
}

// Hoe dicht twee verblijven bij elkaar mogen liggen om als dezelfde plek te
// gelden. Ruim genomen: een camping een dorp verderop voelt als terugkomen.
// De afstand wordt in de UI erbij gezet zodra hij noemenswaardig is, zodat
// "exact dezelfde plek" en "in de buurt" niet door elkaar gaan lopen.
export const ZELFDE_PLEK_KM = 25;

// Plekken waar je in méér dan één reis bent geweest.
//
// Clusteren gebeurt met single-linkage: A hoort bij B als ze binnen de drempel
// liggen, en de keten mag doorlopen. Dat is precies wat je wilt bij een rij
// campings langs dezelfde fjord. Twee verblijven uit dezelfde reis vormen géén
// terugkeer — dat is gewoon een reis die ter plaatse verhuisde.
export function terugkerendePlekken(stays, drempelKm = ZELFDE_PLEK_KM) {
  const groepen = groepeerReizen(Array.isArray(stays) ? stays : []);
  const punten = [];
  for (const groep of groepen) {
    for (const s of groep.stays || []) {
      if (!Array.isArray(s?.coords) || s.coords.length !== 2) continue;
      punten.push({ stay: s, reisId: groep.id, reis: groep.naam, jaar: jaarVanGroep(groep) });
    }
  }

  const drempelM = Math.max(drempelKm, 0) * 1000;
  const cluster = punten.map((_, i) => i); // index → clusternummer
  for (let i = 0; i < punten.length; i++) {
    for (let j = i + 1; j < punten.length; j++) {
      if (cluster[i] === cluster[j]) continue;
      if (hemelsbreed(punten[i].stay.coords, punten[j].stay.coords) > drempelM) continue;
      // Samenvoegen: alles met het hogere nummer krijgt het lagere.
      const van = cluster[j];
      const naar = cluster[i];
      for (let k = 0; k < cluster.length; k++) if (cluster[k] === van) cluster[k] = naar;
    }
  }

  const perCluster = new Map();
  cluster.forEach((c, i) => {
    if (!perCluster.has(c)) perCluster.set(c, []);
    perCluster.get(c).push(punten[i]);
  });

  const uit = [];
  for (const leden of perCluster.values()) {
    const reizen = new Set(leden.map(l => l.reisId));
    if (reizen.size < 2) continue;
    // Hoe ver de twee verste leden uit elkaar liggen: dat bepaalt of dit
    // "exact dezelfde plek" of "in de buurt" is.
    let spreiding = 0;
    for (let i = 0; i < leden.length; i++) {
      for (let j = i + 1; j < leden.length; j++) {
        spreiding = Math.max(spreiding, hemelsbreed(leden[i].stay.coords, leden[j].stay.coords));
      }
    }
    const gesorteerd = [...leden].sort((a, b) =>
      String(a.stay.startDate || '').localeCompare(String(b.stay.startDate || '')));
    uit.push({
      id: gesorteerd.map(l => l.stay.id).join('_'),
      naam: gesorteerd[0].stay.name,
      keren: reizen.size,
      spreidingKm: Math.round((spreiding / 1000) * 10) / 10,
      bezoeken: gesorteerd.map(l => ({
        id: l.stay.id, naam: l.stay.name, jaar: l.jaar, reis: l.reis,
      })),
    });
  }

  // Vaakst teruggekomen eerst, daarna chronologisch op het eerste bezoek.
  return uit.sort((a, b) => b.keren - a.keren
    || String(a.bezoeken[0].jaar).localeCompare(String(b.bezoeken[0].jaar)));
}

// Nachten per kalendermaand, altijd twaalf vakjes — net als bij de cijfers
// vertelt een lege maand net zoveel als een volle.
export function maandVerdeling(stays) {
  const rij = Array.from({ length: 12 }, (_, i) => ({ maand: i + 1, nachten: 0 }));
  for (const s of stays || []) {
    for (const [m, n] of Object.entries(nachtenPerMaand(s.startDate, s.endDate))) {
      rij[Number(m) - 1].nachten += n;
    }
  }
  return rij;
}

// Statistiek van één reis (zoals groepeerReizen die teruggeeft).
export function reisStatistiek(reis) {
  const stays = reis?.stays || [];
  const cijfers = stays.filter(s => typeof s.score === 'number').map(s => s.score);
  const totaalNachten = stays.reduce((n, s) => n + nachten(s.startDate, s.endDate), 0);

  // Beste verblijf: hoogste cijfer; bij gelijkspel de langste. Zonder cijfers
  // is er geen "beste" — dan liever niets dan een willekeurige keuze.
  const beoordeeld = stays.filter(s => typeof s.score === 'number');
  const beste = beoordeeld.length
    ? beoordeeld.reduce((a, b) => {
        if (b.score !== a.score) return b.score > a.score ? b : a;
        return nachten(b.startDate, b.endDate) > nachten(a.startDate, a.endDate) ? b : a;
      })
    : null;

  return {
    id: reis.id,
    naam: reis.naam,
    periode: reis.periode,
    kleur: reis.kleur,
    los: Boolean(reis.los),
    aantalVerblijven: stays.length,
    nachten: totaalNachten,
    landen: tel(stays, s => s.country),
    types: tel(stays, s => s.type),
    gemiddeldCijfer: gemiddelde(cijfers),
    gemiddeldCijferGewogen: gewogenGemiddelde(stays),
    aantalBeoordeeld: cijfers.length,
    kilometers: afstandVanReis(stays),
    besteVerblijf: beste ? { naam: beste.name, score: beste.score } : null,
    startDate: stays[0]?.startDate || null,
    endDate: stays[stays.length - 1]?.endDate || stays[stays.length - 1]?.startDate || null,
    // Het jaar waar deze reis bij hoort. Bij echte datums het eindjaar (zelfde
    // regel als de afgeleide naam "aug 2026"); staat er alleen "zomer 2003",
    // dan dát jaar. Zonder een van beide: null, en dan telt hij nergens in mee.
    jaar: eindeVan(stays) || jarenVanVerblijf(stays[0] || {})[0] || null,
  };
}

function eindeVan(stays) {
  const laatste = stays[stays.length - 1];
  const einde = laatste?.endDate || laatste?.startDate;
  return einde ? einde.slice(0, 4) : null;
}

// Alles bij elkaar: per reis én de optelsom.
export function maakVerslag(stays) {
  const lijst = Array.isArray(stays) ? stays : [];
  const groepen = groepeerReizen(lijst);
  const reizen = groepen.map(reisStatistiek);

  // Een reis telt mee zodra we weten in wélk jaar hij viel. Dat mag ook uit
  // een losse periodetekst komen ("zomer 2003"): je bent er geweest, je weet
  // alleen de precieze dagen niet meer. Alleen een verblijf waar helemaal geen
  // jaar uit te halen is blijft buiten de telling.
  const echteReizen = reizen.filter(r => r.jaar);

  const alleCijfers = lijst.filter(s => typeof s.score === 'number').map(s => s.score);

  // Nachten per jaar, én binnen zo'n jaar uitgesplitst per reis. Dat tweede is
  // wat de balk op /verslag in stukken deelt: "2019 · 27 nachten" was in
  // werkelijkheid twee vakanties, en dat hoor je te kunnen zien.
  const perJaar = {};
  const delenPerJaar = {};
  const voegToe = (jaar, reis, n) => {
    perJaar[jaar] = (perJaar[jaar] || 0) + n;
    if (!delenPerJaar[jaar]) delenPerJaar[jaar] = new Map();
    const rij = delenPerJaar[jaar];
    const vorig = rij.get(reis.id);
    rij.set(reis.id, {
      id: reis.id,
      naam: reis.naam,
      nachten: (vorig?.nachten || 0) + n,
      // Waarop de stukjes binnen een jaar geordend worden: chronologisch.
      start: reis.startDate || reis.jaar || '',
    });
  };

  // Via de reisgroepen lopen en niet via de losse verblijven: zo weet elk
  // stukje bij welke reis het hoort, en blijft de optelsom exact dezelfde.
  for (const groep of groepen) {
    const reis = { id: groep.id, naam: groep.naam, startDate: groep.stays[0]?.startDate || '' };
    for (const s of groep.stays || []) {
      const nachtenVanDitVerblijf = nachtenPerJaar(s.startDate, s.endDate);
      if (Object.keys(nachtenVanDitVerblijf).length) {
        for (const [jaar, n] of Object.entries(nachtenVanDitVerblijf)) voegToe(jaar, reis, n);
        continue;
      }
      // Geen nachten (of geen echte datums), maar wel een jaartal — uit de
      // datums zelf of uit de vrije periodetekst ("zomer 2003"). Dan hoort dit
      // verblijf in dat jaar thuis met nul nachten: dat wéten we niet, en
      // verzinnen is erger dan ontbreken.
      for (const jaar of jarenVanVerblijf(s)) voegToe(jaar, reis, 0);
    }
  }

  const gevuld = vulJarenAan(Object.keys(perJaar).map(Number));

  const jaren = gevuld.map((jaarNr) => {
    const jaar = String(jaarNr);
    const delen = [...(delenPerJaar[jaar]?.values() || [])]
      .sort((a, b) => String(a.start).localeCompare(String(b.start)))
      .map(({ id, naam, nachten: n }) => ({ id, naam, nachten: n }));
    return {
      jaar: jaarNr,
      nachten: perJaar[jaar] || 0,
      // Het aantal reizen dat een nacht in dít jaar had — precies het aantal
      // stukjes in de balk. Eerder telde dit het jaar waarin een reis
      // *eindigde*, en dan sprak het getal de balk tegen: een kerstreis stond
      // met al zijn nachten in het oude jaar maar telde bij het nieuwe.
      reizen: delen.length,
      delen,
    };
  });

  return {
    reizen,
    totaal: {
      aantalReizen: echteReizen.length,
      aantalVerblijven: lijst.length,
      nachten: lijst.reduce((n, s) => n + nachten(s.startDate, s.endDate), 0),
      kilometers: groepen.reduce((km, g) => km + afstandVanReis(g.stays), 0),
      landen: tel(lijst, s => s.country),
      types: tel(lijst, s => s.type),
      gemiddeldCijfer: gemiddelde(alleCijfers),
      gemiddeldCijferGewogen: gewogenGemiddelde(lijst),
      aantalBeoordeeld: alleCijfers.length,
      cijferPerLand: cijferPerLand(lijst),
      cijferVerdeling: cijferVerdeling(lijst),
      maanden: maandVerdeling(lijst),
      langsteVerblijf: uiterste(lijst, 'langste'),
      kortsteVerblijf: uiterste(lijst, 'kortste'),
      eersteJaar: jaren.length ? jaren[0].jaar : null,
      laatsteJaar: jaren.length ? jaren[jaren.length - 1].jaar : null,
    },
    jaren,
    nieuweLanden: nieuweLanden(groepen),
    terugkerendePlekken: terugkerendePlekken(lijst),
  };
}

// De jaren tussen het eerste en het laatste aanvullen, ook de jaren waarin je
// niet weg bent geweest. Zonder die lege jaren verspringt de as en zie je niet
// dát 2020 werd overgeslagen — de balk zou dan liegen door weglating.
export function vulJarenAan(jaren) {
  const getallen = (Array.isArray(jaren) ? jaren : [])
    .map(Number)
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  if (!getallen.length) return [];
  const uit = [];
  for (let j = getallen[0]; j <= getallen[getallen.length - 1]; j++) uit.push(j);
  return uit;
}

// Vanaf hoeveel lege jaren op rij de balk ze samenvouwt tot één regel. Twee
// overgeslagen jaren wil je los zien staan; tien is een muur van lege sporen.
export const SAMENVOUW_VANAF = 3;

// De jarenlijst klaarmaken om te tekenen: losse jaren blijven losse jaren, maar
// een lange reeks zonder nachten wordt één regel ("2004 – 2012"). Dit is
// presentatie, geen statistiek — daarom zit het niet in `jaren` zelf, maar het
// staat hier omdat het een pure lijstbewerking is die je wilt kunnen testen.
export function groepeerLegeJaren(jaren, vanaf = SAMENVOUW_VANAF) {
  const rijen = [];
  let leeg = [];
  const spoel = () => {
    if (!leeg.length) return;
    if (leeg.length >= Math.max(vanaf, 2)) {
      rijen.push({ type: 'gat', van: leeg[0].jaar, tot: leeg[leeg.length - 1].jaar, aantal: leeg.length });
    } else {
      for (const j of leeg) rijen.push({ type: 'jaar', jaar: j });
    }
    leeg = [];
  };
  for (const j of jaren || []) {
    // "Leeg" is geen jaar zónder nachten maar een jaar zónder reis. Een
    // verblijf uit het hoofd ("zomer 2003") levert nul nachten op — die weet je
    // niet meer — maar je bent er wél geweest, en dat mag niet in een
    // samengevouwen gat verdwijnen.
    if (j.nachten > 0 || j.reizen > 0) { spoel(); rijen.push({ type: 'jaar', jaar: j }); }
    else leeg.push(j);
  }
  spoel();
  return rijen;
}

// Het langste of kortste verblijf, gemeten in nachten. Verblijven zonder
// nachten (alleen een periodetekst, of aankomen en vertrekken op dezelfde dag)
// doen niet mee: die zijn niet "het kortste", die zijn ongemeten.
function uiterste(stays, welke) {
  const metNachten = (stays || [])
    .map(s => ({ s, n: nachten(s.startDate, s.endDate) }))
    .filter(x => x.n > 0);
  if (!metNachten.length) return null;
  const gekozen = metNachten.reduce((a, b) => {
    if (a.n === b.n) return a;
    return (welke === 'langste' ? b.n > a.n : b.n < a.n) ? b : a;
  });
  return { naam: gekozen.s.name, nachten: gekozen.n };
}
