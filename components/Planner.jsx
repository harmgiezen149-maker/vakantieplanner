'use client';

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import Link from 'next/link';
import {
  Plus, X, Trash2, Sparkles, Calendar as CalendarIcon,
  ChevronRight, RefreshCw, User, Wifi, WifiOff, Check, AlertCircle, MapPin, Map as MapIcon,
  Pencil, Car, ChevronUp, ChevronDown, CheckSquare, Backpack,
  Settings, CalendarRange, Compass, Star, ShieldCheck, Wallet,
} from 'lucide-react';
import {
  COLORS, CATEGORIES, CATEGORY_ORDER, DEFAULT_ACTIVITIES,
  DEFAULT_TRIP_CONFIG, isTripConfigured, staysWithColors, buildDays, formatPeriod,
  getMapsLink, applyLocationOverride, formatDistance, formatDuration,
} from '@/lib/data';
import { useRoute } from '@/lib/useRoute';
import { useWeer } from '@/lib/useWeer';
import { formatTemp } from '@/lib/weer';
import { getPin } from '@/lib/maps';
import { archiveTripStays } from '@/lib/stayLog';
import ConflictMelding from '@/components/ConflictMelding';

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
import SuggestionsSheet from '@/components/planner/SuggestionsSheet';

// ============ API CLIENT ============

const getName = () => {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem('planner-name') || '';
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
async function apiPut(plan, customActivities, locationOverrides, tripConfig, suggestExclusions, name, basisVersie) {
  const res = await fetch('/api/plan', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'X-Family-Pin': getPin(),
    },
    body: JSON.stringify({
      plan, customActivities, locationOverrides, tripConfig, suggestExclusions,
      updatedBy: name || null, basisVersie,
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

  return (
    <header style={{ padding: '24px 20px 12px', position: 'relative', zIndex: 1 }}>
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

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div style={{ flex: '1 1 240px', minWidth: 200 }}>
          <h1 style={{
            fontFamily: "'Fraunces', serif",
            fontSize: 34, lineHeight: 1.08, margin: 0,
            color: COLORS.forest, fontWeight: 500, letterSpacing: '-0.02em',
          }}>
            {tripConfig.title || 'Onze vakantie'}
          </h1>

          <p style={{ margin: '10px 0 0', color: COLORS.ink, fontSize: 13, lineHeight: 1.5 }}>
            {[stayNames, period].filter(Boolean).join(' · ') || 'Stel de reis in via Instellingen'}
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: '0 1 200px', minWidth: 170 }}>
          {[
            { href: '/dag', icon: <CalendarIcon size={18} />, label: 'Dagoverzicht' },
            { href: '/kaart', icon: <MapIcon size={18} />, label: 'Kaart' },
            { href: '/checklist', icon: <CheckSquare size={18} />, label: 'Auto & documenten' },
            { href: '/inpakken', icon: <Backpack size={18} />, label: 'Inpaklijst' },
            { href: '/verblijven', icon: <Star size={18} />, label: 'Verblijven' },
            { href: '/uitgaven', icon: <Wallet size={18} />, label: 'Uitgaven' },
          ].map((b) => (
            <Link
              key={b.href}
              href={b.href}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '11px 13px',
                background: 'rgba(58, 126, 132, 0.10)',
                color: COLORS.forest,
                borderRadius: 12,
                textDecoration: 'none',
                fontFamily: "'DM Sans', sans-serif",
                fontSize: 14, fontWeight: 600,
              }}
            >
              <span style={{ color: COLORS.lake, display: 'flex', flexShrink: 0 }}>{b.icon}</span>
              <span style={{ flex: 1 }}>{b.label}</span>
              <ChevronRight size={16} style={{ color: COLORS.lake, flexShrink: 0 }} />
            </Link>
          ))}
          <button
            onClick={onOpenTripSettings}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '11px 13px',
              background: 'transparent',
              color: COLORS.forest,
              border: `1px dashed ${COLORS.lake}60`,
              borderRadius: 12,
              cursor: 'pointer',
              fontFamily: "'DM Sans', sans-serif",
              fontSize: 14, fontWeight: 600,
              textAlign: 'left',
            }}
          >
            <span style={{ color: COLORS.lake, display: 'flex', flexShrink: 0 }}><Settings size={18} /></span>
            <span style={{ flex: 1 }}>Reis instellen</span>
            <ChevronRight size={16} style={{ color: COLORS.lake, flexShrink: 0 }} />
          </button>
        </div>
      </div>

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

