import { getRedis } from '@/lib/redis';
import { STAY_TYPE_IDS } from '@/lib/stayTypes';

// Het verblijvenlogboek: alle plekken waar het gezin heeft gelogeerd, met
// bezoekdatum, cijfer, review en foto's.
//
// Bewust een APART document van planner:trip. Dat document wordt gewist bij
// "Nieuwe vakantie starten"; dit logboek moet die reset juist overleven.
//
// De foto's zelf staan niet hier maar in Vercel Blob — hier bewaren we
// alleen hun URL en pathname.

export const dynamic = 'force-dynamic';

const KEY = 'planner:verblijven';

const EMPTY = { stays: [], updatedBy: null, updatedAt: null };

function checkAuth(request) {
  const expectedPin = process.env.FAMILY_PIN;
  if (!expectedPin) return null; // geen auth ingesteld → open
  const provided = request.headers.get('x-family-pin');
  if (provided !== expectedPin) {
    return Response.json({ error: 'Ongeldige PIN' }, { status: 401 });
  }
  return null;
}

function normalize(raw) {
  if (!raw) return null;
  if (typeof raw === 'string') {
    try { return JSON.parse(raw); } catch { return null; }
  }
  return raw;
}

const str = (v, max) =>
  typeof v === 'string' ? v.slice(0, max) : null;

const isoDate = (v) =>
  typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;

function sanitizeStay(raw, i) {
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
    tripTitle: str(raw?.tripTitle, 80),
    score,
    review: str(raw?.review, 2000),
    photos,
    source: raw?.source === 'trip' ? 'trip' : 'manual',
    createdAt: str(raw?.createdAt, 40) || new Date().toISOString(),
    updatedAt: str(raw?.updatedAt, 40) || new Date().toISOString(),
  };
}

export async function GET(request) {
  const authErr = checkAuth(request);
  if (authErr) return authErr;

  try {
    const redis = getRedis();
    const data = normalize(await redis.get(KEY));
    if (!data) return Response.json(EMPTY);
    return Response.json({
      stays: Array.isArray(data.stays) ? data.stays.map(sanitizeStay) : [],
      updatedBy: data.updatedBy ?? null,
      updatedAt: data.updatedAt ?? null,
    });
  } catch (err) {
    return Response.json(
      { error: 'load_failed', detail: String(err?.message ?? err) },
      { status: 500 },
    );
  }
}

export async function POST(request) {
  const authErr = checkAuth(request);
  if (authErr) return authErr;

  try {
    const body = await request.json();
    const payload = {
      stays: Array.isArray(body?.stays) ? body.stays.slice(0, 300).map(sanitizeStay) : [],
      updatedBy: str(body?.updatedBy, 40),
      updatedAt: new Date().toISOString(),
    };
    const redis = getRedis();
    await redis.set(KEY, JSON.stringify(payload));
    return Response.json(payload);
  } catch (err) {
    return Response.json(
      { error: 'save_failed', detail: String(err?.message ?? err) },
      { status: 500 },
    );
  }
}
