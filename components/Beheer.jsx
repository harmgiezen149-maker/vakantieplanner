'use client';

// Alles wat niet bij het dagelijks plannen hoort, op één plek achter het
// beheerderswachtwoord: reservekopieën, het foutenlogboek, en de twee knoppen
// die dingen wissen.
//
// Waarom bij elkaar: dit zijn precies de handelingen waarvan je niet wilt dat
// iedereen die de familie-PIN kent ze per ongeluk uitvoert.

import React, { useState } from 'react';
import Link from 'next/link';
import {
  ChevronLeft, Archive, AlertTriangle, Trash2, Sparkles, ShieldCheck, Share2,
} from 'lucide-react';
import { COLORS } from '@/lib/data';
import BackupBeheer from '@/components/BackupBeheer';
import FoutenLijst from '@/components/FoutenLijst';
import DeelLink from '@/components/DeelLink';

const TABS = [
  { key: 'kopie', label: 'Reservekopieën', icon: Archive },
  { key: 'fouten', label: 'Foutenlogboek', icon: AlertTriangle },
  { key: 'delen', label: 'Meekijk-link', icon: Share2 },
  { key: 'wissen', label: 'Opruimen', icon: Trash2 },
];

export default function Beheer() {
  const [tab, setTab] = useState('kopie');

  return (
    <div style={S.pagina}>
      <header style={S.kop}>
        <Link href="/" style={S.terug}>
          <ChevronLeft size={15} /> Terug naar planner
        </Link>
        <p style={S.kicker}>Vakantie · Beheer</p>
        <h1 style={S.titel}>Beheer</h1>
        <p style={S.uitleg}>
          Reservekopieën, meldingen en opruimen. Deze pagina zit achter een eigen
          wachtwoord omdat je hier dingen kunt terugzetten en wissen.
        </p>
      </header>

      <nav style={S.tabs}>
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            style={{ ...S.tab, ...(tab === key ? S.tabAan : {}) }}
          >
            <Icon size={14} /> {label}
          </button>
        ))}
      </nav>

      <div style={S.inhoud}>
        {tab === 'kopie' && <BackupBeheer ingebed />}
        {tab === 'fouten' && <FoutenLijst ingebed />}
        {tab === 'delen' && <DeelLink />}
        {tab === 'wissen' && <Opruimen />}
      </div>
    </div>
  );
}

// De twee wis-acties staan bewust hier en niet meer alleen in de
// instellingen-sheet van de planner: het zijn de onomkeerbare handelingen.
function Opruimen() {
  return (
    <div style={S.kaarten}>
      <div style={S.kaart}>
        <div style={S.kaartKop}><Sparkles size={16} color={COLORS.forest} /> Nieuwe vakantie starten</div>
        <p style={S.kaartTekst}>
          Wist de planning én je eigen activiteiten, en opent de reisinstellingen voor
          een frisse start. Het verblijvenlogboek, de inpaklijst en de auto-checklist
          blijven staan — de vinkjes reset je daar apart.
        </p>
        <Link href="/?beheer=nieuw" style={S.kaartKnop}>Naar de planner</Link>
      </div>

      <div style={S.kaart}>
        <div style={S.kaartKop}><Trash2 size={16} color={COLORS.forest} /> Hele planning wissen</div>
        <p style={S.kaartTekst}>
          Start met een leeg blad. Eigen activiteiten en reisinstellingen blijven bewaard.
        </p>
        <Link href="/?beheer=wissen" style={S.kaartKnop}>Naar de planner</Link>
      </div>

      <div style={{ ...S.kaart, background: 'transparent', border: `1px dashed ${COLORS.hairline}` }}>
        <div style={S.kaartKop}><ShieldCheck size={16} color={COLORS.slate} /> Voordat je iets wist</div>
        <p style={S.kaartTekst}>
          Maak eerst een reservekopie onder het tabblad hiernaast. Terugzetten kan
          alleen wat er bewaard is.
        </p>
      </div>
    </div>
  );
}

const S = {
  pagina: {
    minHeight: '100vh', background: COLORS.cream,
    fontFamily: "'DM Sans', sans-serif", color: COLORS.charcoal,
    padding: '20px 20px 60px', maxWidth: 720, margin: '0 auto',
  },
  kop: { marginBottom: 18 },
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
  uitleg: { fontSize: 13, lineHeight: 1.55, color: COLORS.ink, margin: 0 },
  tabs: { display: 'flex', gap: 6, marginBottom: 18, flexWrap: 'wrap' },
  tab: {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '9px 14px', borderRadius: 999,
    borderWidth: 1, borderStyle: 'solid', borderColor: COLORS.hairline,
    background: 'transparent',
    color: COLORS.ink, fontFamily: "'DM Sans', sans-serif",
    fontSize: 13, fontWeight: 500, cursor: 'pointer',
  },
  tabAan: { background: COLORS.forest, color: COLORS.cream, borderColor: COLORS.forest, fontWeight: 600 },
  inhoud: { minHeight: 200 },
  kaarten: { display: 'flex', flexDirection: 'column', gap: 12 },
  kaart: {
    background: COLORS.creamSoft, border: `1px solid ${COLORS.hairline}`,
    borderRadius: 14, padding: 16,
  },
  kaartKop: {
    display: 'flex', alignItems: 'center', gap: 8,
    fontFamily: "'Fraunces', serif", fontSize: 16, color: COLORS.forest,
    marginBottom: 6,
  },
  kaartTekst: { fontSize: 13, lineHeight: 1.55, color: COLORS.ink, margin: '0 0 12px' },
  kaartKnop: {
    display: 'inline-block', padding: '9px 14px', borderRadius: 999,
    background: COLORS.forest, color: COLORS.cream,
    fontSize: 13, fontWeight: 600, textDecoration: 'none',
  },
};
