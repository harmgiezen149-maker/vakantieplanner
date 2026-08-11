'use client';

// Terugblik op het verblijvenlogboek: wat je in totaal hebt gedaan, en per
// reis de cijfers erachter. Leest alleen bestaande data — er wordt hier niets
// opgeslagen, dus geen versiecontrole en geen botsingsbalk nodig.

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, Moon, MapPinned, Star, CalendarRange } from 'lucide-react';
import { COLORS } from '@/lib/data';
import { getPin } from '@/lib/maps';
import { stayTypeById } from '@/lib/stayTypes';
import { maakVerslag } from '@/lib/reisverslag';

const cijfer = (n) => (n == null ? '–' : String(n).replace('.', ','));

export default function Reisverslag() {
  const [stays, setStays] = useState(null);
  const [fout, setFout] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/verblijven', {
          headers: { 'X-Family-Pin': getPin() },
          cache: 'no-store',
        });
        if (!res.ok) throw new Error(res.status === 401 ? 'unauthorized' : `HTTP ${res.status}`);
        const data = await res.json();
        setStays(data.stays || []);
      } catch (e) {
        setFout(e.message === 'unauthorized'
          ? 'Geen toegang — open eerst de planner en vul de familie-PIN in.'
          : 'Kon het logboek niet ophalen.');
      }
    })();
  }, []);

  const verslag = useMemo(() => (stays ? maakVerslag(stays) : null), [stays]);

  if (fout) return <Leeg tekst={fout} />;
  if (!verslag) return <Leeg tekst="Laden…" />;
  if (verslag.totaal.aantalVerblijven === 0) {
    return <Leeg tekst="Nog geen verblijven in het logboek. Voeg er een toe op de verblijvenpagina, dan verschijnt hier je terugblik." />;
  }

  const t = verslag.totaal;
  const jaren = t.eersteJaar && t.laatsteJaar && t.eersteJaar !== t.laatsteJaar
    ? `${t.eersteJaar}–${t.laatsteJaar}`
    : (t.laatsteJaar ? String(t.laatsteJaar) : '');

  return (
    <div style={S.pagina}>
      <Link href="/verblijven" style={S.terug}><ChevronLeft size={15} /> Verblijven</Link>
      <p style={S.kicker}>Vakantie · Terugblik</p>
      <h1 style={S.titel}>Waar we zijn geweest</h1>
      {jaren && <p style={S.onder}>{jaren}</p>}

      <div style={S.tegels}>
        <Tegel icoon={<CalendarRange size={16} />} getal={t.aantalReizen} label={t.aantalReizen === 1 ? 'reis' : 'reizen'} />
        <Tegel icoon={<Moon size={16} />} getal={t.nachten} label={t.nachten === 1 ? 'nacht' : 'nachten'} />
        <Tegel icoon={<MapPinned size={16} />} getal={t.landen.length} label={t.landen.length === 1 ? 'land' : 'landen'} />
        <Tegel icoon={<Star size={16} />} getal={cijfer(t.gemiddeldCijfer)} label="gemiddeld" />
      </div>

      {t.landen.length > 0 && (
        <Blok kop="Landen">
          <div style={S.chips}>
            {t.landen.map(l => (
              <span key={l.naam} style={S.chip}>
                {l.naam}{l.aantal > 1 && <b style={S.chipAantal}>{l.aantal}×</b>}
              </span>
            ))}
          </div>
        </Blok>
      )}

      {t.types.length > 0 && (
        <Blok kop="Soort verblijf">
          <div style={S.balken}>
            {t.types.map(x => {
              const soort = stayTypeById(x.naam);
              const breedte = Math.round((x.aantal / t.types[0].aantal) * 100);
              return (
                <div key={x.naam} style={S.balkRij}>
                  <span style={S.balkLabel}>
                    {soort?.emoji || '📍'} {soort?.label || x.naam}
                  </span>
                  <span style={S.balkSpoor}>
                    <span style={{ ...S.balkVulling, width: `${breedte}%` }} />
                  </span>
                  <span style={S.balkGetal}>{x.aantal}</span>
                </div>
              );
            })}
          </div>
        </Blok>
      )}

      {verslag.jaren.length > 1 && (
        <Blok kop="Per jaar">
          <div style={S.balken}>
            {(() => {
              const max = Math.max(...verslag.jaren.map(j => j.nachten), 1);
              return verslag.jaren.map(j => <Jaarbalk key={j.jaar} jaar={j} max={max} />);
            })()}
          </div>
        </Blok>
      )}

      <Blok kop={`${verslag.reizen.length} ${verslag.reizen.length === 1 ? 'reis' : 'reizen'}`}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {verslag.reizen.map(r => <ReisKaart key={r.id} reis={r} />)}
        </div>
      </Blok>
    </div>
  );
}

