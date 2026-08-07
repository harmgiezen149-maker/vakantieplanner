import { getRedis, PLAN_KEY } from '@/lib/redis';
import { DELEN_KEY, maakToken } from '@/lib/delen';
import { magBeheren, weigering } from '@/lib/toegang';

// Beheer van de deel-link: opvragen, aanmaken, intrekken.
//
// Beheer-gated, want dit maakt een deel van de planning zonder PIN bereikbaar.
// Er is er bewust maar één tegelijk: twee links betekent twee dingen om in te
// trekken, en dan vergeet je er een.

export const dynamic = 'force-dynamic';

function normalize(raw) {
  if (!raw) return null;
  if (typeof raw === 'string') {
    try { return JSON.parse(raw); } catch { return null; }
  }
  return raw;
}

export async function GET(request) {
  if (!magBeheren(request)) return weigering(request);
  try {
    const doc = normalize(await getRedis().get(DELEN_KEY));
    if (!doc?.token || doc.actief === false) {
      return Response.json({ actief: false, token: null, aangemaakt: null });
    }
    return Response.json({
      actief: true,
      token: doc.token,
      aangemaakt: doc.aangemaakt ?? null,
      aangemaaktDoor: doc.aangemaaktDoor ?? null,
    });
  } catch (err) {
    return Response.json({ error: 'read_failed', detail: String(err?.message ?? err) }, { status: 500 });
  }
}

export async function POST(request) {
  if (!magBeheren(request)) return weigering(request);
  let body = {};
  try { body = await request.json(); } catch { /* leeg mag */ }

  const token = maakToken(crypto.randomUUID());
  if (!token) {
    return Response.json({ error: 'token_failed' }, { status: 500 });
  }
  const doc = {
    token,
    actief: true,
    aangemaakt: new Date().toISOString(),
    aangemaaktDoor: typeof body.door === 'string' ? body.door.slice(0, 40) : null,
  };
  try {
    // Een nieuwe link maken vervangt de oude — de vorige werkt daarna niet meer.
    await getRedis().set(DELEN_KEY, JSON.stringify(doc));
    return Response.json(doc);
  } catch (err) {
    return Response.json({ error: 'save_failed', detail: String(err?.message ?? err) }, { status: 500 });
  }
}

export async function DELETE(request) {
  if (!magBeheren(request)) return weigering(request);
  try {
    // Het token blijft staan maar wordt inactief; zo kun je in het logboek nog
    // terugzien dat er ooit gedeeld is.
    const doc = normalize(await getRedis().get(DELEN_KEY)) || {};
    await getRedis().set(DELEN_KEY, JSON.stringify({
      ...doc, actief: false, ingetrokken: new Date().toISOString(),
    }));
    return Response.json({ actief: false });
  } catch (err) {
    return Response.json({ error: 'save_failed', detail: String(err?.message ?? err) }, { status: 500 });
  }
}
