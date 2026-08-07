'use client';

// Het kasboek van de reis: wat is er uitgegeven, waaraan, door wie.
//
// Zelfde vangnetten als de andere schrijvende pagina's: gedebouncede opslag,
// een `dirty`-ref zodat een focus-refresh de laatste bewerking niet wegpoetst,
// en de versiecontrole met de botsingsbalk (valkuil 4).

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft, Plus, Trash2, Users, Wallet, Scale, X,
} from 'lucide-react';
import { COLORS } from '@/lib/data';
import { getPin } from '@/lib/maps';
import ConflictMelding from '@/components/ConflictMelding';
import {
  CATEGORIEEN, categorieById, naarCenten, formatEuro,
  totaal, perCategorie, perPersoon, verrekening,
} from '@/lib/uitgaven';

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const vandaag = () => new Date().toISOString().slice(0, 10);

export default function Uitgaven() {
  const [uitgaven, setUitgaven] = useState([]);
  const [personen, setPersonen] = useState([]);
  const [naam, setNaam] = useState('');
  const [laden, setLaden] = useState(true);
  const [opslaan, setOpslaan] = useState(false);
  const [fout, setFout] = useState('');
  const [conflict, setConflict] = useState(null);
  const [tab, setTab] = useState('lijst');

  // Nieuw-formulier
  const [bedrag, setBedrag] = useState('');
  const [omschrijving, setOmschrijving] = useState('');
  const [categorie, setCategorie] = useState('boodschappen');
  const [betaaldDoor, setBetaaldDoor] = useState('');
  const [datum, setDatum] = useState(vandaag);
  const [invoerFout, setInvoerFout] = useState('');

  const laatste = useRef({ uitgaven: [], personen: [] });
  const versie = useRef(null);
  const dirty = useRef(false);
  const timer = useRef(null);

  useEffect(() => {
    if (typeof window !== 'undefined') setNaam(localStorage.getItem('planner-name') || '');
  }, []);

  const laad = useCallback(async () => {
    if (dirty.current) return;
    try {
      const res = await fetch('/api/uitgaven', {
        headers: { 'X-Family-Pin': getPin() }, cache: 'no-store',
      });
      if (!res.ok) throw new Error(res.status === 401 ? 'unauthorized' : `HTTP ${res.status}`);
      const data = await res.json();
      setUitgaven(data.uitgaven || []);
      setPersonen(data.personen || []);
      laatste.current = { uitgaven: data.uitgaven || [], personen: data.personen || [] };
      versie.current = data.updatedAt ?? null;
      setFout('');
    } catch (e) {
      setFout(e.message === 'unauthorized'
        ? 'Geen toegang — open eerst de planner en vul de familie-PIN in.'
        : 'Kon de uitgaven niet ophalen.');
    } finally {
      setLaden(false);
    }
  }, []);

  useEffect(() => {
    laad();
    const opFocus = () => laad();
    window.addEventListener('focus', opFocus);
    return () => window.removeEventListener('focus', opFocus);
  }, [laad]);

  const bewaar = useCallback((next, negeerVersie = false) => {
    laatste.current = next;
    dirty.current = true;
    clearTimeout(timer.current);
    setOpslaan(true);
    timer.current = setTimeout(async () => {
      try {
        const res = await fetch('/api/uitgaven', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Family-Pin': getPin() },
          body: JSON.stringify({
            ...laatste.current,
            updatedBy: (typeof window !== 'undefined' && localStorage.getItem('planner-name')) || null,
            basisVersie: negeerVersie ? undefined : versie.current,
          }),
        });
        if (res.status === 409) {
          setConflict(await res.json().catch(() => ({})));
          return;
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        versie.current = data.updatedAt ?? null;
        dirty.current = false;
        setConflict(null);
      } catch {
        // De volgende wijziging probeert het opnieuw
      } finally {
        setOpslaan(false);
      }
    }, 600);
  }, []);

  // Muteren gaat altijd via laatste.current, nooit via de state uit de closure
  // — zie de stale-closure-bug in het verblijvenlogboek.
  const muteer = (fn) => {
    const next = fn(laatste.current);
    setUitgaven(next.uitgaven);
    setPersonen(next.personen);
    bewaar(next);
  };

  const voegToe = () => {
    const centen = naarCenten(bedrag);
    if (centen === null || centen === 0) {
      setInvoerFout('Vul een bedrag in, bijvoorbeeld 12,50');
      return;
    }
    setInvoerFout('');
    const nieuw = {
      id: uid(),
      datum: datum || null,
      bedrag: centen,
      omschrijving: omschrijving.trim() || null,
      categorie,
      betaaldDoor: betaaldDoor || null,
      activityId: null,
    };
    muteer(s => ({ ...s, uitgaven: [nieuw, ...s.uitgaven] }));
    setBedrag('');
    setOmschrijving('');
  };

  const verwijder = (id) => muteer(s => ({ ...s, uitgaven: s.uitgaven.filter(u => u.id !== id) }));

  const voegPersoonToe = (nieuweNaam) => {
    const schoon = nieuweNaam.trim().slice(0, 40);
    if (!schoon) return;
    muteer(s => (s.personen.includes(schoon) ? s : { ...s, personen: [...s.personen, schoon] }));
  };

  const verwijderPersoon = (p) =>
    muteer(s => ({ ...s, personen: s.personen.filter(x => x !== p) }));

  const som = useMemo(() => totaal(uitgaven), [uitgaven]);
  const catRijen = useMemo(() => perCategorie(uitgaven), [uitgaven]);
  const persoonRijen = useMemo(() => perPersoon(uitgaven), [uitgaven]);
  const saldi = useMemo(() => verrekening(uitgaven, personen), [uitgaven, personen]);

  const gesorteerd = useMemo(
    () => [...uitgaven].sort((a, b) => String(b.datum || '').localeCompare(String(a.datum || ''))),
    [uitgaven],
  );

  return (
    <div style={S.pagina}>
      <Link href="/" style={S.terug}><ArrowLeft size={16} /> Planner</Link>
      <p style={S.kicker}>Vakantie · Uitgaven</p>
      <h1 style={S.titel}>Wat kost het</h1>
      <p style={S.onder}>
        Houd bij wat je onderweg uitgeeft. Vul namen in bij “Wie doen er mee” om
        te zien wie aan het eind wie moet terugbetalen.
      </p>

      {fout && <div style={S.foutBalk}>{fout}</div>}

      {conflict && (
        <ConflictMelding
          door={conflict.door}
          onLaadHunVersie={() => { dirty.current = false; setConflict(null); laad(); }}
          onForceer={() => { setConflict(null); bewaar(laatste.current, true); }}
        />
      )}

      <div style={S.totaalKaart}>
        <span style={S.totaalLabel}>Totaal</span>
        <span style={S.totaalBedrag}>{formatEuro(som)}</span>
        <span style={S.totaalSub}>
          {uitgaven.length} {uitgaven.length === 1 ? 'uitgave' : 'uitgaven'}
          {opslaan && ' · opslaan…'}
        </span>
      </div>

      {/* Nieuw ── */}
      <div style={S.formulier}>
        <div style={S.rij}>
          <input
            value={bedrag}
            onChange={(e) => setBedrag(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && voegToe()}
            placeholder="12,50"
            inputMode="decimal"
            style={{ ...S.invoer, flex: '0 0 92px', fontWeight: 600 }}
          />
          <input
            value={omschrijving}
            onChange={(e) => setOmschrijving(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && voegToe()}
            placeholder="Waarvoor?"
            style={{ ...S.invoer, flex: 1 }}
          />
        </div>
        <div style={S.rij}>
          <select value={categorie} onChange={(e) => setCategorie(e.target.value)} style={{ ...S.invoer, flex: 1 }}>
            {CATEGORIEEN.map(c => (
              <option key={c.id} value={c.id}>{c.emoji} {c.label}</option>
            ))}
          </select>
          <input type="date" value={datum} onChange={(e) => setDatum(e.target.value)} style={{ ...S.invoer, flex: '0 0 140px' }} />
        </div>
        {personen.length > 0 && (
          <div style={S.rij}>
            <select value={betaaldDoor} onChange={(e) => setBetaaldDoor(e.target.value)} style={{ ...S.invoer, flex: 1 }}>
              <option value="">Betaald door…</option>
              {personen.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
        )}
        {invoerFout && <div style={S.invoerFout}>{invoerFout}</div>}
        <button onClick={voegToe} style={S.primair}><Plus size={15} /> Toevoegen</button>
      </div>

      <nav style={S.tabs}>
        {[
          { key: 'lijst', label: 'Alles', icon: Wallet },
          { key: 'verdeling', label: 'Verdeling', icon: Scale },
          { key: 'personen', label: 'Wie doen er mee', icon: Users },
        ].map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setTab(key)}
            style={{ ...S.tab, ...(tab === key ? S.tabAan : {}) }}>
            <Icon size={14} /> {label}
          </button>
        ))}
      </nav>

      {laden ? <p style={S.leeg}>Laden…</p> : (
        <>
          {tab === 'lijst' && (
            gesorteerd.length === 0
              ? <p style={S.leeg}>Nog niets ingevuld.</p>
              : (
                <ul style={S.lijst}>
                  {gesorteerd.map(u => {
                    const c = categorieById(u.categorie);
                    return (
                      <li key={u.id} style={S.regel}>
                        <span style={S.regelEmoji}>{c?.emoji || '💶'}</span>
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <span style={S.regelNaam}>{u.omschrijving || c?.label || 'Uitgave'}</span>
                          <span style={S.regelMeta}>
                            {u.datum || 'zonder datum'}
                            {u.betaaldDoor && <> · {u.betaaldDoor}</>}
                          </span>
                        </span>
                        <span style={S.regelBedrag}>{formatEuro(u.bedrag)}</span>
                        <button onClick={() => verwijder(u.id)} style={S.wisKnop} aria-label="Verwijderen">
                          <Trash2 size={14} />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )
          )}

          {tab === 'verdeling' && (
            <>
              <Balken kop="Per categorie" rijen={catRijen.map(r => ({
                label: `${categorieById(r.naam)?.emoji || '💶'} ${categorieById(r.naam)?.label || r.naam}`,
                bedrag: r.bedrag,
              }))} />
              {persoonRijen.length > 0 && (
                <Balken kop="Betaald door" rijen={persoonRijen.map(r => ({ label: r.naam, bedrag: r.bedrag }))} />
              )}
              {saldi.length > 0 && (
                <section style={{ marginTop: 20 }}>
                  <h2 style={S.blokKop}>Verrekening</h2>
                  <p style={S.blokUitleg}>
                    Als iedereen evenveel draagt. Positief betekent: die persoon
                    krijgt nog terug.
                  </p>
                  <ul style={S.lijst}>
                    {saldi.map(s => (
                      <li key={s.naam} style={S.regel}>
                        <span style={{ flex: 1 }}>
                          <span style={S.regelNaam}>{s.naam}</span>
                          <span style={S.regelMeta}>
                            betaald {formatEuro(s.betaald)} · aandeel {formatEuro(s.aandeel)}
                          </span>
                        </span>
                        <span style={{
                          ...S.regelBedrag,
                          color: s.saldo > 0 ? COLORS.moss : (s.saldo < 0 ? '#B5443B' : COLORS.inkLight),
                        }}>{formatEuro(s.saldo)}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </>
          )}

          {tab === 'personen' && (
            <PersonenBeheer
              personen={personen}
              onToevoegen={voegPersoonToe}
              onVerwijderen={verwijderPersoon}
              eigenNaam={naam}
            />
          )}
        </>
      )}
    </div>
  );
}

function PersonenBeheer({ personen, onToevoegen, onVerwijderen, eigenNaam }) {
  const [invoer, setInvoer] = useState('');
  return (
    <div>
      <p style={S.blokUitleg}>
        Wie draagt er mee aan de kosten? Zonder namen wordt er alleen opgeteld,
        niet verdeeld.
      </p>
      <div style={S.rij}>
        <input
          value={invoer}
          onChange={(e) => setInvoer(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { onToevoegen(invoer); setInvoer(''); } }}
          placeholder={eigenNaam ? `Bijvoorbeeld ${eigenNaam}` : 'Naam'}
          style={{ ...S.invoer, flex: 1 }}
        />
        <button onClick={() => { onToevoegen(invoer); setInvoer(''); }} style={S.primair}>
          <Plus size={15} /> Erbij
        </button>
      </div>
      {personen.length > 0 && (
        <div style={{ ...S.chips, marginTop: 12 }}>
          {personen.map(p => (
            <span key={p} style={S.chip}>
              {p}
              <button onClick={() => onVerwijderen(p)} style={S.chipWis} aria-label={`${p} verwijderen`}>
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function Balken({ kop, rijen }) {
  if (!rijen.length) return null;
  const max = Math.max(...rijen.map(r => Math.abs(r.bedrag)), 1);
  return (
    <section style={{ marginTop: 20 }}>
      <h2 style={S.blokKop}>{kop}</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        {rijen.map(r => (
          <div key={r.label} style={S.balkRij}>
            <span style={S.balkLabel}>{r.label}</span>
            <span style={S.balkSpoor}>
              <span style={{ ...S.balkVulling, width: `${Math.round((Math.abs(r.bedrag) / max) * 100)}%` }} />
            </span>
            <span style={S.balkGetal}>{formatEuro(r.bedrag)}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

const S = {
  pagina: {
    minHeight: '100vh', background: COLORS.cream,
    fontFamily: "'DM Sans', sans-serif", color: COLORS.charcoal,
    padding: '20px 20px 60px', maxWidth: 720, margin: '0 auto',
  },
  terug: {
    display: 'inline-flex', alignItems: 'center', gap: 4,
    fontSize: 13, color: COLORS.lake, textDecoration: 'none',
    marginBottom: 14, fontWeight: 500,
  },
  kicker: {
    fontSize: 11, letterSpacing: 1.4, textTransform: 'uppercase',
    color: COLORS.lake, fontWeight: 600, margin: '0 0 4px',
  },
  titel: {
    fontFamily: "'Fraunces', serif", fontSize: 30, fontWeight: 500,
    color: COLORS.forest, margin: '0 0 8px', letterSpacing: '-0.02em',
  },
  onder: { fontSize: 13, lineHeight: 1.55, color: COLORS.ink, margin: '0 0 16px' },
  foutBalk: {
    fontSize: 12.5, color: '#B5443B', background: 'rgba(181,68,59,0.08)',
    border: '1px solid rgba(181,68,59,0.25)', borderRadius: 10,
    padding: '9px 12px', marginBottom: 12,
  },
  totaalKaart: {
    background: COLORS.forest, color: COLORS.cream, borderRadius: 16,
    padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 2,
    marginBottom: 16,
  },
  totaalLabel: { fontSize: 11, letterSpacing: 1.2, textTransform: 'uppercase', opacity: 0.8 },
  totaalBedrag: { fontFamily: "'Fraunces', serif", fontSize: 30, fontWeight: 500 },
  totaalSub: { fontSize: 12, opacity: 0.75 },
  formulier: {
    background: COLORS.creamSoft, border: `1px solid ${COLORS.hairline}`,
    borderRadius: 14, padding: 14, display: 'flex', flexDirection: 'column', gap: 8,
    marginBottom: 18,
  },
  rij: { display: 'flex', gap: 8 },
  invoer: {
    padding: '11px 12px', background: COLORS.cream,
    border: `1px solid ${COLORS.hairline}`, borderRadius: 10,
    fontFamily: "'DM Sans', sans-serif", fontSize: 14,
    color: COLORS.charcoal, outline: 'none', boxSizing: 'border-box',
    minWidth: 0,
  },
  invoerFout: { fontSize: 12, color: '#B5443B' },
  primair: {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
    padding: '11px 14px', borderRadius: 999, border: 'none',
    background: COLORS.forest, color: COLORS.cream,
    fontFamily: "'DM Sans', sans-serif", fontSize: 13.5, fontWeight: 600,
    cursor: 'pointer',
  },
  tabs: { display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' },
  tab: {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '8px 13px', borderRadius: 999,
    borderWidth: 1, borderStyle: 'solid', borderColor: COLORS.hairline,
    background: 'transparent',
    color: COLORS.ink, fontFamily: "'DM Sans', sans-serif",
    fontSize: 12.5, fontWeight: 500, cursor: 'pointer',
  },
  tabAan: { background: COLORS.forest, color: COLORS.cream, borderColor: COLORS.forest, fontWeight: 600 },
  leeg: { fontSize: 13, color: COLORS.inkLight },
  lijst: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 },
  regel: {
    display: 'flex', alignItems: 'center', gap: 10,
    background: COLORS.creamSoft, border: `1px solid ${COLORS.hairline}`,
    borderRadius: 11, padding: '10px 12px',
  },
  regelEmoji: { fontSize: 17 },
  regelNaam: { display: 'block', fontSize: 13.5, fontWeight: 500, color: COLORS.charcoal },
  regelMeta: { display: 'block', fontSize: 11.5, color: COLORS.inkLight, marginTop: 1 },
  regelBedrag: {
    fontFamily: "'Fraunces', serif", fontSize: 15, color: COLORS.forest,
    fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap',
  },
  wisKnop: {
    border: 'none', background: 'transparent', cursor: 'pointer',
    color: COLORS.inkLight, padding: 4, display: 'flex',
  },
  blokKop: {
    fontFamily: "'Fraunces', serif", fontSize: 17, fontWeight: 500,
    color: COLORS.forest, margin: '0 0 6px',
  },
  blokUitleg: { fontSize: 12.5, color: COLORS.inkLight, margin: '0 0 10px', lineHeight: 1.5 },
  balkRij: { display: 'flex', alignItems: 'center', gap: 9, fontSize: 12.5 },
  balkLabel: { minWidth: 130, color: COLORS.ink },
  balkSpoor: { flex: 1, height: 8, borderRadius: 99, background: COLORS.hairline, overflow: 'hidden' },
  balkVulling: { display: 'block', height: '100%', background: COLORS.moss, borderRadius: 99 },
  balkGetal: {
    minWidth: 74, textAlign: 'right', color: COLORS.inkLight,
    fontVariantNumeric: 'tabular-nums',
  },
  chips: { display: 'flex', flexWrap: 'wrap', gap: 6 },
  chip: {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '6px 8px 6px 12px', borderRadius: 999,
    background: COLORS.creamSoft, border: `1px solid ${COLORS.hairline}`,
    fontSize: 12.5, color: COLORS.ink,
  },
  chipWis: {
    border: 'none', background: 'transparent', cursor: 'pointer',
    color: COLORS.inkLight, padding: 0, display: 'flex',
  },
};
