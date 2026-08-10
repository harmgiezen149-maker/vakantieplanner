import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// Routeberekening tussen punten [[lat,lng], ...].
// Gebruikt OpenRouteService als ORS_API_KEY is gezet (env var),
// anders de publieke OSRM demo-server (geen key nodig).
//
// Body: { points: [[lat,lng], …], profiel?: 'rijden' | 'lopen' }
// Respons: { segments: [{distance, duration}], totalDistance, totalDuration, geometry }
// geometry = GeoJSON LineString { coordinates: [[lng,lat], ...] }
//
// **Wandelen kan alleen met een ORS-sleutel** — de publieke OSRM-demoserver
// rijdt alleen auto. Zonder sleutel geeft deze route 501 voor 'lopen', en tekent
// de kaart de stippellijn die hij toch al tekent als er geen route is. Dat is
// eerlijker dan een autoroute over de ring onder het kopje "lopen".

function validPoints(points) {
  return Array.isArray(points)
    && points.length >= 2
    && points.length <= 30
    && points.every(p =>
      Array.isArray(p) && p.length === 2 &&
      Number.isFinite(p[0]) && Number.isFinite(p[1]) &&
      Math.abs(p[0]) <= 90 && Math.abs(p[1]) <= 180
    );
}

const ORS_PROFIEL = { rijden: 'driving-car', lopen: 'foot-walking' };

async function routeViaORS(points, apiKey, profiel) {
  // ORS verwacht [lng, lat]
  const coordinates = points.map(([lat, lng]) => [lng, lat]);
  const url = `https://api.openrouteservice.org/v2/directions/${ORS_PROFIEL[profiel]}/geojson`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ coordinates }),
  });
  if (!res.ok) throw new Error(`ORS ${res.status}`);
  const data = await res.json();
  const feature = data.features?.[0];
  if (!feature) throw new Error('ORS: geen route');
  const segments = (feature.properties?.segments || []).map(s => ({
    distance: s.distance,
    duration: s.duration,
  }));
  const summary = feature.properties?.summary || {};
  return {
    segments,
    totalDistance: summary.distance ?? segments.reduce((a, s) => a + s.distance, 0),
    totalDuration: summary.duration ?? segments.reduce((a, s) => a + s.duration, 0),
    geometry: feature.geometry,
  };
}

async function routeViaOSRM(points) {
  // OSRM verwacht lng,lat;lng,lat;…
  const coordStr = points.map(([lat, lng]) => `${lng},${lat}`).join(';');
  const url = `https://router.project-osrm.org/route/v1/driving/${coordStr}` +
    `?overview=full&geometries=geojson&steps=false`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'VakantiePlanner/1.0' },
  });
  if (!res.ok) throw new Error(`OSRM ${res.status}`);
  const data = await res.json();
  const route = data.routes?.[0];
  if (!route) throw new Error('OSRM: geen route');
  const segments = (route.legs || []).map(l => ({
    distance: l.distance,
    duration: l.duration,
  }));
  return {
    segments,
    totalDistance: route.distance,
    totalDuration: route.duration,
    geometry: route.geometry,
  };
}

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
    if (!validPoints(points)) {
      return NextResponse.json({ error: 'Ongeldige punten' }, { status: 400 });
    }

    const profiel = body?.profiel === 'lopen' ? 'lopen' : 'rijden';
    const orsKey = process.env.ORS_API_KEY;
    if (profiel === 'lopen' && !orsKey) {
      return NextResponse.json({ error: 'geen wandelroute' }, { status: 501 });
    }

    const result = orsKey
      ? await routeViaORS(points, orsKey, profiel)
      : await routeViaOSRM(points);

    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 502 });
  }
}
