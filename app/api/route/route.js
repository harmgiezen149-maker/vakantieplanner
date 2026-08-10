import { NextResponse } from 'next/server';
import {
  geldigePunten, normaliseerProfiel, kanWandelen, haalRoute,
} from '@/lib/routeDienst';

export const dynamic = 'force-dynamic';

// Routeberekening tussen punten [[lat,lng], ...].
// Het rekenwerk staat in lib/routeDienst.js, want /api/delen/dagroute gebruikt
// hetzelfde. Hier zit alleen de poort: de familie-PIN en de invoercontrole.
//
// Body: { points: [[lat,lng], …], profiel?: 'rijden' | 'lopen' }
// Respons: { segments: [{distance, duration}], totalDistance, totalDuration, geometry }
// geometry = GeoJSON LineString { coordinates: [[lng,lat], ...] }
//
// **Wandelen kan alleen met een ORS-sleutel** — de publieke OSRM-demoserver
// rijdt alleen auto. Zonder sleutel geeft deze route 501 voor 'lopen', en tekent
// de kaart de stippellijn die hij toch al tekent als er geen route is. Dat is
// eerlijker dan een autoroute over de ring onder het kopje "lopen".

export async function POST(request) {
  // Zelfde optionele PIN-check als /api/plan
  const expectedPin = process.env.FAMILY_PIN;
  if (expectedPin) {
    const provided = request.headers.get('x-family-pin');
    if (provided !== expectedPin) {
      return NextResponse.json({ error: 'Ongeldige PIN' }, { status: 401 });
    }
  }

  try {
    const body = await request.json();
    const points = body?.points;
    if (!geldigePunten(points)) {
      return NextResponse.json({ error: 'Ongeldige punten' }, { status: 400 });
    }

    const profiel = normaliseerProfiel(body?.profiel);
    if (profiel === 'lopen' && !kanWandelen()) {
      return NextResponse.json({ error: 'geen wandelroute' }, { status: 501 });
    }

    return NextResponse.json(await haalRoute(points, profiel));
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 502 });
  }
}
