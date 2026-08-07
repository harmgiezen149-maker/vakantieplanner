// Het foutenlogboek: wat er misgaat in de browser en op de server, zodat je
// het ziet zonder dat iemand het hoeft te melden.
//
// Bewust géén externe dienst: dit blijft bij de infrastructuur die er al is
// (één Redis-document). Pure logica staat hier zodat ze te testen is.

export const FOUTEN_KEY = 'planner:fouten';

// Meer dan dit bewaren heeft weinig zin: het gaat om "gaat er iets mis",
// niet om een volledig archief. Het document blijft zo ook klein.
export const MAX_FOUTEN = 100;

const knip = (v, max) => (typeof v === 'string' ? v.slice(0, max) : null);

// Dezelfde fout op dezelfde plek is één regel met een teller. Anders vult
// één kapotte pagina die elke seconde opnieuw faalt het hele logboek.
const sleutelVan = (f) => `${f.bron}|${f.bericht}|${f.pad || ''}`;

export function normaliseerMelding(ruw, nu = new Date()) {
  const bericht = knip(ruw?.bericht, 300);
  if (!bericht || !bericht.trim()) return null;
  return {
    bron: ruw?.bron === 'server' ? 'server' : 'client',
    bericht: bericht.trim(),
    detail: knip(ruw?.detail, 1500),
    pad: knip(ruw?.pad, 200),
    versie: knip(ruw?.versie, 40),
    aantal: 1,
    eerst: nu.toISOString(),
    laatst: nu.toISOString(),
  };
}

// Voegt een melding toe aan de bestaande lijst. Bestond hij al, dan gaat de
// teller omhoog en schuift hij naar voren; anders komt hij er nieuw bij.
// Geeft altijd een nieuwe array terug, nieuwste eerst.
export function voegFoutToe(bestaand, melding) {
  if (!melding) return Array.isArray(bestaand) ? bestaand : [];
  const lijst = Array.isArray(bestaand) ? bestaand : [];
  const sleutel = sleutelVan(melding);

  const bestaandeIndex = lijst.findIndex(f => sleutelVan(f) === sleutel);
  if (bestaandeIndex !== -1) {
    const oud = lijst[bestaandeIndex];
    const bijgewerkt = {
      ...oud,
      aantal: (oud.aantal || 1) + 1,
      laatst: melding.laatst,
      // Nieuwste detail bewaren: dat is meestal het meest bruikbare
      detail: melding.detail || oud.detail,
    };
    const rest = lijst.filter((_, i) => i !== bestaandeIndex);
    return [bijgewerkt, ...rest].slice(0, MAX_FOUTEN);
  }

  return [melding, ...lijst].slice(0, MAX_FOUTEN);
}

// Ruis die niets zegt over de app zelf: geblokkeerde extensies, afgebroken
// verzoeken bij het wegklikken van een pagina, en fouten uit scripts van
// derden waar we geen zicht op hebben.
const RUIS = [
  /ResizeObserver loop/i,
  /Script error\.?$/i,
  /Load failed$/i,
  /NetworkError when attempting to fetch/i,
  /The operation was aborted/i,
  /AbortError/i,
  /Extension context invalidated/i,
];

export function isRuis(bericht) {
  if (!bericht) return true;
  return RUIS.some(re => re.test(bericht));
}
