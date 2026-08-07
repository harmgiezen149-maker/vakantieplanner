'use client';

import { useEffect } from 'react';

// Vangt fouten op die anders alleen in de console van één telefoon te zien
// zijn, en stuurt ze naar /api/fouten. Hangt in de root-layout, dus op elke
// pagina.
//
// Toont zelf niets: de app moet niet ánders gaan werken doordat er iets wordt
// gelogd. Wat er binnenkomt lees je op /fouten.

const VERSTUURD = new Set();   // binnen deze paginasessie niet herhalen
let verstuurdTotaal = 0;
const MAX_PER_SESSIE = 10;

async function meld(bericht, detail) {
  try {
    if (!bericht) return;
    if (verstuurdTotaal >= MAX_PER_SESSIE) return;
    const sleutel = `${bericht}|${detail || ''}`.slice(0, 300);
    if (VERSTUURD.has(sleutel)) return;
    VERSTUURD.add(sleutel);
    verstuurdTotaal++;

    await fetch('/api/fouten', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bron: 'client',
        bericht: String(bericht).slice(0, 300),
        detail: detail ? String(detail).slice(0, 1500) : null,
        pad: window.location.pathname,
        versie: navigator.userAgent.slice(0, 40),
      }),
      keepalive: true, // ook nog versturen als de pagina wordt weggeklikt
    });
  } catch {
    // Het melden van een fout mag nooit zelf een fout opleveren
  }
}

export default function Foutmelder() {
  useEffect(() => {
    const opFout = (e) => {
      const bericht = e?.message || 'Onbekende fout';
      const detail = [
        e?.error?.stack,
        e?.filename ? `${e.filename}:${e.lineno}:${e.colno}` : null,
      ].filter(Boolean).join('\n');
      meld(bericht, detail);
    };

    const opAfwijzing = (e) => {
      const r = e?.reason;
      const bericht = r?.message || String(r || 'Onafgehandelde belofte');
      meld(bericht, r?.stack || null);
    };

    window.addEventListener('error', opFout);
    window.addEventListener('unhandledrejection', opAfwijzing);
    return () => {
      window.removeEventListener('error', opFout);
      window.removeEventListener('unhandledrejection', opAfwijzing);
    };
  }, []);

  return null;
}
