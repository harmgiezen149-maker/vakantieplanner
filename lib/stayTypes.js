// Soorten accommodatie en landhulpjes voor het verblijvenlogboek.
//
// Bewust géén 'use client': deze module wordt zowel door de pagina als door
// app/api/verblijven/route.js gebruikt, zodat de lijst met geldige types op
// één plek staat. De client-kant (fetch, localStorage) zit in lib/stayLog.js.

// De volgorde hier is ook de volgorde in de keuzelijst.
export const STAY_TYPES = [
  { id: 'camping_tent', label: 'Camping — tent', emoji: '⛺' },
  { id: 'camping_caravan', label: 'Camping — caravan', emoji: '🚚' },
  { id: 'camping_camper', label: 'Camping — camper', emoji: '🚐' },
  { id: 'camping_stacaravan', label: 'Camping — stacaravan', emoji: '🏕️' },
  { id: 'hotel', label: 'Hotel', emoji: '🏨' },
  { id: 'bnb', label: 'B&B', emoji: '🥐' },
  { id: 'airbnb', label: 'Airbnb', emoji: '🏠' },
  { id: 'anders', label: 'Anders', emoji: '✨' },
];

export const STAY_TYPE_IDS = STAY_TYPES.map(t => t.id);

export const stayTypeById = (id) => STAY_TYPES.find(t => t.id === id) || null;

// Label zoals het in de lijst wordt getoond. Bij "anders" wint de eigen
// omschrijving, zodat "vakantiehuisje" niet als "Anders" eindigt.
export function stayTypeLabel(stay) {
  const t = stayTypeById(stay?.type);
  if (!t) return null;
  if (stay.type === 'anders' && stay.typeOther) {
    return `${t.emoji} ${stay.typeOther}`;
  }
  return `${t.emoji} ${t.label}`;
}

// ISO-2 landcode → vlagemoji (regional indicator symbols)
export function countryFlag(code) {
  if (!code || code.length !== 2) return '';
  const base = 0x1f1e6;
  return String.fromCodePoint(
    ...code.toUpperCase().split('').map(c => base + c.charCodeAt(0) - 65)
  );
}