function ReisKaart({ reis }) {
  return (
    <div style={{ ...S.reis, borderLeft: `3px solid ${reis.kleur}` }}>
      <div style={S.reisKop}>
        <span style={S.reisNaam}>{reis.naam}</span>
        {reis.gemiddeldCijfer != null && (
          <span style={{ ...S.cijferBadge, background: reis.kleur }}>
            {cijfer(reis.gemiddeldCijfer)}
          </span>
        )}
      </div>
      <div style={S.reisMeta}>
        {reis.periode}
        {reis.nachten > 0 && <> · {reis.nachten} {reis.nachten === 1 ? 'nacht' : 'nachten'}</>}
        {' · '}{reis.aantalVerblijven} {reis.aantalVerblijven === 1 ? 'verblijf' : 'verblijven'}
      </div>
      {reis.landen.length > 0 && (
        <div style={S.reisLanden}>
          {reis.landen.map(l => <span key={l.naam}>{l.naam}</span>)}
        </div>
      )}
      {reis.besteVerblijf && (
        <div style={S.reisBeste}>
          <Star size={12} /> Hoogste cijfer: {reis.besteVerblijf.naam} ({cijfer(reis.besteVerblijf.score)})
        </div>
      )}
      {reis.aantalBeoordeeld < reis.aantalVerblijven && (
        <div style={S.reisRest}>
          {reis.aantalVerblijven - reis.aantalBeoordeeld} nog zonder cijfer
        </div>
      )}
    </div>
  );
}

const Tegel = ({ icoon, getal, label }) => (
  <div style={S.tegel}>
    <span style={S.tegelIcoon}>{icoon}</span>
    <span style={S.tegelGetal}>{getal}</span>
    <span style={S.tegelLabel}>{label}</span>
  </div>
);

// Eén jaar in de "Per jaar"-balk, opgedeeld naar reis.
//
// Waarom niet één massieve balk: een jaar met 27 nachten kunnen twee losse
// vakanties zijn geweest, en dat is precies wat je wilt terugzien. De tinten
// wisselen per stukje binnen het jaar, zodat aangrenzende reizen altijd van
// elkaar te onderscheiden zijn; de namen staan eronder in dezelfde volgorde,
// want een gekleurde balk zonder legenda is een raadsel.
const REIS_TINTEN = [COLORS.forest, '#6E9A72', COLORS.moss, '#94B58C'];

