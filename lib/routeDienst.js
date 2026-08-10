// De routeberekening zelf: ORS met een sleutel, anders de publieke OSRM.
//
// Staat apart omdat twee routes hem gebruiken: /api/route (achter de familie-PIN,
// voor de app zelf) en /api/delen/dagroute (open, achter een deel-token). Zonder
// deze module zou dat tweede pad een kopie van de eerste zijn, en dan lopen ze
// vroeg of laat uit elkaar.
//
// Geen 'use client': dit praat met externe diensten en hoort alleen op de server.

const ORS_PROFIEL = { rijden: 'driving-car', lopen: 'foot-walking' };

// Punten zijn [lat, lng]; ORS en OSRM willen [lng, lat] — valkuil 6.
export function geldigePunten(points, max = 30) {
  return Array.isArray(points)
    && points.length >= 2
    && points.length <= max
    && points.every(p =>
      Array.isArray(p) && p.length === 2 &&
      Number.isFinite(p[0]) && Number.isFinite(p[1]) &&
      Math.abs(p[0]) <= 90 && Math.abs(p[1]) <= 180
    );
}

export function normaliseerProfiel(v) {
  return v === 'lopen' ? 'lopen' : 'rijden';
}

// Wandelen kan alleen met een ORS-sleutel: de publieke OSRM-demoserver rijdt
// alleen auto. Roep dit aan vóór je aan een wandelroute begint.
export function kanWandelen() {
  return Boolean(process.env.ORS_API_KEY);
}

async function viaORS(points, apiKey, profiel) {
  const coordinates = points.map(([lat, lng]) => [lng, lat]);
  const url = `https://api.openrouteservice.org/v2/directions/${ORS_PROFIEL[profiel]}/geojson`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Authorization': apiKey, 'Content-Type': 'application/json' },
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

async function viaOSRM(points) {
  const coordStr = points.map(([lat, lng]) => `${lng},${lat}`).join(';');
  const url = `https://router.project-osrm.org/route/v1/driving/${coordStr}` +
    `?overview=full&geometries=geojson&steps=false`;
  const res = await fetch(url, { headers: { 'User-Agent': 'VakantiePlanner/1.0' } });
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

// Gooit bij een mislukte aanroep; de aanroepende route beslist wat dat betekent.
export async function haalRoute(points, profiel = 'rijden') {
  const orsKey = process.env.ORS_API_KEY;
  return orsKey ? viaORS(points, orsKey, profiel) : viaOSRM(points);
}
