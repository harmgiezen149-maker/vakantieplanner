import { getRedis, PLAN_KEY } from '@/lib/redis';
import { DELEN_KEY, magBekijken, dagRouteVraag } from '@/lib/delen';
import { kanWandelen, haalRoute } from '@/lib/routeDienst';
import { cacheSleutel, uitCache, naarCache, TTL } from '@/lib/geoCache';

// De route van één dag, voor wie met de deel-link meekijkt.
//
// Net als /api/delen/bekijk staat deze route bewust ZONDER familie-PIN open; de
// grendel is het token. Twee dingen houden hem smal:
//
//   1. De bezoeker geeft **alleen een datum** mee, geen punten. De server zoekt
//      zelf op wat er die dag gepland staat (dagRouteVraag in lib/delen.js).
//      Dit is dus geen open router waarmee iemand met de link willekeurige
//      ritten door Europa kan laten uitrekenen — je krijgt er precies uit wat
//      op de pagina hoort.
//   2. Het antwoord bevat alleen routegegevens. Geen namen, geen notities, geen
//      routeAnkers — die staan niet voor niets buiten de witte lijst.
//
// Alleen-lezen: er is geen POST. Bewust.

export const dynamic = 'force-dynamic';

function normalize(raw) {
  if (!raw) return null;
  if (typeof raw === 'string') {
    try { return JSON.parse(raw); } catch { return null; }
  }
  return raw;
}

export async function GET(request) {
  const params = new URL(request.url).searchParams;
  const token = params.get('token') || '';
  const dag = params.get('dag') || '';

  try {
    const redis = getRedis();
    const doc = normalize(await redis.get(DELEN_KEY));
    // Eén antwoord voor "bestaat niet", "klopt niet" en "ingetrokken".
    if (!magBekijken(doc, token)) {
      return Response.json({ error: 'not_found' }, { status: 404 });
    }

    const trip = normalize(await redis.get(PLAN_KEY));
    const vraag = dagRouteVraag(trip, dag);
    // Geen route voor deze dag is geen fout: één stop, of niets met een locatie.
    if (!vraag) return Response.json({ route: null, vervoer: null });

    const { punten, vervoer } = vraag;
    if (vervoer === 'lopen' && !kanWandelen()) {
      // Geen wandelrouter beschikbaar. De pagina tekent dan de stippellijn.
      return Response.json({ route: null, vervoer, reden: 'geen_wandelroute' });
    }

    // Dezelfde dag wordt door meerdere familieleden geopend; dat hoort één
    // aanvraag bij de routedienst te kosten (valkuil 7). Het profiel hoort in de
    // sleutel, anders krijgt een wandeldag de auto-lijn terug.
    const sleutel = cacheSleutel(
      'dagroute', [vervoer, ...punten.flatMap(p => [p[0], p[1]])], 4,
    );
    const bewaard = await uitCache(sleutel);
    if (bewaard) return Response.json({ ...bewaard, uitCache: true });

    const route = await haalRoute(punten, vervoer);
    const uit = { route, vervoer };
    await naarCache(sleutel, uit, TTL.matrix);
    return Response.json(uit);
  } catch (err) {
    // De pagina valt hierop terug op de stippellijn.
    return Response.json({ error: 'route_failed' }, { status: 502 });
  }
}
