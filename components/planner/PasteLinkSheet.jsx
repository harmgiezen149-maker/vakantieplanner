'use client';

// ============ GOOGLE MAPS-LINK PLAKKEN ============

import React, { useState } from 'react';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { COLORS } from '@/lib/data';
import {
  apiResolveMaps, isGoogleMapsUrl, parseMapsUrlClient, extractUrl, labelBeforeUrl,
} from '@/lib/maps';
import Sheet from '@/components/planner/Sheet';

const PasteLinkSheet = ({ onCreate, onClose }) => {
  const [url, setUrl] = useState('');
  const [state, setState] = useState('idle'); // idle | loading | preview | error
  const [preview, setPreview] = useState(null);
  const [fout, setFout] = useState(null);

  const resolve = async (value) => {
    const v = (value ?? url).trim();
    if (!v) return;
    setState('loading');
    setFout(null);
    try {
      // De Maps-app plakt de naam van de plek vóór de link, dus we vissen de
      // URL uit de tekst in plaats van een kale URL te eisen.
      const link = extractUrl(v) || v;
      const naamHint = labelBeforeUrl(v);
      let data = null;
      const direct = parseMapsUrlClient(link);
      if (direct.coords) {
        data = { name: direct.name, coords: direct.coords, description: null, bron: 'link' };
      } else if (isGoogleMapsUrl(link)) {
        data = await apiResolveMaps(link, naamHint);
      } else {
        throw new Error('geen Maps-link');
      }
      if (!data?.coords) throw new Error('geen locatie gevonden');
      setPreview({
        name: data.name || naamHint || 'Nieuwe activiteit',
        coords: data.coords,
        description: data.description || null,
        // 'adres' betekent: niet uit de link maar erbij gezocht. Dat zeggen we
        // in de voorvertoning, zodat je de speld even kunt nalopen.
        bron: data.bron || null,
        adres: data.adres || null,
      });
      setState('preview');
    } catch (e) {
      const d = e?.detail || {};
      const link = extractUrl(v) || v;
      setFout({
        openen: d.finalUrl && d.finalUrl !== link ? d.finalUrl : link,
        diagnose: [
          e?.message || 'onbekend',
          d.hops ? `${d.hops} stap${d.hops === 1 ? '' : 'pen'}` : null,
          d.status ? `status ${d.status}` : null,
        ].filter(Boolean).join(' · '),
      });
      setState('error');
    }
  };

  const confirm = () => {
    onCreate({ name: preview.name, coords: preview.coords, note: preview.description });
  };

  return (
    <Sheet onClose={onClose} title="Google Maps-link toevoegen">
      <div style={{ padding: '14px 20px 24px' }}>
        <p style={{ fontSize: 13, color: COLORS.inkLight, margin: '0 0 12px', lineHeight: 1.5 }}>
          Plak een Google Maps-link van een plek (in Google Maps: <strong>Delen → Link kopiëren</strong>).
          De app maakt er automatisch een activiteit van met naam en locatie.
        </p>

        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') resolve(); }}
            placeholder="https://maps.app.goo.gl/…"
            autoFocus
            style={{
              flex: 1, fontFamily: "'DM Sans', sans-serif", fontSize: 14,
              padding: '11px 12px', border: `1px solid ${COLORS.hairline}`,
              borderRadius: 10, background: COLORS.cream, color: COLORS.charcoal,
            }}
          />
          <button
            onClick={() => resolve()}
            disabled={state === 'loading' || !url.trim()}
            style={{
              padding: '0 16px', background: COLORS.forest, color: COLORS.cream,
              border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 600,
              fontFamily: "'DM Sans', sans-serif",
              cursor: state === 'loading' ? 'wait' : 'pointer',
              display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap',
            }}
          >
            {state === 'loading'
              ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} />
              : 'Uitlezen'}
          </button>
        </div>

        {state === 'error' && fout && (
          <div style={{
            padding: 12, borderRadius: 10, fontSize: 13, lineHeight: 1.5,
            background: 'rgba(201, 125, 93, 0.12)', color: COLORS.sunset,
          }}>
            Kon deze link niet uitlezen.
            <a
              href={fout.openen}
              target="_blank"
              rel="noreferrer"
              style={{
                display: 'inline-block', marginTop: 8, padding: '6px 11px',
                borderRadius: 8, border: `1px solid ${COLORS.sunset}`,
                color: COLORS.sunset, textDecoration: 'none',
                fontSize: 12, fontWeight: 600,
              }}
            >Openen in Google Maps</a>
            <div style={{ marginTop: 8, fontSize: 11.5, opacity: 0.85 }}>
              Wacht tot de kaart er staat en plak de URL uit de adresbalk hier terug.
              Of plak de coördinaten — in Maps lang drukken op de plek. [{fout.diagnose}]
            </div>
          </div>
        )}

        {state === 'preview' && preview && (
          <div style={{
            padding: 14, borderRadius: 12, background: COLORS.creamSoft,
            border: `1px solid ${COLORS.hairline}`,
          }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: COLORS.inkLight, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Naam</label>
            <input
              value={preview.name}
              onChange={(e) => setPreview(p => ({ ...p, name: e.target.value }))}
              style={{
                width: '100%', boxSizing: 'border-box', marginTop: 4, marginBottom: 10,
                fontFamily: "'DM Sans', sans-serif", fontSize: 14, padding: '9px 11px',
                border: `1px solid ${COLORS.hairline}`, borderRadius: 9,
                background: COLORS.cream, color: COLORS.charcoal,
              }}
            />
            <label style={{ fontSize: 11, fontWeight: 600, color: COLORS.inkLight, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Beschrijving</label>
            <textarea
              value={preview.description || ''}
              onChange={(e) => setPreview(p => ({ ...p, description: e.target.value }))}
              placeholder="Optioneel"
              style={{
                width: '100%', boxSizing: 'border-box', marginTop: 4, marginBottom: 10,
                minHeight: 50, resize: 'vertical',
                fontFamily: "'DM Sans', sans-serif", fontSize: 14, padding: '9px 11px',
                border: `1px solid ${COLORS.hairline}`, borderRadius: 9,
                background: COLORS.cream, color: COLORS.charcoal,
              }}
            />
            <div style={{ fontSize: 11, color: COLORS.inkLight, marginBottom: preview.bron === 'adres' ? 8 : 12 }}>
              📍 {preview.coords[0].toFixed(5)}, {preview.coords[1].toFixed(5)}
            </div>
            {preview.bron === 'adres' && (
              <div style={{
                marginBottom: 12, padding: '7px 9px', borderRadius: 8,
                background: 'rgba(58, 126, 132, 0.10)',
                fontSize: 11, color: COLORS.lake, lineHeight: 1.45,
              }}>
                <b>Bij benadering.</b> De link gaf geen coördinaten, dus is er gezocht
                op{preview.adres ? ` ${preview.adres}` : ' de naam'}.
              </div>
            )}
            <button
              onClick={confirm}
              style={{
                width: '100%', padding: 13, background: COLORS.forest, color: COLORS.cream,
                border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 600,
                fontFamily: "'DM Sans', sans-serif", cursor: 'pointer',
              }}
            >+ Toevoegen aan activiteiten</button>
          </div>
        )}
      </div>
    </Sheet>
  );
};

export default PasteLinkSheet;
