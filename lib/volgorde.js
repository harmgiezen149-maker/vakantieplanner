// De activiteiten van één dag in een logische route zetten.
//
// De volgorde in `plan[dagKey]` is de volgorde waarin je ze toevoegde, en dat
// is zelden de volgorde waarin je ze wilt aflopen. Deze module schudt ze om
// naar de kortste route, met twee vaste punten die de gebruiker zelf mag
// aanwijzen: waar de dag begint en waar hij eindigt.
//
// Geen 'use client', geen fetch, geen React: alles gaat er als getallen in en
// uit. De echte rijafstanden komen van buiten, als `kosten`-functie — zo blijft
// dit stuk testbaar buiten Next om en werkt het ook als de matrix onbereikbaar
// is (dan rekent hij hemelsbreed).

// Aardstraal in meters. Hemelsbreed is een benadering, maar wel een die het
// altijd doet — geen netwerk, geen sleutel, geen wachttijd.
const R = 6371000;

export function hemelsbreed(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) return 0;
  const rad = Math.PI / 180;
  const dLat = (b[0] - a[0]) * rad;
  const dLng = (b[1] - a[1]) * rad;
  const la = a[0] * rad;
  const lb = b[0] * rad;
  const h = Math.sin(dLat / 2) ** 2 +
    Math.cos(la) * Math.cos(lb) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

const geldig = (c) =>
  Array.isArray(c) && c.length === 2 && isFinite(Number(c[0])) && isFinite(Number(c[1]));

// Wat kost deze volgorde? Punten zijn coördinaten; `begin` en `eind` zijn het
// verblijf 's ochtends en 's avonds en tellen mee als ze er zijn — de rit naar
// de eerste stop is net zo goed rijden.
function kostenVan(punten, kosten, begin, eind) {
  let som = 0;
  if (begin && punten.length) som += kosten(begin, punten[0]);
  for (let i = 1; i < punten.length; i++) som += kosten(punten[i - 1], punten[i]);
  if (eind && punten.length) som += kosten(punten[punten.length - 1], eind);
  return som;
}

// Dichtstbijzijnde buur: begin bij het vertrekpunt en pak steeds de stop die
// het dichtst bij de vorige ligt. Levert zelden meteen het beste rondje op,
// maar wel een goed startpunt voor 2-opt hieronder.
function dichtstbijzijnde(vrij, kosten, vanaf) {
  const over = [...vrij];
  const uit = [];
  let hier = vanaf;
  while (over.length) {
    let beste = 0;
    if (hier) {
      let besteKosten = Infinity;
      over.forEach((item, i) => {
        const k = kosten(hier, item.coords);
        if (k < besteKosten) { besteKosten = k; beste = i; }
      });
    }
    const [gekozen] = over.splice(beste, 1);
    uit.push(gekozen);
    hier = gekozen.coords;
  }
  return uit;
}

// 2-opt: draai steeds een stuk van de route om zolang dat korter uitpakt. Dit
// haalt de kruisingen eruit die de dichtstbijzijnde-buur achterlaat. Bij een
// handvol stops per dag is het resultaat in de praktijk de kortste route.
const MAX_RONDES = 200;

function tweeOpt(rij, kosten, begin, eind) {
  const punten = rij.map(x => x.coords);
  let beste = [...rij];
  let besteKosten = kostenVan(punten, kosten, begin, eind);
  let verbeterd = true;
  let ronde = 0;

  while (verbeterd && ronde < MAX_RONDES) {
    verbeterd = false;
    ronde++;
    for (let i = 0; i < beste.length - 1; i++) {
      for (let j = i + 1; j < beste.length; j++) {
        const kandidaat = [
          ...beste.slice(0, i),
          ...beste.slice(i, j + 1).reverse(),
          ...beste.slice(j + 1),
        ];
        const k = kostenVan(kandidaat.map(x => x.coords), kosten, begin, eind);
        // Strikt kleiner: anders blijft hij eindeloos gelijkwaardige
        // volgordes tegen elkaar inwisselen.
        if (k < besteKosten - 0.001) {
          beste = kandidaat;
          besteKosten = k;
          verbeterd = true;
        }
      }
    }
  }
  return beste;
}

