// Een alleen-lezen deel-link: opa en oma kunnen de planning bekijken zonder
// de familie-PIN, en zonder iets te kunnen wijzigen.
//
// Het token staat in een eigen Redis-document en niet in `planner:trip`, om
// dezelfde reden als het verblijvenlogboek: dat document wordt gewist bij
// "nieuwe vakantie starten", en een link die je hebt rondgestuurd moet die
// reset overleven.

import { DEFAULT_ACTIVITIES, applyLocationOverride, buildDays } from './data.js';
import { kiesVervoer, routePunten } from './volgorde.js';

export const DELEN_KEY = 'planner:delen';

// 32 hex-tekens ≈ 128 bits. Niet te raden, en kort genoeg om in een
// WhatsApp-bericht te plakken zonder dat het een muur wordt.
export function maakToken(uuid) {
  const bron = typeof uuid === 'string' ? uuid : '';
  const schoon = bron.replace(/-/g, '');
  if (/^[0-9a-f]{32}$/i.test(schoon)) return schoon.toLowerCase();
  return null;
}

export function tokenGeldig(token) {
  return typeof token === 'string' && /^[0-9a-f]{32}$/.test(token);
}

// Klopt het meegestuurde token met wat er is uitgegeven?
// Een ingetrokken link (`actief: false`) telt niet meer, ook al is het token
// nog hetzelfde — dat is precies wat "intrekken" moet betekenen.
export function magBekijken(document, token) {
  if (!document || document.actief === false) return false;
  if (!tokenGeldig(token) || !tokenGeldig(document.token)) return false;
  return document.token === token;
}

// Wat een bezoeker met de link te zien krijgt. Alles wat er niet in staat is
// bewust weggelaten:
//   - `updatedBy`      → namen van het gezin
//   - verblijvenlogboek, foto's, uitgaven, foutenlogboek
//   - de familie-PIN, uiteraard
//
// Wat een activiteit hier wél meebrengt is precies genoeg om hem op een kaart
// en in een dagoverzicht te tonen.
export function publiekePlanning(trip) {
  if (!trip) return { tripConfig: null, plan: {}, activiteiten: [] };

  const gebruikt = new Set();
  const plan = {};
  for (const [dag, ids] of Object.entries(trip.plan || {})) {
    if (!Array.isArray(ids)) continue;
    plan[dag] = ids.slice(0, 40);
    ids.forEach(id => gebruikt.add(id));
  }

  // Alleen de activiteiten die ook echt op een dag staan. Een bezoeker heeft
  // niets aan de hele bibliotheek, en het scheelt een hoop bytes.
  const activiteiten = (trip.customActivities || [])
    .filter(a => gebruikt.has(a.id))
    .map(schoonActiviteit);

  const overrides = {};
  for (const [id, o] of Object.entries(trip.locationOverrides || {})) {
    if (gebruikt.has(id)) overrides[id] = schoonActiviteit(o);
  }

  const cfg = trip.tripConfig || null;
  return {
    tripConfig: cfg && {
      title: cfg.title ?? null,
      startDate: cfg.startDate ?? null,
      endDate: cfg.endDate ?? null,
      stays: (cfg.stays || []).map(s => ({
        id: s.id, name: s.name,
        startDate: s.startDate ?? null, endDate: s.endDate ?? null,
        coords: s.coords ?? null, locationLabel: s.locationLabel ?? null,
      })),
    },
    plan,
    activiteiten,
    overrides,
    bijgewerkt: trip.updatedAt ?? null,
  };
}

// Wat moet er getekend worden voor de route van één dag?
//
// Dit hoort op de server en niet in de meekijkpagina, en wel om twee redenen.
// De bezoeker geeft alleen een dátum mee: hij kan dus geen willekeurige punten
// laten uitrekenen, alleen de route die op zijn scherm hoort. En `routeAnkers`
// — waar de vervoerkeuze per dag in staat — zit bewust niet in de witte lijst
// van publiekePlanning(); de server mag dat weten, de bezoeker niet.
//
// Geeft { punten, vervoer } of null als er niets te tekenen valt.
export function dagRouteVraag(trip, dagKey) {
  if (!trip || !/^\d{4}-\d{2}-\d{2}$/.test(dagKey || '')) return null;

  const ids = trip.plan?.[dagKey];
  if (!Array.isArray(ids) || ids.length === 0) return null;

  const perId = {};
  for (const a of DEFAULT_ACTIVITIES) perId[a.id] = applyLocationOverride(a, trip.locationOverrides || {});
  for (const a of trip.customActivities || []) if (a?.id) perId[a.id] = a;

  const stops = ids
    .map(id => perId[id]?.coords)
    .filter(c => Array.isArray(c) && c.length === 2);
  if (stops.length === 0) return null;

  const dag = buildDays(trip.tripConfig).find(d => d.key === dagKey);
  const vervoer = kiesVervoer(stops, trip.routeAnkers?.[dagKey]?.vervoer || null);
  const punten = routePunten(stops, {
    begin: dag?.startCoords || null,
    eind: dag?.endCoords || null,
    vervoer,
  });
  // routePunten() geeft al een lege lijst zodra er minder dan twee punten
  // overblijven — één stop op een wandeldag, of een stop die precies op het
  // verblijf ligt. Hier hoeven we alleen nog te besluiten dat er dan niets te
  // tekenen valt.
  if (punten.length === 0) return null;

  return { punten, vervoer };
}

function schoonActiviteit(a) {
  if (!a || typeof a !== 'object') return null;
  return {
    id: a.id ?? null,
    name: a.name ?? null,
    emoji: a.emoji ?? null,
    category: a.category ?? null,
    note: a.note ?? null,
    important: Boolean(a.important),
    coords: Array.isArray(a.coords) && a.coords.length === 2 ? a.coords : null,
    mapsQuery: a.mapsQuery ?? null,
  };
}
