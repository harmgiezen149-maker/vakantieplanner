// Kleurpalet — natuurlijke tinten, geschikt voor elke bestemming
export const COLORS = {
  cream: '#F4EBD5',
  creamSoft: '#FAF3E1',
  forest: '#2D4F3E',
  moss: '#4A6F4F',
  lake: '#3A7E84',
  sunset: '#C97D5D',
  wood: '#8B6F47',
  wine: '#8E3D52',
  slate: '#5A6B8C',
  charcoal: '#1F2922',
  ink: 'rgba(31, 41, 34, 0.65)',
  inkLight: 'rgba(31, 41, 34, 0.45)',
  hairline: 'rgba(31, 41, 34, 0.10)',
};

// Kleuren die automatisch aan verblijven worden toegekend (op volgorde)
export const STAY_PALETTE = [
  '#3A7E84', // meer-blauw
  '#B08A3E', // oker
  '#8E3D52', // wijnrood
  '#4A6F4F', // mos
  '#5A6B8C', // leisteen
  '#C97D5D', // zonsondergang
  '#8B6F47', // hout
];

// Generieke activiteitscategorieën — bruikbaar voor elke vakantie
export const CATEGORIES = {
  stay: { name: 'Verblijf & relaxen', color: '#3A7E84', emoji: '🏡' },
  hiking: { name: 'Wandelen', color: '#4A6F4F', emoji: '🥾' },
  cycling: { name: 'Fietsen', color: '#8B6F47', emoji: '🚴' },
  water: { name: 'Water & strand', color: '#5A8FA8', emoji: '🏖️' },
  nature: { name: 'Natuur & Wildlife', color: '#2D4F3E', emoji: '🌲' },
  villages: { name: 'Steden & dorpen', color: '#8E3D52', emoji: '🏘️' },
  culture: { name: 'Cultuur & musea', color: '#5A6B8C', emoji: '🏛️' },
  food: { name: 'Eten & markt', color: '#A8624A', emoji: '🍽️' },
  shops: { name: 'Supermarkten & winkels', color: '#6B7A5E', emoji: '🛒' },
  custom: { name: 'Eigen ideeën', color: '#7A6F5C', emoji: '✨' },
};

export const CATEGORY_ORDER = [
  'stay', 'hiking', 'cycling', 'water', 'nature',
  'villages', 'culture', 'food', 'shops', 'custom',
];

// Kleine generieke startbibliotheek — locatieloos, geldt voor elke bestemming.
// Bestemmingsspecifieke activiteiten voeg je toe als "eigen activiteit"
// (met locatie via de zoekfunctie).
export const DEFAULT_ACTIVITIES = [
  { id: 'g_arrival', name: 'Aankomst & inrichten', emoji: '🚐', category: 'stay' },
  { id: 'g_departure', name: 'Inpakken & vertrek', emoji: '👋', category: 'stay' },
  { id: 'g_transfer', name: 'Reisdag naar volgend verblijf', emoji: '🚗', category: 'stay' },
  { id: 'g_relax', name: 'Lui hangen & lezen', emoji: '📖', category: 'stay' },
  { id: 'g_bbq', name: 'BBQ / koken op het verblijf', emoji: '🔥', category: 'stay' },
  { id: 'g_swim', name: 'Zwemmen', emoji: '🏊', category: 'water' },
  { id: 'g_walk_local', name: 'Lokaal rondje wandelen', emoji: '🚶', category: 'hiking' },
  { id: 'g_hike', name: 'Dagwandeling', emoji: '🥾', category: 'hiking' },
  { id: 'g_bike', name: 'Fietstocht', emoji: '🚲', category: 'cycling' },
  { id: 'g_market', name: 'Lokale markt', emoji: '🛒', category: 'food' },
  { id: 'g_restaurant', name: 'Uit eten', emoji: '🍽️', category: 'food' },
  { id: 'g_groceries', name: 'Boodschappen doen', emoji: '🛍️', category: 'shops' },
  { id: 'g_museum', name: 'Museumbezoek', emoji: '🖼️', category: 'culture' },
  { id: 'g_village', name: 'Dorp/stadje verkennen', emoji: '🏘️', category: 'villages' },
];

// ── Reisconfiguratie ─────────────────────────────────────────────────
// tripConfig wordt server-side bewaard en bepaalt titel, periode en
// verblijven:
// {
//   title: 'Onze vakantie',
//   startDate: 'YYYY-MM-DD',
//   endDate: 'YYYY-MM-DD',
//   stays: [{ id, name, startDate, endDate, coords: [lat,lng]|null, locationLabel }]
// }

export const DEFAULT_TRIP_CONFIG = {
  title: 'Onze vakantie',
  startDate: null,
  endDate: null,
  stays: [],
};