// ── Te voet of met de auto? ─────────────────────────────────────────
//
// Een auto-router stuurt je in een stadscentrum over de ring, door
// eenrichtingsstraten en om het voetgangersgebied heen. De volgorde die daaruit
// komt is niet de volgorde waarin je de stad afloopt. Liggen de stops dicht bij
// elkaar, dan rekenen we dus te voet.

// Ruim een half uur wandelen van de ene naar de andere kant van het gebied.
// Daarboven pak je de auto.
export const WANDEL_DREMPEL_M = 2000;

// Kijkt naar de grootste afstand tússen de stops, niet naar de afstand tot het
// verblijf: naar de stad rijd je, in de stad loop je. Een centrum op twaalf
// kilometer van de camping is nog steeds wandelbaar.
export function isWandelbaar(punten, drempel = WANDEL_DREMPEL_M) {
  const lijst = (Array.isArray(punten) ? punten : []).filter(geldig);
  if (lijst.length < 2) return true;   // niets om over te rijden
  for (let i = 0; i < lijst.length; i++) {
    for (let j = i + 1; j < lijst.length; j++) {
      if (hemelsbreed(lijst[i], lijst[j]) > drempel) return false;
    }
  }
  return true;
}

// `keuze` is wat de gebruiker voor deze dag heeft ingesteld: 'lopen', 'rijden',
// of niets (dan bepaalt de afstand het).
export function kiesVervoer(punten, keuze = null) {
  if (keuze === 'lopen' || keuze === 'rijden') return keuze;
  return isWandelbaar(punten) ? 'lopen' : 'rijden';
}

// De hoofdingang.
//
//   items    [{ id, coords }] in de huidige volgorde
//   begin    coördinaat waar de dag begint (het verblijf), of null
//   eind     coördinaat waar de dag eindigt, of null
//   start    id van de activiteit die vooraan moet, of null
//   stop     id van de activiteit die achteraan moet, of null
//   kosten   (a, b) => meters — standaard hemelsbreed
//
// Geeft { ids, voor, na, zonderLocatie } terug. `voor` en `na` zijn de kosten
// van de oude en de nieuwe volgorde, zodat de UI kan laten zien wat het scheelt.
export function optimaliseerVolgorde(items, opties = {}) {
  const {
    begin = null, eind = null, start = null, stop = null,
    kosten = hemelsbreed,
  } = opties;

  const lijst = Array.isArray(items) ? items.filter(Boolean) : [];
  const beginPunt = geldig(begin) ? begin : null;
  const eindPunt = geldig(eind) ? eind : null;

  // Zonder coördinaten valt er niets te plaatsen. Die blijven onderling in
  // dezelfde volgorde staan en gaan achteraan — voorspelbaar, en de UI zegt het
  // erbij zodat het niet als toeval overkomt.
  const metCoords = lijst.filter(x => geldig(x.coords));
  const zonder = lijst.filter(x => !geldig(x.coords));

  const oudeKosten = kostenVan(metCoords.map(x => x.coords), kosten, beginPunt, eindPunt);
  const onveranderd = {
    ids: lijst.map(x => x.id),
    voor: oudeKosten,
    na: oudeKosten,
    zonderLocatie: zonder.length,
  };
  if (metCoords.length < 2) return onveranderd;

  // De ankers doen niet mee in de permutatie. Eerst gevonden wint, zodat één
  // id dat per ongeluk twee keer op de dag staat geen twee ankers oplevert.
  const startItem = start ? metCoords.find(x => x.id === start) || null : null;
  const stopItem = stop && stop !== start
    ? metCoords.find(x => x.id === stop) || null
    : null;
  const vrij = metCoords.filter(x => x !== startItem && x !== stopItem);

  let geordend;
  if (vrij.length < 2) {
    geordend = vrij;
  } else {
    // Het vaste punt vóór het vrije stuk: het startanker als dat er is, anders
    // het verblijf. Zonder allebei begint hij bij de eerste stop. En daarachter
    // het eindanker, of anders het verblijf waar de dag eindigt.
    const vanaf = startItem?.coords || beginPunt || null;
    const naar = stopItem?.coords || eindPunt || null;
    geordend = tweeOpt(dichtstbijzijnde(vrij, kosten, vanaf), kosten, vanaf, naar);
  }

  const nieuw = [
    ...(startItem ? [startItem] : []),
    ...geordend,
    ...(stopItem ? [stopItem] : []),
  ];
  const nieuweKosten = kostenVan(nieuw.map(x => x.coords), kosten, beginPunt, eindPunt);
  const nieuweIds = [...nieuw.map(x => x.id), ...zonder.map(x => x.id)];

  // Komt er precies hetzelfde rijtje uit, dan is dit al de kortste volgorde.
  if (nieuweIds.every((id, i) => id === onveranderd.ids[i])) return onveranderd;

  // Levert het niets op, dan laten we de lijst met rust: een volgorde die de
  // gebruiker zelf heeft gezet omgooien voor nul winst is alleen maar
  // verwarrend. Een ánker is geen optimalisatie maar een opdracht — die wordt
  // dus wél uitgevoerd, ook als de route er langer van wordt.
  const heeftAnker = Boolean(startItem || stopItem);
  if (!heeftAnker && nieuweKosten >= oudeKosten - 0.001) return onveranderd;

  return {
    ids: nieuweIds,
    voor: oudeKosten,
    na: nieuweKosten,
    zonderLocatie: zonder.length,
  };
}

