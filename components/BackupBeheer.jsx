'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import {
  ArrowLeft, Download, RefreshCw, Loader2, ShieldCheck, AlertTriangle, RotateCcw,
} from 'lucide-react';
import { COLORS } from '@/lib/data';
import { kopieVerouderd } from '@/lib/backup';
import { beheerHeaders } from '@/components/Poort';

const kb = (n) => (n >= 1024 * 1024
  ? `${(n / 1024 / 1024).toFixed(1)} MB`
  : `${Math.max(1, Math.round(n / 1024))} kB`);

const datumNL = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' });
};

// `ingebed` = getoond binnen /beheer, dat zijn eigen kop en terug-link
// al heeft. Los aangeroepen houdt hij zijn eigen paginakop.
export default function BackupBeheer({ ingebed = false }) {
  const [kopieen, setKopieen] = useState([]);
  const [laden, setLaden] = useState(true);
  const [bezig, setBezig] = useState(null); // 'maken' | 'terugzetten'
  const [melding, setMelding] = useState(null);
  const [fout, setFout] = useState(null);
  const [terugzetten, setTerugzetten] = useState(null); // kopie die bevestigd moet worden
  const [bevestiging, setBevestiging] = useState('');

  const laad = useCallback(async () => {
    setLaden(true);
    try {
      const res = await fetch('/api/backup', {
        headers: beheerHeaders(),
        cache: 'no-store',
      });
      const data = await res.json();
      if (!res.ok) {
        setFout(data.detail || data.error);
        setKopieen([]);
      } else {
        setKopieen(data.kopieen || []);
        setFout(null);
      }
    } catch (e) {
      setFout(`Kon de lijst niet ophalen: ${e.message}`);
    } finally {
      setLaden(false);
    }
  }, []);

  useEffect(() => { laad(); }, [laad]);

  // Hoe oud is de nieuwste kopie? De regel zelf staat in lib/backup.js, zodat
  // hij testbaar is; hier tekenen we alleen de melding.
  const veroudering = useMemo(
    () => kopieVerouderd(kopieen.map(k => k.pad)),
    [kopieen],
  );

  const maakNu = async () => {
    setBezig('maken');
    setMelding(null);
    try {
      const res = await fetch('/api/backup', {
        method: 'POST',
        headers: beheerHeaders(),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || data.error);
      setMelding(`Reservekopie gemaakt van ${data.documenten.length} documenten.` +
        (data.opgeruimd ? ` ${data.opgeruimd} oude opgeruimd.` : ''));
      await laad();
    } catch (e) {
      setFout(e.message);
    } finally {
      setBezig(null);
    }
  };

  const zetTerug = async () => {
    setBezig('terugzetten');
    setMelding(null);
    try {
      const res = await fetch('/api/backup/restore', {
        method: 'POST',
        headers: beheerHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ url: terugzetten.url, bevestigd: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || data.error);
      setMelding(
        `${data.teruggezet.length} documenten teruggezet uit de kopie van ` +
        `${datumNL(data.uitMomentopname)}. De staat van vlak vóór het terugzetten ` +
        `is bewaard als veiligheidskopie.`
      );
      setTerugzetten(null);
      setBevestiging('');
      await laad();
    } catch (e) {
      setFout(e.message);
    } finally {
      setBezig(null);
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
        {!ingebed && <h1 style={S.title}>Reservekopieën</h1>}
        <p style={S.sub}>
          Elke nacht wordt automatisch een kopie gemaakt van de planning, de
          inpaklijst, de checklist en het verblijvenlogboek. Kopieën van de
          afgelopen 30 dagen blijven allemaal bewaard, daarvoor één per maand tot
          een jaar terug.
        </p>

        {melding && (
          <div style={S.goed}><ShieldCheck size={16} /> <span>{melding}</span></div>
        )}
        {fout && (
          <div style={S.slecht}><AlertTriangle size={16} /> <span>{fout}</span></div>
        )}

        <div style={S.knoppen}>
          <button style={S.primair} onClick={maakNu} disabled={bezig !== null}>
            {bezig === 'maken'
              ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
              : <RefreshCw size={16} />}
            {bezig === 'maken' ? 'Bezig…' : 'Nu een kopie maken'}
          </button>
          <a
            style={S.secundair}
            href="/api/backup/download"
            onClick={(e) => {
              // De download-route wil de PIN in een header; die kan een gewone
              // link niet meesturen. Daarom halen we het bestand zelf op.
              e.preventDefault();
              downloadAlles();
            }}
          >
            <Download size={15} /> Alles downloaden
          </a>
        </div>

        <p style={S.tip}>
          Bewaar zo'n download af en toe ergens buiten Vercel — op je eigen
          computer of in de cloud. Dat is de enige kopie die het overleeft als er
          met het Vercel-account zelf iets misgaat.
        </p>

        <h2 style={S.kop2}>Beschikbare kopieën</h2>

        {/* Het vangnet: draait de nachtelijke taak niet meer, dan hoort dat
            hier te staan in plaats van dat je het pas merkt als je een kopie
            nodig hebt. Wat de oorzaak ook is. */}
        {!laden && !fout && veroudering.verouderd && (
          <div style={S.verouderd}>
            <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
            <div>
              <strong>
                {veroudering.laatste
                  ? `De laatste reservekopie is van ${datumNL(veroudering.laatste)}.`
                  : 'Er is nog geen enkele reservekopie.'}
              </strong>
              <div style={{ marginTop: 3 }}>
                De nachtelijke taak lijkt niet te draaien. Kijk in Vercel bij
                Settings → Cron Jobs wat de laatste run deed, en of{' '}
                <code style={S.code}>CRON_SECRET</code> nog klopt. Maak
                intussen hierboven met de hand een kopie.
              </div>
            </div>
          </div>
        )}

        {laden && <p style={S.stil}>Laden…</p>}
        {!laden && kopieen.length === 0 && !fout && (
          <p style={S.stil}>Nog geen kopieën. Maak er hierboven een.</p>
        )}

        <div style={S.lijst}>
          {kopieen.map((k) => (
            <div key={k.pad} style={S.rij}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={S.rijTitel}>{k.pad.replace('reservekopie/', '').replace('.json', '')}</div>
                <div style={S.rijMeta}>
                  {datumNL(k.gemaaktOp)} · {kb(k.grootte)}
                </div>
              </div>
              <a href={k.url} target="_blank" rel="noreferrer" style={S.rijKnop}
                 title="Deze kopie bekijken of opslaan">
                <Download size={14} />
              </a>
              <button
                style={{ ...S.rijKnop, color: COLORS.wine, borderColor: `${COLORS.wine}55` }}
                onClick={() => { setTerugzetten(k); setBevestiging(''); setFout(null); }}
                title="Deze kopie terugzetten"
              >
                <RotateCcw size={14} />
              </button>
            </div>
          ))}
        </div>

        {terugzetten && (
          <div style={S.bevestig}>
            <div style={S.bevestigKop}>
              <AlertTriangle size={17} color={COLORS.wine} />
              <strong>Kopie van {datumNL(terugzetten.gemaaktOp)} terugzetten?</strong>
            </div>
            <p style={S.bevestigTekst}>
              Dit overschrijft de planning, inpaklijst, checklist en het
              verblijvenlogboek met de inhoud van die dag. Alles wat daarna is
              bijgewerkt gaat verloren.
            </p>
            <p style={S.bevestigTekst}>
              De huidige staat wordt eerst als veiligheidskopie bewaard, dus je
              kunt dit terugdraaien. Typ <strong>TERUGZETTEN</strong> om te bevestigen.
            </p>
            <input
              style={S.invoer}
              value={bevestiging}
              onChange={(e) => setBevestiging(e.target.value)}
              placeholder="TERUGZETTEN"
              autoFocus
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button
                style={{
                  ...S.primair,
                  background: COLORS.wine,
                  opacity: bevestiging === 'TERUGZETTEN' ? 1 : 0.45,
                  cursor: bevestiging === 'TERUGZETTEN' ? 'pointer' : 'not-allowed',
                }}
                disabled={bevestiging !== 'TERUGZETTEN' || bezig !== null}
                onClick={zetTerug}
              >
                {bezig === 'terugzetten'
                  ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
                  : <RotateCcw size={16} />}
                Terugzetten
              </button>
              <button style={S.ghost} onClick={() => setTerugzetten(null)}>Annuleren</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

async function downloadAlles() {
  try {
    const res = await fetch('/api/backup/download', {
      headers: beheerHeaders(),
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vakantieplanner-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (e) {
    window.alert(`Downloaden mislukt: ${e.message}`);
  }
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
  kop2: {
    fontFamily: "'Fraunces', serif", fontSize: 20, fontWeight: 500,
    color: COLORS.forest, margin: '28px 0 10px',
  },
  sub: { fontSize: 14, lineHeight: 1.55, color: COLORS.ink, margin: '0 0 18px' },
  tip: { fontSize: 12, lineHeight: 1.5, color: COLORS.inkLight, margin: '10px 0 0' },
  stil: { color: COLORS.inkLight, fontSize: 14, fontStyle: 'italic' },
  verouderd: {
    display: 'flex', gap: 10, alignItems: 'flex-start',
    padding: '11px 13px', borderRadius: 12, margin: '0 0 12px',
    background: 'rgba(201,125,93,0.12)',
    borderLeft: `3px solid ${COLORS.sunset}`,
    color: COLORS.charcoal, fontSize: 13, lineHeight: 1.55,
  },
  code: {
    fontFamily: 'ui-monospace, monospace', fontSize: 12,
    background: 'rgba(31,41,34,0.07)', padding: '1px 5px', borderRadius: 5,
  },
  knoppen: { display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 16 },
  primair: {
    display: 'inline-flex', alignItems: 'center', gap: 7,
    padding: '10px 16px', borderRadius: 999, border: 'none',
    background: COLORS.forest, color: COLORS.cream,
    fontFamily: "'DM Sans', sans-serif", fontSize: 14, fontWeight: 600,
    cursor: 'pointer',
  },
  secundair: {
    display: 'inline-flex', alignItems: 'center', gap: 7,
    padding: '10px 16px', borderRadius: 999,
    border: `1px solid ${COLORS.lake}`, background: 'transparent',
    color: COLORS.lake, fontFamily: "'DM Sans', sans-serif",
    fontSize: 14, fontWeight: 600, cursor: 'pointer', textDecoration: 'none',
  },
  ghost: {
    padding: '10px 16px', borderRadius: 999,
    border: `1px solid ${COLORS.hairline}`, background: 'transparent',
    color: COLORS.ink, fontFamily: "'DM Sans', sans-serif",
    fontSize: 14, fontWeight: 600, cursor: 'pointer',
  },
  goed: {
    display: 'flex', alignItems: 'flex-start', gap: 8, padding: 13,
    borderRadius: 12, background: 'rgba(74,111,79,0.12)',
    color: COLORS.forest, fontSize: 13, lineHeight: 1.5, marginBottom: 12,
  },
  slecht: {
    display: 'flex', alignItems: 'flex-start', gap: 8, padding: 13,
    borderRadius: 12, background: 'rgba(142,61,82,0.10)',
    color: COLORS.wine, fontSize: 13, lineHeight: 1.5, marginBottom: 12,
  },
  lijst: { display: 'flex', flexDirection: 'column', gap: 8 },
  rij: {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '11px 13px', background: COLORS.creamSoft,
    border: `1px solid ${COLORS.hairline}`, borderRadius: 12,
  },
  rijTitel: { fontSize: 14, fontWeight: 600, color: COLORS.forest },
  rijMeta: { fontSize: 11, color: COLORS.inkLight, marginTop: 2 },
  rijKnop: {
    width: 34, height: 34, borderRadius: 9, flexShrink: 0,
    border: `1px solid ${COLORS.hairline}`, background: COLORS.cream,
    color: COLORS.lake, cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    textDecoration: 'none',
  },
  bevestig: {
    marginTop: 18, padding: 16, borderRadius: 14,
    background: COLORS.creamSoft, border: `1px solid ${COLORS.wine}55`,
  },
  bevestigKop: {
    display: 'flex', alignItems: 'center', gap: 8,
    color: COLORS.wine, fontSize: 15, marginBottom: 8,
  },
  bevestigTekst: { fontSize: 13, lineHeight: 1.55, color: COLORS.ink, margin: '0 0 8px' },
  invoer: {
    width: '100%', padding: '11px 13px', background: COLORS.cream,
    border: `1px solid ${COLORS.hairline}`, borderRadius: 10,
    fontFamily: "'DM Sans', sans-serif", fontSize: 14,
    color: COLORS.charcoal, outline: 'none', boxSizing: 'border-box',
  },
};
