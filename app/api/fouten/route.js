import { getRedis } from '@/lib/redis';
import {
  FOUTEN_KEY, MAX_FOUTEN, normaliseerMelding, voegFoutToe, isRuis,
} from '@/lib/errorLog';

// Het foutenlogboek.
//
// POST   → een fout melden (door de browser, of door de server zelf)
// GET    → de lijst bekijken (op /fouten)
// DELETE → de lijst wissen
//
// Melden mag bewust zónder PIN: een fout treedt soms juist op vóórdat de
// gebruiker is ingelogd, en dan wil je hem alsnog zien. Lezen en wissen
// vereisen wél de PIN — dat is waar de inhoud staat.

export const dynamic = 'force-dynamic';

// Simpele snelheidsbegrenzing per serverinstantie: een pagina die in een lus
// blijft falen mag niet eindeloos schrijven.
let recent = [];
function teVaak() {
  const nu = Date.now();
  recent = recent.filter(t => nu - t < 60_000);
  if (recent.length >= 30) return true;
  recent.push(nu);
  return false;
}

function magLezen(request) {
  const pin = process.env.FAMILY_PIN;
  if (!pin) return true;
  return request.headers.get('x-family-pin') === pin;
}

function normalize(raw) {
  if (!raw) return null;
  if (typeof raw === 'string') {
    try { return JSON.parse(raw); } catch { return null; }
  }
  return raw;
}

export async function GET(request) {
  if (!magLezen(request)) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  try {
    const redis = getRedis();
    const data = normalize(await redis.get(FOUTEN_KEY));
    return Response.json({
      fouten: Array.isArray(data?.fouten) ? data.fouten : [],
      updatedAt: data?.updatedAt ?? null,
    });
  } catch (err) {
    return Response.json(
      { error: 'load_failed', detail: String(err?.message ?? err) },
      { status: 500 },
    );
  }
}

export async function POST(request) {
  if (teVaak()) {
    // Stil weigeren: een 429 zou de melder kunnen aanzetten tot opnieuw
    // proberen, en dat is precies wat we hier niet willen.
    return Response.json({ genegeerd: 'te_vaak' });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'invalid_body' }, { status: 400 });
  }

  if (isRuis(body?.bericht)) {
    return Response.json({ genegeerd: 'ruis' });
  }

  const melding = normaliseerMelding(body);
  if (!melding) return Response.json({ genegeerd: 'leeg' });

  try {
    await bewaarFout(melding);
    return Response.json({ bewaard: true });
  } catch (err) {
    // Als het logboek zelf stukgaat mag dat de app niet raken
    return Response.json({ error: 'save_failed' }, { status: 500 });
  }
}

export async function DELETE(request) {
  if (!magLezen(request)) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  try {
    const redis = getRedis();
    await redis.set(FOUTEN_KEY, JSON.stringify({ fouten: [], updatedAt: new Date().toISOString() }));
    return Response.json({ gewist: true });
  } catch (err) {
    return Response.json(
      { error: 'clear_failed', detail: String(err?.message ?? err) },
      { status: 500 },
    );
  }
}

async function bewaarFout(melding) {
  const redis = getRedis();
  const data = normalize(await redis.get(FOUTEN_KEY));
  const fouten = voegFoutToe(data?.fouten, melding);
  await redis.set(FOUTEN_KEY, JSON.stringify({
    fouten: fouten.slice(0, MAX_FOUTEN),
    updatedAt: new Date().toISOString(),
  }));
}

// Voor gebruik in catch-blokken van andere API-routes. Mag nooit zelf een
// fout gooien: een kapot logboek moet de aanroeper niet ook nog omver halen.
export async function meldServerFout(bericht, detail, pad) {
  try {
    if (isRuis(bericht)) return;
    const melding = normaliseerMelding({
      bron: 'server',
      bericht: String(bericht ?? ''),
      detail: detail == null ? null : String(detail),
      pad: pad ?? null,
    });
    if (melding) await bewaarFout(melding);
  } catch {
    // bewust stil
  }
}
