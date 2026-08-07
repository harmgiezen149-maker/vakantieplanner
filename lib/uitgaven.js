// Uitgaven per reis: optellen, verdelen en uitrekenen wie wie moet
// terugbetalen.
//
// **Alles in hele centen als integer.** Nooit in euro's als kommagetal:
// 0.1 + 0.2 === 0.30000000000000004, en in een kasboek wil je dat niet. De UI
// rekent bij het invoeren om naar centen en bij het tonen terug.

export const UITGAVEN_KEY = 'planner:uitgaven';

export const CATEGORIEEN = [
  { id: 'eten', label: 'Eten & drinken', emoji: '🍽️' },
  { id: 'boodschappen', label: 'Boodschappen', emoji: '🛒' },
  { id: 'verblijf', label: 'Verblijf', emoji: '⛺' },
  { id: 'vervoer', label: 'Vervoer & brandstof', emoji: '⛽' },
  { id: 'entree', label: 'Entree & uitjes', emoji: '🎟️' },
  { id: 'overig', label: 'Overig', emoji: '💶' },
];

export const CATEGORIE_IDS = CATEGORIEEN.map(c => c.id);
export const categorieById = (id) => CATEGORIEEN.find(c => c.id === id) || null;

// ── Bedragen ────────────────────────────────────────────────────────

// "12,50" / "12.50" / "€ 12,50" / "12" → 1250 cent. Onleesbaar → null, zodat
// de aanroeper zelf kan beslissen wat er met een lege of foute invoer gebeurt.
export function naarCenten(invoer) {
  if (typeof invoer === 'number') {
    if (!isFinite(invoer)) return null;
    return Math.round(invoer * 100);
  }
  const tekst = String(invoer ?? '')
    .replace(/[€\s]/g, '')
    .replace(',', '.');
  if (!tekst || !/^-?\d*\.?\d*$/.test(tekst) || tekst === '.' || tekst === '-') return null;
  const n = Number(tekst);
  if (!isFinite(n)) return null;
  return Math.round(n * 100);
}

export function formatEuro(centen) {
  const n = Number(centen);
  if (!isFinite(n)) return '–';
  const negatief = n < 0;
  const abs = Math.abs(Math.round(n));
  const euro = Math.floor(abs / 100);
  const rest = String(abs % 100).padStart(2, '0');
  return `${negatief ? '−' : ''}€ ${euro.toLocaleString('nl-NL')},${rest}`;
}

// ── Optellen ────────────────────────────────────────────────────────

const bedragVan = (u) => (typeof u?.bedrag === 'number' && isFinite(u.bedrag) ? Math.round(u.bedrag) : 0);

export function totaal(uitgaven) {
  return (uitgaven || []).reduce((som, u) => som + bedragVan(u), 0);
}

function groepeer(uitgaven, sleutel) {
  const uit = new Map();
  for (const u of uitgaven || []) {
    const k = sleutel(u);
    if (k == null || k === '') continue;
    uit.set(k, (uit.get(k) || 0) + bedragVan(u));
  }
  return [...uit.entries()]
    .map(([naam, bedrag]) => ({ naam, bedrag }))
    .sort((a, b) => b.bedrag - a.bedrag || String(a.naam).localeCompare(String(b.naam)));
}

export const perCategorie = (uitgaven) => groepeer(uitgaven, u => u.categorie);
export const perPersoon = (uitgaven) => groepeer(uitgaven, u => u.betaaldDoor);
export const perDag = (uitgaven) => groepeer(uitgaven, u => u.datum)
  .sort((a, b) => String(a.naam).localeCompare(String(b.naam)));

// ── Verdelen ────────────────────────────────────────────────────────

// Een bedrag eerlijk over n personen. Deelt het niet op? Dan gaat de restcent
// naar de eerste personen — één cent per persoon, nooit meer. De som van het
// resultaat is altijd exact het oorspronkelijke bedrag; dat is de enige
// eigenschap die er echt toe doet.
export function verdeel(centen, aantal) {
  const n = Math.trunc(aantal);
  if (!isFinite(centen) || n <= 0) return [];
  const totaalCent = Math.round(centen);
  const teken = totaalCent < 0 ? -1 : 1;
  const abs = Math.abs(totaalCent);
  const basis = Math.floor(abs / n);
  const rest = abs - basis * n;
  return Array.from({ length: n }, (_, i) => teken * (basis + (i < rest ? 1 : 0)));
}

// Wie heeft te veel of te weinig betaald, als iedereen evenveel had moeten
// dragen? Positief = die persoon krijgt nog geld terug.
export function verrekening(uitgaven, personen) {
  const namen = (personen || []).filter(Boolean);
  if (!namen.length) return [];

  const som = totaal(uitgaven);
  const eerlijk = verdeel(som, namen.length);
  const betaald = new Map(namen.map(n => [n, 0]));
  for (const u of uitgaven || []) {
    if (betaald.has(u?.betaaldDoor)) {
      betaald.set(u.betaaldDoor, betaald.get(u.betaaldDoor) + bedragVan(u));
    }
  }

  return namen.map((naam, i) => ({
    naam,
    betaald: betaald.get(naam),
    aandeel: eerlijk[i],
    saldo: betaald.get(naam) - eerlijk[i],
  })).sort((a, b) => b.saldo - a.saldo);
}

// Uitgaven binnen een periode (beide grenzen meegerekend). Zonder datum valt
// een uitgave overal buiten — die hoort nergens bij een specifieke reis.
export function binnenPeriode(uitgaven, van, tot) {
  return (uitgaven || []).filter(u => {
    if (!u?.datum) return false;
    if (van && u.datum < van) return false;
    if (tot && u.datum > tot) return false;
    return true;
  });
}
