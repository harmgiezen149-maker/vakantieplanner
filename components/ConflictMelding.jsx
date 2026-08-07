'use client';

import React from 'react';
import { AlertTriangle, Download, Upload } from 'lucide-react';
import { COLORS } from '@/lib/data';

// Verschijnt als iemand anders iets opsloeg terwijl jij aan het bewerken was.
// Vroeger won stilzwijgend de laatste; nu krijg je de keuze, want alleen jij
// weet welke van de twee wijzigingen de belangrijkste is.

export default function ConflictMelding({ door, onLaadHunVersie, onForceer }) {
  return (
    <div style={S.balk}>
      <div style={S.kop}>
        <AlertTriangle size={17} style={{ flexShrink: 0 }} />
        <strong>
          {door ? `${door} heeft intussen iets opgeslagen` : 'Iemand anders heeft intussen iets opgeslagen'}
        </strong>
      </div>
      <p style={S.tekst}>
        Je laatste wijziging is daarom nog niet bewaard. Kies wat er moet gebeuren —
        anders zou een van de twee stilletjes verdwijnen.
      </p>
      <div style={S.knoppen}>
        <button style={S.primair} onClick={onLaadHunVersie}>
          <Download size={15} /> Hun versie laden
        </button>
        <button style={S.secundair} onClick={onForceer}>
          <Upload size={15} /> Toch de mijne opslaan
        </button>
      </div>
      <p style={S.klein}>
        “Hun versie laden” gooit jouw laatste wijziging weg. “Toch de mijne
        opslaan” overschrijft die van hen.
      </p>
    </div>
  );
}

const S = {
  balk: {
    padding: '13px 15px', borderRadius: 13, marginBottom: 14,
    background: 'rgba(201,125,93,0.12)',
    border: `1px solid ${COLORS.sunset}66`,
    fontFamily: "'DM Sans', sans-serif",
  },
  kop: {
    display: 'flex', alignItems: 'center', gap: 8,
    color: COLORS.sunset, fontSize: 14, marginBottom: 6,
  },
  tekst: { fontSize: 13, lineHeight: 1.5, color: COLORS.ink, margin: '0 0 10px' },
  knoppen: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  primair: {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '9px 14px', borderRadius: 999, border: 'none',
    background: COLORS.forest, color: COLORS.cream,
    fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600,
    cursor: 'pointer',
  },
  secundair: {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '9px 14px', borderRadius: 999,
    border: `1px solid ${COLORS.hairline}`, background: 'transparent',
    color: COLORS.ink, fontFamily: "'DM Sans', sans-serif",
    fontSize: 13, fontWeight: 600, cursor: 'pointer',
  },
  klein: { fontSize: 11, lineHeight: 1.5, color: COLORS.inkLight, margin: '8px 0 0' },
};