const ActivityChip = ({ activity, dayKey, days, onRemove, onEditLocation, onMoveUp, onMoveDown, canMoveUp, canMoveDown, onUpdateProps, onMoveToDay }) => {
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
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{activity.name}</span>
        </div>
        {activity.note && (
          <div style={{ fontSize: 11, color: COLORS.inkLight, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{activity.note}</div>
        )}
      </div>
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

// ============ DAY CARD ============

const DayCard = ({ day, days: allDays, activities, activityById, plan: planRef, weer, onAddClick, onRemove, onEditLocation, onMove, onUpdateProps, onMoveToDay, onSwapDay }) => {
  const [swapping, setSwapping] = useState(false);
  const hasActivities = activities.length > 0;
  const stay = day.stay;

  // Verzamel coords voor route-berekening
  const routePoints = useMemo(() => {
    const acts = activities.map(id => activityById[id]).filter(a => a && a.coords);
    if (acts.length === 0) return [];
    const pts = [];
    if (day.startCoords) pts.push(day.startCoords);
    acts.forEach(a => pts.push(a.coords));
    if (day.endCoords) pts.push(day.endCoords);
    // Dedupliceer aangrenzende identieke coördinaten (bv. activiteit op het verblijf zelf)
    const cleaned = pts.filter((p, i) => {
      if (i === 0) return true;
      const [la, ln] = p;
      const [pla, pln] = pts[i - 1];
      return Math.abs(la - pla) > 0.0001 || Math.abs(ln - pln) > 0.0001;
    });
    return cleaned.length >= 2 ? cleaned : [];
  }, [activities, activityById, day]);

  const { route } = useRoute(routePoints, hasActivities);
  const hasStartCoords = Boolean(day.startCoords);

  return (
    <div style={{
      background: hasActivities ? COLORS.creamSoft : 'rgba(250, 243, 225, 0.4)',
      borderRadius: 16, padding: 16,
      border: `1px solid ${COLORS.hairline}`,
      borderLeft: `4px solid ${stay?.color || COLORS.hairline}`,
      transition: 'all 0.2s ease',
    }}>
      <div style={{
        display: 'flex', alignItems: 'baseline', gap: 10,
        marginBottom: hasActivities ? 12 : 8,
      }}>
        <div style={{
          fontFamily: "'Fraunces', serif", fontSize: 11,
          letterSpacing: 1.5, textTransform: 'uppercase',
          color: COLORS.inkLight, fontWeight: 500,
        }}>{day.dayShort}</div>
        <div style={{
          fontFamily: "'Fraunces', serif", fontSize: 22,
          color: COLORS.forest, fontWeight: 500, letterSpacing: '-0.01em',
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
        {hasActivities && (
          <button
            onClick={() => setSwapping(s => !s)}
            title="Wissel deze dag met een andere dag"
            style={{
              marginLeft: day.label ? 8 : 'auto',
              border: `1px solid ${swapping ? COLORS.forest : COLORS.hairline}`,
              background: swapping ? `${COLORS.forest}12` : 'transparent',
              color: swapping ? COLORS.forest : COLORS.inkLight,
              borderRadius: 99, padding: '4px 10px', cursor: 'pointer',
              fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 600,
              display: 'inline-flex', alignItems: 'center', gap: 4,
            }}
          >
            <RefreshCw size={12} /> Wissel dag
          </button>
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
          <Car size={12} />
          <span>{formatDistance(route.totalDistance)}</span>
          <span style={{ opacity: 0.5 }}>·</span>
          <span>{formatDuration(route.totalDuration)} rijden</span>
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

const PlanView = ({ days, plan, activityById, weerPerDag, onAddClick, onRemove, onEditLocation, onMove, onUpdateProps, onMoveToDay, onSwapDay, onOpenTripSettings }) => {
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
  return (
    <div style={{ padding: '16px 20px 100px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      {days.map(day => (
        <DayCard
          key={day.key}
          day={day}
          days={days}
          activities={plan[day.key] || []}
          activityById={activityById}
          plan={plan}
          weer={weerPerDag?.[day.key]}
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

// ============ LIBRARY VIEW ============

const LibraryActivity = ({ activity, usedInDays, onAddClick, onDelete, onEditLocation }) => {
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
        {usedInDays > 0 && (
          <div style={{
            fontSize: 10, color: cat.color, marginTop: 4,
            fontWeight: 600, letterSpacing: 0.3,
          }}>
            Gepland: {usedInDays}×
          </div>
        )}
      </div>
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

const LibraryView = ({ activities, plan, onAddClick, onCreateCustom, onDeleteCustom, onEditLocation, onOpenSuggestions, onPasteLink }) => {
  const planUsage = useMemo(() => {
    const usage = {};
    Object.values(plan).flat().forEach(id => { usage[id] = (usage[id] || 0) + 1; });
    return usage;
  }, [plan]);

  const grouped = useMemo(() => {
    const out = {};
    activities.forEach(a => {
      const cat = CATEGORIES[a.category] ? a.category : 'custom';
      if (!out[cat]) out[cat] = [];
      out[cat].push(a);
    });
    return out;
  }, [activities]);

  return (
    <div style={{ padding: '16px 20px 100px' }}>
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
  const [tripConfig, setTripConfig] = useState(DEFAULT_TRIP_CONFIG);
  const [loading, setLoading] = useState(true);
  const [sheet, setSheet] = useState(null);
  const [syncStatus, setSyncStatus] = useState('idle'); // 'idle' | 'syncing' | 'synced' | 'offline'
  const [serverUpdate, setServerUpdate] = useState({ at: null, by: null });
  const [conflict, setConflict] = useState(null);
  const [name, setName] = useState('');

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
      versie.current = data.updatedAt ?? null;
      setPlan(data.plan || {});
      setCustomActivities(data.customActivities || []);
      setLocationOverrides(data.locationOverrides || {});
      setSuggestExclusions(data.suggestExclusions || []);
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
      if (e.message === 'unauthorized') {
        setUnlocked(false);
      } else {
        setSyncStatus('offline');
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
    if (skipNextSave.current) {
      skipNextSave.current = false;
      return;
    }
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setSyncStatus('syncing');
    saveTimer.current = setTimeout(async () => {
      try {
        const data = await apiPut(
          plan, customActivities, locationOverrides, tripConfig, suggestExclusions, name,
          versie.current,
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
  }, [plan, customActivities, locationOverrides, tripConfig, suggestExclusions, name, loading]);

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
        const r = await archiveTripStays(tripConfig, name);
        if (r.added > 0) {
          window.alert(
            `${r.added} ${r.added === 1 ? 'verblijf' : 'verblijven'} bewaard in het logboek.` +
            (r.skipped ? ` ${r.skipped} stond${r.skipped === 1 ? '' : 'en'} er al in.` : '') +
            '\n\nJe vindt ze terug onder “Verblijven”.'
          );
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

  // Losse functies (in plaats van closures in de JSX) omdat /beheer er
  // rechtstreeks naartoe kan linken: ?beheer=wissen of ?beheer=nieuw.
  const vraagPlanningWissen = () => {
    setSheet({
      type: 'confirm',
      title: 'Hele planning wissen?',
      message: `Alle ${days.length || ''} dagen worden leeggemaakt. Eigen activiteiten en reisinstellingen blijven bewaard.`,
      confirmText: 'Alles wissen',
      onConfirm: () => setPlan({}),
    });
  };

  const vraagNieuweVakantie = () => {
    const teArchiveren = (tripConfig.stays || []).length;
    const basis = 'De planning en eigen activiteiten worden gewist. Daarna stel je de nieuwe periode en verblijven in. De inpaklijst en auto-checklist blijven staan.';
    setSheet({
      type: 'confirm',
      title: 'Nieuwe vakantie starten?',
      message: teArchiveren
        ? `${basis}\n\nJe hebt ${teArchiveren} ${teArchiveren === 1 ? 'verblijf' : 'verblijven'} ingesteld. Wil je ${teArchiveren === 1 ? 'dat' : 'die'} eerst bewaren in het verblijvenlogboek, zodat je er later een cijfer en foto's aan kunt hangen?`
        : basis,
      confirmText: teArchiveren ? 'Bewaren en starten' : 'Nieuwe vakantie',
      onConfirm: () => archiveerEnStart(Boolean(teArchiveren)),
      altText: teArchiveren ? 'Starten zonder bewaren' : undefined,
      onAlt: teArchiveren ? () => archiveerEnStart(false) : undefined,
    });
  };

  // Vanaf /beheer doorgestuurd? Open dan meteen de bijbehorende vraag, en haal
  // de parameter uit de URL zodat een verversing hem niet opnieuw opent.
  useEffect(() => {
    if (loading) return;
    const params = new URLSearchParams(window.location.search);
    const actie = params.get('beheer');
    if (actie !== 'wissen' && actie !== 'nieuw') return;
    window.history.replaceState({}, '', window.location.pathname);
    if (actie === 'wissen') vraagPlanningWissen();
    else vraagNieuweVakantie();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

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
            onAddClick={(activityId) => setSheet({ type: 'pick-day', activityId })}
            onCreateCustom={() => setSheet({ type: 'create-custom' })}
            onDeleteCustom={deleteCustom}
            onEditLocation={(act) => setSheet({ type: 'edit-location', activityId: act.id })}
            onOpenSuggestions={() => setSheet({ type: 'suggestions' })}
            onPasteLink={() => setSheet({ type: 'paste-link' })}
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
