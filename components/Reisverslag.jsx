'use client';

// Terugblik op het verblijvenlogboek: wat je in totaal hebt gedaan, en per
// reis de cijfers erachter. Leest alleen bestaande data — er wordt hier niets
// opgeslagen, dus geen versiecontrole en geen botsingsbalk nodig.

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ChevronLeft, Moon, MapPinned, Star, CalendarRange, Route, Tent, Sparkles, Repeat,
} from 'lucide-react';
import { COLORS } from '@/lib/data';
import { getPin } from '@/lib/maps';
import { stayTypeById } from '@/lib/stayTypes';
import { maakVerslag, groepeerLegeJaren } from '@/lib/reisverslag';

const cijfer = (n) => (n == null ? '–' : String(n).replace('.', ','));
// In een kolom cijfers onder elkaar moet "7" er als 7,0 staan, anders springt
// de komma heen en weer en lezen de getallen niet meer als één rij.
const cijfer1 = (n) => (n == null ? '–' : n.toFixed(1).replace('.', ','));
const getal = (n) => (n == null ? '–' : n.toLocaleString('nl-NL'));
const MAANDEN = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];

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
        <Tegel icoon={<Star size={16} />} getal={cijfer(t.gemiddeldCijferGewogen)} label="naar nachten" />
        <Tegel icoon={<Route size={16} />} getal={getal(t.kilometers)} label="km hemelsbreed" />
        {t.langsteVerblijf && (
          <Tegel icoon={<Tent size={16} />} getal={t.langsteVerblijf.nachten} label="langste verblijf" />
        )}
      </div>

      <Kop>In cijfers</Kop>

      {t.landen.length > 0 && (
        <Blok kop="Landen">
          <div style={S.chips}>
            {t.landen.map(l => (
              <span key={l.naam} style={S.chip}>
                {l.naam}
                <b style={S.chipAantal}>{l.nachten}&thinsp;n</b>
                {l.aantal > 1 && <span style={S.chipBij}>{l.aantal}×</span>}
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
              return (
                <Balk
                  key={x.naam}
                  label={`${soort?.emoji || '📍'} ${soort?.label || x.naam}`}
                  deel={x.nachten}
                  max={t.types[0].nachten}
                  getal={`${x.nachten} n`}
                  titel={`${x.aantal} ${x.aantal === 1 ? 'verblijf' : 'verblijven'}, ${x.nachten} nachten`}
                />
              );
            })}
          </div>
        </Blok>
      )}

      {t.cijferPerLand.length > 0 && (
        <Blok kop="Cijfer per land">
          <div style={S.balken}>
            {t.cijferPerLand.map(x => (
              <Balk
                key={x.land}
                label={x.land}
                deel={x.gemiddeld}
                max={10}
                getal={cijfer1(x.gemiddeld)}
                titel={`${x.aantal} ${x.aantal === 1 ? 'verblijf' : 'verblijven'}, ${x.nachten} nachten`}
                bij={`${x.aantal}×`}
              />
            ))}
          </div>
          <p style={S.voetnoot}>
            Het aantal verblijven staat erbij: één 3 weegt anders dan achttien keer een 8.
          </p>
        </Blok>
      )}

      {t.aantalBeoordeeld > 0 && (
        <Blok kop="Welke cijfers we geven">
          <Kolommen
            rij={t.cijferVerdeling.map(x => ({ sleutel: x.cijfer, label: x.cijfer, waarde: x.aantal }))}
            eenheid="×"
          />
        </Blok>
      )}

      <Kop>Door de jaren</Kop>

      {verslag.jaren.length > 1 && (
        <Blok kop="Per jaar">
          <div style={S.balken}>
            {(() => {
              const max = Math.max(...verslag.jaren.map(j => j.nachten), 1);
              return groepeerLegeJaren(verslag.jaren).map(rij => (
                rij.type === 'gat'
                  ? <Gat key={`gat-${rij.van}`} gat={rij} />
                  : <Jaarbalk key={rij.jaar.jaar} jaar={rij.jaar} max={max} />
              ));
            })()}
          </div>
        </Blok>
      )}

      {t.nachten > 0 && (
        <Blok kop="Wanneer we weg zijn">
          <Kolommen
            rij={t.maanden.map(x => ({ sleutel: x.maand, label: MAANDEN[x.maand - 1], waarde: x.nachten }))}
            eenheid=" nachten"
            smal
          />
        </Blok>
      )}

      {verslag.nieuweLanden.length > 0 && (
        <Blok kop="Voor het eerst">
          <div style={S.tijdlijn}>
            {verslag.nieuweLanden.map(x => (
              <div key={x.id} style={S.tijdlijnRij}>
                <span style={S.tijdlijnJaar}><Sparkles size={11} /> {x.jaar}</span>
                <span style={S.tijdlijnTekst}>
                  <b style={S.tijdlijnLanden}>{x.landen.join(' · ')}</b>
                  <span style={S.tijdlijnReis}>{x.reis}</span>
                </span>
              </div>
            ))}
          </div>
        </Blok>
      )}

      {verslag.terugkerendePlekken.length > 0 && (
        <Blok kop="Hier kwamen we vaker">
          <div style={S.tijdlijn}>
            {verslag.terugkerendePlekken.map(p => (
              <div key={p.id} style={S.tijdlijnRij}>
                <span style={S.tijdlijnJaar}><Repeat size={11} /> {p.keren}×</span>
                <span style={S.tijdlijnTekst}>
                  <b style={S.tijdlijnLanden}>{p.naam}</b>
                  <span style={S.tijdlijnReis}>
                    {p.bezoeken.map(b => b.jaar).join(' · ')}
                    {/* Onder de twee kilometer is het dezelfde plek; daarboven
                        moet je kunnen zien dat het "in de buurt" was. */}
                    {p.spreidingKm >= 2 && ` — ${cijfer(p.spreidingKm)} km uit elkaar`}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </Blok>
      )}

      <Kop>De reizen</Kop>

      <Blok kop={`${verslag.reizen.length} ${verslag.reizen.length === 1 ? 'reis' : 'reizen'}`}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {verslag.reizen.map(r => <ReisKaart key={r.id} reis={r} />)}
        </div>
      </Blok>
    </div>
  );
}

// Eén balkregel: label, spoor, getal. Alle blokken op deze pagina gebruiken
// dezelfde vorm, zodat je ze naast elkaar kunt lezen.
const Balk = ({ label, deel, max, getal: rechts, titel, bij }) => (
  <div style={S.balkRij} title={titel}>
    <span style={S.balkLabel}>
      {label}
      {bij && <span style={S.balkBij}>{bij}</span>}
    </span>
    <span style={S.balkSpoor}>
      <span style={{ ...S.balkVulling, width: `${Math.round((deel / (max || 1)) * 100)}%` }} />
    </span>
    <span style={S.balkGetal}>{rechts}</span>
  </div>
);

// Een compacte kolommenrij: twaalf maanden of tien cijfers passen zo naast
// elkaar op een telefoon, waar twaalf balkregels onder elkaar een scrollpartij
// zouden zijn. Lege kolommen blijven staan — dat een maand nul is, is nieuws.
const Kolommen = ({ rij, eenheid, smal }) => {
  const max = Math.max(...rij.map(x => x.waarde), 1);
  return (
    <div style={S.kolommen}>
      {rij.map(x => (
        <div key={x.sleutel} style={S.kolom} title={`${x.label}: ${x.waarde}${eenheid}`}>
          <span style={S.kolomGetal}>{x.waarde || ''}</span>
          <span style={S.kolomSpoor}>
            <span style={{
              ...S.kolomVulling,
              // Een kolom met één treffer moet zichtbaar blijven naast een
              // kolom met twaalf — anders lijkt "één keer een 3" op "nooit".
              height: `${Math.max(Math.round((x.waarde / max) * 100), x.waarde ? 7 : 0)}%`,
            }} />
          </span>
          <span style={{ ...S.kolomLabel, fontSize: smal ? 9.5 : 11 }}>{x.label}</span>
        </div>
      ))}
    </div>
  );
};

// Een reeks jaren waarin je niet weg bent geweest, samengevouwen tot één regel.
const Gat = ({ gat }) => (
  <div style={S.balkRij}>
    <span style={{ ...S.balkLabel, color: COLORS.inkLight }}>{gat.van} – {gat.tot}</span>
    <span style={{ ...S.balkSpoor, background: 'transparent', borderTop: `1px dashed ${COLORS.hairline}` }} />
    <span style={{ ...S.balkGetal, fontSize: 11 }}>{gat.aantal} jaar</span>
  </div>
);

const Kop = ({ children }) => <h2 style={S.sectieKop}>{children}</h2>;

function ReisKaart({ reis }) {
  return (
    <div style={{ ...S.reis, borderLeft: `3px solid ${reis.kleur}` }}>
      <div style={S.reisKop}>
        <span style={S.reisNaam}>{reis.naam}</span>
        {reis.gemiddeldCijferGewogen != null && (
          <span
            style={{ ...S.cijferBadge, background: reis.kleur }}
            title={`Gewogen naar nachten. Ongewogen: ${cijfer(reis.gemiddeldCijfer)}`}
          >
            {cijfer(reis.gemiddeldCijferGewogen)}
          </span>
        )}
      </div>
      <div style={S.reisMeta}>
        {reis.periode}
        {reis.nachten > 0 && <> · {reis.nachten} {reis.nachten === 1 ? 'nacht' : 'nachten'}</>}
        {' · '}{reis.aantalVerblijven} {reis.aantalVerblijven === 1 ? 'verblijf' : 'verblijven'}
        {reis.kilometers > 0 && <> · {getal(reis.kilometers)} km</>}
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
  // Een overgeslagen jaar hoort er wél te staan — anders verspringt de as en
  // zie je niet dat je een jaar niet weg bent geweest — maar het mag niet even
  // hard roepen als een jaar waarin je wel ging. Let op: nul nachten is niet
  // hetzelfde als niet weg geweest; een verblijf uit het hoofd ("zomer 2003")
  // heeft geen nachten maar wél een reis.
  const leeg = jaar.nachten === 0 && jaar.reizen === 0;

  return (
    <div>
      <div
        style={S.balkRij}
        title={`${jaar.jaar} · ${jaar.nachten} ${jaar.nachten === 1 ? 'nacht' : 'nachten'}`
          + (jaar.reizen ? ` · ${jaar.reizen} ${jaar.reizen === 1 ? 'reis' : 'reizen'}` : ' · niet weg geweest')}
      >
        <span style={{ ...S.balkLabel, color: leeg ? COLORS.inkLight : COLORS.ink }}>{jaar.jaar}</span>
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
        <span style={{ ...S.balkGetal, color: leeg ? COLORS.hairline : COLORS.inkLight }}>
          {leeg ? '–' : <>{jaar.nachten}&thinsp;n</>}
        </span>
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
  chipAantal: { color: COLORS.forest, fontWeight: 700, fontSize: 11 },
  chipBij: { color: COLORS.inkLight, fontSize: 10.5 },
  // Een tussenkop boven een groep blokken. De pagina is lang geworden; zonder
  // deze rustpunten loopt "hoeveel" ongemerkt over in "wat voor".
  sectieKop: {
    fontSize: 11, letterSpacing: 1.4, textTransform: 'uppercase',
    color: COLORS.lake, fontWeight: 600,
    margin: '30px 0 -4px', paddingTop: 12,
    borderTop: `1px solid ${COLORS.hairline}`,
  },
  voetnoot: { fontSize: 11, color: COLORS.inkLight, margin: '8px 0 0', lineHeight: 1.5 },
  balken: { display: 'flex', flexDirection: 'column', gap: 7 },
  balkRij: { display: 'flex', alignItems: 'center', gap: 9, fontSize: 12.5 },
  balkLabel: {
    minWidth: 118, maxWidth: 118, color: COLORS.ink,
    display: 'flex', alignItems: 'baseline', gap: 5,
    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
  },
  balkBij: { color: COLORS.inkLight, fontSize: 10.5 },
  balkSpoor: {
    flex: 1, height: 8, borderRadius: 99,
    background: COLORS.hairline, overflow: 'hidden',
  },
  balkVulling: { display: 'block', height: '100%', background: COLORS.moss, borderRadius: 99 },
  balkGetal: { minWidth: 30, textAlign: 'right', color: COLORS.inkLight, fontVariantNumeric: 'tabular-nums' },
  kolommen: {
    display: 'flex', alignItems: 'flex-end', gap: 3,
    background: COLORS.creamSoft, border: `1px solid ${COLORS.hairline}`,
    borderRadius: 13, padding: '10px 8px 8px',
  },
  kolom: {
    flex: 1, minWidth: 0,
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
  },
  kolomGetal: {
    fontSize: 10, color: COLORS.inkLight, minHeight: 13,
    fontVariantNumeric: 'tabular-nums',
  },
  kolomSpoor: {
    width: '100%', height: 54, display: 'flex', alignItems: 'flex-end',
    background: COLORS.hairline, borderRadius: 4, overflow: 'hidden',
  },
  kolomVulling: { display: 'block', width: '100%', background: COLORS.moss, borderRadius: 4 },
  kolomLabel: { color: COLORS.ink, whiteSpace: 'nowrap' },
  tijdlijn: { display: 'flex', flexDirection: 'column', gap: 7 },
  tijdlijnRij: { display: 'flex', alignItems: 'baseline', gap: 10, fontSize: 12.5 },
  tijdlijnJaar: {
    display: 'inline-flex', alignItems: 'center', gap: 4,
    minWidth: 58, color: COLORS.lake, fontWeight: 600,
    fontVariantNumeric: 'tabular-nums',
  },
  tijdlijnTekst: { display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 },
  tijdlijnLanden: { color: COLORS.ink, fontWeight: 500 },
  tijdlijnReis: { fontSize: 11, color: COLORS.inkLight },
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
