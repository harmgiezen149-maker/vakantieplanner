import { Redis } from '@upstash/redis';

// Voorkom dat Vercel de GET-respons cachet — anders kun je na opslaan
// alsnog een oude (lege) versie terugkrijgen bij het verversen.
export const dynamic = 'force-dynamic';

const redis = Redis.fromEnv();
const KEY = 'planner:checklist';
// Oude key uit de Vogezen-2026 versie — wordt eenmalig gelezen als fallback
const LEGACY_KEY = 'vogezen2026:checklist';

const EMPTY = { checked: {}, updatedBy: null, updatedAt: null };

// GET: huidige status van afgevinkte items + wie laatst bijwerkte
export async function GET() {
  try {
    let data = await redis.get(KEY);
    if (!data) data = await redis.get(LEGACY_KEY);
    return Response.json(data ?? EMPTY);
  } catch (err) {
    return Response.json(
      { error: 'load_failed', detail: String(err?.message ?? err) },
      { status: 500 },
    );
  }
}

// POST: sla de volledige checked-state op.
// Een lege checked-map ({}) is geldig en fungeert als "reset vinkjes".
export async function POST(request) {
  try {
    const body = await request.json();
    const payload = {
      checked: body.checked ?? {},
      updatedBy: body.updatedBy ?? null,
      updatedAt: new Date().toISOString(),
    };
    await redis.set(KEY, payload);
    return Response.json(payload);
  } catch (err) {
    return Response.json(
      { error: 'save_failed', detail: String(err?.message ?? err) },
      { status: 500 },
    );
  }
}
