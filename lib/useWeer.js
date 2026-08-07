'use client';

// Haalt de verwachting op voor een verblijf en een periode, en geeft hem terug
// als map van datum → dag.
//
// Het weer is bijzaak: mislukt de oproep, dan blijft de map leeg en toont de
// pagina er gewoon niets over. Geen foutmelding, want een kapotte
// weersverwachting mag het dagoverzicht niet in de weg zitten.

import { useEffect, useState } from 'react';
import { getPin } from '@/lib/maps';

export function useWeer(coords, van, tot) {
  const [perDatum, setPerDatum] = useState({});

  const lat = Array.isArray(coords) ? coords[0] : null;
  const lng = Array.isArray(coords) ? coords[1] : null;

  useEffect(() => {
    if (lat == null || lng == null || !van || !tot) {
      setPerDatum({});
      return undefined;
    }
    let levend = true;
    (async () => {
      try {
        const res = await fetch(
          `/api/weer?lat=${lat}&lng=${lng}&van=${van}&tot=${tot}`,
          { headers: { 'X-Family-Pin': getPin() }, cache: 'no-store' },
        );
        if (!res.ok) return;
        const data = await res.json();
        if (!levend) return;
        const map = {};
        for (const d of data.dagen || []) map[d.datum] = d;
        setPerDatum(map);
      } catch {
        // stil — het weer is bijzaak
      }
    })();
    return () => { levend = false; };
  }, [lat, lng, van, tot]);

  return perDatum;
}
