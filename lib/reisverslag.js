// Statistiek over het verblijvenlogboek: per reis en over alle jaren heen.
//
// Alles is afgeleid — er wordt niets extra's opgeslagen. Pas je de datums van
// een verblijf aan, dan verschuift de groepering (valkuil 14) en dus ook deze
// cijfers. Dat is de bedoeling.
//
// Relatieve import, want de tests draaien buiten Next om.
import { groepeerReizen, jarenVanVerblijf } from './stayLog.js';

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

function gemiddelde(getallen) {
  if (!getallen.length) return null;
  const som = getallen.reduce((a, b) => a + b, 0);
  return Math.round((som / getallen.length) * 10) / 10;
}

function tel(lijst, sleutel) {
  const uit = new Map();
  for (const item of lijst) {
    const k = sleutel(item);
    if (k == null || k === '') continue;
    uit.set(k, (uit.get(k) || 0) + 1);
  }
  // Aflopend op aantal, daarna alfabetisch — zodat de volgorde vast ligt en
  // twee gelijke aantallen niet per toeval van plek wisselen.
  return [...uit.entries()]
    .map(([naam, aantal]) => ({ naam, aantal }))
    .sort((a, b) => b.aantal - a.aantal || String(a.naam).localeCompare(String(b.naam)));
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
    aantalBeoordeeld: cijfers.length,
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
  const reizen = groepeerReizen(lijst).map(reisStatistiek);

  // Een reis telt mee zodra we weten in wélk jaar hij viel. Dat mag ook uit
  // een losse periodetekst komen ("zomer 2003"): je bent er geweest, je weet
  // alleen de precieze dagen niet meer. Alleen een verblijf waar helemaal geen
  // jaar uit te halen is blijft buiten de telling.
  const echteReizen = reizen.filter(r => r.jaar);

  const alleCijfers = lijst.filter(s => typeof s.score === 'number').map(s => s.score);
  const perJaar = {};
  for (const s of lijst) {
    const nachtenVanDitVerblijf = nachtenPerJaar(s.startDate, s.endDate);
    if (Object.keys(nachtenVanDitVerblijf).length) {
      for (const [jaar, n] of Object.entries(nachtenVanDitVerblijf)) {
        perJaar[jaar] = (perJaar[jaar] || 0) + n;
      }
      continue;
    }
    // Geen echte datums, maar wel een jaartal in de vrije periodetekst
    // ("zomer 2003")? Dan hoort dit verblijf in dat jaar thuis. Het aantal
    // nachten blijft 0 — dat wéten we niet, en verzinnen is erger dan
    // ontbreken.
    for (const jaar of jarenVanVerblijf(s)) perJaar[jaar] = perJaar[jaar] || 0;
  }
  for (const r of echteReizen) perJaar[r.jaar] = perJaar[r.jaar] || 0;

  const jaren = Object.keys(perJaar)
    .sort()
    .map(jaar => ({
      jaar: Number(jaar),
      nachten: perJaar[jaar],
      reizen: echteReizen.filter(r => r.jaar === jaar).length,
    }));

  return {
    reizen,
    totaal: {
      aantalReizen: echteReizen.length,
      aantalVerblijven: lijst.length,
      nachten: lijst.reduce((n, s) => n + nachten(s.startDate, s.endDate), 0),
      landen: tel(lijst, s => s.country),
      types: tel(lijst, s => s.type),
      gemiddeldCijfer: gemiddelde(alleCijfers),
      aantalBeoordeeld: alleCijfers.length,
      eersteJaar: jaren.length ? jaren[0].jaar : null,
      laatsteJaar: jaren.length ? jaren[jaren.length - 1].jaar : null,
    },
    jaren,
  };
}