const Jaarbalk = ({ jaar, max }) => {
  const delen = jaar.delen?.length ? jaar.delen : [{ id: 'x', naam: '', nachten: jaar.nachten }];
  const gesplitst = jaar.nachten > 0 && delen.length > 1;

  return (
    <div>
      <div style={S.balkRij}>
        <span style={S.balkLabel}>{jaar.jaar}</span>
        <span style={S.balkSpoor}>
          <span style={{
            display: 'flex', height: '100%', width: `${Math.round((jaar.nachten / max) * 100)}%`,
            borderRadius: 99, overflow: 'hidden',
          }}>
            {delen.map((deel, i) => (
              <span
                key={deel.id}
                title={`${deel.naam}: ${deel.nachten} ${deel.nachten === 1 ? 'nacht' : 'nachten'}`}
                style={{
                  display: 'block', height: '100%',
                  flex: `${Math.max(deel.nachten, 0)} 0 0`,
                  background: REIS_TINTEN[i % REIS_TINTEN.length],
                  // Een haarlijntje ertussen, anders lopen twee tinten in elkaar
                  // over bij smalle stukjes.
                  borderLeft: i > 0 ? `1px solid ${COLORS.creamSoft}` : 'none',
                }}
              />
            ))}
          </span>
        </span>
        <span style={S.balkGetal}>{jaar.nachten}&thinsp;n</span>
      </div>
      {gesplitst && (
        <div style={S.jaarLegenda}>
          {delen.map((deel, i) => (
            <span key={deel.id} style={S.jaarLegendaItem}>
              <span style={{ ...S.jaarStip, background: REIS_TINTEN[i % REIS_TINTEN.length] }} />
              {deel.naam} <span style={{ color: COLORS.inkLight }}>{deel.nachten}&thinsp;n</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
};

const Blok = ({ kop, children }) => (
  <section style={{ marginTop: 22 }}>
    <h2 style={S.blokKop}>{kop}</h2>
    {children}
  </section>
);

const Leeg = ({ tekst }) => (
  <div style={S.pagina}>
    <Link href="/verblijven" style={S.terug}><ChevronLeft size={15} /> Verblijven</Link>
    <p style={{ ...S.onder, marginTop: 24 }}>{tekst}</p>
  </div>
);

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
    color: COLORS.forest, margin: '0 0 4px', letterSpacing: '-0.02em',
  },
  onder: { fontSize: 13, color: COLORS.inkLight, margin: 0, lineHeight: 1.55 },
  tegels: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(78px, 1fr))',
    gap: 8, marginTop: 18,
  },
  tegel: {
    background: COLORS.creamSoft, border: `1px solid ${COLORS.hairline}`,
    borderRadius: 14, padding: '12px 8px',
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
  },
  tegelIcoon: { color: COLORS.lake, display: 'flex' },
  tegelGetal: {
    fontFamily: "'Fraunces', serif", fontSize: 22, color: COLORS.forest, fontWeight: 500,
  },
  tegelLabel: { fontSize: 11, color: COLORS.inkLight },
  blokKop: {
    fontFamily: "'Fraunces', serif", fontSize: 17, fontWeight: 500,
    color: COLORS.forest, margin: '0 0 10px',
  },
  chips: { display: 'flex', flexWrap: 'wrap', gap: 6 },
  chip: {
    display: 'inline-flex', alignItems: 'center', gap: 5,
    padding: '6px 11px', borderRadius: 999,
    background: COLORS.creamSoft, border: `1px solid ${COLORS.hairline}`,
    fontSize: 12.5, color: COLORS.ink,
  },
  chipAantal: { color: COLORS.inkLight, fontWeight: 600, fontSize: 11 },
  balken: { display: 'flex', flexDirection: 'column', gap: 7 },
  balkRij: { display: 'flex', alignItems: 'center', gap: 9, fontSize: 12.5 },
  balkLabel: { minWidth: 118, color: COLORS.ink },
  balkSpoor: {
    flex: 1, height: 8, borderRadius: 99,
    background: COLORS.hairline, overflow: 'hidden',
  },
  balkVulling: { display: 'block', height: '100%', background: COLORS.moss, borderRadius: 99 },
  balkGetal: { minWidth: 30, textAlign: 'right', color: COLORS.inkLight, fontVariantNumeric: 'tabular-nums' },
  jaarLegenda: {
    display: 'flex', flexWrap: 'wrap', gap: '2px 12px',
    margin: '3px 0 2px 127px', fontSize: 11, color: COLORS.ink,
  },
  jaarLegendaItem: { display: 'inline-flex', alignItems: 'center', gap: 5 },
  jaarStip: { width: 8, height: 8, borderRadius: 3, display: 'inline-block' },
  reis: {
    background: COLORS.creamSoft, border: `1px solid ${COLORS.hairline}`,
    borderRadius: 13, padding: '12px 14px',
  },
  reisKop: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 },
  reisNaam: {
    flex: 1, fontFamily: "'Fraunces', serif", fontSize: 16,
    color: COLORS.forest, fontWeight: 500,
  },
  cijferBadge: {
    minWidth: 30, textAlign: 'center', padding: '2px 7px', borderRadius: 999,
    color: COLORS.cream, fontSize: 12.5, fontWeight: 700,
  },
  reisMeta: { fontSize: 12, color: COLORS.inkLight },
  reisLanden: { display: 'flex', gap: 8, flexWrap: 'wrap', fontSize: 12, color: COLORS.ink, marginTop: 5 },
  reisBeste: {
    display: 'flex', alignItems: 'center', gap: 5,
    fontSize: 11.5, color: COLORS.moss, marginTop: 6,
  },
  reisRest: { fontSize: 11.5, color: COLORS.inkLight, marginTop: 3 },
};
