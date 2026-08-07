'use client';

// ============ "WAT LIGT HIER?" (klik op de kaart) ============

import React, { useState, useEffect } from 'react';
import { Plus, X, Loader2 } from 'lucide-react';
import { COLORS } from '@/lib/data';
import { getPin } from '@/lib/maps';
import Sheet from '@/components/planner/Sheet';

const WhatsHereSheet = ({ point, onCreate, onClose }) => {
  const [state, setState] = useState('loading');
  const [results, setResults] = useState([]);
  const [clicked, setClicked] = useState(point);

  useEffect(() => {
    let alive = true;
    (async () => {
      setState('loading');
      try {
        const res = await fetch('/api/whats-here', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Family-Pin': getPin() },
          body: JSON.stringify({ lat: point[0], lng: point[1] }),
        });
        if (!res.ok) throw new Error('failed');
        const data = await res.json();
        if (!alive) return;
        setResults(data.suggestions || []);
        setClicked(data.clicked || point);
        setState('done');
      } catch {
        if (alive) setState('error');
      }
    })();
    return () => { alive = false; };
  }, [point]);

  const makeActivity = (r) => onCreate({
    name: r.name,
    coords: r.coords,
    note: [r.kind, r.place].filter(Boolean).join(' · ') || null,
    emoji: r.emoji,
  });

  return (
    <Sheet onClose={onClose} title="Wat ligt hier?">
      <div style={{ padding: '12px 20px 24px' }}>
        {state === 'loading' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: COLORS.ink, fontSize: 14, padding: '8px 0' }}>
            <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
            Zoeken wat hier in de buurt ligt…
          </div>
        )}

        {state === 'error' && (
          <div style={{ fontSize: 14, color: COLORS.ink, lineHeight: 1.6 }}>
            Kon niet ophalen wat hier ligt. Je kunt deze plek wel als activiteit
            toevoegen op de exacte coördinaten:
            <button
              onClick={() => makeActivity({ name: 'Gekozen locatie', coords: clicked, kind: null, place: null, emoji: '📍' })}
              style={{
                marginTop: 12, width: '100%', padding: 12,
                background: COLORS.forest, color: COLORS.cream, border: 'none',
                borderRadius: 10, fontSize: 14, fontWeight: 600,
                fontFamily: "'DM Sans', sans-serif", cursor: 'pointer',
              }}
            >📍 Voeg deze plek toe</button>
          </div>
        )}

        {state === 'done' && (
          <>
            <p style={{ fontSize: 13, color: COLORS.inkLight, margin: '0 0 12px', lineHeight: 1.5 }}>
              Kies een plek om er een activiteit van te maken, of voeg het
              exacte klikpunt toe.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
              {results.map((r, i) => (
                <button
                  key={`${r.name}-${i}`}
                  onClick={() => makeActivity(r)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '11px 12px', width: '100%', textAlign: 'left',
                    background: COLORS.creamSoft,
                    border: `1px solid ${COLORS.hairline}`,
                    borderRadius: 10, cursor: 'pointer',
                    fontFamily: "'DM Sans', sans-serif",
                  }}
                >
                  <span style={{ fontSize: 18 }}>{r.emoji}</span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 14, fontWeight: 500, color: COLORS.charcoal, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.name}
                    </span>
                    <span style={{ display: 'block', fontSize: 11, color: COLORS.inkLight, marginTop: 1 }}>
                      {[r.kind, r.place].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                  {r.distM > 0 && (
                    <span style={{ fontSize: 11, color: COLORS.inkLight, whiteSpace: 'nowrap' }}>
                      {r.distM < 1000 ? `${r.distM} m` : `${(r.distM / 1000).toFixed(1)} km`}
                    </span>
                  )}
                  <Plus size={16} style={{ color: COLORS.forest, flexShrink: 0 }} />
                </button>
              ))}
              {results.length === 0 && (
                <div style={{ fontSize: 13, color: COLORS.inkLight }}>
                  Niets benoembaars gevonden op deze plek.
                </div>
              )}
            </div>
            <button
              onClick={() => makeActivity({ name: 'Gekozen locatie', coords: clicked, kind: null, place: null, emoji: '📍' })}
              style={{
                width: '100%', padding: 11,
                background: 'transparent', color: COLORS.forest,
                border: `1px solid ${COLORS.forest}`, borderRadius: 10,
                fontSize: 13, fontWeight: 600, fontFamily: "'DM Sans', sans-serif",
                cursor: 'pointer',
              }}
            >📍 Of: voeg het exacte klikpunt toe</button>
          </>
        )}
      </div>
    </Sheet>
  );
};

export default WhatsHereSheet;
