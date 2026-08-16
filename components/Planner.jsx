'use client';

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import Link from 'next/link';
import {
  Plus, X, Trash2, Sparkles, Calendar as CalendarIcon,
  ChevronRight, RefreshCw, User, Wifi, WifiOff, Check, AlertCircle, MapPin, Map as MapIcon,
  Pencil, Car, ChevronUp, ChevronDown, CheckSquare, Backpack,
  Settings, CalendarRange, Compass, Star, ShieldCheck, Wallet, Crosshair,
  Route, Loader2, Flag, Play, Footprints, HelpCircle, History, Filter,
} from 'lucide-react';
import {
  COLORS, CATEGORIES, CATEGORY_ORDER, DEFAULT_ACTIVITIES,
  DEFAULT_TRIP_CONFIG, isTripConfigured, staysWithColors, buildDays, formatPeriod,
  getMapsLink, applyLocationOverride, formatDistance, formatDuration,
  huidigVerblijf, verblijfPerActiviteit,
} from '@/lib/data';
import { useRoute } from '@/lib/useRoute';
import {
  optimaliseerVolgorde, kostenUitMatrix, hemelsbreed, kiesVervoer, routePunten,
} from '@/lib/volgorde';
import { useWeer } from '@/lib/useWeer';
import { formatTemp } from '@/lib/weer';
import { getPin } from '@/lib/maps';
import { archiveTripStays } from '@/lib/stayLog';
import ConflictMelding from '@/components/ConflictMelding';
import OfflineMelding from '@/components/OfflineMelding';
import { bewaarLokaal, leesLokaal } from '@/lib/offline';

// De sheets staan sinds de opsplitsing in components/planner/. Ze hangen
// alleen aan hun props — geen enkele leest de state van Planner — dus ze
// konden er los uit. Wat hier blijft is het planscherm zelf.
import Sheet from '@/components/planner/Sheet';
import { PickActivitySheet, PickDaySheet } from '@/components/planner/PickSheets';
import TripSettingsSheet from '@/components/planner/TripSettingsSheet';
import CustomActivityForm from '@/components/planner/CustomActivityForm';
import LocationEditSheet from '@/components/planner/LocationEditSheet';
import ConfirmSheet from '@/components/planner/ConfirmSheet';
import PasteLinkSheet from '@/components/planner/PasteLinkSheet';
import InDeBuurtSheet from '@/components/planner/InDeBuurtSheet';
import SuggestionsSheet from '@/components/planner/SuggestionsSheet';

// ============ API CLIENT ============

const getName = () => {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem('planner-name') || '';
};

// Vandaag als 'YYYY-MM-DD', in de tijdzone van het apparaat. Bewust niet via
// toISOString(): dat is UTC, en dan is het hier tussen middernacht en twee uur
// 's nachts nog "gisteren" — precies wanneer je de planning voor morgen bekijkt.
const vandaagKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const setNameLS = (name) => {
  if (typeof window === 'undefined') return;
  localStorage.setItem('planner-name', name);
};

async function apiGet() {
  const res = await fetch('/api/plan', {
    method: 'GET',
    headers: { 'X-Family-Pin': getPin() },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(res.status === 401 ? 'unauthorized' : `HTTP ${res.status}`);
  return res.json();
}

// basisVersie is de updatedAt waarop deze wijziging is gebaseerd; laat hem weg
// om zonder controle te schrijven ("toch de mijne opslaan" na een botsing).
async function apiPut(plan, customActivities, locationOverrides, tripConfig, suggestExclusions, routeAnkers, name, basisVersie) {
  const res = await fetch('/api/plan', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'X-Family-Pin': getPin(),
    },
    body: JSON.stringify({
      plan, customActivities, locationOverrides, tripConfig, suggestExclusions,
      routeAnkers, updatedBy: name || null, basisVersie,
    }),
  });
  if (res.status === 409) {
    const info = await res.json().catch(() => ({}));
    const err = new Error('conflict');
    err.conflict = info;
    throw err;
  }
  if (!res.ok) throw new Error(res.status === 401 ? 'unauthorized' : `HTTP ${res.status}`);
  return res.json();
}

// ============ TOPO BACKGROUND ============

const TopoBackground = () => (
  <svg
    style={{
      position: 'fixed', inset: 0, width: '100%', height: '100%',
      pointerEvents: 'none', zIndex: 0, opacity: 0.6,
    }}
    aria-hidden="true"
  >
    <defs>
      <pattern id="topo" x="0" y="0" width="320" height="320" patternUnits="userSpaceOnUse">
        <path d="M -20 80 Q 60 40 140 70 T 320 90" fill="none" stroke={COLORS.forest} strokeWidth="0.6" opacity="0.10" />
        <path d="M -20 130 Q 80 100 160 125 T 340 135" fill="none" stroke={COLORS.forest} strokeWidth="0.6" opacity="0.08" />
        <path d="M -20 190 Q 100 150 180 180 T 340 200" fill="none" stroke={COLORS.lake} strokeWidth="0.6" opacity="0.10" />
        <path d="M -20 250 Q 70 220 150 240 T 340 250" fill="none" stroke={COLORS.forest} strokeWidth="0.6" opacity="0.07" />
      </pattern>
    </defs>
    <rect width="100%" height="100%" fill="url(#topo)" />
  </svg>
);

// ============ HEADER ============

