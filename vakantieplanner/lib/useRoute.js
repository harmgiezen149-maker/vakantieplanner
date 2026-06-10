'use client';

import { useEffect, useState } from 'react';

const getPin = () => {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem('planner-pin') || '';
};

// Simpele in-browser cache zodat we niet bij elke render opnieuw fetchen
const routeCache = new Map();

function cacheKey(points) {
  return points.map(([lat, lng]) => `${lat.toFixed(5)},${lng.toFixed(5)}`).join('|');
}

export async function fetchRoute(points) {
  if (!points || points.length < 2) {
    return { segments: [], totalDistance: 0, totalDuration: 0, geometry: null };
  }
  const key = cacheKey(points);
  if (routeCache.has(key)) return routeCache.get(key);

  const res = await fetch('/api/route', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Family-Pin': getPin(),
    },
    body: JSON.stringify({ points }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  routeCache.set(key, data);
  return data;
}

// Hook: geef coords-array, krijgt route terug (gecached)
export function useRoute(points, enabled = true) {
  const [route, setRoute] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled || !points || points.length < 2) {
      setRoute(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetchRoute(points)
      .then(r => { if (!cancelled) setRoute(r); })
      .catch(() => { if (!cancelled) setRoute(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [enabled, cacheKey(points || [])]); // gebruik string-key zodat re-fetches alleen bij echte coord-verandering

  return { route, loading };
}
