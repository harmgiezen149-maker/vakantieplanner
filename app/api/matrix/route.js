import { NextResponse } from 'next/server';
import { canoniekeVolgorde, herstelMatrix } from '@/lib/volgorde';
import { cacheSleutel, uitCache, naarCache, TTL } from '@/lib/geoCache';

export const dynamic = 'force-dynamic';

// Alle onderlinge rijafstanden tussen een handvol punten, in één oproep.
//
// Hiermee zet /"Slimme volgorde" de activiteiten van een dag in de kortste
// route. Zelfde opzet als /api/route: OpenRouteService als ORS_API_KEY gezet is,
// anders de publieke OSRM-server (geen sleutel nodig).
//
// Respons: { distances, durations, bron }  — beide n×n, in meters en seconden,
// in dezelfde volgorde als de punten die de client stuurde.
//
// Mislukt de oproep, dan geeft deze route 502 en rekent de client hemelsbreed
// door. Dat is geen storing maar een terugval: de knop moet ook werken op een
// camping zonder bereik.

// Ruim genoeg voor een dag vol activiteiten, en klein genoeg dat beide diensten
// het aankunnen (25×25 = 625 paren; ORS staat 2500 toe).
const MAX_PUNTEN = 25;

function geldigePunten(points) {
  return Array.isArray(points)
    && points.length >= 2
    && points.length <= MAX_PUNTEN
    && points.every(p =>
      Array.isArray(p) && p.length === 2 &&
      Number.isFinite(p[0]) && Number.isFinite(p[1]) &&
      Math.abs(p[0]) <= 90 && Math.abs(p[1]) <= 180
    );
}

// n×n met alleen getallen? Een half gevulde matrix is erger dan geen matrix:
// dan optimaliseer je op gaten.
function volledig(matrix, n) {
  return Array.isArray(matrix)
    && matrix.length === n
    && matrix.every(rij =>
      Array.isArray(rij) && rij.length === n && rij.every(v => Number.isFinite(v)));
}

async function matrixViaORS(punten, apiKey) {
  // ORS verwacht [lng, lat] — valkuil 6
  const locations = punten.map(([lat, lng]) => [lng, lat]);
  const res = await fetch('https://api.openrouteservice.org/v2/matrix/driving-car', {
    method: 'POST',
    headers: { 'Authorization': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ locations, metrics: ['distance', 'duration'] }),
  });
  if (!res.ok) throw new Error(`ORS ${res.status}`);
  const data = await res.json();
  return { distances: data.distances ?? null, durations: data.durations ?? null, bron: 'ors' };
}

async function matrixViaOSRM(punten) {
  const coordStr = punten.map(([lat, lng]) => `${lng},${lat}`).join(';');
  const url = `https://router.project-osrm.org/table/v1/driving/${coordStr}` +
    `?annotations=duration,distance`;
  const res = await fetch(url, { headers: { 'User-Agent': 'VakantiePlanner/1.0' } });
  if (!res.ok) throw new Error(`OSRM ${res.status}`);
  const data = await res.json();
  if (data.code && data.code !== 'Ok') throw new Error(`OSRM ${data.code}`);
  return { distances: data.distances ?? null, durations: data.durations ?? null, bron: 'osrm' };
}

export async function POST(request) {
  // Zelfde optionele PIN-check als /api/plan en /api/route
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

    // Eerst canoniek sorteren, dán opvragen. Zo hoort dezelfde verzameling
    // punten bij dezelfde cachesleutel, ook nadat het optimaliseren de volgorde
    // heeft omgegooid — anders is een klik op "Slimme volgorde" altijd een
    // misser, precies wanneer je de cache nodig hebt.
    const { punten, index } = canoniekeVolgorde(points);
    const sleutel = cacheSleutel('matrix', punten.flatMap(p => [p[0], p[1]]), 4);

    const bewaard = await uitCache(sleutel);
    let uit = bewaard;

    if (!uit) {
      const orsKey = process.env.ORS_API_KEY;
      const n = punten.length;
      const antwoord = orsKey
        ? await matrixViaORS(punten, orsKey)
        : await matrixViaOSRM(punten);

      // Afstanden zijn wat we willen; kent de dienst ze niet, dan is rijtijd
      // een prima vervanger — het gaat om de onderlinge verhouding.
      const distances = volledig(antwoord.distances, n) ? antwoord.distances : null;
      const durations = volledig(antwoord.durations, n) ? antwoord.durations : null;
      if (!distances && !durations) throw new Error('matrix onbruikbaar');

      uit = { distances, durations, bron: antwoord.bron };
      // Alleen geslaagde, volledige antwoorden bewaren (valkuil 7).
      await naarCache(sleutel, uit, TTL.matrix);
    }

    // Terug in de volgorde waarin de client zijn punten aanleverde
    return NextResponse.json({
      distances: uit.distances ? herstelMatrix(uit.distances, index) : null,
      durations: uit.durations ? herstelMatrix(uit.durations, index) : null,
      bron: uit.bron,
      uitCache: Boolean(bewaard),
    });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 502 });
  }
}
