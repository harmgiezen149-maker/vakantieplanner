// Laatst geladen gegevens tonen als er geen verbinding is.
//
// **Dit is bewust géén service worker** (valkuil 19). Het verschil is precies
// wat het veilig maakt: een service worker levert stilzwijgend oude data die je
// wél kunt bewerken, en dat geeft de "waarom zie ik oude data"-bugs die de
// sync-vangnetten juist proberen te voorkomen. Hier is de data:
//
//   1. zichtbaar oud — er staat een balk boven met het tijdstip erbij, en
//   2. niet bewerkbaar — opslaan is geblokkeerd zolang die balk staat.
//
// Er kan dus niets stils misgaan met het gedeelde Redis-document. Geen
// gecachete JS, geen manifest-wijziging, geen nieuwe afhankelijkheid.

const PREFIX = 'offline:';

// Ouder dan dit tonen we niet meer. Een planning van vorige maand is geen
// hulp maar een valstrik.
export const MAX_LEEFTIJD_MS = 14 * 24 * 3600 * 1000;

export function bewaarLokaal(sleutel, data, nu = Date.now()) {
  if (typeof window === 'undefined' || !sleutel) return false;
  try {
    window.localStorage.setItem(PREFIX + sleutel, JSON.stringify({ op: nu, data }));
    return true;
  } catch {
    // Quota vol of privémodus — dan is er gewoon geen offline-kopie.
    return false;
  }
}

// Geeft `{ data, op }` terug, of null als er niets (bruikbaars) staat.
export function leesLokaal(sleutel, nu = Date.now()) {
  if (typeof window === 'undefined' || !sleutel) return null;
  try {
    const rauw = window.localStorage.getItem(PREFIX + sleutel);
    if (!rauw) return null;
    const pakket = JSON.parse(rauw);
    if (!pakket || typeof pakket.op !== 'number' || pakket.data === undefined) return null;
    if (nu - pakket.op > MAX_LEEFTIJD_MS) return null;
    return { data: pakket.data, op: pakket.op };
  } catch {
    return null;
  }
}

export function wisLokaal(sleutel) {
  if (typeof window === 'undefined' || !sleutel) return;
  try { window.localStorage.removeItem(PREFIX + sleutel); } catch { /* stil */ }
}

// "gisteren 19:40" / "vandaag 08:12" / "3 aug 14:05"
export function formatMoment(op, nu = Date.now()) {
  const d = new Date(op);
  if (!isFinite(d.getTime())) return '';
  const tijd = d.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
  const dag = (t) => {
    const x = new Date(t);
    return `${x.getFullYear()}-${x.getMonth()}-${x.getDate()}`;
  };
  const vandaag = dag(nu);
  const gisteren = dag(nu - 86_400_000);
  if (dag(op) === vandaag) return `vandaag ${tijd}`;
  if (dag(op) === gisteren) return `gisteren ${tijd}`;
  return `${d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })} ${tijd}`;
}
