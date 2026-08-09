'use client';

import ConflictMelding from '@/components/ConflictMelding';

import { useEffect, useState, useRef, useCallback } from 'react';
import { COLORS } from '@/lib/data';

// ── De checklist-inhoud ──────────────────────────────────────────────
// Per sectie een groep items. id moet uniek + stabiel blijven (wordt als
// sleutel in Redis bewaard). Pas tekst gerust aan; verander geen bestaande
// id's, anders verspringen de vinkjes.
const SECTIONS = [
  {
    id: 'docs',
    title: 'Documenten',
    items: [
      { id: 'doc-rijbewijs', label: 'Geldig rijbewijs (alle bestuurders)' },
      { id: 'doc-kenteken', label: 'Kentekenbewijs (deel 1A/1B of overschrijvingsbewijs)' },
      { id: 'doc-groenekaart', label: 'Groene kaart / verzekeringsbewijs — verplicht mee' },
      { id: 'doc-id', label: 'Geldig ID/paspoort voor iedereen' },
      { id: 'doc-leasebrief', label: 'Toestemmingsbrief bij lease-/leenauto (indien van toepassing)' },
    ],
  },
  {
    id: 'verplicht',
    title: 'Verplicht in de auto (Frankrijk)',
    items: [
      { id: 'fr-driehoek', label: 'Gevarendriehoek' },
      { id: 'fr-vesten', label: 'Veiligheidsvest per inzittende — binnen handbereik, niet in kofferbak' },
      { id: 'fr-lampjes', label: 'Reserve-set lampjes (aanbevolen)' },
    ],
  },
  {
    id: 'milieu',
    title: 'Milieuzone & vignet',
    items: [
      { id: 'critair-bestel', label: "Crit'Air-vignet bestellen via certificat-air.gouv.fr (officiële site!)" },
      { id: 'critair-binnen', label: "Crit'Air-vignet ontvangen en op voorruit geplakt" },
      { id: 'lux-tol', label: 'Luxemburg: geen tol/vignet nodig — niets te regelen' },
    ],
  },
  {
    id: 'verzekering',
    title: 'Verzekering & pechhulp',
    items: [
      { id: 'verz-dekking', label: 'Autoverzekering dekt Frankrijk + Luxemburg gecheckt' },
      { id: 'verz-pech', label: 'Pechhulp Europa (ANWB/Wegenwacht) geldig en mee' },
      { id: 'verz-alarm', label: 'Alarmnummer pechhulp opgeslagen in telefoon' },
    ],
  },
  {
    id: 'tol',
    title: 'Tol & betaling',
    items: [
      { id: 'tol-frankrijk', label: 'Péage: pinpas/contant gereed (of télépéage-badge overwegen)' },
    ],
  },
  {
    id: 'techniek',
    title: 'Technische check vóór vertrek',
    items: [
      { id: 'tech-banden', label: 'Bandenspanning afstellen op beladen auto + profiel checken' },
      { id: 'tech-olie', label: 'Olie- en koelvloeistofpeil controleren' },
      { id: 'tech-ruiten', label: 'Ruitenwisservloeistof bijvullen' },
      { id: 'tech-verlichting', label: 'Verlichting en remlichten testen' },
      { id: 'tech-reserve', label: 'Reservewiel / bandenreparatieset aanwezig' },
    ],
  },
];

const ALL_ITEMS = SECTIONS.flatMap((s) => s.items);

