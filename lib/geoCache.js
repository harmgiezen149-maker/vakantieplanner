// Antwoorden van externe diensten bewaren, zodat dezelfde vraag niet twee
// keer de deur uit gaat.
//
// Waarom dit er is (valkuil 7): Overpass en Nominatim zijn de zwakke schakel.
// De publieke Overpass-servers weigeren Vercel-IP's regelmatig en Nominatim
// staat één verzoek per seconde toe. Zoek je twee keer dezelfde omgeving, dan
// stond je de tweede keer met lege handen terwijl het antwoord tien minuten
// eerder gewoon binnenkwam.
//
// Drie eigenschappen die niet mogen wegvallen:
//   1. De cache mag nooit een verzoek laten mislukken. Lezen en schrijven
//      falen stil; zonder Redis werkt alles precies als voorheen.
//   2. Alleen geslaagde antwoorden worden bewaard. Een 502 van Overpass zit
//      je anders een maand lang achterna.
//   3. Er zit een plafond op de omvang. Een wandelroute-antwoord mét
//      geometrie kan megabytes zijn; Upstash weigert dat.

import { getRedis } from './redis.js';

// Ophogen als de vorm van een bewaard antwoord verandert — dan vervalt alles
// wat er nog onder de oude sleutel staat vanzelf.
export const CACHE_VERSIE = 1;

// Ruim boven de grootste normale respons, ruim onder de Upstash-limiet.
export const MAX_CACHE_BYTES = 200_000;

// Bewaartermijnen in seconden. Een supermarkt verhuist zelden; een land nooit.
export const TTL = {
  // Het weer is de uitzondering op de rest: een verwachting van vorige week is
  // erger dan geen verwachting. Eén uur, en de datumreeks zit in de sleutel.
  weer: 3600,
  suggest: 30 * 24 * 3600,
  hiking: 30 * 24 * 3600,
  whatsHere: 7 * 24 * 3600,
  geocode: 30 * 24 * 3600,
  reverse: 180 * 24 * 3600,
};

// Coördinaten afronden bepaalt de trefkans. Te grof en je krijgt het antwoord
// van de buren; te fijn en elke muisbeweging is een misser. `-0` wordt `0`,
// anders krijgen twee identieke plekken twee sleutels.
export function rond(getal, decimalen) {
  const n = Number(getal);
  if (!isFinite(n)) return null;
  const factor = 10 ** decimalen;
  const uit = Math.round(n * factor) / factor;
  return uit === 0 ? 0 : uit;
}

// cacheSleutel('suggest', [48.0712, 6.4521, 20000], 2)
//   → 'cache:v1:suggest:48.07|6.45|20000'
// Getallen worden afgerond, tekst wordt genormaliseerd (kleine letters,
// samengeperste spaties, afgekapt) zodat "Gérardmer " en "gérardmer" één
// sleutel delen.
export function cacheSleutel(naam, delen, decimalen = 2) {
  const stukken = delen.map((d) => {
    if (typeof d === 'number') {
      const r = rond(d, decimalen);
      return r === null ? '?' : String(r);
    }
    return String(d ?? '').trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 120);
  });
  return `cache:v${CACHE_VERSIE}:${naam}:${stukken.join('|')}`;
}

export function magOpslaan(waarde) {
  try {
    const tekst = typeof waarde === 'string' ? waarde : JSON.stringify(waarde);
    if (!tekst) return false;
    // Byte-lengte, niet tekenlengte: accenten en emoji tellen dubbel.
    return Buffer.byteLength(tekst, 'utf8') <= MAX_CACHE_BYTES;
  } catch {
    return false;
  }
}

// Eén regel per serverinstantie in de Vercel-logs, niet in het foutenlogboek
// uit `meldServerFout()`: dát logboek staat zelf in Redis, dus juist als de
// cache er niet bij kan is het de laatste plek waar een melding aankomt.
// Console is hier het enige kanaal dat het wél overleeft.
let alGemeld = false;
function meldEenKeer(fout) {
  if (alGemeld) return;
  alGemeld = true;
  console.warn('[geoCache] cache onbereikbaar, val terug op de externe dienst:',
    String(fout?.message ?? fout));
}

export async function uitCache(sleutel) {
  try {
    const rauw = await getRedis().get(sleutel);
    if (rauw == null) return null;
    return typeof rauw === 'string' ? JSON.parse(rauw) : rauw;
  } catch (e) {
    meldEenKeer(e);
    return null;
  }
}

export async function naarCache(sleutel, waarde, ttlSec) {
  if (!magOpslaan(waarde)) return false;
  try {
    await getRedis().set(sleutel, JSON.stringify(waarde), { ex: ttlSec });
    return true;
  } catch (e) {
    meldEenKeer(e);
    return false;
  }
}