export function isTripConfigured(config) {
  return Boolean(config?.startDate && config?.endDate && config.endDate >= config.startDate);
}

// Voorzie verblijven van een vaste kleur (op volgorde van invoer)
export function staysWithColors(config) {
  return (config?.stays || []).map((s, i) => ({
    ...s,
    color: s.color || STAY_PALETTE[i % STAY_PALETTE.length],
  }));
}

const DAY_SHORT = ['Zo', 'Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za'];
const MONTH_SHORT = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];

function toKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

// Bouw de dagenlijst dynamisch uit de reisconfiguratie.
// Elke dag krijgt:
//   key, dayShort, date, label?, stay (object|null),
//   startCoords, endCoords (voor routeberekening)
// Wisseldagen (dag valt binnen twee verblijfsperiodes) krijgen het
// label "Wisseldag": start = oude verblijf, einde = nieuwe verblijf.
export function buildDays(config) {
  if (!isTripConfigured(config)) return [];
  const stays = staysWithColors(config)
    .filter(s => s.startDate && s.endDate)
    .sort((a, b) => a.startDate.localeCompare(b.startDate));

  const days = [];
  const start = parseKey(config.startDate);
  const end = parseKey(config.endDate);
  // Veiligheidsklep: maximaal 90 dagen
  let guard = 0;

  for (let d = new Date(start); d <= end && guard < 90; d.setDate(d.getDate() + 1), guard++) {
    const key = toKey(d);
    const containing = stays.filter(s => key >= s.startDate && key <= s.endDate);

    let stay = containing[0] || null;
    let startStay = stay;
    let endStay = stay;
    let label = null;

    if (containing.length >= 2) {
      // Dag valt in twee verblijven → wisseldag
      startStay = containing[0];
      endStay = containing[containing.length - 1];
      stay = endStay;
      label = 'Wisseldag';
    }

    const day = {
      key,
      dayShort: DAY_SHORT[d.getDay()],
      date: `${d.getDate()} ${MONTH_SHORT[d.getMonth()]}`,
      stay,
      startCoords: startStay?.coords || null,
      endCoords: endStay?.coords || null,
      label,
    };
    days.push(day);
  }

  if (days.length > 0) {
    if (!days[0].label) days[0].label = 'Aankomstdag';
    if (days.length > 1 && !days[days.length - 1].label) days[days.length - 1].label = 'Vertrek';
  }
  return days;
}

// Korte omschrijving van de periode, bv. "25 jul — 15 aug 2026"
export function formatPeriod(config) {
  if (!isTripConfigured(config)) return '';
  const s = parseKey(config.startDate);
  const e = parseKey(config.endDate);
  const sameYear = s.getFullYear() === e.getFullYear();
  const sStr = `${s.getDate()} ${MONTH_SHORT[s.getMonth()]}${sameYear ? '' : ' ' + s.getFullYear()}`;
  const eStr = `${e.getDate()} ${MONTH_SHORT[e.getMonth()]} ${e.getFullYear()}`;
  return `${sStr} — ${eStr}`;
}

// Bouwt een Google Maps zoek-URL voor een activiteit
export function getMapsLink(activity) {
  if (!activity?.mapsQuery && !activity?.mapsPlaceId) return null;
  const query = encodeURIComponent(activity.mapsQuery || activity.name);
  let url = `https://www.google.com/maps/search/?api=1&query=${query}`;
  if (activity.mapsPlaceId) {
    url += `&query_place_id=${activity.mapsPlaceId}`;
  }
  return url;
}

// Past server-side location overrides toe op een activity.
// Override wint van de ingebouwde defaults; null in override betekent "wissen".
export function applyLocationOverride(activity, overrides) {
  if (!activity || !overrides) return activity;
  const ov = overrides[activity.id];
  if (!ov) return activity;
  const merged = { ...activity };
  if (ov.coords !== undefined) merged.coords = ov.coords;
  if (ov.mapsQuery !== undefined) merged.mapsQuery = ov.mapsQuery;
  if (ov.mapsPlaceId !== undefined) merged.mapsPlaceId = ov.mapsPlaceId;
  if (ov.locationLabel !== undefined) merged.locationLabel = ov.locationLabel;
  return merged;
}

// Formatteer afstand in km of m
export function formatDistance(meters) {
  if (!meters && meters !== 0) return '';
  if (meters < 1000) return `${Math.round(meters)} m`;
  if (meters < 10000) return `${(meters / 1000).toFixed(1)} km`;
  return `${Math.round(meters / 1000)} km`;
}

// Formatteer duur in min/u
export function formatDuration(seconds) {
  if (!seconds && seconds !== 0) return '';
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (m === 0) return `${h}u`;
  return `${h}u${String(m).padStart(2, '0')}`;
}
