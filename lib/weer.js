// Weercodes van Open-Meteo naar iets leesbaars.
//
// Geen 'use client': `app/api/weer/route.js` gebruikt dezelfde tabel om het
// antwoord te vertalen, en de tests draaien buiten Next om.
//
// De codes komen uit de WMO-tabel die Open-Meteo hanteert. We vatten ze samen
// tot een handvol groepen — voor "gaan we morgen wandelen of naar het museum"
// is het verschil tussen lichte en matige motregen niet interessant.

const GROEPEN = [
  { codes: [0], emoji: '☀️', label: 'Onbewolkt' },
  { codes: [1], emoji: '🌤️', label: 'Overwegend zonnig' },
  { codes: [2], emoji: '⛅', label: 'Halfbewolkt' },
  { codes: [3], emoji: '☁️', label: 'Bewolkt' },
  { codes: [45, 48], emoji: '🌫️', label: 'Mist' },
  { codes: [51, 53, 55, 56, 57], emoji: '🌦️', label: 'Motregen' },
  { codes: [61, 63, 66], emoji: '🌧️', label: 'Regen' },
  { codes: [65, 67], emoji: '🌧️', label: 'Zware regen' },
  { codes: [71, 73, 75, 77, 85, 86], emoji: '🌨️', label: 'Sneeuw' },
  { codes: [80, 81], emoji: '🌦️', label: 'Buien' },
  { codes: [82], emoji: '🌧️', label: 'Zware buien' },
  { codes: [95, 96, 99], emoji: '⛈️', label: 'Onweer' },
];

const ONBEKEND = { emoji: '🌡️', label: 'Onbekend' };

export function weerOmschrijving(code) {
  const n = Number(code);
  if (!isFinite(n)) return ONBEKEND;
  const groep = GROEPEN.find(g => g.codes.includes(n));
  return groep ? { emoji: groep.emoji, label: groep.label } : ONBEKEND;
}

// Een dag is "mooi weer" als het droog en niet te koud is. Wordt gebruikt om
// een dag subtiel te markeren, niet om er beslissingen op te baseren.
export function isBuitendag(dag) {
  if (!dag) return false;
  const droog = (dag.neerslagMm ?? 0) < 1;
  const warm = (dag.maxC ?? -99) >= 18;
  return droog && warm;
}

export const formatTemp = (c) =>
  (typeof c === 'number' && isFinite(c) ? `${Math.round(c)}°` : '–');
