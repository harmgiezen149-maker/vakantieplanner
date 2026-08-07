'use client';

// Verschijnt als de server niet bereikbaar was en je de laatst geladen versie
// ziet. Dat moet er niet uitzien als een gewone pagina, want dat is precies de
// verwarring die valkuil 19 beschrijft: oude data die je bewerkt zonder het te
// weten. Vandaar dat de balk er staat én dat opslaan geblokkeerd is.

import React from 'react';
import { CloudOff, RefreshCw } from 'lucide-react';
import { COLORS } from '@/lib/data';
import { formatMoment } from '@/lib/offline';

export default function OfflineMelding({ op, onOpnieuw }) {
  return (
    <div style={S.balk}>
      <div style={S.kop}>
        <CloudOff size={17} style={{ flexShrink: 0 }} />
        <strong>Geen verbinding</strong>
      </div>
      <p style={S.tekst}>
        Je ziet de versie van {formatMoment(op)}. Wijzigingen worden niet
        bewaard zolang dit er staat — anders zou je op verouderde gegevens
        verder werken en het werk van een ander overschrijven.
      </p>
      {onOpnieuw && (
        <button style={S.knop} onClick={onOpnieuw}>
          <RefreshCw size={15} /> Opnieuw proberen
        </button>
      )}
    </div>
  );
}

const S = {
  balk: {
    padding: '13px 15px', borderRadius: 13, marginBottom: 14,
    background: 'rgba(122,134,120,0.12)',
    border: `1px solid ${COLORS.slate}66`,
    fontFamily: "'DM Sans', sans-serif",
  },
  kop: {
    display: 'flex', alignItems: 'center', gap: 8,
    color: COLORS.slate, fontSize: 14, marginBottom: 6,
  },
  tekst: { fontSize: 13, lineHeight: 1.5, color: COLORS.ink, margin: '0 0 10px' },
  knop: {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '9px 14px', borderRadius: 999,
    borderWidth: 1, borderStyle: 'solid', borderColor: COLORS.hairline,
    background: 'transparent', color: COLORS.ink,
    fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600,
    cursor: 'pointer',
  },
};
