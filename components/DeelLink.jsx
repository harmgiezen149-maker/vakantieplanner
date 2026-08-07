'use client';

// De alleen-lezen deel-link aanmaken, kopiëren en intrekken.
// Staat onder /beheer, want wie deze knop indrukt maakt een stuk van de
// planning bereikbaar zonder de familie-PIN.

import React, { useCallback, useEffect, useState } from 'react';
import { Share2, Copy, Check, Link2Off, RefreshCw, ExternalLink } from 'lucide-react';
import { COLORS } from '@/lib/data';
import { beheerHeaders } from '@/components/Poort';

export default function DeelLink() {
  const [staat, setStaat] = useState(null);   // { actief, token, aangemaakt }
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState('');
  const [gekopieerd, setGekopieerd] = useState(false);

  const laad = useCallback(async () => {
    try {
      const res = await fetch('/api/delen', { headers: beheerHeaders(), cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) { setFout(data.detail || data.error || 'Kon de deel-link niet ophalen.'); return; }
      setStaat(data);
      setFout('');
    } catch (e) {
      setFout(e.message);
    }
  }, []);

  useEffect(() => { laad(); }, [laad]);

  const doe = async (methode) => {
    setBezig(true);
    setFout('');
    try {
      const res = await fetch('/api/delen', {
        method: methode,
        headers: beheerHeaders({ 'Content-Type': 'application/json' }),
        body: methode === 'POST' ? JSON.stringify({}) : undefined,
      });
      const data = await res.json();
      if (!res.ok) { setFout(data.detail || data.error); return; }
      setStaat(methode === 'DELETE' ? { actief: false, token: null } : data);
      setGekopieerd(false);
    } catch (e) {
      setFout(e.message);
    } finally {
      setBezig(false);
    }
  };

  const url = staat?.actief && staat.token
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/bekijk?token=${staat.token}`
    : null;

  const kopieer = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setGekopieerd(true);
      setTimeout(() => setGekopieerd(false), 2500);
    } catch {
      // Klembord geweigerd (kan op iOS zonder https) — de link staat er ook
      // gewoon, dan selecteert de gebruiker hem zelf.
      setFout('Kopiëren lukte niet; selecteer de link hierboven met de hand.');
    }
  };

  return (
    <div style={S.blok}>
      <div style={S.kop}>
        <Share2 size={16} color={COLORS.forest} /> Meekijk-link
      </div>
      <p style={S.uitleg}>
        Een link waarmee anderen de planning kunnen <b>bekijken</b> zonder de familie-PIN
        en zonder iets te kunnen wijzigen. Het verblijvenlogboek, de foto's, de inpaklijst
        en de namen van wie wat bijwerkte gaan niet mee.
      </p>

      {fout && <div style={S.fout}>{fout}</div>}

      {url ? (
        <>
          <div style={S.linkVak}>{url}</div>
          <div style={S.knoppen}>
            <button onClick={kopieer} style={S.primair}>
              {gekopieerd ? <><Check size={15} /> Gekopieerd</> : <><Copy size={15} /> Link kopiëren</>}
            </button>
            <a href={url} target="_blank" rel="noopener noreferrer" style={S.secundair}>
              <ExternalLink size={15} /> Openen
            </a>
            <button onClick={() => doe('DELETE')} disabled={bezig} style={S.secundair}>
              <Link2Off size={15} /> Intrekken
            </button>
            <button onClick={() => doe('POST')} disabled={bezig} style={S.secundair}>
              <RefreshCw size={15} /> Nieuwe maken
            </button>
          </div>
          <p style={S.klein}>
            “Nieuwe maken” vervangt deze link — de oude werkt daarna niet meer.
            {staat?.aangemaakt && <> Aangemaakt op {new Date(staat.aangemaakt).toLocaleDateString('nl-NL')}.</>}
          </p>
        </>
      ) : (
        <>
          <p style={S.klein}>Er staat op dit moment geen link open.</p>
          <button onClick={() => doe('POST')} disabled={bezig} style={S.primair}>
            <Share2 size={15} /> {bezig ? 'Bezig…' : 'Link aanmaken'}
          </button>
        </>
      )}
    </div>
  );
}

const knopBasis = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  padding: '9px 14px', borderRadius: 999,
  fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600,
  cursor: 'pointer', textDecoration: 'none',
};

const S = {
  blok: {
    background: COLORS.creamSoft, border: `1px solid ${COLORS.hairline}`,
    borderRadius: 14, padding: 16,
  },
  kop: {
    display: 'flex', alignItems: 'center', gap: 8,
    fontFamily: "'Fraunces', serif", fontSize: 16, color: COLORS.forest,
    marginBottom: 6,
  },
  uitleg: { fontSize: 13, lineHeight: 1.55, color: COLORS.ink, margin: '0 0 12px' },
  fout: {
    fontSize: 12.5, color: '#B5443B', background: 'rgba(181,68,59,0.08)',
    border: '1px solid rgba(181,68,59,0.25)', borderRadius: 10,
    padding: '9px 12px', marginBottom: 10,
  },
  linkVak: {
    background: COLORS.cream, border: `1px solid ${COLORS.hairline}`,
    borderRadius: 10, padding: '10px 12px', marginBottom: 10,
    fontSize: 12, color: COLORS.ink, wordBreak: 'break-all',
    fontFamily: "'DM Sans', sans-serif",
  },
  knoppen: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  primair: { ...knopBasis, border: 'none', background: COLORS.forest, color: COLORS.cream },
  secundair: {
    ...knopBasis, border: `1px solid ${COLORS.hairline}`,
    background: 'transparent', color: COLORS.ink,
  },
  klein: { fontSize: 11.5, lineHeight: 1.5, color: COLORS.inkLight, margin: '10px 0 0' },
};
