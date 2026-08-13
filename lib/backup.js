// Gedeelde kennis over reservekopieën: welke documenten erin horen en hoe een
// momentopname eruitziet. Bewust géén 'use client' — zowel de API-routes als
// de beheerpagina leunen hierop.

// De vier documenten die samen de hele app vormen. De legacy-sleutels
// (vosges:, vogezen2026:) laten we bewust buiten de reservekopie: die worden
// alleen nog gelezen als de nieuwe leeg is, en zijn dus al een keer
// overgenomen.
export const BACKUP_KEYS = [
  'planner:trip',
  'planner:inpakken',
  'planner:checklist',
  'planner:verblijven',
  'planner:uitgaven',
];

// Versienummer van het momentopname-formaat zelf. Verandert de vorm ooit, dan
// kan het terugzetten daarop inspelen in plaats van rommel te schrijven.
export const BACKUP_FORMAAT = 1;

export const BACKUP_PREFIX = 'reservekopie/';

// Bestandsnaam per dag: een tweede run op dezelfde dag overschrijft de eerste,
// zodat je niet tientallen kopieën per dag krijgt.
export const backupPad = (datum = new Date()) =>
  `${BACKUP_PREFIX}${datum.toISOString().slice(0, 10)}.json`;

// Datum uit een pad terughalen ("reservekopie/2026-08-05.json" → "2026-08-05")
export const datumUitPad = (pathname) => {
  const m = /(\d{4}-\d{2}-\d{2})\.json$/.exec(pathname || '');
  return m ? m[1] : null;
};

// Welke momentopnames mogen weg? We houden alles van de laatste 30 dagen, plus
// van elke oudere maand de eerste die we hebben, tot 12 maanden terug. Zo blijft
// een fout die je pas na een half jaar opmerkt nog te herstellen.
export function bepaalOpruiming(paden, nu = new Date()) {
  const dagMs = 86400000;
  const metDatum = paden
    .map(p => ({ pad: p, datum: datumUitPad(p) }))
    .filter(x => x.datum)
    .sort((a, b) => b.datum.localeCompare(a.datum)); // nieuwste eerst

  const bewaren = new Set();
  const maandBewaard = new Set();

  for (const { pad, datum } of metDatum) {
    const leeftijd = Math.floor((nu - new Date(`${datum}T00:00:00Z`)) / dagMs);
    if (leeftijd <= 30) {
      bewaren.add(pad);
      continue;
    }
    if (leeftijd <= 365) {
      const maand = datum.slice(0, 7);
      if (!maandBewaard.has(maand)) {
        maandBewaard.add(maand);
        bewaren.add(pad);
      }
    }
  }

  return {
    bewaren: [...bewaren],
    verwijderen: metDatum.map(x => x.pad).filter(p => !bewaren.has(p)),
  };
}

// Hoeveel dagen een kopie oud mag zijn voordat we ervan uitgaan dat de
// nachtelijke taak niet meer draait. Twee: één gemiste nacht kan aan van alles
// liggen (een deploy, een storing bij Vercel), twee nachten op rij niet.
export const MAX_KOPIE_LEEFTIJD_DAGEN = 2;

// Is de nieuwste momentopname te oud? Geeft `{ verouderd, laatste, dagen }`.
//
// Dit is het vangnet onder alle oorzaken: een cron die niet mag, een verlopen
// Blob-token, Redis eruit. Wat er ook misgaat, /beheer zegt het. Een stille
// reservekopie is erger dan geen reservekopie — dan denk je dat je beschermd bent.
export function kopieVerouderd(paden, nu = new Date()) {
  const datums = (Array.isArray(paden) ? paden : [])
    .map(datumUitPad)
    .filter(Boolean)
    .sort();
  const laatste = datums.length ? datums[datums.length - 1] : null;
  if (!laatste) return { verouderd: true, laatste: null, dagen: null };

  const dagen = Math.floor(
    (Date.parse(`${nu.toISOString().slice(0, 10)}T00:00:00Z`)
      - Date.parse(`${laatste}T00:00:00Z`)) / 86400000,
  );
  return { verouderd: dagen > MAX_KOPIE_LEEFTIJD_DAGEN, laatste, dagen };
}

// Controleert of een geladen bestand een bruikbare momentopname is. Terugzetten
// overschrijft alles, dus liever hier streng dan achteraf spijt.
export function valideerMomentopname(data) {
  if (!data || typeof data !== 'object') return 'Geen geldig bestand.';
  if (data.formaat !== BACKUP_FORMAAT) {
    return `Onbekende versie van het bestand (${data.formaat ?? 'geen'}).`;
  }
  if (!data.documenten || typeof data.documenten !== 'object') {
    return 'Er zitten geen documenten in dit bestand.';
  }
  const aanwezig = BACKUP_KEYS.filter(k => k in data.documenten);
  if (aanwezig.length === 0) {
    return 'Er zit geen enkel bekend document in dit bestand.';
  }
  return null;
}
