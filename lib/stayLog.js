'use client';

import { getPin } from '@/lib/maps';

// Client-kant van het verblijvenlogboek. Wordt op twee plekken gebruikt:
// de pagina /verblijven (knop "Huidige reis toevoegen") en de planner
// (archiveervraag bij "Nieuwe vakantie starten").

export const uid = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

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
