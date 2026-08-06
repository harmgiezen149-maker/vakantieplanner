'use client';

import { getPin } from '@/lib/maps';
import { STAY_PALETTE, formatDateRange } from '@/lib/data';

// Client-kant van het verblijvenlogboek. Wordt op twee plekken gebruikt:
// de pagina /verblijven (knop "Huidige reis toevoegen") en de planner
// (archiveervraag bij "Nieuwe vakantie starten").

export const uid = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

// ── Verblijven groeperen tot reizen ─────────────────────────────────
// Twee verblijven horen bij dezelfde vakantie als ze in de tijd tegen elkaar
// aan liggen: je rijdt van de ene camping naar de volgende, dus het gat is nul
// of een paar dagen. Zit er meer dan MAX_GAT tussen, dan was het een andere
// vakantie. Verblijven die uit een reis zijn gearchiveerd dragen een tripTitle;
// die is leidend — twee verschillende reizen worden nooit samengevoegd, ook
// niet als ze toevallig op elkaar aansluiten.

const MAX_GAT_DAGEN = 5;

const MAAND_KORT = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun',
  'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];

const naarDatum = (key) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
};

const dagenTussen = (a, b) =>
  Math.round((naarDatum(b) - naarDatum(a)) / 86400000);

// Naam voor een reis zonder titel: "jul 2026" of "jul—aug 2026"
function afgeleideNaam(groep) {
  const start = naarDatum(groep[0].startDate);
  const laatste = groep[groep.length - 1];
  const eind = naarDatum(laatste.endDate || laatste.startDate);
  const zelfdeMaand = start.getMonth() === eind.getMonth() && start.getFullYear() === eind.getFullYear();
  const kop = zelfdeMaand
    ? MAAND_KORT[start.getMonth()]
    : `${MAAND_KORT[start.getMonth()]}—${MAAND_KORT[eind.getMonth()]}`;
  return `${kop} ${eind.getFullYear()}`;
}

// Geeft een lijst reizen terug: { id, naam, periode, kleur, stays[] }.
// Verblijven zonder begindatum kunnen niet op tijd geordend worden en komen
// elk in een eigen "losse" groep — die krijgen dus ook geen route.
export function groepeerReizen(stays) {
  const metDatum = [...stays]
    .filter(s => s.startDate)
    .sort((a, b) => a.startDate.localeCompare(b.startDate));

  const groepen = [];
  let huidig = null;

  for (const s of metDatum) {
    if (huidig) {
      const vorige = huidig[huidig.length - 1];
      const eindVorige = vorige.endDate || vorige.startDate;
      const gat = dagenTussen(eindVorige, s.startDate);
      const titelsBotsen = s.tripTitle && vorige.tripTitle && s.tripTitle !== vorige.tripTitle;
      const zelfdeTitel = s.tripTitle && vorige.tripTitle && s.tripTitle === vorige.tripTitle;
      // Overlappend of vlak erna → dezelfde vakantie. Een negatief gat betekent
      // dat de periodes overlappen; dat telt ook als aansluitend.
      if (!titelsBotsen && (zelfdeTitel || gat <= MAX_GAT_DAGEN)) {
        huidig.push(s);
        continue;
      }
    }
    huidig = [s];
    groepen.push(huidig);
  }

  const reizen = groepen.map((groep, i) => {
    const laatste = groep[groep.length - 1];
    const titel = groep.find(s => s.tripTitle)?.tripTitle || null;
    return {
      id: `reis_${groep[0].startDate}_${i}`,
      naam: titel || afgeleideNaam(groep),
      periode: formatDateRange(groep[0].startDate, laatste.endDate || laatste.startDate),
      kleur: STAY_PALETTE[i % STAY_PALETTE.length],
      stays: groep,
    };
  });

  // Verblijven zonder datum: elk apart, zonder route
  stays.filter(s => !s.startDate).forEach((s, i) => {
    reizen.push({
      id: `los_${s.id}`,
      naam: s.periodLabel || 'Zonder datum',
      periode: s.periodLabel || '',
      kleur: STAY_PALETTE[(reizen.length + i) % STAY_PALETTE.length],
      stays: [s],
      los: true,
    });
  });

  return reizen;
}

