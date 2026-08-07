'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  ArrowLeft, RefreshCw, Trash2, AlertTriangle, CheckCircle2, Loader2, Server, Smartphone,
} from 'lucide-react';
import { COLORS } from '@/lib/data';
import { getPin } from '@/lib/maps';
import { beheerHeaders } from '@/components/Poort';

const tijdNL = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  const vandaag = new Date().toDateString() === d.toDateString();
  const klok = d.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
  return vandaag ? `vandaag ${klok}` : `${d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })} ${klok}`;
};

// `ingebed` = getoond binnen /beheer, dat zijn eigen kop en terug-link
// al heeft. Los aangeroepen houdt hij zijn eigen paginakop.
export default function FoutenLijst({ ingebed = false }) {
  const [fouten, setFouten] = useState([]);
  const [laden, setLaden] = useState(true);
  const [fout, setFout] = useState(null);
  const [open, setOpen] = useState(null);

  const laad = useCallback(async () => {
    setLaden(true);
    try {
      const res = await fetch('/api/fouten', {
        headers: { 'X-Family-Pin': getPin() },
        cache: 'no-store',
      });
      const data = await res.json();
      if (!res.ok) { setFout(data.detail || data.error); setFouten([]); }
      else { setFouten(data.fouten || []); setFout(null); }
    } catch (e) {
      setFout(`Kon het logboek niet ophalen: ${e.message}`);
    } finally {
      setLaden(false);
    }
  }, []);

  useEffect(() => { laad(); }, [laad]);

  const wis = async () => {
    if (!window.confirm('Alle gemelde fouten wissen?')) return;
    try {
      // Wissen is een beheeractie — vandaar de tweede sleutel.
      await fetch('/api/fouten', {
        method: 'DELETE',
        headers: beheerHeaders(),
      });
      await laad();
    } catch (e) {
      setFout(e.message);
    }
  };

  return (
    <div style={ingebed ? S.pageIngebed : S.page}>
      <div style={ingebed ? S.innerIngebed : S.inner}>
        {!ingebed && (
          <>
            <Link href="/" style={S.backLink}><ArrowLeft size={16} /> Planner</Link>
            <p style={S.kicker}>Beheer</p>
          </>
        )}
        {!ingebed && <h1 style={S.title}>Wat er misging</h1>}
        <p style={S.sub}>
          Fouten die in de app optreden — in de browser van wie hem gebruikt, en
          op de server — komen hier terecht. Dezelfde fout op dezelfde plek wordt
          één regel met een teller.
        </p>

        {fout && <div style={S.slecht}><AlertTriangle size={16} /> <span>{fout}</span></div>}

        <div style={S.knoppen}>
          <button style={S.secundair} onClick={laad} disabled={laden}>
            {laden ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> : <RefreshCw size={15} />}
            Vernieuwen
          </button>
          {fouten.length > 0 && (
            <button style={{ ...S.secundair, color: COLORS.wine, borderColor: `${COLORS.wine}88` }} onClick={wis}>
              <Trash2 size={15} /> Lijst wissen
            </button>
          )}
        </div>

        {!laden && fouten.length === 0 && !fout && (
          <div style={S.goed}>
            <CheckCircle2 size={18} />
            <span>Niets gemeld. Dat is het antwoord dat je wilt zien.</span>
          </div>
        )}

        <div style={S.lijst}>
          {fouten.map((f, i) => {
            const isOpen = open === i;
            return (
              <div key={`${f.bericht}-${i}`} style={S.rij}>
                <button style={S.rijKop} onClick={() => setOpen(isOpen ? null : i)}>
                  <span style={{ ...S.bron, background: f.bron === 'server' ? 'rgba(90,107,140,0.15)' : 'rgba(58,126,132,0.13)' }}>
                    {f.bron === 'server' ? <Server size={11} /> : <Smartphone size={11} />}
                    {f.bron}
                  </span>
                  <span style={S.bericht}>{f.bericht}</span>
                  {f.aantal > 1 && <span style={S.teller}>{f.aantal}×</span>}
                </button>
                <div style={S.meta}>
                  {[f.pad, tijdNL(f.laatst)].filter(Boolean).join(' · ')}
                  {f.aantal > 1 && f.eerst !== f.laatst ? ` · eerst ${tijdNL(f.eerst)}` : ''}
                </div>
                {isOpen && f.detail && <pre style={S.detail}>{f.detail}</pre>}
                {isOpen && f.versie && <div style={S.versie}>{f.versie}</div>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const S = {
  pageIngebed: { fontFamily: "'DM Sans', sans-serif", color: COLORS.charcoal },
  innerIngebed: {},
  page: {
    fontFamily: "'DM Sans', sans-serif",
    background: COLORS.cream, color: COLORS.charcoal, minHeight: '100vh',
  },
  inner: { maxWidth: 720, margin: '0 auto', padding: '18px 20px 60px' },
  backLink: {
    color: COLORS.forest, fontSize: 14, textDecoration: 'none',
    display: 'inline-flex', alignItems: 'center', gap: 6,
  },
  kicker: {
    fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase',
    color: COLORS.lake, fontWeight: 600, margin: '18px 0 6px',
  },
  title: {
    fontFamily: "'Fraunces', serif", fontSize: 32, fontWeight: 500,
    lineHeight: 1.08, margin: '0 0 8px', color: COLORS.forest,
    letterSpacing: '-0.02em',
  },
  sub: { fontSize: 14, lineHeight: 1.55, color: COLORS.ink, margin: '0 0 18px' },
  knoppen: { display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 },
  secundair: {
    display: 'inline-flex', alignItems: 'center', gap: 7,
    padding: '9px 15px', borderRadius: 999,
    border: `1px solid ${COLORS.lake}`, background: 'transparent',
    color: COLORS.lake, fontFamily: "'DM Sans', sans-serif",
    fontSize: 14, fontWeight: 600, cursor: 'pointer',
  },
  goed: {
    display: 'flex', alignItems: 'center', gap: 9, padding: 16,
    borderRadius: 12, background: 'rgba(74,111,79,0.12)',
    color: COLORS.forest, fontSize: 14,
  },
  slecht: {
    display: 'flex', alignItems: 'flex-start', gap: 8, padding: 13,
    borderRadius: 12, background: 'rgba(142,61,82,0.10)',
    color: COLORS.wine, fontSize: 13, lineHeight: 1.5, marginBottom: 12,
  },
  lijst: { display: 'flex', flexDirection: 'column', gap: 8 },
  rij: {
    padding: '10px 13px', background: COLORS.creamSoft,
    border: `1px solid ${COLORS.hairline}`, borderRadius: 12,
  },
  rijKop: {
    display: 'flex', alignItems: 'center', gap: 8, width: '100%',
    background: 'transparent', border: 'none', padding: 0, cursor: 'pointer',
    textAlign: 'left', fontFamily: "'DM Sans', sans-serif",
  },
  bron: {
    display: 'inline-flex', alignItems: 'center', gap: 3, flexShrink: 0,
    fontSize: 10, fontWeight: 600, textTransform: 'uppercase',
    letterSpacing: 0.3, color: COLORS.ink, padding: '2px 6px', borderRadius: 6,
  },
  bericht: { flex: 1, fontSize: 13, fontWeight: 600, color: COLORS.forest, minWidth: 0 },
  teller: {
    flexShrink: 0, fontSize: 11, fontWeight: 700, color: COLORS.wine,
    background: 'rgba(142,61,82,0.10)', padding: '2px 7px', borderRadius: 999,
  },
  meta: { fontSize: 11, color: COLORS.inkLight, marginTop: 4 },
  detail: {
    marginTop: 8, marginBottom: 0, padding: 10, borderRadius: 8,
    background: COLORS.cream, border: `1px solid ${COLORS.hairline}`,
    fontSize: 11, lineHeight: 1.5, color: COLORS.ink,
    whiteSpace: 'pre-wrap', wordBreak: 'break-word', overflowX: 'auto',
  },
  versie: { fontSize: 10, color: COLORS.inkLight, marginTop: 6 },
};
