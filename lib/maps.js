'use client';

// Client-side helpers voor locatie-invoer: het uitlezen van Google Maps-links
// en kale coördinaten, plus de twee API-aanroepen die daarbij horen.
//
// Deze zaten tot voor kort in components/Planner.jsx. Ze staan hier apart
// omdat components/LocationPicker.jsx ze nodig heeft en die inmiddels op twee
// pagina's wordt gebruikt (planner én verblijvenlogboek).

// ── Familie-PIN ─────────────────────────────────────────────────────
// Leeg als FAMILY_PIN niet is ingesteld; elke API-route accepteert dat.

export const getPin = () => {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem('planner-pin') || '';
};

export const setPin = (pin) => {
  if (typeof window === 'undefined') return;
  localStorage.setItem('planner-pin', pin);
};

// ── Herkenning van geplakte invoer ──────────────────────────────────

export const COORDS_RE = /^\s*(-?\d{1,2}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)\s*$/;

export const isGoogleMapsUrl = (txt) => {
  try {
    const u = new URL(txt.trim());
    return /(^|\.)google\.[a-z.]+$/.test(u.hostname) && u.pathname.includes('/maps')
      || ['maps.app.goo.gl', 'goo.gl', 'g.co', 'maps.google.com'].includes(u.hostname);
  } catch { return false; }
};

export const isShortMapsUrl = (txt) => {
  try {
    const u = new URL(txt.trim());
    return ['maps.app.goo.gl', 'goo.gl', 'g.co'].includes(u.hostname);
  } catch { return false; }
};

// Naam + coördinaten uit een volledige Maps-URL (client-side variant).
// Korte links (maps.app.goo.gl) lukken hier niet — die moeten langs de
// server, want de redirect volgen kan niet vanuit de browser (CORS).
export const parseMapsUrlClient = (urlStr) => {
  let name = null, coords = null;
  const placeMatch = /\/place\/([^/@?]+)/.exec(urlStr);
  if (placeMatch) {
    try { name = decodeURIComponent(placeMatch[1]).replace(/\+/g, ' ').trim(); } catch {}
  }
  const pin = /!3d(-?\d{1,2}\.\d+)!4d(-?\d{1,3}\.\d+)/.exec(urlStr);
  const at = /@(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)/.exec(urlStr);
  const q = /[?&]q=(-?\d{1,2}\.\d+)(?:,|%2C)(-?\d{1,3}\.\d+)/.exec(urlStr);
  const m = pin || at || q;
  if (m) {
    const lat = Number(m[1]), lng = Number(m[2]);
    if (isFinite(lat) && isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
      coords = [lat, lng];
    }
  }
  return { name, coords };
};

// ── API-aanroepen ───────────────────────────────────────────────────

export async function apiGeocode(q) {
  const res = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`, {
    headers: { 'X-Family-Pin': getPin() },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function apiResolveMaps(url) {
  const res = await fetch('/api/resolve-maps', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Family-Pin': getPin() },
    body: JSON.stringify({ url }),
  });
  if (!res.ok) throw new Error('resolve_failed');
  return res.json();
}