// ── Land ────────────────────────────────────────────────────────────
// De types en de vlagjes staan in lib/stayTypes.js — die module wordt ook
// server-side gebruikt en mag daarom geen client-code bevatten.

// Land bepalen uit coördinaten. Geeft null terug als het niet lukt — dan
// blijft het verblijf gewoon zonder land staan.
export async function reverseCountry(coords) {
  if (!Array.isArray(coords) || coords.length !== 2) return null;
  try {
    const res = await fetch(
      `/api/geocode?lat=${encodeURIComponent(coords[0])}&lng=${encodeURIComponent(coords[1])}`,
      { headers: { 'X-Family-Pin': getPin() } },
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (!data?.country) return null;
    return { country: data.country, countryCode: data.countryCode || null };
  } catch {
    return null;
  }
}

// Land uit het address-object dat /api/geocode bij een zoekresultaat
// meelevert — scheelt een extra verzoek aan Nominatim.
export function countryFromAddress(address) {
  if (!address?.country) return null;
  return {
    country: address.country,
    countryCode: address.country_code ? String(address.country_code).toUpperCase() : null,
  };
}

export async function fetchStayLog() {
  const res = await fetch('/api/verblijven', {
    headers: { 'X-Family-Pin': getPin() },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(res.status === 401 ? 'unauthorized' : `HTTP ${res.status}`);
  return res.json();
}

export async function saveStayLog(stays, updatedBy) {
  const res = await fetch('/api/verblijven', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Family-Pin': getPin() },
    body: JSON.stringify({ stays, updatedBy: updatedBy || null }),
  });
  if (!res.ok) throw new Error(res.status === 401 ? 'unauthorized' : `HTTP ${res.status}`);
  return res.json();
}

// Stabiele id voor een verblijf dat uit de reisconfiguratie komt. Hierop
// dedupliceren we, zodat "Huidige reis toevoegen" meerdere keren indrukken
// niets dubbels oplevert.
export const tripStayId = (stay) =>
  `trip_${stay?.id || 'x'}_${stay?.startDate || 'x'}`;

export function stayFromTripStay(stay, tripConfig) {
  const now = new Date().toISOString();
  return {
    id: tripStayId(stay),
    name: stay?.name || 'Verblijf',
    locationLabel: stay?.locationLabel || null,
    coords: Array.isArray(stay?.coords) && stay.coords.length === 2 ? stay.coords : null,
    startDate: stay?.startDate || null,
    endDate: stay?.endDate || null,
    periodLabel: null,
    tripTitle: tripConfig?.title || null,
    score: null,
    review: null,
    photos: [],
    source: 'trip',
    createdAt: now,
    updatedAt: now,
  };
}

// Voegt de verblijven van een reis toe aan het logboek. Bestaande verblijven
// (zelfde id) worden overgeslagen, niet overschreven — anders zou je je eigen
// cijfer en review kwijtraken bij een tweede import.
// Geeft { added, skipped, stays } terug.
export async function archiveTripStays(tripConfig, updatedBy) {
  const candidates = (tripConfig?.stays || []).filter(s => s?.name || s?.coords);
  if (candidates.length === 0) return { added: 0, skipped: 0, stays: null };

  const current = await fetchStayLog();
  const existing = new Set((current.stays || []).map(s => s.id));

  const toAdd = candidates
    .filter(s => !existing.has(tripStayId(s)))
    .map(s => stayFromTripStay(s, tripConfig));

  if (toAdd.length === 0) {
    return { added: 0, skipped: candidates.length, stays: current.stays || [] };
  }

  const next = [...(current.stays || []), ...toAdd];
  await saveStayLog(next, updatedBy);
  return { added: toAdd.length, skipped: candidates.length - toAdd.length, stays: next };
}
