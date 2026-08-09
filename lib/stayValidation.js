// Opschoning van verblijven, zoals /api/verblijven die toepast bij lezen en
// schrijven. Staat hier apart zodat het te testen is zonder de API-route (en
// dus Redis) op te tuigen — dit is de laatste zeef vóór iets in de opslag
// belandt, dus juist hier wil je zekerheid.

import { STAY_TYPE_IDS } from './stayTypes.js';

const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : null);

const isoDate = (v) =>
  typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;

// Een website van een verblijf. Alleen http(s): een `javascript:`-adres in een
// href is een gat, en dit veld komt straks als aanklikbare link op de pagina.
// Zonder schema plakken we https:// ervoor, want zo typt iedereen het in.
export function schoneWebsite(v) {
  const ruw = typeof v === 'string' ? v.trim() : '';
  if (!ruw) return null;
  const met = /^[a-z][a-z0-9+.-]*:/i.test(ruw) ? ruw : `https://${ruw}`;
  let url;
  try { url = new URL(met); } catch { return null; }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (!url.hostname.includes('.')) return null;
  return url.href.slice(0, 300);
}

export function sanitizeStay(raw, i = 0) {
  const coords =
    Array.isArray(raw?.coords) && raw.coords.length === 2 &&
    isFinite(Number(raw.coords[0])) && isFinite(Number(raw.coords[1])) &&
    Math.abs(Number(raw.coords[0])) <= 90 && Math.abs(Number(raw.coords[1])) <= 180
      ? [Number(raw.coords[0]), Number(raw.coords[1])]
      : null;

  const scoreNum = Number(raw?.score);
  const score = isFinite(scoreNum) && scoreNum >= 1 && scoreNum <= 10
    ? Math.round(scoreNum * 10) / 10
    : null;

  const photos = Array.isArray(raw?.photos)
    ? raw.photos.slice(0, 40).map((p, j) => ({
        id: str(p?.id, 40) || `f_${i}_${j}`,
        url: str(p?.url, 500) || '',
        pathname: str(p?.pathname, 300) || null,
        w: Number(p?.w) || null,
        h: Number(p?.h) || null,
        caption: str(p?.caption, 140),
      })).filter(p => p.url)
    : [];

  const type = STAY_TYPE_IDS.includes(raw?.type) ? raw.type : null;

  return {
    id: str(raw?.id, 80) || `v_${Date.now()}_${i}`,
    name: str(raw?.name, 90) || 'Naamloos verblijf',
    locationLabel: str(raw?.locationLabel, 200),
    coords,
    type,
    // Eigen omschrijving hoort alleen bij "anders"
    typeOther: type === 'anders' ? str(raw?.typeOther, 40) : null,
    country: str(raw?.country, 60),
    countryCode: /^[A-Za-z]{2}$/.test(raw?.countryCode || '')
      ? String(raw.countryCode).toUpperCase()
      : null,
    startDate: isoDate(raw?.startDate),
    endDate: isoDate(raw?.endDate),
    periodLabel: str(raw?.periodLabel, 60),
    website: schoneWebsite(raw?.website),
    tripTitle: str(raw?.tripTitle, 80),
    score,
    review: str(raw?.review, 2000),
    photos,
    // Bezochte activiteiten rond dit verblijf: een momentopname uit de
    // planning, want die wordt gewist bij een nieuwe vakantie.
    bezocht: Array.isArray(raw?.bezocht)
      ? raw.bezocht.slice(0, 60).map((b, j) => ({
          id: str(b?.id, 80) || `b_${i}_${j}`,
          name: str(b?.name, 90) || 'Activiteit',
          emoji: str(b?.emoji, 8),
          category: str(b?.category, 30),
          note: str(b?.note, 300),
          coords:
            Array.isArray(b?.coords) && b.coords.length === 2 &&
            isFinite(Number(b.coords[0])) && isFinite(Number(b.coords[1]))
              ? [Number(b.coords[0]), Number(b.coords[1])]
              : null,
          datum: isoDate(b?.datum),
        }))
      : [],
    source: raw?.source === 'trip' ? 'trip' : 'manual',
    createdAt: str(raw?.createdAt, 40) || new Date().toISOString(),
    updatedAt: str(raw?.updatedAt, 40) || new Date().toISOString(),
  };
}
