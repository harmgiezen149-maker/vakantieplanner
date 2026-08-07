import { getRedis, PLAN_KEY } from '@/lib/redis';
import { DELEN_KEY, magBekijken, publiekePlanning } from '@/lib/delen';

// Wat een bezoeker met de deel-link te zien krijgt.
//
// Deze route staat bewust ZONDER familie-PIN open — dat is het hele punt van
// een deel-link. Wat hij teruggeeft is daarom uitgekleed door
// publiekePlanning(): geen namen, geen verblijvenlogboek, geen foto's, geen
// uitgaven. Voeg je later een veld toe aan planner:trip, kijk dan of het daar
// ook echt in thuishoort.
//
// Alleen-lezen: er is geen POST/PUT. Bewust.

export const dynamic = 'force-dynamic';

function normalize(raw) {
  if (!raw) return null;
  if (typeof raw === 'string') {
    try { return JSON.parse(raw); } catch { return null; }
  }
  return raw;
}

export async function GET(request) {
  const token = new URL(request.url).searchParams.get('token') || '';

  try {
    const redis = getRedis();
    const doc = normalize(await redis.get(DELEN_KEY));
    // Eén antwoord voor "bestaat niet", "klopt niet" en "ingetrokken": een
    // bezoeker hoeft niet te weten welk van de drie het is.
    if (!magBekijken(doc, token)) {
      return Response.json({ error: 'not_found' }, { status: 404 });
    }
    const trip = normalize(await redis.get(PLAN_KEY));
    return Response.json(publiekePlanning(trip));
  } catch (err) {
    return Response.json({ error: 'read_failed', detail: String(err?.message ?? err) }, { status: 500 });
  }
}
