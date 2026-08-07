import { Redis } from '@upstash/redis';
import { isConflict, conflictAntwoord, CONFLICT_STATUS } from '@/lib/conflict';

export const dynamic = 'force-dynamic';

const redis = Redis.fromEnv();
const KEY = 'planner:inpakken';
// Oude key uit de Vogezen-2026 versie — wordt eenmalig gelezen als fallback,
// zodat een bestaande inpaklijst behouden blijft na de herbouw.
const LEGACY_KEY = 'vogezen2026:inpakken';

// De volledige staat is één document:
// {
//   categories: [{ id, name }],
//   items: [{ id, categoryId, label, qty, checked, important?, note? }],
//   updatedBy, updatedAt
// }
const EMPTY = { categories: [], items: [], updatedBy: null, updatedAt: null };

export async function GET() {
  try {
    let data = await redis.get(KEY);
    if (!data) data = await redis.get(LEGACY_KEY);
    return Response.json(data ?? EMPTY);
  } catch (err) {
    return Response.json({ error: 'load_failed' }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();

    // Botst dit met wat er intussen is opgeslagen? Zie lib/conflict.js
    const bestaand = await redis.get(KEY);
    if (isConflict(bestaand?.updatedAt, body?.basisVersie)) {
      return Response.json(conflictAntwoord(bestaand), { status: CONFLICT_STATUS });
    }

    const payload = {
      categories: Array.isArray(body.categories) ? body.categories : [],
      items: Array.isArray(body.items) ? body.items : [],
      updatedBy: body.updatedBy ?? null,
      updatedAt: new Date().toISOString(),
    };
    await redis.set(KEY, payload);
    return Response.json(payload);
  } catch (err) {
    return Response.json({ error: 'save_failed' }, { status: 500 });
  }
}
