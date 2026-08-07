import { getRedis } from '@/lib/redis';
import { sanitizeStay } from '@/lib/stayValidation';
import { isConflict, conflictAntwoord, CONFLICT_STATUS } from '@/lib/conflict';

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
    const redisVoor = getRedis();

    // Botst dit met wat er intussen is opgeslagen? Zie lib/conflict.js
    const bestaand = normalize(await redisVoor.get(KEY));
    if (isConflict(bestaand?.updatedAt, body?.basisVersie)) {
      return Response.json(conflictAntwoord(bestaand), { status: CONFLICT_STATUS });
    }

    const payload = {
      stays: Array.isArray(body?.stays) ? body.stays.slice(0, 300).map(sanitizeStay) : [],
      updatedBy: typeof body?.updatedBy === 'string' ? body.updatedBy.slice(0, 40) : null,
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