export default function Checklist() {
  const [checked, setChecked] = useState({});
  const [updatedBy, setUpdatedBy] = useState(null);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [conflict, setConflict] = useState(null);
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const saveTimer = useRef(null);
  // True zolang een lokale wijziging nog niet is opgeslagen. Voorkomt dat
  // de focus-refresh (vuurt o.a. na een confirm-popup) de wijziging
  // overschrijft met oude serverdata.
  const dirty = useRef(false);
  // updatedAt van het document zoals wij het kennen — de versie waarop onze
  // wijziging is gebaseerd.
  const versie = useRef(null);
  const laatsteChecked = useRef({});

  const load = useCallback(async () => {
    if (dirty.current) return;
    try {
      const res = await fetch('/api/checklist');
      const data = await res.json();
      setChecked(data.checked ?? {});
      laatsteChecked.current = data.checked ?? {};
      setUpdatedBy(data.updatedBy ?? null);
      setUpdatedAt(data.updatedAt ?? null);
      versie.current = data.updatedAt ?? null;
    } catch {
      // stil falen; toon gewoon lege staat
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const onFocus = () => load();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [load]);

  // negeerVersie = "toch de mijne opslaan" na een botsing.
  const persist = useCallback((nextChecked, negeerVersie = false) => {
    dirty.current = true;
    laatsteChecked.current = nextChecked;
    clearTimeout(saveTimer.current);
    setSaving(true);
    saveTimer.current = setTimeout(async () => {
      try {
        const res = await fetch('/api/checklist', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            checked: nextChecked,
            updatedBy: name || null,
            basisVersie: negeerVersie ? undefined : versie.current,
          }),
        });
        const data = await res.json();
        if (res.status === 409) {
          setConflict(data);
          return;
        }
        setUpdatedBy(data.updatedBy ?? null);
        setUpdatedAt(data.updatedAt ?? null);
        versie.current = data.updatedAt ?? null;
        dirty.current = false;
        setConflict(null);
      } catch {
        // negeer; volgende toggle probeert opnieuw (dirty blijft staan)
      } finally {
        setSaving(false);
      }
    }, 500);
  }, [name]);

  const toggle = (itemId) => {
    setChecked((prev) => {
      const next = { ...prev, [itemId]: !prev[itemId] };
      if (!next[itemId]) delete next[itemId];
      persist(next);
      return next;
    });
  };

  const doneCount = ALL_ITEMS.filter((i) => checked[i.id]).length;
  const total = ALL_ITEMS.length;
  const pct = Math.round((doneCount / total) * 100);

  const formattedDate = updatedAt
    ? new Date(updatedAt).toLocaleString('nl-NL', {
        day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
      })
    : null;

  return (
    <div style={styles.page}>
      <style>{globalCss}</style>

      <header style={styles.header}>
        <a href="/" style={styles.backLink}>‹ Terug naar planner</a>
        <p style={styles.kicker}>Vakantie · Voorbereiding</p>
        <h1 style={styles.title}>Auto & documenten</h1>
        <p style={styles.sub}>
          Wat moet er geregeld zijn voordat we rijden. Iedereen vinkt af —
          de lijst is gedeeld.
        </p>

        {conflict && (
          <ConflictMelding
            door={conflict.door}
            onLaadHunVersie={() => { dirty.current = false; setConflict(null); load(); }}
            onForceer={() => { setConflict(null); persist(laatsteChecked.current, true); }}
          />
        )}

        {doneCount > 0 && (
          <button
            onClick={() => {
              if (window.confirm('Alle vinkjes uitzetten? De lijst zelf blijft staan — handig bij een nieuwe vakantie.')) {
                setChecked({});
                persist({});
              }
            }}
            style={styles.resetBtn}
          >
            ↺ Alle vinkjes resetten
          </button>
        )}

        <div style={styles.progressWrap}>
          <div style={styles.progressTrack}>
            <div style={{ ...styles.progressFill, width: `${pct}%` }} />
          </div>
          <span style={styles.progressLabel}>
            {doneCount}/{total} geregeld
          </span>
        </div>

        <div style={styles.nameRow}>
          <input
            style={styles.nameInput}
            placeholder="Je naam (voor 'laatst bijgewerkt door')"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <span style={styles.saveState}>
            {saving ? 'Opslaan…' : formattedDate ? `${updatedBy ?? 'Iemand'} · ${formattedDate}` : ''}
          </span>
        </div>
      </header>

      {loading ? (
        <p style={styles.loading}>Laden…</p>
      ) : (
        <div style={styles.sections}>
          {SECTIONS.map((section) => {
            const secDone = section.items.filter((i) => checked[i.id]).length;
            return (
              <section key={section.id} style={styles.section}>
                <div style={styles.sectionHead}>
                  <h2 style={styles.sectionTitle}>{section.title}</h2>
                  <span style={styles.sectionCount}>
                    {secDone}/{section.items.length}
                  </span>
                </div>
                <ul style={styles.list}>
                  {section.items.map((item) => {
                    const on = !!checked[item.id];
                    return (
                      <li key={item.id}>
                        <button
                          onClick={() => toggle(item.id)}
                          style={{ ...styles.item, ...(on ? styles.itemOn : {}) }}
                        >
                          <span style={{ ...styles.box, ...(on ? styles.boxOn : {}) }}>
                            {on ? '✓' : ''}
                          </span>
                          <span style={{ ...styles.label, ...(on ? styles.labelOn : {}) }}>
                            {item.label}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      )}

      <footer style={styles.footer}>
        <p>
          Tip: bestel het Crit'Air-vignet ruim op tijd — alleen via de
          officiële site <strong>certificat-air.gouv.fr</strong> (~€3,70).
          Verzending kan weken duren.
        </p>
      </footer>
    </div>
  );
}

// ── Styling ──────────────────────────────────────────────────────────
// De tokens wijzen naar het huispalet uit lib/data.js. Deze twee lijstpagina's
// hadden lang hun eigen kleuren (een mint-teal op bijna-wit) en vielen daardoor
// uit de toon bij de rest van de app.
const teal = COLORS.lake;
const tealSoft = 'rgba(58, 126, 132, 0.12)';
const amber = COLORS.sunset;
const ink = COLORS.charcoal;
const paper = COLORS.cream;      // paginakleur
const kaart = COLORS.creamSoft;  // kaarten en invoervelden erop
const lijn = COLORS.hairline;

const globalCss = `
@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700&family=DM+Sans:wght@400;500;600&display=swap');
* { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
body { margin: 0; }
`;

const styles = {
  page: {
    fontFamily: "'DM Sans', sans-serif",
    background: paper,
    color: ink,
    minHeight: '100vh',
    maxWidth: 640,
    margin: '0 auto',
    padding: '24px 18px 64px',
    backgroundImage:
      'radial-gradient(circle at 1px 1px, rgba(58,126,132,0.07) 1px, transparent 0)',
    backgroundSize: '22px 22px',
  },
  header: { marginBottom: 28 },
  backLink: {
    display: 'inline-block', marginBottom: 14, fontSize: 13, fontWeight: 600,
    color: teal, textDecoration: 'none', padding: '6px 12px 6px 10px',
    background: tealSoft, borderRadius: 99,
  },
  kicker: {
    fontSize: 12, letterSpacing: '0.12em', textTransform: 'uppercase',
    color: teal, fontWeight: 600, margin: '0 0 6px',
  },
  title: {
    fontFamily: "'Fraunces', serif", fontSize: 34, fontWeight: 700,
    lineHeight: 1.05, margin: '0 0 8px',
  },
  sub: { fontSize: 15, lineHeight: 1.5, color: COLORS.ink, margin: '0 0 20px' },
  resetBtn: {
    fontFamily: 'inherit', fontSize: 13, fontWeight: 600,
    padding: '8px 14px', marginBottom: 16,
    background: 'transparent', color: teal,
    border: `1px solid ${teal}`, borderRadius: 999, cursor: 'pointer',
  },
  progressWrap: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 },
  progressTrack: {
    flex: 1, height: 10, background: tealSoft, borderRadius: 999, overflow: 'hidden',
  },
  progressFill: {
    height: '100%', background: teal, borderRadius: 999,
    transition: 'width 0.35s ease',
  },
  progressLabel: { fontSize: 13, fontWeight: 600, color: teal, whiteSpace: 'nowrap' },
  nameRow: { display: 'flex', flexDirection: 'column', gap: 6 },
  nameInput: {
    fontFamily: 'inherit', fontSize: 14, padding: '10px 12px',
    border: `1px solid ${lijn}`, borderRadius: 10, background: kaart, color: ink,
  },
  saveState: { fontSize: 12, color: COLORS.inkLight, minHeight: 16 },
  loading: { color: COLORS.inkLight, fontStyle: 'italic' },
  sections: { display: 'flex', flexDirection: 'column', gap: 22 },
  section: {},
  sectionHead: {
    display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
    marginBottom: 10, paddingBottom: 6, borderBottom: `2px solid ${tealSoft}`,
  },
  sectionTitle: {
    fontFamily: "'Fraunces', serif", fontSize: 19, fontWeight: 600, margin: 0,
  },
  sectionCount: { fontSize: 13, fontWeight: 600, color: COLORS.inkLight },
  list: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 },
  item: {
    width: '100%', display: 'flex', alignItems: 'flex-start', gap: 12,
    padding: '12px 14px', background: kaart, border: `1px solid ${lijn}`,
    borderRadius: 12, cursor: 'pointer', textAlign: 'left',
    fontFamily: 'inherit', transition: 'background 0.15s, border-color 0.15s',
  },
  itemOn: { background: tealSoft, borderColor: tealSoft },
  box: {
    flexShrink: 0, width: 22, height: 22, borderRadius: 6,
    border: `2px solid ${lijn}`, display: 'flex', alignItems: 'center',
    justifyContent: 'center', fontSize: 14, fontWeight: 700, color: kaart,
    background: kaart, marginTop: 1, transition: 'all 0.15s',
  },
  boxOn: { background: teal, borderColor: teal },
  label: { fontSize: 14.5, lineHeight: 1.4, color: ink },
  labelOn: { color: COLORS.ink, textDecoration: 'line-through', textDecorationColor: tealSoft },
  footer: {
    marginTop: 32, padding: '14px 16px', background: 'rgba(201, 125, 93, 0.10)',
    border: `1px solid rgba(201, 125, 93, 0.35)`, borderRadius: 12, fontSize: 13,
    lineHeight: 1.5, color: amber,
  },
};
