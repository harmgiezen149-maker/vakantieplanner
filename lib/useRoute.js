'use client';

import { useEffect, useState } from 'react';

const getPin = () => {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem('planner-pin') || '';
};

// Simpele in-browser cache zodat we niet bij elke render opnieuw fetchen
const routeCache = new Map();

// Het profiel hoort in de sleutel: dezelfde punten leveren te voet een andere
// lijn op dan met de auto, en zonder profiel in de sleutel krijgt een wandeldag
// de auto-geometrie terug.
function cacheKey(points, profiel = 'rijden') {
  return `${profiel}|${points.map(([lat, lng]) => `${lat.toFixed(5)},${lng.toFixed(5)}`).join('|')}`;
}

export async function fetchRoute(points, profiel = 'rijden') {
  if (!points || points.length < 2) {
    return { segments: [], totalDistance: 0, totalDuration: 0, geometry: null };
  }
  const key = cacheKey(points, profiel);
  if (routeCache.has(key)) return routeCache.get(key);

  const res = await fetch('/api/route', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Family-Pin': getPin(),
    },
    body: JSON.stringify({ points, profiel }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  routeCache.set(key, data);
  return data;
}

// Hook: geef coords-array, krijgt route terug (gecached)
export function useRoute(points, enabled = true, profiel = 'rijden') {
  const [route, setRoute] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled || !points || points.length < 2) {
      setRoute(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetchRoute(points, profiel)
      .then(r => { if (!cancelled) setRoute(r); })
      .catch(() => { if (!cancelled) setRoute(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [enabled, cacheKey(points || [], profiel)]); // gebruik string-key zodat re-fetches alleen bij echte coord-verandering

  return { route, loading };
}
