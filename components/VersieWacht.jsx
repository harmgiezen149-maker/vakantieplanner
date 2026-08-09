'use client';

// Draai je nog op de laatste versie?
//
// De app is een PWA zonder service worker (valkuil 19), dus niets duwt een
// update naar binnen. Een geopende app op de telefoon blijft daardoor makkelijk
// dagen op oude JS hangen, en dat merk je pas als iets zich vreemd gedraagt —
// of, erger, als een oude tab tegen een nieuw datamodel praat.
//
// Deze wacht vergelijkt de versie die de server nu meldt met de versie die er
// stond toen deze pagina laadde. Verschillen ze, dan komt er een balk met een
// herlaadknop. Meer niet: nooit vanzelf herladen, want dan verlies je waar je
// middenin zat.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshCw, X, ArrowUpCircle } from 'lucide-react';
import { COLORS } from '@/lib/data';

// Hoe vaak we kijken als de app open blijft staan. Elke vijf minuten is ruim
// genoeg voor een familieplanner en kost vrijwel niets.
const INTERVAL_MS = 5 * 60 * 1000;

export default function VersieWacht() {
  const [nieuw, setNieuw] = useState(false);
  const [weggeklikt, setWeggeklikt] = useState(false);
  const bekend = useRef(null);

  const kijk = useCallback(async () => {
    try {
      const res = await fetch('/api/versie', { cache: 'no-store' });
      if (!res.ok) return;
      const { versie } = await res.json();
      if (!versie) return;

      if (bekend.current === null) {
        bekend.current = versie;   // eerste keer: dit is onze versie
        return;
      }
      if (versie !== bekend.current) setNieuw(true);
    } catch {
      // Geen verbinding of een fout: dat is geen nieuwe versie. Stil laten
      // gaan — dit onderdeel mag de app nooit in de weg zitten.
    }
  }, []);

  useEffect(() => {
    kijk();
    const timer = setInterval(kijk, INTERVAL_MS);
    // Ook bij terugkomen in de app: dat is precies het moment waarop je een
    // dag later opnieuw kijkt.
    const opFocus = () => kijk();
    window.addEventListener('focus', opFocus);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', opFocus);
    };
  }, [kijk]);

  if (!nieuw || weggeklikt) return null;

  return (
    <div style={S.balk} role="status">
      <ArrowUpCircle size={17} style={{ flexShrink: 0, color: COLORS.cream }} />
      <span style={S.tekst}>
        Er is een nieuwe versie van de planner.
      </span>
      <button style={S.herlaad} onClick={() => window.location.reload()}>
        <RefreshCw size={14} /> Herladen
      </button>
      <button
        style={S.sluit}
        onClick={() => setWeggeklikt(true)}
        aria-label="Melding wegklikken"
      ><X size={15} /></button>
    </div>
  );
}

const S = {
  balk: {
    position: 'fixed', left: 12, right: 12, bottom: 12, zIndex: 200,
    maxWidth: 560, margin: '0 auto',
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '11px 12px 11px 14px', borderRadius: 14,
    background: COLORS.forest, color: COLORS.cream,
    boxShadow: '0 6px 22px rgba(31,41,34,0.28)',
    fontFamily: "'DM Sans', sans-serif", fontSize: 13.5,
  },
  tekst: { flex: 1, lineHeight: 1.4 },
  herlaad: {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '7px 12px', borderRadius: 999, border: 'none',
    background: COLORS.cream, color: COLORS.forest,
    fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 700,
    cursor: 'pointer', flexShrink: 0,
  },
  sluit: {
    border: 'none', background: 'transparent', cursor: 'pointer',
    color: COLORS.cream, opacity: 0.7, padding: 2, display: 'flex', flexShrink: 0,
  },
};