// ── Hulpjes voor de afstandsmatrix ──────────────────────────────────
//
// De matrix wordt in Redis bewaard (valkuil 7), en dan wil je dat dezelfde
// verzameling punten altijd dezelfde sleutel oplevert — óók nadat het
// optimaliseren de volgorde heeft omgegooid. Anders is het eerste wat er na een
// klik gebeurt een cachemisser. Daarom sorteren we de punten canoniek vóór het
// opvragen, en draaien we die sortering daarna terug.

export function canoniekeVolgorde(punten) {
  const lijst = Array.isArray(punten) ? punten : [];
  const index = lijst.map((_, i) => i).sort((a, b) => {
    const pa = lijst[a] || [];
    const pb = lijst[b] || [];
    if (pa[0] !== pb[0]) return pa[0] - pb[0];
    return pa[1] - pb[1];
  });
  return { punten: index.map(i => lijst[i]), index };
}

// `index[k] = i` betekent: rij k van de gesorteerde matrix hoort bij punt i van
// de oorspronkelijke lijst. Deze functie zet zo'n matrix terug in de volgorde
// waarin de client zijn punten aanleverde.
export function herstelMatrix(matrix, index) {
  if (!Array.isArray(matrix) || !Array.isArray(index)) return null;
  const n = index.length;
  if (matrix.length !== n) return null;
  const uit = Array.from({ length: n }, () => new Array(n).fill(null));
  for (let k = 0; k < n; k++) {
    const rij = matrix[k];
    if (!Array.isArray(rij) || rij.length !== n) return null;
    for (let l = 0; l < n; l++) {
      uit[index[k]][index[l]] = rij[l];
    }
  }
  return uit;
}

// Van een matrix een kosten-functie maken die `optimaliseerVolgorde` snapt.
// De punten worden op hun afgeronde coördinaat opgezocht, want onderweg gaan ze
// door JSON heen en terug. Ontbreekt een paar in de matrix, dan valt hij voor
// dát paar terug op hemelsbreed — beter een schatting dan een gat.
export function kostenUitMatrix(punten, matrix) {
  const sleutel = (c) => `${Number(c[0]).toFixed(5)},${Number(c[1]).toFixed(5)}`;
  const nummer = new Map();
  (punten || []).forEach((p, i) => { if (geldig(p)) nummer.set(sleutel(p), i); });
  return (a, b) => {
    const i = nummer.get(sleutel(a));
    const j = nummer.get(sleutel(b));
    const waarde = matrix?.[i]?.[j];
    return typeof waarde === 'number' && isFinite(waarde) ? waarde : hemelsbreed(a, b);
  };
}
