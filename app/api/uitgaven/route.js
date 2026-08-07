import { getRedis } from '@/lib/redis';
import { UITGAVEN_KEY, CATEGORIE_IDS } from '@/lib/uitgaven';
import { isConflict, conflictAntwoord, CONFLICT_STATUS } from '@/lib/conflict';
import { pinOk, weigering } from '@/lib/toegang';

// Het kasboek van de reis. Eigen document, want het overleeft "nieuwe vakantie
// starten" net als het verblijvenlogboek — je wilt volgend jaar nog kunnen
// terugkijken wat een week weg ongeveer kostte.
//
// Bedragen staan als hele centen in een integer. Zie lib/uitgaven.js.

export const dynamic = 'force-dynamic';

const MAX_UITGAVEN = 500;

function normalize(raw) {
  if (!raw) return null;
  if (typeof raw === 'string') {
    try { return JSON.parse(raw); } catch { return null; }
  }
  return raw;
}

const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : null);

function schoonUitgave(u, i) {
  if (!u || typeof u !== 'object') return null;
  const bedrag = Number(u.bedrag);
  if (!isFinite(bedrag)) return null;
  const categorie = CATEGORIE_IDS.includes(u.categorie) ? u.categorie : 'overig';
  return {
    id: str(u.id, 40) || `u_${Date.now()}_${i}`,
    // Alleen een echte YYYY-MM-DD; anders null, want binnenPeriode() vergelijkt
    // datums als tekst en gaat de mist in bij een ander formaat.
    datum: /^\d{4}-\d{2}-\d{2}$/.test(u.datum) ? u.datum : null,
    bedrag: Math.round(bedrag),
    omschrijving: str(u.omschrijving, 120),
    categorie,
    betaaldDoor: str(u.betaaldDoor, 40),
    activityId: str(u.activityId, 60),
  };
}

export async function GET(request) {
  if (!pinOk(request)) return weigering(request);
  try {
    const data = normalize(await getRedis().get(UITGAVEN_KEY));
    return Response.json({
      uitgaven: data?.uitgaven || [],
      personen: data?.personen || [],
      updatedAt: data?.updatedAt ?? null,
      updatedBy: data?.updatedBy ?? null,
    });
  } catch (err) {
    return Response.json({ error: 'read_failed', detail: String(err?.message ?? err) }, { status: 500 });
  }
}

export async function POST(request) {
  if (!pinOk(request)) return weigering(request);

  let body;
  try { body = await request.json(); } catch {
    return Response.json({ error: 'invalid_body' }, { status: 400 });
  }

  try {
    const redis = getRedis();

    // Lees-vóór-schrijf (valkuil 4): heeft iemand anders intussen opgeslagen,
    // dan weigeren we en laten we de gebruiker kiezen.
    const bestaand = normalize(await redis.get(UITGAVEN_KEY));
    if (isConflict(bestaand?.updatedAt, body?.basisVersie)) {
      return Response.json(conflictAntwoord(bestaand), { status: CONFLICT_STATUS });
    }

    const uitgaven = (Array.isArray(body.uitgaven) ? body.uitgaven : [])
      .slice(0, MAX_UITGAVEN)
      .map(schoonUitgave)
      .filter(Boolean);

    const personen = (Array.isArray(body.personen) ? body.personen : [])
      .slice(0, 12)
      .map(p => str(p, 40))
      .filter(Boolean);

    const doc = {
      uitgaven,
      personen,
      updatedAt: new Date().toISOString(),
      updatedBy: str(body.updatedBy, 40),
    };
    await redis.set(UITGAVEN_KEY, JSON.stringify(doc));
    return Response.json(doc);
  } catch (err) {
    return Response.json({ error: 'save_failed', detail: String(err?.message ?? err) }, { status: 500 });
  }
}