const Header = ({ tripConfig, stays, totalDays, stats, name, onNameChange, syncStatus, lastUpdate, onRefresh, onOpenTripSettings }) => {
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState(name);

  useEffect(() => { setDraftName(name); }, [name]);

  const saveName = () => {
    onNameChange(draftName.trim().slice(0, 30));
    setEditingName(false);
  };

  const stayNames = stays.map(s => s.name).filter(Boolean).join(' · ');
  const period = formatPeriod(tripConfig);
  const ingesteld = isTripConfigured(tripConfig);
  // Drie of meer verblijfsnamen achter elkaar breken op een telefoon lelijk af;
  // dan liever het aantal. De namen staan voluit in de reisinstellingen.
  const onderschrift = stays.length > 2
    ? [`${stays.length} verblijven`, period].filter(Boolean).join(' · ')
    : [stayNames, period].filter(Boolean).join(' · ');

  return (
    <header style={{ padding: '22px 20px 10px', position: 'relative', zIndex: 1 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span style={{
          fontSize: 11, letterSpacing: 2, textTransform: 'uppercase',
          color: COLORS.lake, fontWeight: 600,
        }}>
          Familie · Vakantieplanner
        </span>
        <span style={{ flex: 1, height: 1, background: COLORS.hairline }} />
        <SyncIndicator status={syncStatus} onRefresh={onRefresh} />
      </div>

      <h1 style={{
        fontFamily: "'Fraunces', serif",
        fontSize: 32, lineHeight: 1.08, margin: 0,
        color: COLORS.forest, fontWeight: 500, letterSpacing: '-0.02em',
      }}>
        {tripConfig.title || 'Onze vakantie'}
      </h1>

      {ingesteld ? (
        <p style={{ margin: '8px 0 0', color: COLORS.ink, fontSize: 13, lineHeight: 1.5 }}>
          {onderschrift}
        </p>
      ) : (
        // Zonder reis is dit de enige plek in beeld die naar de instellingen
        // wijst — de sheet gaat bij een eerste bezoek vanzelf open, maar wie
        // hem wegklikt moet er terug kunnen komen.
        <button
          onClick={onOpenTripSettings}
          style={{
            margin: '8px 0 0', padding: 0, border: 'none', background: 'transparent',
            color: COLORS.lake, fontSize: 13, lineHeight: 1.5, cursor: 'pointer',
            fontFamily: "'DM Sans', sans-serif", fontWeight: 600, textAlign: 'left',
            display: 'inline-flex', alignItems: 'center', gap: 5,
          }}
        >
          <Settings size={14} /> Stel de reis in
        </button>
      )}

      {/* Eén raster in plaats van een kolom knoppen: op een telefoon drie per
          rij, op een breed scherm passen ze in één rij. Dat scheelt bijna een
          half scherm voordat de planning begint. */}
      <nav style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(96px, 1fr))',
        gap: 8, marginTop: 16,
      }}>
        {[
          { href: '/dag', icon: <CalendarIcon size={19} />, label: 'Dagen' },
          { href: '/kaart', icon: <MapIcon size={19} />, label: 'Kaart' },
          { href: '/checklist', icon: <CheckSquare size={19} />, label: 'Checklist' },
          { href: '/inpakken', icon: <Backpack size={19} />, label: 'Inpakken' },
          { href: '/verblijven', icon: <Star size={19} />, label: 'Verblijven' },
          { href: '/uitgaven', icon: <Wallet size={19} />, label: 'Uitgaven' },
          { href: '/uitleg', icon: <HelpCircle size={19} />, label: 'Uitleg' },
        ].map((b) => (
          <Link
            key={b.href}
            href={b.href}
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', gap: 6,
              padding: '12px 6px',
              background: 'rgba(58, 126, 132, 0.10)',
              color: COLORS.forest,
              borderRadius: 14,
              textDecoration: 'none',
              fontFamily: "'DM Sans', sans-serif",
              fontSize: 12.5, fontWeight: 600,
              textAlign: 'center',
            }}
          >
            <span style={{ color: COLORS.lake, display: 'flex' }}>{b.icon}</span>
            <span>{b.label}</span>
          </Link>
        ))}
      </nav>

      <div style={{ display: 'flex', gap: 14, marginTop: 14, fontSize: 13, alignItems: 'flex-end' }}>
        <div>
          <div style={{ fontFamily: "'Fraunces', serif", fontSize: 22, color: COLORS.forest, fontWeight: 500 }}>
            {stats.totalActivities}
          </div>
          <div style={{ color: COLORS.inkLight, fontSize: 10, letterSpacing: 0.5, textTransform: 'uppercase' }}>
            Activiteiten
          </div>
        </div>
        <div style={{ width: 1, background: COLORS.hairline, alignSelf: 'stretch' }} />
        <div>
          <div style={{ fontFamily: "'Fraunces', serif", fontSize: 22, color: COLORS.forest, fontWeight: 500 }}>
            {stats.daysWithActivities}<span style={{ color: COLORS.inkLight, fontSize: 14 }}>/{totalDays}</span>
          </div>
          <div style={{ color: COLORS.inkLight, fontSize: 10, letterSpacing: 0.5, textTransform: 'uppercase' }}>
            Dagen vol
          </div>
        </div>
        <div style={{ flex: 1 }} />

        {/* Wie ben je */}
        <div style={{ textAlign: 'right' }}>
          {!editingName ? (
            <button
              onClick={() => setEditingName(true)}
              style={{
                background: 'transparent', border: 'none', cursor: 'pointer',
                color: COLORS.ink, fontSize: 12, padding: 0,
                display: 'flex', alignItems: 'center', gap: 5,
                fontFamily: "'DM Sans', sans-serif",
              }}
            >
              <User size={12} /> {name || 'Wie ben je?'}
            </button>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <input
                type="text"
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && saveName()}
                onBlur={saveName}
                placeholder="Naam"
                autoFocus
                style={{
                  width: 100, padding: '4px 8px',
                  background: COLORS.creamSoft,
                  border: `1px solid ${COLORS.hairline}`,
                  borderRadius: 6, fontSize: 12,
                  fontFamily: "'DM Sans', sans-serif",
                  color: COLORS.charcoal,
                }}
              />
            </div>
          )}
          {lastUpdate && (
            <div style={{ fontSize: 10, color: COLORS.inkLight, marginTop: 4 }}>
              {lastUpdate}
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

// ============ SYNC INDICATOR ============

const SyncIndicator = ({ status, onRefresh }) => {
  const map = {
    syncing: { icon: <RefreshCw size={11} style={{ animation: 'spin 1s linear infinite' }} />, label: 'Syncen', color: COLORS.ink },
    synced: { icon: <Check size={11} />, label: 'Synced', color: COLORS.moss },
    offline: { icon: <WifiOff size={11} />, label: 'Offline', color: '#B5443B' },
    idle: { icon: <Wifi size={11} />, label: '', color: COLORS.inkLight },
  };
  const cur = map[status] || map.idle;
  return (
    <button
      onClick={onRefresh}
      style={{
        background: 'transparent', border: 'none', cursor: 'pointer',
        display: 'flex', alignItems: 'center', gap: 4,
        fontSize: 10, color: cur.color, padding: 4,
        fontFamily: "'DM Sans', sans-serif",
        letterSpacing: 0.3,
      }}
      title="Klik om te verversen"
    >
      {cur.icon}
      <style>{`@keyframes spin { from { transform: rotate(0); } to { transform: rotate(360deg); } }`}</style>
      {cur.label}
    </button>
  );
};

// ============ TAB BAR ============

const TabBar = ({ active, setActive }) => (
  <div style={{
    position: 'sticky', top: 0, zIndex: 10,
    background: COLORS.cream,
    padding: '8px 20px 0',
    borderBottom: `1px solid ${COLORS.hairline}`,
  }}>
    <div style={{ display: 'flex', gap: 4 }}>
      {[
        { key: 'plan', label: 'Planning', icon: CalendarIcon },
        { key: 'library', label: 'Activiteiten', icon: Sparkles },
      ].map(({ key, label, icon: Icon }) => {
        const isActive = active === key;
        return (
          <button
            key={key}
            onClick={() => setActive(key)}
            style={{
              flex: 1, border: 'none', background: 'transparent',
              padding: '12px 0',
              fontFamily: "'DM Sans', sans-serif", fontSize: 14,
              fontWeight: isActive ? 600 : 500,
              color: isActive ? COLORS.forest : COLORS.inkLight,
              cursor: 'pointer',
              borderBottom: `2px solid ${isActive ? COLORS.forest : 'transparent'}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              transition: 'all 0.2s ease',
            }}
          >
            <Icon size={16} />
            {label}
          </button>
        );
      })}
    </div>
  </div>
);

// ============ ACTIVITY CHIP ============

const ActivityChip = ({ activity, dayKey, days, rol, onZetAnker, onRemove, onEditLocation, onMoveUp, onMoveDown, canMoveUp, canMoveDown, onUpdateProps, onMoveToDay }) => {
  const cat = CATEGORIES[activity.category] || CATEGORIES.custom;
  const mapsLink = getMapsLink(activity);
  const [open, setOpen] = useState(false);
  return (
   <div>
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6,
      background: COLORS.creamSoft,
      borderRadius: open ? '10px 10px 0 0' : 10,
      padding: '10px 10px 10px 6px',
      borderLeft: `3px solid ${activity.important ? COLORS.sunset : cat.color}`,
      boxShadow: '0 1px 2px rgba(31,41,34,0.04)',
    }}>
      {/* Volgorde-knoppen */}
      <div style={{
        display: 'flex', flexDirection: 'column', gap: 1,
        flexShrink: 0,
      }}>
        <button
          onClick={onMoveUp}
          disabled={!canMoveUp}
          style={{
            border: 'none', background: 'transparent',
            cursor: canMoveUp ? 'pointer' : 'default',
            color: canMoveUp ? COLORS.ink : COLORS.hairline,
            padding: '1px 2px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            opacity: canMoveUp ? 1 : 0.35,
          }}
          aria-label="Omhoog"
          title="Omhoog"
        >
          <ChevronUp size={14} />
        </button>
        <button
          onClick={onMoveDown}
          disabled={!canMoveDown}
          style={{
            border: 'none', background: 'transparent',
            cursor: canMoveDown ? 'pointer' : 'default',
            color: canMoveDown ? COLORS.ink : COLORS.hairline,
            padding: '1px 2px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            opacity: canMoveDown ? 1 : 0.35,
          }}
          aria-label="Omlaag"
          title="Omlaag"
        >
          <ChevronDown size={14} />
        </button>
      </div>

      <span style={{ fontSize: 18 }}>{activity.emoji}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 14, fontWeight: 500, color: COLORS.charcoal,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          display: 'flex', alignItems: 'center', gap: 5,
        }}>
          {activity.important && <span style={{ color: COLORS.sunset, fontSize: 13 }}>★</span>}
          {/* Vast punt in de route van deze dag — zichtbaar zonder uitklappen */}
          {rol && (
            <span
              title={rol === 'start' ? 'Startpunt van deze dag' : 'Eindpunt van deze dag'}
              style={{
                flexShrink: 0, display: 'inline-flex', alignItems: 'center',
                color: COLORS.lake,
              }}
            >{rol === 'start' ? <Play size={10} fill={COLORS.lake} /> : <Flag size={11} />}</span>
          )}
          <span style={{
            overflow: 'hidden', textOverflow: 'ellipsis',
            // Bezocht = gedaan. Doorstrepen zou "geschrapt" suggereren, dus
            // alleen wat gedempter, met het vinkje ernaast als het echte teken.
            opacity: activity.visited ? 0.75 : 1,
          }}>{activity.name}</span>
        </div>
        {activity.note && (
          <div style={{ fontSize: 11, color: COLORS.inkLight, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{activity.note}</div>
        )}
      </div>
      {/* Werkelijk bezocht. Zit op de activiteit, niet op de dag — dezelfde
          activiteit op twee dagen deelt dus deze vlag (valkuil 1). */}
      <button
        onClick={() => onUpdateProps(activity.id, { visited: !activity.visited })}
        style={{
          border: 'none', cursor: 'pointer', padding: 4, borderRadius: 6,
          background: activity.visited ? `${COLORS.moss}22` : 'transparent',
          color: activity.visited ? COLORS.moss : COLORS.inkLight,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          opacity: activity.visited ? 1 : 0.55,
        }}
        aria-label={activity.visited ? 'Toch niet bezocht' : 'Markeren als bezocht'}
        title={activity.visited ? 'Bezocht — tik om terug te draaien' : 'Markeren als bezocht'}
      >
        <Check size={15} />
      </button>
      <button
        onClick={() => onEditLocation(activity)}
        style={{
          border: 'none', background: 'transparent', cursor: 'pointer',
          color: activity.coords ? cat.color : COLORS.inkLight,
          padding: 4, borderRadius: 6,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          opacity: activity.coords ? 1 : 0.55,
        }}
        aria-label={activity.coords ? 'Locatie bewerken' : 'Locatie toevoegen'}
        title={activity.coords ? 'Locatie bewerken' : 'Locatie toevoegen'}
      >
        <Pencil size={13} />
      </button>
      {mapsLink && (
        <a
          href={mapsLink}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            color: cat.color, padding: 4, borderRadius: 6,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            textDecoration: 'none',
          }}
          aria-label="Open in Google Maps"
          title="Open in Google Maps"
        >
          <MapPin size={15} />
        </a>
      )}
      <button
        onClick={onRemove}
        style={{
          border: 'none', background: 'transparent', cursor: 'pointer',
          color: COLORS.inkLight, padding: 4, borderRadius: 6,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
        aria-label="Verwijderen"
      >
        <X size={16} />
      </button>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          border: 'none', background: open ? `${cat.color}22` : 'transparent',
          cursor: 'pointer', color: open ? cat.color : COLORS.inkLight,
          padding: 4, borderRadius: 6,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
        aria-label="Bewerken"
        title="Bewerken"
      >
        {open ? <ChevronUp size={16} /> : <Pencil size={14} />}
      </button>
    </div>

    {open && (
      <div style={{
        background: COLORS.creamSoft, borderRadius: '0 0 10px 10px',
        borderLeft: `3px solid ${activity.important ? COLORS.sunset : cat.color}`,
        padding: '4px 12px 14px', marginTop: -1,
        display: 'flex', flexDirection: 'column',
      }}>
        <label style={chipEditLabel}>Naam</label>
        <input
          style={chipEditInput}
          defaultValue={activity.name}
          key={`n-${activity.id}-${activity.name}`}
          onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== activity.name) onUpdateProps(activity.id, { name: v.slice(0, 80) }); }}
          onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }}
        />

        {onZetAnker && (
          <>
            <label style={chipEditLabel}>Rol in de route van deze dag</label>
            <div style={{ display: 'flex', gap: 6 }}>
              {[
                { id: null, label: 'Vrij' },
                { id: 'start', label: 'Start' },
                { id: 'eind', label: 'Eind' },
              ].map(r => {
                const aan = rol === r.id;
                return (
                  <button
                    key={r.label}
                    onClick={() => onZetAnker(r.id)}
                    style={{
                      flex: 1, padding: '8px 6px', borderRadius: 9, cursor: 'pointer',
                      borderWidth: 1, borderStyle: 'solid',
                      borderColor: aan ? COLORS.lake : COLORS.hairline,
                      background: aan ? `${COLORS.lake}18` : COLORS.cream,
                      color: aan ? COLORS.lake : COLORS.ink,
                      fontFamily: "'DM Sans', sans-serif", fontSize: 12.5,
                      fontWeight: aan ? 700 : 500,
                    }}
                  >{r.label}</button>
                );
              })}
            </div>
            <div style={{ fontSize: 11, color: COLORS.inkLight, marginTop: 5, lineHeight: 1.45 }}>
              “Slimme volgorde” houdt het startpunt vooraan en het eindpunt
              achteraan — handig bij een stadsbezoek: parkeren waar je begint,
              eten waar je eindigt.
            </div>
          </>
        )}

        <label style={chipEditLabel}>Verplaats naar dag</label>
        <select
          style={chipEditInput}
          value={dayKey}
          onChange={(e) => { if (e.target.value !== dayKey) onMoveToDay(e.target.value); }}
        >
          {(days || []).map(d => (
            <option key={d.key} value={d.key}>
              {d.dayShort} {d.date}{d.label ? ` · ${d.label}` : ''}
            </option>
          ))}
        </select>

        <label style={{ ...chipEditLabel, display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginTop: 10, textTransform: 'none', fontSize: 13, fontWeight: 500, color: COLORS.charcoal }}>
          <input
            type="checkbox"
            checked={!!activity.important}
            onChange={() => onUpdateProps(activity.id, { important: !activity.important })}
            style={{ width: 16, height: 16, accentColor: COLORS.sunset }}
          />
          Hoofdactiviteit (belangrijk)
        </label>

        <label style={chipEditLabel}>Notitie</label>
        <textarea
          style={{ ...chipEditInput, minHeight: 56, resize: 'vertical', fontFamily: "'DM Sans', sans-serif" }}
          defaultValue={activity.note || ''}
          key={`note-${activity.id}`}
          placeholder="Extra info, bv. reserveren, openingstijden, meenemen…"
          onBlur={(e) => { if ((e.target.value || '') !== (activity.note || '')) onUpdateProps(activity.id, { note: e.target.value.slice(0, 500) }); }}
        />
      </div>
    )}
   </div>
  );
};

const chipEditLabel = {
  fontSize: 11, fontWeight: 600, color: COLORS.inkLight,
  textTransform: 'uppercase', letterSpacing: '0.05em', margin: '10px 0 4px',
};
const chipEditInput = {
  fontFamily: "'DM Sans', sans-serif", fontSize: 14, padding: '9px 11px',
  border: `1px solid ${COLORS.hairline}`, borderRadius: 10,
  background: COLORS.cream, color: COLORS.charcoal,
  width: '100%', boxSizing: 'border-box',
};

// Linkjes in de melding onder "Slimme volgorde"
const slimLink = {
  border: 'none', background: 'transparent', padding: 0, cursor: 'pointer',
  color: COLORS.forest, fontFamily: "'DM Sans', sans-serif",
  fontSize: 11.5, fontWeight: 700, textDecoration: 'underline',
  whiteSpace: 'nowrap',
};

// ============ DAY CARD ============

const DayCard = ({ day, days: allDays, activities, activityById, plan: planRef, weer, anker, offline, gemarkeerd, kaartRef, onAddClick, onRemove, onEditLocation, onMove, onUpdateProps, onMoveToDay, onSwapDay, onOptimaliseer, onZetVolgorde, onZetAnker }) => {
  const [swapping, setSwapping] = useState(false);
  // Uitkomst van de laatste optimalisatie: { tekst, vorige } | null
  const [slim, setSlim] = useState(null);
  const [bezig, setBezig] = useState(false);
  const hasActivities = activities.length > 0;
  const stay = day.stay;

  // Twee stops met een locatie is het minimum om iets te kunnen omgooien.
  const teOrdenen = activities.filter(id => Array.isArray(activityById[id]?.coords)).length;

  const slimmeVolgorde = async (keuze) => {
    setBezig(true);
    setSlim(null);
    try {
      const uit = await onOptimaliseer(day.key, keuze);
      // Zeggen wát hij deed: te voet of met de auto, en of dat op echte
      // routes was of hemelsbreed. Anders is het magie.
      const hoe = uit.vervoer === 'lopen'
        ? (uit.echt ? 'lopen' : 'lopen, hemelsbreed')
        : (uit.echt ? 'rijden' : 'rijden, hemelsbreed');
      const zonder = uit.zonderLocatie
        ? ` · ${uit.zonderLocatie} zonder locatie ${uit.zonderLocatie === 1 ? 'staat' : 'staan'} onderaan`
        : '';
      const anders = uit.vervoer === 'lopen' ? 'rijden' : 'lopen';
      if (!uit.gewijzigd) {
        setSlim({ tekst: `Dit was al de kortste volgorde (${hoe})${zonder}.`, vorige: null, anders });
      } else if (uit.na < uit.voor) {
        setSlim({
          tekst: `Volgorde aangepast · ${formatDistance(uit.voor)} → ${formatDistance(uit.na)} ${hoe}${zonder}`,
          vorige: uit.vorige, anders,
        });
      } else {
        // Kan alleen met een anker: dat is een opdracht, geen optimalisatie.
        setSlim({
          tekst: `Volgorde volgt je start- en eindpunt · ${formatDistance(uit.na)} ${hoe}${zonder}`,
          vorige: uit.vorige, anders,
        });
      }
    } catch {
      setSlim({ tekst: 'Kon de volgorde nu niet berekenen.', vorige: null, anders: null });
    } finally {
      setBezig(false);
    }
  };

  // Coords van de stops, en daaruit de route. Ligt alles binnen loopafstand,
  // dan is dit een stadsdag: dan telt het verblijf niet mee en rekenen we te
  // voet — dezelfde regel als de knop hierboven, met dezelfde functies, zodat
  // dit scherm en /dag niet uit elkaar lopen.
  const stops = useMemo(
    () => activities.map(id => activityById[id]?.coords).filter(Boolean),
    [activities, activityById],
  );
  const vervoer = useMemo(
    () => kiesVervoer(stops, anker?.vervoer || null),
    [stops, anker],
  );
  const lopen = vervoer === 'lopen';
  const routePoints = useMemo(
    () => routePunten(stops, { begin: day.startCoords, eind: day.endCoords, vervoer }),
    [stops, day, vervoer],
  );

  const { route } = useRoute(routePoints, hasActivities, vervoer);
  const hasStartCoords = Boolean(!lopen && day.startCoords);

  return (
    <div ref={kaartRef} style={{
      background: hasActivities ? COLORS.creamSoft : 'rgba(250, 243, 225, 0.4)',
      borderRadius: 16, padding: 16,
      borderWidth: '1px 1px 1px 4px', borderStyle: 'solid',
      borderColor: `${COLORS.hairline} ${COLORS.hairline} ${COLORS.hairline} ${stay?.color || COLORS.hairline}`,
      // Kort oplichten na een sprong vanaf /dag, zodat je ziet waar je bent.
      boxShadow: gemarkeerd ? `0 0 0 3px ${COLORS.lake}55` : 'none',
      transition: 'box-shadow 0.3s ease',
    }}>
      <div style={{
        display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap',
        marginBottom: hasActivities ? 12 : 8,
      }}>
        <div style={{
          fontFamily: "'Fraunces', serif", fontSize: 11,
          letterSpacing: 1.5, textTransform: 'uppercase',
          color: COLORS.inkLight, fontWeight: 500, whiteSpace: 'nowrap',
        }}>{day.dayShort}</div>
        <div style={{
          fontFamily: "'Fraunces', serif", fontSize: 22,
          color: COLORS.forest, fontWeight: 500, letterSpacing: '-0.01em',
          whiteSpace: 'nowrap',
        }}>{day.date}</div>
        {weer && (
          <span
            title={`${weer.label}, ${formatTemp(weer.maxC)} / ${formatTemp(weer.minC)}`}
            style={{ fontSize: 12, color: COLORS.inkLight, display: 'inline-flex', alignItems: 'center', gap: 3 }}
          >
            <span style={{ fontSize: 14 }}>{weer.emoji}</span>
            <span style={{ fontWeight: 600, color: COLORS.ink }}>{formatTemp(weer.maxC)}</span>
          </span>
        )}
        {stay && (
          <div style={{
            fontSize: 9, color: stay.color, letterSpacing: 0.8,
            textTransform: 'uppercase', fontWeight: 600,
            padding: '2px 7px',
            background: `${stay.color}1A`,
            borderRadius: 99,
          }}>{stay.name}</div>
        )}
        {day.label && (
          <div style={{
            fontSize: 10, color: COLORS.lake, letterSpacing: 0.8,
            textTransform: 'uppercase', fontWeight: 600,
            marginLeft: 'auto', padding: '3px 8px',
            background: 'rgba(58, 126, 132, 0.10)', borderRadius: 99,
          }}>{day.label}</div>
        )}
        {/* De knoppen samen in één blok: past het niet naast de datum, dan
            wippen ze samen naar de volgende regel in plaats van de datum in
            tweeën te breken. */}
        {hasActivities && (
          <div style={{
            display: 'flex', gap: 6, marginLeft: 'auto', flexShrink: 0,
            alignItems: 'center',
          }}>
            {/* Naar het dagoverzicht van precies deze dag. De datum staat in
                het adres, dus de terugknop van de telefoon werkt ook. */}
            <Link
              href={`/dag?dag=${day.key}`}
              title="Bekijk deze dag met kaart en route"
              style={{
                border: `1px solid ${COLORS.hairline}`,
                background: 'transparent', color: COLORS.inkLight,
                borderRadius: 99, padding: '4px 10px', textDecoration: 'none',
                fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 600,
                display: 'inline-flex', alignItems: 'center', gap: 4,
                whiteSpace: 'nowrap',
              }}
            >
              <CalendarIcon size={12} /> Dagoverzicht
            </Link>
            {teOrdenen >= 2 && (
              <button
                onClick={() => slimmeVolgorde()}
                disabled={bezig || offline}
                title={offline
                  ? 'Geen verbinding — de volgorde wordt niet opgeslagen'
                  : 'Zet de activiteiten in de kortste route'}
                style={{
                  border: `1px solid ${COLORS.lake}`,
                  background: 'rgba(58, 126, 132, 0.08)',
                  color: COLORS.lake,
                  borderRadius: 99, padding: '4px 10px',
                  cursor: bezig || offline ? 'default' : 'pointer',
                  opacity: offline ? 0.45 : 1,
                  fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 600,
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  whiteSpace: 'nowrap',
                }}
              >
                {bezig
                  ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} />
                  : <Route size={12} />}
                {bezig ? 'Rekenen…' : 'Slimme volgorde'}
              </button>
            )}
            <button
              onClick={() => setSwapping(s => !s)}
              title="Wissel deze dag met een andere dag"
              style={{
                border: `1px solid ${swapping ? COLORS.forest : COLORS.hairline}`,
                background: swapping ? `${COLORS.forest}12` : 'transparent',
                color: swapping ? COLORS.forest : COLORS.inkLight,
                borderRadius: 99, padding: '4px 10px', cursor: 'pointer',
                fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 600,
                display: 'inline-flex', alignItems: 'center', gap: 4,
                whiteSpace: 'nowrap',
              }}
            >
              <RefreshCw size={12} /> Wissel dag
            </button>
          </div>
        )}
      </div>

      {swapping && (
        <div style={{
          marginBottom: 12, padding: 12,
          background: COLORS.cream, borderRadius: 12,
          border: `1px solid ${COLORS.hairline}`,
        }}>
          <div style={{ fontSize: 12, color: COLORS.ink, marginBottom: 8 }}>
            Verwissel alle activiteiten van <strong>{day.dayShort} {day.date}</strong> met:
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {allDays.filter(d => d.key !== day.key).map(d => {
              const cnt = (planRef?.[d.key] || []).length;
              return (
                <button
                  key={d.key}
                  onClick={() => { onSwapDay(day.key, d.key); setSwapping(false); }}
                  style={{
                    padding: '6px 10px', borderRadius: 99,
                    fontSize: 11.5, fontWeight: 600, cursor: 'pointer',
                    fontFamily: "'DM Sans', sans-serif",
                    background: 'transparent', color: COLORS.charcoal,
                    border: `1px solid ${COLORS.hairline}`,
                    borderLeft: `4px solid ${d.stay?.color || COLORS.forest}`,
                  }}
                >
                  {d.dayShort} {d.date}
                  <span style={{ opacity: 0.6, fontWeight: 500 }}> · {cnt}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {slim && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
          marginBottom: 10, padding: '7px 10px', borderRadius: 8,
          background: 'rgba(74, 111, 79, 0.10)',
          fontSize: 11.5, color: COLORS.moss, fontWeight: 600, lineHeight: 1.45,
        }}>
          {/* De tekst pakt de hele regel, zodat de linkjes eronder komen te
              staan in plaats van hem tot vier regels samen te knijpen. */}
          <span style={{ flex: '1 1 100%', minWidth: 0 }}>{slim.tekst}</span>
          {slim.anders && !bezig && (
            <button
              onClick={() => slimmeVolgorde(slim.anders)}
              style={slimLink}
            >{slim.anders === 'rijden' ? 'Liever met de auto?' : 'Liever te voet?'}</button>
          )}
          {slim.vorige && (
            <button
              onClick={() => { onZetVolgorde(day.key, slim.vorige); setSlim(null); }}
              style={slimLink}
            >Ongedaan maken</button>
          )}
          <button
            onClick={() => setSlim(null)}
            aria-label="Melding wegklikken"
            style={{
              border: 'none', background: 'transparent', cursor: 'pointer',
              color: COLORS.inkLight, padding: 0, display: 'flex',
            }}
          ><X size={13} /></button>
        </div>
      )}

      {/* Route-totaal: tonen als er activiteiten met coords zijn */}
      {hasActivities && route && route.totalDistance > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          marginBottom: 10,
          padding: '6px 10px',
          background: 'rgba(58, 126, 132, 0.06)',
          borderRadius: 8,
          fontSize: 11,
          color: COLORS.lake,
          fontWeight: 600,
          letterSpacing: 0.2,
        }}>
          {lopen ? <Footprints size={12} /> : <Car size={12} />}
          <span>{formatDistance(route.totalDistance)}</span>
          <span style={{ opacity: 0.5 }}>·</span>
          <span>{formatDuration(route.totalDuration)} {lopen ? 'lopen' : 'rijden'}</span>
          <span style={{ flex: 1 }} />
          <span style={{ fontSize: 9, color: COLORS.inkLight, fontWeight: 500 }}>
            {hasStartCoords ? 'heen + terug' : 'tussen stops'}
          </span>
        </div>
      )}

      {hasActivities && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
          {activities.map((actId, idx) => {
            const activity = activityById[actId];
            if (!activity) return null;

            // Bereken het segment-label dat HIERVOOR moet komen.
            // routePoints = [start?, act0, act1, ..., actN, end?]
            const actsWithCoords = activities
              .map((id, i) => ({ id, i, act: activityById[id] }))
              .filter(x => x.act && x.act.coords);
            const myIndexInRoute = actsWithCoords.findIndex(x => x.i === idx);
            // Zonder start-coördinaat is er geen segment naar de eerste activiteit
            const segIndex = hasStartCoords ? myIndexInRoute : myIndexInRoute - 1;
            const segment = (activity.coords && route && myIndexInRoute >= 0 && segIndex >= 0)
              ? route.segments?.[segIndex]
              : null;

            return (
              <React.Fragment key={`${actId}-${idx}`}>
                {segment && segment.distance > 100 && (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    paddingLeft: 6,
                    fontSize: 10,
                    color: COLORS.inkLight,
                    fontWeight: 500,
                  }}>
                    <div style={{
                      width: 1, height: 10,
                      background: COLORS.hairline,
                      marginLeft: 11,
                    }} />
                    <span>↓ {formatDistance(segment.distance)} · {formatDuration(segment.duration)}</span>
                  </div>
                )}
                <ActivityChip
                  activity={activity}
                  dayKey={day.key}
                  days={allDays}
                  rol={anker?.start === actId ? 'start' : anker?.eind === actId ? 'eind' : null}
                  onZetAnker={(r) => onZetAnker(day.key, actId, r)}
                  onRemove={() => onRemove(day.key, idx)}
                  onEditLocation={onEditLocation}
                  onMoveUp={() => onMove(day.key, idx, idx - 1)}
                  onMoveDown={() => onMove(day.key, idx, idx + 1)}
                  canMoveUp={idx > 0}
                  canMoveDown={idx < activities.length - 1}
                  onUpdateProps={onUpdateProps}
                  onMoveToDay={(toKey) => onMoveToDay(day.key, idx, toKey)}
                />
              </React.Fragment>
            );
          })}
        </div>
      )}

      <button
        onClick={() => onAddClick(day.key)}
        style={{
          width: '100%', padding: '10px 14px',
          background: hasActivities ? 'transparent' : 'rgba(45, 79, 62, 0.04)',
          border: `1px dashed ${COLORS.forest}`,
          borderRadius: 10, color: COLORS.forest,
          fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 500,
          cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          transition: 'all 0.15s',
        }}
      >
        <Plus size={14} /> Activiteit toevoegen
      </button>
    </div>
  );
};

// ============ PLAN VIEW ============

const PlanView = ({ days, plan, activityById, weerPerDag, routeAnkers, offline, toonVerleden, onToonVerleden, gemarkeerdeDag, dagRefs, onAddClick, onRemove, onEditLocation, onMove, onUpdateProps, onMoveToDay, onSwapDay, onOptimaliseer, onZetVolgorde, onZetAnker, onOpenTripSettings }) => {
  if (days.length === 0) {
    return (
      <div style={{ padding: '40px 20px 100px', textAlign: 'center' }}>
        <CalendarRange size={36} color={COLORS.inkLight} style={{ marginBottom: 12 }} />
        <p style={{ color: COLORS.ink, fontSize: 14, lineHeight: 1.6, maxWidth: 320, margin: '0 auto 18px' }}>
          Stel eerst de vakantieperiode en verblijven in. Daarna verschijnen
          hier de dagen om in te plannen.
        </p>
        <button
          onClick={onOpenTripSettings}
          style={{
            padding: '12px 20px',
            background: COLORS.forest, color: COLORS.cream,
            border: 'none', borderRadius: 10,
            fontFamily: "'DM Sans', sans-serif", fontSize: 14, fontWeight: 600,
            cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', gap: 8,
          }}
        >
          <Settings size={16} /> Reis instellen
        </button>
      </div>
    );
  }
  // Dagen die al geweest zijn staan standaard ingeklapt: op dag tien van de
  // vakantie wil je niet eerst langs negen afgelopen dagen scrollen. Alleen
  // inklappen als er ook iets overblijft — is de hele reis voorbij, dan is een
  // lege planning geen hulp.
  const vandaag = vandaagKey();
  const verleden = days.filter(d => d.key < vandaag);
  const rest = days.length - verleden.length;
  const klapIn = verleden.length > 0 && rest > 0 && !toonVerleden;
  const zichtbareDagen = klapIn ? days.filter(d => d.key >= vandaag) : days;

  return (
    <div style={{ padding: '16px 20px 100px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      {verleden.length > 0 && rest > 0 && (
        <button onClick={() => onToonVerleden(!toonVerleden)} style={S_verleden}>
          <History size={13} />
          {toonVerleden
            ? `${verleden.length} afgelopen ${verleden.length === 1 ? 'dag' : 'dagen'} verbergen`
            : `${verleden.length} afgelopen ${verleden.length === 1 ? 'dag' : 'dagen'} tonen`}
        </button>
      )}
      {zichtbareDagen.map(day => (
        <DayCard
          key={day.key}
          day={day}
          days={days}
          activities={plan[day.key] || []}
          activityById={activityById}
          plan={plan}
          weer={weerPerDag?.[day.key]}
          anker={routeAnkers?.[day.key] || null}
          offline={offline}
          gemarkeerd={gemarkeerdeDag === day.key}
          kaartRef={(el) => { if (dagRefs) dagRefs.current[day.key] = el; }}
          onOptimaliseer={onOptimaliseer}
          onZetVolgorde={onZetVolgorde}
          onZetAnker={onZetAnker}
          onAddClick={onAddClick}
          onRemove={onRemove}
          onEditLocation={onEditLocation}
          onUpdateProps={onUpdateProps}
          onMoveToDay={onMoveToDay}
          onSwapDay={onSwapDay}
          onMove={onMove}
        />
      ))}
    </div>
  );
};

const S_filterBalk = {
  display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12,
  padding: '8px 12px', borderRadius: 10,
  background: 'rgba(58,126,132,0.08)', color: COLORS.ink,
  fontFamily: "'DM Sans', sans-serif", fontSize: 12.5, lineHeight: 1.4,
};
const S_filterKnop = {
  flexShrink: 0, border: 'none', background: 'transparent', padding: 0,
  cursor: 'pointer', color: COLORS.lake,
  fontFamily: "'DM Sans', sans-serif", fontSize: 12.5, fontWeight: 700,
  textDecoration: 'underline', whiteSpace: 'nowrap',
};

const S_verleden = {
  alignSelf: 'flex-start',
  display: 'inline-flex', alignItems: 'center', gap: 6,
  padding: '6px 12px', borderRadius: 99,
  borderWidth: 1, borderStyle: 'dashed', borderColor: COLORS.hairline,
  background: 'transparent', color: COLORS.inkLight,
  fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600,
  cursor: 'pointer',
};

// ============ LIBRARY VIEW ============

const LibraryActivity = ({ activity, usedInDays, onAddClick, onDelete, onEditLocation, onBezocht }) => {
  const cat = CATEGORIES[activity.category] || CATEGORIES.custom;
  const mapsLink = getMapsLink(activity);
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px',
      background: COLORS.creamSoft, borderRadius: 12,
      borderLeft: `3px solid ${cat.color}`,
    }}>
      <span style={{ fontSize: 22 }}>{activity.emoji}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 500, color: COLORS.charcoal }}>{activity.name}</div>
        {activity.note && (
          <div style={{ fontSize: 11, color: COLORS.inkLight, marginTop: 2 }}>{activity.note}</div>
        )}
        {(usedInDays > 0 || activity.visited) && (
          <div style={{
            fontSize: 10, marginTop: 4, fontWeight: 600, letterSpacing: 0.3,
            display: 'flex', gap: 8,
          }}>
            {usedInDays > 0 && <span style={{ color: cat.color }}>Gepland: {usedInDays}×</span>}
            {activity.visited && <span style={{ color: COLORS.moss }}>✓ Bezocht</span>}
          </div>
        )}
      </div>
      {/* Bezocht aanvinken vanuit de bibliotheek: de planning wordt lang niet
          altijd gevolgd, en dan wil je alsnog kunnen vastleggen dat je ergens
          bent geweest. Vraagt om een dag, want zonder dag kan het bezoek niet
          aan een verblijf worden gekoppeld (zie lib/bezoek.js). */}
      <button
        onClick={() => onBezocht(activity)}
        style={{
          border: 'none', cursor: 'pointer', padding: 6, borderRadius: 6,
          background: activity.visited ? `${COLORS.moss}22` : 'transparent',
          color: activity.visited ? COLORS.moss : COLORS.inkLight,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          opacity: activity.visited ? 1 : 0.55,
        }}
        aria-label={activity.visited ? 'Toch niet bezocht' : 'Markeren als bezocht'}
        title={activity.visited ? 'Bezocht — tik om terug te draaien' : 'Ik ben hier geweest'}
      ><Check size={15} /></button>
      <button
        onClick={() => onEditLocation(activity)}
        style={{
          border: 'none', background: 'transparent', cursor: 'pointer',
          color: activity.coords ? cat.color : COLORS.inkLight,
          padding: 6, borderRadius: 6,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          opacity: activity.coords ? 1 : 0.55,
        }}
        aria-label={activity.coords ? 'Locatie bewerken' : 'Locatie toevoegen'}
        title={activity.coords ? 'Locatie bewerken' : 'Locatie toevoegen'}
      >
        <Pencil size={14} />
      </button>
      {mapsLink && (
        <a
          href={mapsLink}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            color: cat.color, padding: 6, borderRadius: 6,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            textDecoration: 'none',
          }}
          aria-label="Open in Google Maps"
          title="Open in Google Maps"
        >
          <MapPin size={16} />
        </a>
      )}
      {(activity.category === 'custom' || activity.id?.startsWith('custom_') || activity.id?.startsWith('sugg_')) && (
        <button
          onClick={onDelete}
          style={{
            border: 'none', background: 'transparent',
            cursor: 'pointer', color: COLORS.inkLight, padding: 4,
          }}
          aria-label="Verwijderen"
        ><Trash2 size={14} /></button>
      )}
      <button
        onClick={onAddClick}
        style={{
          border: 'none', background: COLORS.forest, color: COLORS.cream,
          width: 32, height: 32, borderRadius: 8,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer',
        }}
        aria-label="Toevoegen aan dag"
      ><Plus size={16} /></button>
    </div>
  );
};

const LibraryView = ({ activities, plan, stays, onAddClick, onCreateCustom, onDeleteCustom, onEditLocation, onOpenSuggestions, onPasteLink, onInDeBuurt, onBezocht }) => {
  // Op de camping heb je niets aan de tweehonderd ideeën rond het verblijf van
  // volgende week. Standaard tonen we daarom alleen wat bij het verblijf van
  // vandaag in de buurt ligt — met een knop om alsnog alles te zien, want
  // vooruit plannen en achteraf iets toevoegen moet ook kunnen.
  const [alles, setAlles] = useState(false);

  const huidig = useMemo(() => huidigVerblijf(stays, vandaagKey()), [stays]);
  const perStay = useMemo(
    () => verblijfPerActiviteit(activities, stays),
    [activities, stays],
  );
  // Alleen filteren als er iets te kiezen valt: met één verblijf hoort alles
  // erbij en zou de schakelaar alleen maar in de weg staan.
  const kanFilteren = (stays || []).filter(s => Array.isArray(s?.coords)).length > 1 && Boolean(huidig);
  // Zonder locatie kun je een activiteit nergens aan koppelen — die blijven
  // altijd staan. Dat zijn vaak juist de algemene ("boodschappen doen").
  const zichtbaar = useMemo(() => {
    if (!kanFilteren || alles) return activities;
    return activities.filter(a => perStay[a.id] == null || perStay[a.id] === huidig.id);
  }, [activities, perStay, huidig, kanFilteren, alles]);
  const verborgen = activities.length - zichtbaar.length;

  const planUsage = useMemo(() => {
    const usage = {};
    Object.values(plan).flat().forEach(id => { usage[id] = (usage[id] || 0) + 1; });
    return usage;
  }, [plan]);

  const grouped = useMemo(() => {
    const out = {};
    zichtbaar.forEach(a => {
      const cat = CATEGORIES[a.category] ? a.category : 'custom';
      if (!out[cat]) out[cat] = [];
      out[cat].push(a);
    });
    return out;
  }, [zichtbaar]);

  return (
    <div style={{ padding: '16px 20px 100px' }}>
      {kanFilteren && (
        <div style={S_filterBalk}>
          <Filter size={13} style={{ flexShrink: 0, color: COLORS.lake }} />
          <span style={{ flex: 1, minWidth: 0 }}>
            {alles
              ? 'Alle activiteiten van de hele reis'
              : <>In de buurt van <strong>{huidig.name}</strong></>}
          </span>
          <button onClick={() => setAlles(a => !a)} style={S_filterKnop}>
            {alles
              ? 'Alleen dit verblijf'
              : `Alles tonen${verborgen > 0 ? ` (${verborgen})` : ''}`}
          </button>
        </div>
      )}
      <button
        onClick={onOpenSuggestions}
        style={{
          width: '100%', padding: 14,
          background: COLORS.forest, color: COLORS.cream, border: 'none',
          borderRadius: 12, fontSize: 14, fontFamily: "'DM Sans', sans-serif",
          fontWeight: 600, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          marginBottom: 10,
          boxShadow: '0 2px 8px rgba(45, 79, 62, 0.25)',
        }}
      >
        <Compass size={16} /> Ontdek de omgeving van je verblijf
      </button>
      <button
        onClick={onCreateCustom}
        style={{
          width: '100%', padding: 14,
          background: COLORS.sunset, color: COLORS.cream, border: 'none',
          borderRadius: 12, fontSize: 14, fontFamily: "'DM Sans', sans-serif",
          fontWeight: 600, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          marginBottom: 10,
          boxShadow: '0 2px 8px rgba(201, 125, 93, 0.25)',
        }}
      >
        <Sparkles size={16} /> Eigen activiteit toevoegen
      </button>
      <button
        onClick={onPasteLink}
        style={{
          width: '100%', padding: 13,
          background: 'transparent', color: COLORS.forest,
          border: `1px solid ${COLORS.forest}`,
          borderRadius: 12, fontSize: 13.5, fontFamily: "'DM Sans', sans-serif",
          fontWeight: 600, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          marginBottom: 24,
        }}
      >
        <MapPin size={15} /> Plak een Google Maps-link
      </button>

      <button
        onClick={onInDeBuurt}
        style={{
          width: '100%', padding: 13,
          background: 'transparent', color: COLORS.forest,
          border: `1px solid ${COLORS.forest}`,
          borderRadius: 12, fontSize: 13.5, fontFamily: "'DM Sans', sans-serif",
          fontWeight: 600, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          marginTop: -16, marginBottom: 24,
        }}
      >
        <Crosshair size={15} /> Wat is hier in de buurt?
      </button>

      {CATEGORY_ORDER.map(catKey => {
        const items = grouped[catKey];
        if (!items || items.length === 0) return null;
        const cat = CATEGORIES[catKey];
        return (
          <div key={catKey} style={{ marginBottom: 28 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <span style={{ fontSize: 16 }}>{cat.emoji}</span>
              <h3 style={{
                fontFamily: "'Fraunces', serif", fontSize: 17, margin: 0,
                fontWeight: 500, color: cat.color, letterSpacing: '-0.01em',
              }}>{cat.name}</h3>
              <span style={{ flex: 1, height: 1, background: COLORS.hairline }} />
              <span style={{ fontSize: 11, color: COLORS.inkLight }}>{items.length}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {items.map(a => (
                <LibraryActivity
                  key={a.id}
                  activity={a}
                  usedInDays={planUsage[a.id] || 0}
                  onAddClick={() => onAddClick(a.id)}
                  onDelete={() => onDeleteCustom(a.id)}
                  onEditLocation={onEditLocation}
                  onBezocht={onBezocht}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
};

const SettingsSheet = ({ onClose, onOpenTripSettings, onClearPlan, onNewVacation }) => (
  <Sheet onClose={onClose} title="Planning beheren">
    <div style={{ padding: '8px 20px 24px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <Link
        href="/beheer"
        style={{
          padding: '14px 16px', background: COLORS.creamSoft,
          border: `1px solid ${COLORS.hairline}`, borderRadius: 12,
          textAlign: 'left', cursor: 'pointer', textDecoration: 'none',
          display: 'block',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <ShieldCheck size={16} color={COLORS.moss} />
          <span style={{ fontWeight: 600, color: COLORS.forest, fontSize: 14 }}>
            Beheer
          </span>
        </div>
        <div style={{ fontSize: 12, color: COLORS.ink, lineHeight: 1.5 }}>
          Reservekopieën, het foutenlogboek en opruimen — achter een eigen
          wachtwoord, want je kunt er dingen terugzetten en wissen.
        </div>
      </Link>


      <button
        onClick={onOpenTripSettings}
        style={{
          padding: '14px 16px', background: COLORS.creamSoft,
          border: `1px solid ${COLORS.hairline}`, borderRadius: 12,
          textAlign: 'left', cursor: 'pointer',
          fontFamily: "'DM Sans', sans-serif",
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <Settings size={16} color={COLORS.lake} />
          <span style={{ fontWeight: 600, color: COLORS.forest, fontSize: 14 }}>
            Reis instellen
          </span>
        </div>
        <div style={{ fontSize: 12, color: COLORS.ink, lineHeight: 1.5 }}>
          Titel, periode en verblijven aanpassen. De dagenlijst wordt
          hierop automatisch opnieuw opgebouwd.
        </div>
      </button>

      <button
        onClick={onClearPlan}
        style={{
          padding: '14px 16px', background: COLORS.creamSoft,
          border: `1px solid ${COLORS.hairline}`, borderRadius: 12,
          textAlign: 'left', cursor: 'pointer',
          fontFamily: "'DM Sans', sans-serif",
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <Trash2 size={16} color={COLORS.wine} />
          <span style={{ fontWeight: 600, color: COLORS.wine, fontSize: 14 }}>
            Hele planning wissen
          </span>
        </div>
        <div style={{ fontSize: 12, color: COLORS.ink, lineHeight: 1.5 }}>
          Start met een leeg blad. Eigen activiteiten en reisinstellingen
          blijven bewaard.
        </div>
      </button>

      <button
        onClick={onNewVacation}
        style={{
          padding: '14px 16px', background: COLORS.creamSoft,
          border: `1px solid ${COLORS.hairline}`, borderRadius: 12,
          textAlign: 'left', cursor: 'pointer',
          fontFamily: "'DM Sans', sans-serif",
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <Sparkles size={16} color={COLORS.sunset} />
          <span style={{ fontWeight: 600, color: COLORS.sunset, fontSize: 14 }}>
            Nieuwe vakantie starten
          </span>
        </div>
        <div style={{ fontSize: 12, color: COLORS.ink, lineHeight: 1.5 }}>
          Wist de planning én eigen activiteiten, en opent de reisinstellingen
          voor een frisse start. De inpaklijst en auto-checklist blijven staan —
          reset daar de vinkjes apart.
        </div>
      </button>
    </div>
  </Sheet>
);

// ============ MAIN APP ============

export default function Planner() {
  const [activeTab, setActiveTab] = useState('plan');
  const [plan, setPlan] = useState({});
  const [customActivities, setCustomActivities] = useState([]);
  const [locationOverrides, setLocationOverrides] = useState({});
  // Suggesties die de gebruiker heeft verborgen: [{ name, coords }]
  const [suggestExclusions, setSuggestExclusions] = useState([]);
  // Start- en eindpunt van de route, per dag: { dagKey: { start, eind } }
  const [routeAnkers, setRouteAnkers] = useState({});
  const [tripConfig, setTripConfig] = useState(DEFAULT_TRIP_CONFIG);
  const [loading, setLoading] = useState(true);
  const [sheet, setSheet] = useState(null);
  const [syncStatus, setSyncStatus] = useState('idle'); // 'idle' | 'syncing' | 'synced' | 'offline'
  const [serverUpdate, setServerUpdate] = useState({ at: null, by: null });
  const [conflict, setConflict] = useState(null);
  // Gevuld als we de laatst bewaarde versie tonen omdat de server niet
  // bereikbaar was. Zolang dit staat is opslaan geblokkeerd.
  const [offlineOp, setOfflineOp] = useState(null);
  const [name, setName] = useState('');
  // Afgelopen dagen staan standaard ingeklapt; dit zet ze weer aan.
  const [toonVerleden, setToonVerleden] = useState(false);
  // De dag waar je zojuist vanaf /dag naartoe sprong, kort opgelicht.
  const [gemarkeerdeDag, setGemarkeerdeDag] = useState(null);
  const dagRefs = useRef({});

  const saveTimer = useRef(null);
  const skipNextSave = useRef(true);
  const firstLoad = useRef(true);
  // updatedAt van het document zoals wij het kennen; hierop controleert de
  // server of iemand anders er intussen tussendoor is gekomen.
  const versie = useRef(null);

  // Init name from localStorage
  useEffect(() => { setName(getName()); }, []);

  const saveName = (newName) => {
    setName(newName);
    setNameLS(newName);
  };

  // Initial fetch
  const fetchData = useCallback(async (showSpinner = true) => {
    if (showSpinner) setSyncStatus('syncing');
    try {
      const data = await apiGet();
      skipNextSave.current = true;
      setOfflineOp(null);
      bewaarLokaal('trip', data);
      versie.current = data.updatedAt ?? null;
      setPlan(data.plan || {});
      setCustomActivities(data.customActivities || []);
      setLocationOverrides(data.locationOverrides || {});
      setSuggestExclusions(data.suggestExclusions || []);
      setRouteAnkers(data.routeAnkers || {});
      setTripConfig(data.tripConfig || DEFAULT_TRIP_CONFIG);
      setServerUpdate({ at: data.updatedAt, by: data.updatedBy });
      setSyncStatus('synced');
      setTimeout(() => setSyncStatus('idle'), 1500);
      // Eerste bezoek zonder geconfigureerde reis → open meteen de instellingen
      if (firstLoad.current && !isTripConfigured(data.tripConfig)) {
        setSheet({ type: 'trip-settings' });
      }
      firstLoad.current = false;
    } catch (e) {
      setSyncStatus('offline');
      // Een 401 is geen verbindingsprobleem — dan hoort de PIN-poort te
      // verschijnen, niet een gedateerde kopie. Die poort zit om de pagina
      // heen (components/Poort.jsx) en regelt dat zelf.
      if (e.message !== 'unauthorized') {
        // Geen verbinding: toon wat we het laatst zagen, maar wél zichtbaar
        // gedateerd en met opslaan uit. Dat is het verschil met een service
        // worker (valkuil 19).
        const kopie = leesLokaal('trip');
        if (kopie) {
          skipNextSave.current = true;
          setPlan(kopie.data.plan || {});
          setCustomActivities(kopie.data.customActivities || []);
          setLocationOverrides(kopie.data.locationOverrides || {});
          setSuggestExclusions(kopie.data.suggestExclusions || []);
          setRouteAnkers(kopie.data.routeAnkers || {});
          setTripConfig(kopie.data.tripConfig || DEFAULT_TRIP_CONFIG);
          setServerUpdate({ at: kopie.data.updatedAt, by: kopie.data.updatedBy });
          setOfflineOp(kopie.op);
          firstLoad.current = false;
        }
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Refresh on focus
  useEffect(() => {
    const onFocus = () => fetchData(false);
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [fetchData]);

  // Debounced auto-save
  useEffect(() => {
    if (loading) return;
    // Offline: niet schrijven. We werken op een gedateerde kopie en zouden het
    // werk van een ander overschrijven.
    if (offlineOp) return;
    if (skipNextSave.current) {
      skipNextSave.current = false;
      return;
    }
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setSyncStatus('syncing');
    saveTimer.current = setTimeout(async () => {
      try {
        const data = await apiPut(
          plan, customActivities, locationOverrides, tripConfig, suggestExclusions,
          routeAnkers, name, versie.current,
        );
        versie.current = data.updatedAt ?? null;
        setServerUpdate({ at: data.updatedAt, by: data.updatedBy });
        setSyncStatus('synced');
        setConflict(null);
        setTimeout(() => setSyncStatus('idle'), 1500);
      } catch (e) {
        if (e?.conflict) {
          // Niet stilzwijgend overschrijven; de gebruiker kiest zelf
          setConflict(e.conflict);
          setSyncStatus('idle');
        } else {
          setSyncStatus('offline');
        }
      }
    }, 500);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [plan, customActivities, locationOverrides, tripConfig, suggestExclusions, routeAnkers, name, loading, offlineOp]);

  // Dynamische dagenlijst uit de reisconfiguratie
  const days = useMemo(() => buildDays(tripConfig), [tripConfig]);

  // Eén weeroproep voor de hele reis, op het eerste verblijf met coördinaten.
  // Mislukt hij, dan blijft de map leeg en tonen de dagkaarten er niets over —
  // het weer is bijzaak en mag de planner niet in de weg zitten.
  const weerCoords = useMemo(() => {
    const metCoords = (tripConfig?.stays || []).find(s => Array.isArray(s.coords));
    return metCoords?.coords || null;
  }, [tripConfig]);
  const weerPerDag = useWeer(weerCoords, days[0]?.key, days[days.length - 1]?.key);
  const stays = useMemo(() => staysWithColors(tripConfig), [tripConfig]);

  const allActivities = useMemo(
    () => [...DEFAULT_ACTIVITIES, ...customActivities],
    [customActivities]
  );

  // activityById past locationOverrides toe
  const activityById = useMemo(() => {
    const obj = {};
    allActivities.forEach(a => {
      obj[a.id] = applyLocationOverride(a, locationOverrides);
    });
    return obj;
  }, [allActivities, locationOverrides]);

  const stats = useMemo(() => {
    let totalActivities = 0;
    let daysWithActivities = 0;
    days.forEach(d => {
      const n = (plan[d.key] || []).length;
      totalActivities += n;
      if (n > 0) daysWithActivities++;
    });
    return { totalActivities, daysWithActivities };
  }, [plan, days]);

  const addActivityToDay = (dayKey, activityId) => {
    setPlan(p => ({ ...p, [dayKey]: [...(p[dayKey] || []), activityId] }));
  };

  const removeFromDay = (dayKey, index) => {
    setPlan(p => ({ ...p, [dayKey]: (p[dayKey] || []).filter((_, i) => i !== index) }));
  };

  const moveInDay = (dayKey, fromIdx, toIdx) => {
    setPlan(p => {
      const ids = [...(p[dayKey] || [])];
      if (toIdx < 0 || toIdx >= ids.length || fromIdx === toIdx) return p;
      const [moved] = ids.splice(fromIdx, 1);
      ids.splice(toIdx, 0, moved);
      return { ...p, [dayKey]: ids };
    });
  };

  // ── Slimme volgorde ───────────────────────────────────────────────
  //
  // De activiteiten van één dag in de kortste route zetten. De onderlinge
  // rijafstanden komen van /api/matrix; is die niet bereikbaar — geen bereik,
  // server nors — dan rekent `optimaliseerVolgorde` hemelsbreed door. De knop
  // moet het ook doen op een camping zonder streepje bereik.
  const haalMatrix = async (punten, profiel) => {
    try {
      const res = await fetch('/api/matrix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Family-Pin': getPin() },
        body: JSON.stringify({ points: punten, profiel }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      // Afstand is waar we op sorteren; kent de dienst alleen rijtijd, dan is
      // die net zo bruikbaar — het gaat om de onderlinge verhouding.
      return data.distances || data.durations || null;
    } catch {
      return null;
    }
  };

  // `keuze` overschrijft eenmalig wat er voor deze dag is ingesteld — dat is de
  // "Liever met de auto?"-link in de melding.
  const optimaliseerDag = async (dayKey, keuze) => {
    const dag = days.find(d => d.key === dayKey);
    const ids = plan[dayKey] || [];
    const items = ids.map(id => ({ id, coords: activityById[id]?.coords || null }));
    const anker = routeAnkers[dayKey] || {};
    const stops = items.filter(x => Array.isArray(x.coords)).map(x => x.coords);

    // Liggen de stops binnen loopafstand van elkaar, dan is dit een stadsdag en
    // rekenen we te voet. Een auto-router stuurt je daar over de ring en om het
    // voetgangersgebied heen, en dat is niet de volgorde waarin je loopt.
    const vervoer = kiesVervoer(stops, keuze ?? anker.vervoer ?? null);
    const lopen = vervoer === 'lopen';

    // Bij lopen telt de rit vanaf het verblijf niet mee: naar de stad rijd je,
    // en pas daar begint de wandeling. Anders wint de stop die het dichtst bij
    // de camping ligt altijd de eerste plaats. Wil je toch een vast beginpunt,
    // dan is daar het startanker voor.
    const begin = lopen ? null : (dag?.startCoords || null);
    const eind = lopen ? null : (dag?.endCoords || null);

    // Zelfde puntenlijst als de kaart tekent — één plek waar die regel staat.
    const punten = routePunten(stops, {
      begin: dag?.startCoords, eind: dag?.endCoords, vervoer,
    });

    const matrix = punten.length >= 2 && punten.length <= 25
      ? await haalMatrix(punten, vervoer)
      : null;

    const uit = optimaliseerVolgorde(items, {
      begin, eind,
      start: anker.start || null,
      stop: anker.eind || null,
      kosten: matrix ? kostenUitMatrix(punten, matrix) : hemelsbreed,
    });

    const gewijzigd = uit.ids.some((id, i) => id !== ids[i]);
    if (gewijzigd) setPlan(p => ({ ...p, [dayKey]: uit.ids }));
    // Een eenmalige omschakeling onthouden we voor deze dag, zodat een volgende
    // klik op de knop hetzelfde doet.
    if (keuze) zetVervoer(dayKey, keuze);
    return { ...uit, gewijzigd, echt: Boolean(matrix), vervoer, vorige: ids };
  };

  const zetVervoer = (dayKey, vervoer) => {
    setRouteAnkers(a => ({
      ...a,
      [dayKey]: { start: null, eind: null, ...(a[dayKey] || {}), vervoer },
    }));
  };

  // Terugzetten na "Ongedaan maken"
  const zetVolgorde = (dayKey, ids) => {
    setPlan(p => ({ ...p, [dayKey]: [...ids] }));
  };

  // Start- of eindpunt van een dag aanwijzen. Eén van elk per dag: een nieuwe
  // keuze haalt het anker bij de vorige activiteit vanzelf weg, omdat er maar
  // één id per rol wordt bewaard. Dezelfde activiteit kan geen start én eind
  // zijn — dan zou het vrije stuk van de route om zichzelf heen lopen.
  const zetAnker = (dayKey, activityId, rol) => {
    setRouteAnkers(a => {
      const huidig = a[dayKey] || { start: null, eind: null };
      const nieuw = { ...huidig };
      if (rol === 'start') nieuw.start = huidig.start === activityId ? null : activityId;
      else if (rol === 'eind') nieuw.eind = huidig.eind === activityId ? null : activityId;
      else {
        if (huidig.start === activityId) nieuw.start = null;
        if (huidig.eind === activityId) nieuw.eind = null;
      }
      if (rol === 'start' && nieuw.eind === activityId) nieuw.eind = null;
      if (rol === 'eind' && nieuw.start === activityId) nieuw.start = null;

      const volgende = { ...a };
      // Alleen weggooien als er echt niets meer over is — een vervoerkeuze
      // zonder ankers is ook iets om te bewaren.
      if (!nieuw.start && !nieuw.eind && !nieuw.vervoer) delete volgende[dayKey];
      else volgende[dayKey] = nieuw;
      return volgende;
    });
  };

  // Activiteit van de ene dag naar de andere verplaatsen (achteraan toevoegen)
  const moveActivityToDay = (fromDayKey, index, toDayKey) => {
    if (fromDayKey === toDayKey) return;
    setPlan(p => {
      const fromIds = [...(p[fromDayKey] || [])];
      const id = fromIds[index];
      if (id === undefined) return p;
      fromIds.splice(index, 1);
      const toIds = [...(p[toDayKey] || []), id];
      return { ...p, [fromDayKey]: fromIds, [toDayKey]: toIds };
    });
  };

  // Alle activiteiten van twee dagen omwisselen
  const swapDays = (dayA, dayB) => {
    if (dayA === dayB) return;
    setPlan(p => ({
      ...p,
      [dayA]: [...(p[dayB] || [])],
      [dayB]: [...(p[dayA] || [])],
    }));
  };

  // Eigenschap van een activiteit aanpassen (naam/note/important).
  // Custom activities worden direct gewijzigd; standaard-activiteiten via
  // het overrides-mechanisme, zodat de wijziging overal doorwerkt.
  const updateActivityProps = (activityId, props) => {
    const isCustom = customActivities.some(a => a.id === activityId);
    if (isCustom) {
      setCustomActivities(arr => arr.map(a =>
        a.id === activityId ? { ...a, ...props } : a));
    } else {
      setLocationOverrides(o => ({
        ...o,
        [activityId]: { ...(o[activityId] || {}), ...props },
      }));
    }
  };

  const createCustom = (data, andAddToDay) => {
    const newId = `custom_${Date.now()}`;
    const newAct = { ...data, id: newId };
    setCustomActivities(c => [...c, newAct]);
    if (andAddToDay) {
      setPlan(p => ({ ...p, [andAddToDay]: [...(p[andAddToDay] || []), newId] }));
    }
    return newId;
  };

  const saveLocationOverride = (activityId, override) => {
    setLocationOverrides(o => {
      // Voor custom activities: wijzig direct in customActivities array
      const isCustom = customActivities.some(a => a.id === activityId);
      if (isCustom) {
        setCustomActivities(arr => arr.map(a => {
          if (a.id !== activityId) return a;
          const merged = { ...a };
          if (override.coords !== undefined) merged.coords = override.coords;
          if (override.mapsQuery !== undefined) merged.mapsQuery = override.mapsQuery;
          if (override.mapsPlaceId !== undefined) merged.mapsPlaceId = override.mapsPlaceId;
          if (override.locationLabel !== undefined) merged.locationLabel = override.locationLabel;
          // Wis null-velden
          if (merged.coords === null) delete merged.coords;
          if (merged.mapsQuery === null) delete merged.mapsQuery;
          if (merged.mapsPlaceId === null) delete merged.mapsPlaceId;
          if (merged.locationLabel === null) delete merged.locationLabel;
          return merged;
        }));
        // Geen apart override-record voor custom
        const { [activityId]: _, ...rest } = o;
        return rest;
      }
      // Voor built-in activities: gebruik override-record (samenvoegen,
      // zodat eerder gezette naam/notitie/belangrijk behouden blijven)
      return { ...o, [activityId]: { ...(o[activityId] || {}), ...override } };
    });
  };

  const clearLocationOverride = (activityId) => {
    setLocationOverrides(o => {
      const { [activityId]: _, ...rest } = o;
      return rest;
    });
  };

  const deleteCustom = (id) => {
    setSheet({
      type: 'confirm',
      title: 'Eigen activiteit verwijderen?',
      message: 'De activiteit wordt ook uit alle dagen verwijderd waar hij in staat.',
      confirmText: 'Verwijderen',
      onConfirm: () => {
        setCustomActivities(c => c.filter(a => a.id !== id));
        setPlan(p => {
          const np = {};
          Object.entries(p).forEach(([k, ids]) => { np[k] = ids.filter(x => x !== id); });
          return np;
        });
      },
    });
  };

  // Nieuwe vakantie starten, eventueel met de verblijven eerst in het logboek.
  // Mislukt het archiveren, dan wissen we niets — anders raak je de verblijven
  // kwijt zonder dat ze ergens bewaard zijn.
  const archiveerEnStart = async (archiveren) => {
    if (archiveren) {
      try {
        // De planning meegeven, zodat wat je als bezocht hebt aangevinkt
        // mee het logboek in gaat.
        const r = await archiveTripStays(tripConfig, name, { plan, activityById });
        // Ook melden als er alleen is bijgewerkt. Dat dit vroeger aan `added`
        // hing is precies waarom het onopgemerkt bleef toen het archiveren
        // niets deed: het scherm bleef stil en daarna was de planning weg.
        if (r.added > 0 || r.bijgewerkt > 0) {
          const regels = [];
          if (r.added > 0) {
            regels.push(`${r.added} ${r.added === 1 ? 'verblijf' : 'verblijven'} bewaard in het logboek.`);
          }
          if (r.bijgewerkt > 0) {
            regels.push(`${r.bijgewerkt} ${r.bijgewerkt === 1 ? 'verblijf stond' : 'verblijven stonden'} er al in en ${r.bijgewerkt === 1 ? 'is' : 'zijn'} bijgewerkt met wat je hebt aangevinkt als bezocht.`);
          }
          window.alert(regels.join('\n') + '\n\nJe vindt ze terug onder “Verblijven”.');
        }
      } catch (e) {
        window.alert(
          'Kon de verblijven niet bewaren in het logboek, dus er is niets gewist. ' +
          'Probeer het zo nog eens.'
        );
        return;
      }
    }
    setPlan({});
    setCustomActivities([]);
    setLocationOverrides({});
    setSuggestExclusions([]);
    setRouteAnkers({});
    setTripConfig(DEFAULT_TRIP_CONFIG);
    // Open daarna direct de reisinstellingen
    setTimeout(() => setSheet({ type: 'trip-settings' }), 0);
  };

  const lastUpdateText = useMemo(() => {
    if (!serverUpdate.at) return null;
    const d = new Date(serverUpdate.at);
    const now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    const time = d.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
    const dateStr = sameDay
      ? time
      : d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' }) + ' ' + time;
    return serverUpdate.by ? `${serverUpdate.by} · ${dateStr}` : dateStr;
  }, [serverUpdate]);

  // Bezocht aanvinken vanuit de bibliotheek. Staat de activiteit nog nergens
  // in de planning, dan vragen we op welke dag het was: zonder dag valt het
  // bezoek bij geen enkel verblijf (lib/bezoek.js koppelt op datum).
  const markeerBezocht = (activity) => {
    if (activity.visited) {
      updateActivityProps(activity.id, { visited: false });
      return;
    }
    const staatGepland = Object.values(plan).some(ids => (ids || []).includes(activity.id));
    if (staatGepland) {
      updateActivityProps(activity.id, { visited: true });
      return;
    }
    setSheet({ type: 'bezocht-dag', activityId: activity.id });
  };

  // Losse functies (in plaats van closures in de JSX) omdat /beheer er
  // rechtstreeks naartoe kan linken: ?beheer=wissen of ?beheer=nieuw.
  // Hoeveel bezoeken hangen er aan deze planning? Alleen wat op een dag staat
  // én is aangevinkt telt: `bezoekPerVerblijf` koppelt op datum, dus een vinkje
  // zonder dag valt bij geen enkel verblijf en is dus niets waard.
  const aantalBezoeken = useMemo(() => {
    const gezien = new Set();
    for (const ids of Object.values(plan || {})) {
      for (const id of ids || []) {
        if (activityById[id]?.visited) gezien.add(id);
      }
    }
    return gezien.size;
  }, [plan, activityById]);

  const bezoekZin = (n) => `${n} ${n === 1 ? 'activiteit die je hebt aangevinkt als bezocht' : 'activiteiten die je hebt aangevinkt als bezocht'}`;

  const vraagPlanningWissen = () => {
    const basis = `Alle ${days.length || ''} dagen worden leeggemaakt. Eigen activiteiten en reisinstellingen blijven bewaard.`;
    setSheet({
      type: 'confirm',
      title: 'Hele planning wissen?',
      // Het vinkje "bezocht" blijft op de activiteit staan, maar de dag
      // eronder verdwijnt — en zonder dag valt een bezoek bij geen enkel
      // verblijf. Dat is dus net zo goed weg, en dat hoor je te weten.
      message: aantalBezoeken > 0
        ? `${basis}\n\nLet op: ${bezoekZin(aantalBezoeken)} raakt daarmee de dag kwijt waarop je er was, en komt dan niet meer in het verblijvenlogboek. Open eerst “Verblijven” — dan worden ze vastgelegd.`
        : basis,
      confirmText: 'Alles wissen',
      onConfirm: () => setPlan({}),
    });
  };

  const vraagNieuweVakantie = () => {
    const teArchiveren = (tripConfig.stays || []).length;
    const basis = 'De planning en eigen activiteiten worden gewist. Daarna stel je de nieuwe periode en verblijven in. De inpaklijst en auto-checklist blijven staan.';
    const bezoekRegel = aantalBezoeken > 0
      ? `\n\n${bezoekZin(aantalBezoeken)} ${aantalBezoeken === 1 ? 'gaat' : 'gaan'} mee naar het logboek.`
      : '';
    setSheet({
      type: 'confirm',
      title: 'Nieuwe vakantie starten?',
      message: teArchiveren
        ? `${basis}\n\nJe hebt ${teArchiveren} ${teArchiveren === 1 ? 'verblijf' : 'verblijven'} ingesteld. Wil je ${teArchiveren === 1 ? 'dat' : 'die'} eerst bewaren in het verblijvenlogboek, zodat je er later een cijfer en foto's aan kunt hangen?${bezoekRegel}`
        : basis,
      confirmText: teArchiveren ? 'Bewaren en starten' : 'Nieuwe vakantie',
      onConfirm: () => archiveerEnStart(Boolean(teArchiveren)),
      // De tekst zegt wat je opgeeft, want deze knop is onomkeerbaar.
      altText: teArchiveren
        ? (aantalBezoeken > 0 ? 'Starten zonder bewaren — bezoeken kwijt' : 'Starten zonder bewaren')
        : undefined,
      onAlt: teArchiveren ? () => archiveerEnStart(false) : undefined,
    });
  };

  // Vanaf /beheer doorgestuurd? Open dan meteen het bijbehorende scherm, en
  // haal de parameter uit de URL zodat een verversing hem niet opnieuw opent.
  useEffect(() => {
    if (loading) return;
    const params = new URLSearchParams(window.location.search);
    const actie = params.get('beheer');
    if (!['wissen', 'nieuw', 'reis'].includes(actie)) return;
    window.history.replaceState({}, '', window.location.pathname);
    if (actie === 'wissen') vraagPlanningWissen();
    else if (actie === 'nieuw') vraagNieuweVakantie();
    else setSheet({ type: 'trip-settings' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  // Vanaf /dag teruggesprongen met ?dag=YYYY-MM-DD? Ga dan naar de planning,
  // scroll naar die dag en laat hem even oplichten. Zit de dag in het verleden,
  // dan klappen de afgelopen dagen vanzelf open — anders spring je naar iets
  // wat niet in beeld staat.
  useEffect(() => {
    if (loading || days.length === 0) return;
    const params = new URLSearchParams(window.location.search);
    const dag = params.get('dag');
    if (!dag || !days.some(d => d.key === dag)) return;
    window.history.replaceState({}, '', window.location.pathname);
    setActiveTab('plan');
    if (dag < vandaagKey()) setToonVerleden(true);
    setGemarkeerdeDag(dag);
    // Na de render: naar de dag toe. Twee tellen oplichten is genoeg om hem
    // terug te vinden zonder dat het gaat knipperen.
    setTimeout(() => {
      dagRefs.current[dag]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 60);
    const t = setTimeout(() => setGemarkeerdeDag(null), 2400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, days.length]);

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh', background: COLORS.cream,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: "'DM Sans', sans-serif", color: COLORS.ink,
      }}>Laden…</div>
    );
  }

  return (
    <div style={{
      fontFamily: "'DM Sans', sans-serif",
      background: COLORS.cream, color: COLORS.charcoal,
      minHeight: '100vh', position: 'relative', overflow: 'hidden',
    }}>
      <TopoBackground />

      <div style={{ position: 'relative', zIndex: 1, maxWidth: 720, margin: '0 auto' }}>
        <Header
          tripConfig={tripConfig}
          stays={stays}
          totalDays={days.length}
          stats={stats}
          name={name}
          onNameChange={saveName}
          syncStatus={syncStatus}
          lastUpdate={lastUpdateText}
          onRefresh={() => fetchData(true)}
          onOpenTripSettings={() => setSheet({ type: 'trip-settings' })}
        />
        <TabBar active={activeTab} setActive={setActiveTab} />

        {offlineOp && (
          <div style={{ padding: '0 20px' }}>
            <OfflineMelding op={offlineOp} onOpnieuw={() => fetchData(true)} />
          </div>
        )}

        {conflict && (
          <div style={{ padding: '0 20px' }}>
            <ConflictMelding
              door={conflict.door}
              onLaadHunVersie={() => { setConflict(null); fetchData(true); }}
              onForceer={async () => {
                // Meteen schrijven zonder versiecontrole; het opslag-effect
                // hoeft daar niet aan te pas te komen.
                setConflict(null);
                setSyncStatus('syncing');
                try {
                  const data = await apiPut(
                    plan, customActivities, locationOverrides, tripConfig,
                    suggestExclusions, name, undefined,
                  );
                  versie.current = data.updatedAt ?? null;
                  setServerUpdate({ at: data.updatedAt, by: data.updatedBy });
                  setSyncStatus('synced');
                  setTimeout(() => setSyncStatus('idle'), 1500);
                } catch {
                  setSyncStatus('offline');
                }
              }}
            />
          </div>
        )}

        {activeTab === 'plan' ? (
          <PlanView
            days={days}
            plan={plan}
            activityById={activityById}
            weerPerDag={weerPerDag}
            routeAnkers={routeAnkers}
            offline={Boolean(offlineOp)}
            toonVerleden={toonVerleden}
            onToonVerleden={setToonVerleden}
            gemarkeerdeDag={gemarkeerdeDag}
            dagRefs={dagRefs}
            onOptimaliseer={optimaliseerDag}
            onZetVolgorde={zetVolgorde}
            onZetAnker={zetAnker}
            onAddClick={(dayKey) => setSheet({ type: 'pick-activity', dayKey })}
            onRemove={removeFromDay}
            onEditLocation={(act) => setSheet({ type: 'edit-location', activityId: act.id })}
            onMove={moveInDay}
            onUpdateProps={updateActivityProps}
            onMoveToDay={moveActivityToDay}
            onSwapDay={swapDays}
            onOpenTripSettings={() => setSheet({ type: 'trip-settings' })}
          />
        ) : (
          <LibraryView
            activities={allActivities.map(a => applyLocationOverride(a, locationOverrides))}
            plan={plan}
            stays={stays}
            onAddClick={(activityId) => setSheet({ type: 'pick-day', activityId })}
            onCreateCustom={() => setSheet({ type: 'create-custom' })}
            onDeleteCustom={deleteCustom}
            onEditLocation={(act) => setSheet({ type: 'edit-location', activityId: act.id })}
            onOpenSuggestions={() => setSheet({ type: 'suggestions' })}
            onPasteLink={() => setSheet({ type: 'paste-link' })}
            onInDeBuurt={() => setSheet({ type: 'in-de-buurt' })}
            onBezocht={markeerBezocht}
          />
        )}

        {/* Floating settings button */}
        {activeTab === 'plan' && (
          <button
            onClick={() => setSheet({ type: 'settings' })}
            style={{
              position: 'fixed', bottom: 20, right: 20,
              background: COLORS.forest, color: COLORS.cream,
              border: 'none', borderRadius: 99,
              width: 48, height: 48, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 4px 14px rgba(45, 79, 62, 0.30)',
              zIndex: 5,
            }}
            aria-label="Beheer planning"
          >
            <Settings size={18} />
          </button>
        )}
      </div>

      {/* Sheets */}
      {sheet?.type === 'pick-activity' && (
        <PickActivitySheet
          activities={allActivities}
          plan={plan}
          days={days}
          dayKey={sheet.dayKey}
          onPick={(actId) => { addActivityToDay(sheet.dayKey, actId); setSheet(null); }}
          onCreateCustom={() => setSheet({ type: 'create-custom', returnToDay: sheet.dayKey })}
          onClose={() => setSheet(null)}
        />
      )}

      {sheet?.type === 'pick-day' && (
        <PickDaySheet
          activity={activityById[sheet.activityId]}
          plan={plan}
          days={days}
          onPick={(dayKey) => { addActivityToDay(dayKey, sheet.activityId); setSheet(null); }}
          onClose={() => setSheet(null)}
        />
      )}

      {sheet?.type === 'suggestions' && (
        <SuggestionsSheet
          stays={stays}
          days={days}
          plan={plan}
          activityById={activityById}
          existingNames={new Set(allActivities.map(a => a.name.toLowerCase()))}
          existingCoords={allActivities.filter(a => a.coords).map(a => a.coords)}
          exclusions={suggestExclusions}
          onExclude={(ex) => setSuggestExclusions(xs => [...xs, ex])}
          onClearExclusions={() => setSuggestExclusions([])}
          onCreateAt={(act) => {
            const id = `custom_${Date.now()}`;
            setCustomActivities(cs => [...cs, {
              id,
              name: act.name,
              category: 'custom',
              emoji: act.emoji || '📍',
              coords: act.coords,
              note: act.note || null,
              custom: true,
            }]);
          }}
          onAdd={(picked, dayKey, opts) => {
            const ts = Date.now();
            const newActs = picked.map((p, i) => ({
              id: `sugg_${ts}_${i}`,
              name: p.name,
              category: p.category,
              emoji: p.emoji,
              coords: p.coords,
              note: p.note,
              ...(p.routeGeometry ? { routeGeometry: p.routeGeometry } : {}),
              custom: true,
            }));
            setCustomActivities(cs => [...cs, ...newActs]);
            if (dayKey) {
              setPlan(prev => ({
                ...prev,
                [dayKey]: [...(prev?.[dayKey] || []), ...newActs.map(a => a.id)],
              }));
            }
            if (!opts?.keepOpen) setSheet(null);
          }}
          onClose={() => setSheet(null)}
        />
      )}

      {sheet?.type === 'paste-link' && (
        <PasteLinkSheet
          onCreate={(act) => {
            const id = `custom_${Date.now()}`;
            setCustomActivities(cs => [...cs, {
              id, name: act.name, category: 'custom', emoji: '📍',
              coords: act.coords, note: act.note || null, custom: true,
            }]);
            setSheet(null);
          }}
          onClose={() => setSheet(null)}
        />
      )}

      {sheet?.type === 'bezocht-dag' && (
        <PickDaySheet
          activity={activityById[sheet.activityId]}
          plan={plan}
          days={days}
          titel="Wanneer ben je hier geweest?"
          onPick={(dayKey) => {
            setPlan(p => ({ ...p, [dayKey]: [...(p[dayKey] || []), sheet.activityId] }));
            updateActivityProps(sheet.activityId, { visited: true });
            setSheet(null);
          }}
          onClose={() => setSheet(null)}
        />
      )}

      {sheet?.type === 'in-de-buurt' && (
        <InDeBuurtSheet
          days={days}
          onCreate={(plek, dagKey) => {
            // Meteen als bezocht: je staat er nu, dus je bent er geweest.
            const id = `custom_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
            setCustomActivities(cs => [...cs, {
              id, name: plek.name, category: plek.category, emoji: plek.emoji,
              coords: plek.coords, note: plek.note, custom: true, visited: true,
            }]);
            if (dagKey) {
              setPlan(p => ({ ...p, [dagKey]: [...(p[dagKey] || []), id] }));
            }
          }}
          onClose={() => setSheet(null)}
        />
      )}

      {sheet?.type === 'create-custom' && (
        <CustomActivityForm
          onSave={(data) => { createCustom(data, sheet.returnToDay); setSheet(null); }}
          onClose={() => setSheet(null)}
        />
      )}

      {sheet?.type === 'trip-settings' && (
        <TripSettingsSheet
          tripConfig={tripConfig}
          onSave={(cfg) => { setTripConfig(cfg); setSheet(null); }}
          onClose={() => setSheet(null)}
        />
      )}

      {sheet?.type === 'settings' && (
        <SettingsSheet
          onOpenTripSettings={() => setSheet({ type: 'trip-settings' })}
          onClearPlan={vraagPlanningWissen}
          onNewVacation={vraagNieuweVakantie}
          onClose={() => setSheet(null)}
        />
      )}

      {sheet?.type === 'confirm' && (
        <ConfirmSheet
          title={sheet.title}
          message={sheet.message}
          confirmText={sheet.confirmText}
          onConfirm={sheet.onConfirm}
          altText={sheet.altText}
          onAlt={sheet.onAlt}
          onClose={() => setSheet(null)}
        />
      )}

      {sheet?.type === 'edit-location' && (
        <LocationEditSheet
          activity={activityById[sheet.activityId]}
          currentOverride={locationOverrides[sheet.activityId]}
          onSave={(override) => {
            saveLocationOverride(sheet.activityId, override);
            setSheet(null);
          }}
          onClear={() => {
            clearLocationOverride(sheet.activityId);
            setSheet(null);
          }}
          onClose={() => setSheet(null)}
        />
      )}
    </div>
  );
}
