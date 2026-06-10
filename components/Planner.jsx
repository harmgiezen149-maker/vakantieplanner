'use client';

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import Link from 'next/link';
import {
  Plus, X, Trash2, Sparkles, Calendar as CalendarIcon,
  ChevronRight, RefreshCw, User, Wifi, WifiOff, Check, AlertCircle, Lock, MapPin, Map as MapIcon,
  Pencil, Search, Loader2, Car, ChevronUp, ChevronDown, CheckSquare, Backpack,
  Settings, Home, CalendarRange, Compass,
} from 'lucide-react';
import {
  COLORS, CATEGORIES, CATEGORY_ORDER, DEFAULT_ACTIVITIES,
  DEFAULT_TRIP_CONFIG, isTripConfigured, staysWithColors, buildDays, formatPeriod,
  getMapsLink, applyLocationOverride, formatDistance, formatDuration,
} from '@/lib/data';
import { useRoute } from '@/lib/useRoute';

// ============ API CLIENT ============

const getPin = () => {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem('planner-pin') || '';
};
const setPin = (pin) => {
  if (typeof window === 'undefined') return;
  localStorage.setItem('planner-pin', pin);
};
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

async function apiPut(plan, customActivities, locationOverrides, tripConfig, name) {
  const res = await fetch('/api/plan', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'X-Family-Pin': getPin(),
    },
    body: JSON.stringify({ plan, customActivities, locationOverrides, tripConfig, updatedBy: name || null }),
  });
  if (!res.ok) throw new Error(res.status === 401 ? 'unauthorized' : `HTTP ${res.status}`);
  return res.json();
}

async function apiGeocode(q) {
  const res = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`, {
    headers: { 'X-Family-Pin': getPin() },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
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

// ============ PIN GATE ============

const PinGate = ({ onUnlock }) => {
  const [pin, setPinInput] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e) => {
    e?.preventDefault?.();
    if (!pin.trim()) return;
    setSubmitting(true);
    setError('');
    setPin(pin.trim());
    try {
      const res = await fetch('/api/plan', {
        headers: { 'X-Family-Pin': pin.trim() },
        cache: 'no-store',
      });
      if (res.status === 401) {
        setError('PIN klopt niet');
        setSubmitting(false);
        return;
      }
      if (!res.ok) {
        setError('Server-fout');
        setSubmitting(false);
        return;
      }
      onUnlock();
    } catch (err) {
      setError('Netwerkfout');
      setSubmitting(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh', background: COLORS.cream,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 20, position: 'relative',
    }}>
      <TopoBackground />
      <div style={{
        position: 'relative', zIndex: 1,
        maxWidth: 360, width: '100%',
        background: COLORS.creamSoft,
        borderRadius: 20, padding: 28,
        boxShadow: '0 6px 24px rgba(31,41,34,0.08)',
        border: `1px solid ${COLORS.hairline}`,
      }}>
        <div style={{
          width: 48, height: 48, borderRadius: 12,
          background: COLORS.forest, color: COLORS.cream,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          marginBottom: 16,
        }}>
          <Lock size={22} />
        </div>
        <h1 style={{
          fontFamily: "'Fraunces', serif",
          fontSize: 24, margin: '0 0 6px',
          color: COLORS.forest, fontWeight: 500, letterSpacing: '-0.01em',
        }}>Familie-PIN</h1>
        <p style={{ color: COLORS.ink, fontSize: 13, margin: '0 0 18px', lineHeight: 1.5 }}>
          Deze planner is alleen voor het gezin. Voer de gedeelde PIN in om verder te gaan.
        </p>
        <input
          type="password"
          value={pin}
          onChange={(e) => setPinInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          placeholder="PIN"
          autoFocus
          style={{
            width: '100%', padding: 14,
            background: COLORS.cream,
            border: `1px solid ${COLORS.hairline}`,
            borderRadius: 10, fontSize: 16,
            fontFamily: "'DM Sans', sans-serif",
            color: COLORS.charcoal,
          }}
        />
        {error && (
          <div style={{
            marginTop: 10, fontSize: 12, color: '#B5443B',
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <AlertCircle size={14} /> {error}
          </div>
        )}
        <button
          onClick={submit}
          disabled={submitting || !pin.trim()}
          style={{
            marginTop: 16, width: '100%', padding: 14,
            background: pin.trim() ? COLORS.forest : COLORS.hairline,
            color: pin.trim() ? COLORS.cream : COLORS.inkLight,
            border: 'none', borderRadius: 10, fontWeight: 600,
            fontFamily: "'DM Sans', sans-serif", fontSize: 14,
            cursor: pin.trim() ? 'pointer' : 'not-allowed',
          }}
        >
          {submitting ? 'Controleren…' : 'Verder'}
        </button>
      </div>
    </div>
  );
};

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
            { href: '/kaart', icon: <MapIcon size={18} />, label: 'Kaart' },
            { href: '/checklist', icon: <CheckSquare size={18} />, label: 'Auto & documenten' },
            { href: '/inpakken', icon: <Backpack size={18} />, label: 'Inpaklijst' },
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

const ActivityChip = ({ activity, onRemove, onEditLocation, onMoveUp, onMoveDown, canMoveUp, canMoveDown }) => {
  const cat = CATEGORIES[activity.category] || CATEGORIES.custom;
  const mapsLink = getMapsLink(activity);
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6,
      background: COLORS.creamSoft, borderRadius: 10, padding: '10px 10px 10px 6px',
      borderLeft: `3px solid ${cat.color}`,
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
        }}>{activity.name}</div>
        {activity.note && (
          <div style={{ fontSize: 11, color: COLORS.inkLight, marginTop: 2 }}>{activity.note}</div>
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
    </div>
  );
};

// ============ DAY CARD ============

const DayCard = ({ day, activities, activityById, onAddClick, onRemove, onEditLocation, onMove }) => {
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
      </div>

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
                  onRemove={() => onRemove(day.key, idx)}
                  onEditLocation={onEditLocation}
                  onMoveUp={() => onMove(day.key, idx, idx - 1)}
                  onMoveDown={() => onMove(day.key, idx, idx + 1)}
                  canMoveUp={idx > 0}
                  canMoveDown={idx < activities.length - 1}
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

const PlanView = ({ days, plan, activityById, onAddClick, onRemove, onEditLocation, onMove, onOpenTripSettings }) => {
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
          activities={plan[day.key] || []}
          activityById={activityById}
          onAddClick={onAddClick}
          onRemove={onRemove}
          onEditLocation={onEditLocation}
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
      {activity.category === 'custom' && (
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

const LibraryView = ({ activities, plan, onAddClick, onCreateCustom, onDeleteCustom, onEditLocation, onOpenSuggestions }) => {
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
          marginBottom: 24,
          boxShadow: '0 2px 8px rgba(201, 125, 93, 0.25)',
        }}
      >
        <Sparkles size={16} /> Eigen activiteit toevoegen
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

// ============ BOTTOM SHEET ============

const Sheet = ({ children, onClose, title }) => (
  <>
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(31, 41, 34, 0.45)',
        zIndex: 50, animation: 'fadeIn 0.2s ease',
      }}
    />
    <div style={{
      position: 'fixed', bottom: 0, left: 0, right: 0,
      background: COLORS.cream, borderRadius: '20px 20px 0 0',
      maxHeight: '85vh', overflowY: 'auto', zIndex: 51,
      animation: 'slideUp 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
      boxShadow: '0 -8px 32px rgba(31, 41, 34, 0.18)',
    }}>
      <div style={{
        position: 'sticky', top: 0, background: COLORS.cream,
        borderBottom: `1px solid ${COLORS.hairline}`,
        padding: '14px 20px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        zIndex: 1,
      }}>
        <div style={{
          width: 32, height: 4, background: COLORS.hairline, borderRadius: 2,
          position: 'absolute', left: '50%', transform: 'translateX(-50%)', top: 6,
        }} />
        <h3 style={{
          margin: '8px 0 0', fontFamily: "'Fraunces', serif",
          fontSize: 18, fontWeight: 500, color: COLORS.forest,
        }}>{title}</h3>
        <button
          onClick={onClose}
          style={{
            border: 'none', background: 'transparent', cursor: 'pointer',
            padding: 4, marginTop: 8, color: COLORS.ink,
          }}
        ><X size={20} /></button>
      </div>
      {children}
    </div>
  </>
);

const PickActivitySheet = ({ activities, plan, days, dayKey, onPick, onClose, onCreateCustom }) => {
  const day = days.find(d => d.key === dayKey);
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
    <Sheet onClose={onClose} title={`Voeg toe aan ${day?.dayShort} ${day?.date}`}>
      <div style={{ padding: '16px 20px 24px' }}>
        <button
          onClick={onCreateCustom}
          style={{
            width: '100%', padding: 12, background: 'transparent',
            color: COLORS.sunset,
            border: `1px dashed ${COLORS.sunset}`, borderRadius: 10,
            fontSize: 13, fontFamily: "'DM Sans', sans-serif",
            fontWeight: 500, cursor: 'pointer', marginBottom: 20,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}
        >
          <Sparkles size={14} /> Nieuwe eigen activiteit
        </button>

        {CATEGORY_ORDER.map(catKey => {
          const items = grouped[catKey];
          if (!items || items.length === 0) return null;
          const cat = CATEGORIES[catKey];
          return (
            <div key={catKey} style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, paddingLeft: 2 }}>
                <span style={{ fontSize: 13 }}>{cat.emoji}</span>
                <span style={{
                  fontSize: 11, fontWeight: 600, color: cat.color,
                  letterSpacing: 1, textTransform: 'uppercase',
                }}>{cat.name}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {items.map(a => {
                  const used = planUsage[a.id] || 0;
                  return (
                    <button
                      key={a.id}
                      onClick={() => onPick(a.id)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '10px 12px', background: COLORS.creamSoft,
                        border: 'none', borderLeft: `3px solid ${cat.color}`,
                        borderRadius: 8, cursor: 'pointer', textAlign: 'left',
                        fontFamily: "'DM Sans', sans-serif", width: '100%',
                      }}
                    >
                      <span style={{ fontSize: 18 }}>{a.emoji}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, color: COLORS.charcoal, fontWeight: 500 }}>{a.name}</div>
                        {a.note && <div style={{ fontSize: 10, color: COLORS.inkLight, marginTop: 1 }}>{a.note}</div>}
                      </div>
                      {used > 0 && (
                        <span style={{
                          fontSize: 10, color: cat.color, fontWeight: 600,
                          background: 'rgba(0,0,0,0.04)',
                          padding: '2px 6px', borderRadius: 99,
                        }}>{used}×</span>
                      )}
                      <ChevronRight size={14} color={COLORS.inkLight} />
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </Sheet>
  );
};

const PickDaySheet = ({ activity, plan, days, onPick, onClose }) => (
  <Sheet onClose={onClose} title={`"${activity?.name}" toevoegen aan…`}>
    <div style={{ padding: '16px 20px 24px', display: 'flex', flexDirection: 'column', gap: 6 }}>
      {days.map(day => {
        const count = (plan[day.key] || []).length;
        return (
          <button
            key={day.key}
            onClick={() => onPick(day.key)}
            style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: 12,
              background: COLORS.creamSoft, border: 'none', borderRadius: 10,
              cursor: 'pointer', textAlign: 'left',
              fontFamily: "'DM Sans', sans-serif", width: '100%',
              borderLeft: `3px solid ${day.stay?.color || COLORS.hairline}`,
            }}
          >
            <div style={{
              fontFamily: "'Fraunces', serif", fontSize: 11,
              color: COLORS.inkLight, textTransform: 'uppercase',
              letterSpacing: 1, minWidth: 22,
            }}>{day.dayShort}</div>
            <div style={{
              fontFamily: "'Fraunces', serif", fontSize: 16,
              color: COLORS.forest, fontWeight: 500, minWidth: 60,
            }}>{day.date}</div>
            {day.label && (
              <span style={{
                fontSize: 10, color: COLORS.lake,
                background: 'rgba(58, 126, 132, 0.10)',
                padding: '2px 8px', borderRadius: 99,
              }}>{day.label}</span>
            )}
            <span style={{ flex: 1 }} />
            {count > 0 && (
              <span style={{ fontSize: 11, color: COLORS.inkLight }}>
                {count} activiteit{count !== 1 ? 'en' : ''}
              </span>
            )}
            <Plus size={14} color={COLORS.forest} />
          </button>
        );
      })}
    </div>
  </Sheet>
);

// ============ LOCATION PICKER ============
// Herbruikbaar veld met OpenStreetMap autocomplete

const LocationPicker = ({ value, onChange, accentColor = COLORS.forest, placeholder }) => {
  // value shape: { label, coords: [lat,lng] } | null
  const [query, setQuery] = useState(value?.label || '');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [pickedCoords, setPickedCoords] = useState(value?.coords || null);
  const searchTimer = useRef(null);

  useEffect(() => {
    setQuery(value?.label || '');
    setPickedCoords(value?.coords || null);
  }, [value?.label, value?.coords?.[0], value?.coords?.[1]]);

  const doSearch = useCallback(async (q) => {
    if (!q || q.length < 2) {
      setResults([]); setLoading(false); return;
    }
    setLoading(true);
    try {
      const data = await apiGeocode(q);
      setResults(data.results || []);
    } catch (e) {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const onChangeText = (txt) => {
    setQuery(txt);
    setShowResults(true);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    // Als gebruiker tekst aanpast, coords zijn niet meer geldig tenzij ze opnieuw kiezen
    if (pickedCoords && txt !== value?.label) setPickedCoords(null);
    searchTimer.current = setTimeout(() => doSearch(txt), 400);
  };

  const onPick = (r) => {
    const coords = [r.lat, r.lng];
    setQuery(r.shortName);
    setPickedCoords(coords);
    setShowResults(false);
    setResults([]);
    onChange({ label: r.shortName, coords, fullName: r.name });
  };

  const onClear = () => {
    setQuery(''); setPickedCoords(null); setResults([]); setShowResults(false);
    onChange(null);
  };

  const inputStyle = {
    width: '100%', padding: '12px 40px 12px 38px',
    background: COLORS.creamSoft,
    border: `1px solid ${pickedCoords ? accentColor : COLORS.hairline}`,
    borderRadius: 10,
    fontFamily: "'DM Sans', sans-serif", fontSize: 14,
    color: COLORS.charcoal, outline: 'none', boxSizing: 'border-box',
  };

  return (
    <div style={{ position: 'relative' }}>
      <div style={{ position: 'relative' }}>
        <Search
          size={15}
          style={{
            position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
            color: COLORS.inkLight, pointerEvents: 'none',
          }}
        />
        <input
          type="text"
          value={query}
          onChange={(e) => onChangeText(e.target.value)}
          onFocus={() => setShowResults(true)}
          placeholder={placeholder || "Bv. 'Camping de la Plage' of 'Annecy'"}
          style={inputStyle}
        />
        {loading && (
          <Loader2
            size={15}
            style={{
              position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
              color: COLORS.inkLight,
              animation: 'spin 1s linear infinite',
            }}
          />
        )}
        {!loading && query && (
          <button
            onClick={onClear}
            type="button"
            style={{
              position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
              border: 'none', background: 'transparent', cursor: 'pointer',
              color: COLORS.inkLight, padding: 4,
              display: 'flex', alignItems: 'center',
            }}
            aria-label="Wis"
          ><X size={14} /></button>
        )}
      </div>

      {pickedCoords && !showResults && (
        <div style={{
          marginTop: 6, fontSize: 11,
          color: accentColor, display: 'flex', alignItems: 'center', gap: 4,
        }}>
          <MapPin size={11} /> Locatie ingesteld
        </div>
      )}

      {showResults && results.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0,
          marginTop: 4, zIndex: 60,
          background: COLORS.cream,
          border: `1px solid ${COLORS.hairline}`,
          borderRadius: 10,
          boxShadow: '0 6px 16px rgba(31,41,34,0.12)',
          maxHeight: 240, overflowY: 'auto',
        }}>
          {results.map((r, i) => (
            <button
              key={i}
              type="button"
              onClick={() => onPick(r)}
              style={{
                display: 'block', width: '100%', textAlign: 'left',
                padding: '10px 12px',
                background: 'transparent', border: 'none',
                borderBottom: i < results.length - 1 ? `1px solid ${COLORS.hairline}` : 'none',
                cursor: 'pointer',
                fontFamily: "'DM Sans', sans-serif",
              }}
            >
              <div style={{ fontSize: 13, color: COLORS.charcoal, fontWeight: 500 }}>
                {r.shortName}
              </div>
              <div style={{
                fontSize: 11, color: COLORS.inkLight, marginTop: 2,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {r.name}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

// ============ TRIP SETTINGS SHEET ============
// Hier stel je titel, periode en verblijven in — het hart van de
// generieke planner.

const labelStyle = {
  fontSize: 11, color: COLORS.inkLight, letterSpacing: 0.5,
  textTransform: 'uppercase', fontWeight: 600,
};

const inputBaseStyle = {
  width: '100%', padding: '12px 14px',
  background: COLORS.creamSoft,
  border: `1px solid ${COLORS.hairline}`, borderRadius: 10,
  fontFamily: "'DM Sans', sans-serif", fontSize: 14,
  color: COLORS.charcoal, outline: 'none', boxSizing: 'border-box',
};

const TripSettingsSheet = ({ tripConfig, onSave, onClose }) => {
  const [title, setTitle] = useState(tripConfig.title || '');
  const [startDate, setStartDate] = useState(tripConfig.startDate || '');
  const [endDate, setEndDate] = useState(tripConfig.endDate || '');
  const [stays, setStays] = useState(() =>
    (tripConfig.stays || []).map(s => ({ ...s }))
  );
  const [error, setError] = useState('');

  const updateStay = (id, patch) => {
    setStays(arr => arr.map(s => (s.id === id ? { ...s, ...patch } : s)));
  };

  const addStay = () => {
    setStays(arr => [
      ...arr,
      {
        id: `stay_${Date.now()}`,
        name: '',
        startDate: arr.length === 0 ? startDate : (arr[arr.length - 1].endDate || ''),
        endDate: arr.length === 0 ? endDate : '',
        coords: null,
        locationLabel: null,
      },
    ]);
  };

  const removeStay = (id) => {
    setStays(arr => arr.filter(s => s.id !== id));
  };

  const handleSave = () => {
    setError('');
    if (!startDate || !endDate) {
      setError('Vul een begin- en einddatum in.');
      return;
    }
    if (endDate < startDate) {
      setError('De einddatum ligt vóór de begindatum.');
      return;
    }
    for (const s of stays) {
      if (!s.name.trim()) {
        setError('Geef elk verblijf een naam.');
        return;
      }
      if (!s.startDate || !s.endDate) {
        setError(`Vul van/tot-datums in voor "${s.name}".`);
        return;
      }
      if (s.endDate < s.startDate) {
        setError(`De tot-datum van "${s.name}" ligt vóór de van-datum.`);
        return;
      }
    }
    onSave({
      title: title.trim() || 'Onze vakantie',
      startDate,
      endDate,
      stays: stays.map(s => ({
        id: s.id,
        name: s.name.trim(),
        startDate: s.startDate,
        endDate: s.endDate,
        coords: s.coords || null,
        locationLabel: s.locationLabel || null,
      })),
    });
  };

  const colored = staysWithColors({ stays });

  return (
    <Sheet onClose={onClose} title="Reis instellen">
      <div style={{ padding: '16px 20px 24px', display: 'flex', flexDirection: 'column', gap: 18 }}>

        {/* Titel */}
        <div>
          <label style={labelStyle}>Titel van de vakantie</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Bv. Dordogne 2027"
            style={{ ...inputBaseStyle, marginTop: 6 }}
          />
        </div>

        {/* Periode */}
        <div>
          <label style={labelStyle}>Periode</label>
          <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 10, color: COLORS.inkLight, marginBottom: 4 }}>Van</div>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                style={inputBaseStyle}
              />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 10, color: COLORS.inkLight, marginBottom: 4 }}>Tot en met</div>
              <input
                type="date"
                value={endDate}
                min={startDate || undefined}
                onChange={(e) => setEndDate(e.target.value)}
                style={inputBaseStyle}
              />
            </div>
          </div>
        </div>

        {/* Verblijven */}
        <div>
          <label style={labelStyle}>Verblijven (camping / Airbnb / hotel)</label>
          <div style={{ fontSize: 11, color: COLORS.inkLight, marginTop: 4, lineHeight: 1.5 }}>
            Per deelperiode één verblijf. Overlapt een dag met twee verblijven
            (uitchecken + inchecken), dan wordt dat automatisch een wisseldag.
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
            {colored.map((stay) => (
              <div
                key={stay.id}
                style={{
                  background: COLORS.creamSoft,
                  border: `1px solid ${COLORS.hairline}`,
                  borderLeft: `4px solid ${stay.color}`,
                  borderRadius: 12, padding: 14,
                  display: 'flex', flexDirection: 'column', gap: 10,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Home size={15} color={stay.color} style={{ flexShrink: 0 }} />
                  <input
                    type="text"
                    value={stay.name}
                    onChange={(e) => updateStay(stay.id, { name: e.target.value })}
                    placeholder="Naam verblijf, bv. Camping Les Pins"
                    style={{ ...inputBaseStyle, background: COLORS.cream }}
                  />
                  <button
                    onClick={() => removeStay(stay.id)}
                    style={{
                      border: 'none', background: 'transparent', cursor: 'pointer',
                      color: COLORS.inkLight, padding: 6, flexShrink: 0,
                    }}
                    aria-label="Verblijf verwijderen"
                    title="Verblijf verwijderen"
                  ><Trash2 size={15} /></button>
                </div>

                <div style={{ display: 'flex', gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 10, color: COLORS.inkLight, marginBottom: 4 }}>Van</div>
                    <input
                      type="date"
                      value={stay.startDate || ''}
                      min={startDate || undefined}
                      max={endDate || undefined}
                      onChange={(e) => updateStay(stay.id, { startDate: e.target.value })}
                      style={{ ...inputBaseStyle, background: COLORS.cream }}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 10, color: COLORS.inkLight, marginBottom: 4 }}>Tot en met</div>
                    <input
                      type="date"
                      value={stay.endDate || ''}
                      min={stay.startDate || startDate || undefined}
                      max={endDate || undefined}
                      onChange={(e) => updateStay(stay.id, { endDate: e.target.value })}
                      style={{ ...inputBaseStyle, background: COLORS.cream }}
                    />
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: 10, color: COLORS.inkLight, marginBottom: 4 }}>
                    Locatie (voor kaart & ritafstanden)
                  </div>
                  <LocationPicker
                    value={stay.coords ? { label: stay.locationLabel || stay.name, coords: stay.coords } : null}
                    onChange={(loc) => updateStay(stay.id, {
                      coords: loc?.coords || null,
                      locationLabel: loc?.label || null,
                    })}
                    accentColor={stay.color}
                    placeholder="Zoek het adres of de plaats"
                  />
                </div>
              </div>
            ))}
          </div>

          <button
            onClick={addStay}
            style={{
              marginTop: 12, width: '100%', padding: 12,
              background: 'transparent',
              border: `1px dashed ${COLORS.forest}`,
              borderRadius: 10, color: COLORS.forest,
              fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 500,
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}
          >
            <Plus size={14} /> Verblijf toevoegen
          </button>
        </div>

        {error && (
          <div style={{
            fontSize: 12, color: '#B5443B',
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <AlertCircle size={14} /> {error}
          </div>
        )}

        <button
          onClick={handleSave}
          style={{
            padding: 14,
            background: COLORS.forest, color: COLORS.cream,
            border: 'none', borderRadius: 10,
            fontFamily: "'DM Sans', sans-serif", fontSize: 14, fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Opslaan
        </button>
      </div>
    </Sheet>
  );
};

// ============ CUSTOM ACTIVITY FORM ============

const CustomActivityForm = ({ onSave, onClose }) => {
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const [emoji, setEmoji] = useState('✨');
  const [category, setCategory] = useState('custom');
  const [location, setLocation] = useState(null);
  // location shape: { label, coords: [lat,lng], fullName } | null

  const handleSave = () => {
    if (!name.trim()) return;
    const data = {
      name: name.trim(),
      note: note.trim(),
      emoji: emoji.trim() || '✨',
      category,
    };
    if (location?.coords) {
      data.coords = location.coords;
      data.locationLabel = location.label;
      // Voor Google Maps link
      data.mapsQuery = location.fullName || location.label;
    }
    onSave(data);
  };

  return (
    <Sheet onClose={onClose} title="Nieuwe eigen activiteit">
      <div style={{ padding: '16px 20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <label style={labelStyle}>Naam</label>
          <input
            type="text" value={name} onChange={(e) => setName(e.target.value)}
            placeholder="Bv. Kasteel bezoeken"
            style={{ ...inputBaseStyle, marginTop: 6 }} autoFocus
          />
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ width: 80 }}>
            <label style={labelStyle}>Emoji</label>
            <input
              type="text" value={emoji} onChange={(e) => setEmoji(e.target.value)}
              maxLength={2}
              style={{ ...inputBaseStyle, marginTop: 6, textAlign: 'center', fontSize: 22 }}
            />
          </div>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Categorie</label>
            <select
              value={category} onChange={(e) => setCategory(e.target.value)}
              style={{ ...inputBaseStyle, marginTop: 6 }}
            >
              {CATEGORY_ORDER.map((k) => (
                <option key={k} value={k}>{CATEGORIES[k].emoji} {CATEGORIES[k].name}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label style={labelStyle}>Notitie (optioneel)</label>
          <input
            type="text" value={note} onChange={(e) => setNote(e.target.value)}
            placeholder="Korte beschrijving"
            style={{ ...inputBaseStyle, marginTop: 6 }}
          />
        </div>

        <div>
          <label style={labelStyle}>Locatie (optioneel)</label>
          <div style={{ marginTop: 6 }}>
            <LocationPicker value={location} onChange={setLocation} />
          </div>
        </div>

        <button
          onClick={handleSave} disabled={!name.trim()}
          style={{
            marginTop: 8, padding: 14,
            background: name.trim() ? COLORS.forest : COLORS.hairline,
            color: name.trim() ? COLORS.cream : COLORS.inkLight,
            border: 'none', borderRadius: 10,
            fontFamily: "'DM Sans', sans-serif", fontSize: 14, fontWeight: 600,
            cursor: name.trim() ? 'pointer' : 'not-allowed',
            transition: 'all 0.15s',
          }}
        >
          Opslaan
        </button>
      </div>
    </Sheet>
  );
};

// ============ LOCATION EDIT SHEET (voor bestaande activiteit) ============

const LocationEditSheet = ({ activity, currentOverride, onSave, onClear, onClose }) => {
  const initial = useMemo(() => {
    if (activity?.coords) {
      return {
        label: activity.locationLabel || activity.mapsQuery || activity.name,
        coords: activity.coords,
      };
    }
    return null;
  }, [activity]);

  const [location, setLocation] = useState(initial);
  const hasOverride = Boolean(currentOverride && Object.keys(currentOverride).length > 0);

  const handleSave = () => {
    if (location?.coords) {
      onSave({
        coords: location.coords,
        locationLabel: location.label,
        mapsQuery: location.fullName || location.label,
        mapsPlaceId: null, // wis oude place ID, want override gebruikt eigen zoekquery
      });
    } else {
      onSave({ coords: null, locationLabel: null, mapsQuery: null, mapsPlaceId: null });
    }
  };

  if (!activity) return null;

  return (
    <Sheet onClose={onClose} title="Locatie wijzigen">
      <div style={{ padding: '8px 20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '10px 12px',
          background: COLORS.creamSoft,
          borderRadius: 10,
        }}>
          <span style={{ fontSize: 22 }}>{activity.emoji}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 500, color: COLORS.charcoal }}>{activity.name}</div>
            {activity.note && (
              <div style={{ fontSize: 11, color: COLORS.inkLight, marginTop: 2 }}>{activity.note}</div>
            )}
          </div>
        </div>

        <div>
          <label style={labelStyle}>Locatie</label>
          <div style={{ marginTop: 6 }}>
            <LocationPicker value={location} onChange={setLocation} />
          </div>
          <div style={{ fontSize: 11, color: COLORS.inkLight, marginTop: 6, lineHeight: 1.4 }}>
            Wijzigt waar deze activiteit op de kaart verschijnt en wat de "Open in Google Maps" knop opent. Geldt voor het hele gezin.
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          {hasOverride && (
            <button
              onClick={onClear}
              style={{
                flex: 1, padding: 12, background: 'transparent',
                color: COLORS.wine, border: `1px solid ${COLORS.wine}40`,
                borderRadius: 10, fontFamily: "'DM Sans', sans-serif",
                fontSize: 13, fontWeight: 500, cursor: 'pointer',
              }}
            >Standaard herstellen</button>
          )}
          <button
            onClick={handleSave}
            style={{
              flex: 1, padding: 12, background: COLORS.forest,
              color: COLORS.cream, border: 'none', borderRadius: 10,
              fontFamily: "'DM Sans', sans-serif",
              fontSize: 14, fontWeight: 600, cursor: 'pointer',
            }}
          >Opslaan</button>
        </div>
      </div>
    </Sheet>
  );
};

const ConfirmSheet = ({ title, message, confirmText, onConfirm, onClose }) => (
  <Sheet onClose={onClose} title={title}>
    <div style={{ padding: '8px 20px 24px' }}>
      <p style={{ color: COLORS.ink, fontSize: 14, lineHeight: 1.5, marginBottom: 18 }}>
        {message}
      </p>
      <div style={{ display: 'flex', gap: 10 }}>
        <button
          onClick={onClose}
          style={{
            flex: 1, padding: 12, background: 'transparent',
            color: COLORS.ink, border: `1px solid ${COLORS.hairline}`,
            borderRadius: 10, fontFamily: "'DM Sans', sans-serif",
            fontSize: 14, fontWeight: 500, cursor: 'pointer',
          }}
        >Annuleer</button>
        <button
          onClick={() => { onConfirm(); onClose(); }}
          style={{
            flex: 1, padding: 12, background: COLORS.wine,
            color: COLORS.cream, border: 'none', borderRadius: 10,
            fontFamily: "'DM Sans', sans-serif",
            fontSize: 14, fontWeight: 600, cursor: 'pointer',
          }}
        >{confirmText}</button>
      </div>
    </div>
  </Sheet>
);

// ============ OMGEVINGSSUGGESTIES ============

const SuggestionsSheet = ({ stays, existingNames, onAdd, onClose }) => {
  const staysWithCoords = stays.filter(s => s.coords);
  const [stayId, setStayId] = useState(staysWithCoords[0]?.id ?? null);
  const [radiusKm, setRadiusKm] = useState(20);
  const [state, setState] = useState('idle'); // idle | loading | done | error
  const [results, setResults] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [errMsg, setErrMsg] = useState('');

  const stay = staysWithCoords.find(s => s.id === stayId) || null;

  const search = async () => {
    if (!stay) return;
    setState('loading');
    setResults([]);
    setSelected(new Set());
    try {
      const res = await fetch('/api/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Family-Pin': getPin() },
        body: JSON.stringify({ lat: stay.coords[0], lng: stay.coords[1], radius: radiusKm * 1000 }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        if (d.error === 'rate_limited') {
          throw new Error('Even te veel aanvragen — probeer het over een minuut opnieuw.');
        }
        const detail = [d.error || `status ${res.status}`, d.detail].filter(Boolean).join(' · ');
        throw new Error(`Suggesties ophalen mislukt (${detail}). Probeer het later opnieuw.`);
      }
      const data = await res.json();
      const fresh = (data.suggestions || [])
        .filter(s => !existingNames.has(s.name.toLowerCase()));
      setResults(fresh);
      // Standaard alles aangevinkt zou te veel zijn; start leeg
      setState('done');
    } catch (e) {
      setErrMsg(e.message);
      setState('error');
    }
  };

  const toggle = (idx) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  };

  const grouped = useMemo(() => {
    const out = {};
    results.forEach((r, idx) => {
      const cat = CATEGORIES[r.category] ? r.category : 'custom';
      if (!out[cat]) out[cat] = [];
      out[cat].push({ ...r, idx });
    });
    return out;
  }, [results]);

  const confirmAdd = () => {
    const picked = results.filter((_, idx) => selected.has(idx));
    if (picked.length === 0) return;
    onAdd(picked.map(p => ({
      name: p.name,
      category: p.category,
      emoji: p.emoji,
      coords: p.coords,
      note: `≈ ${p.distKm} km van ${stay?.name ?? 'verblijf'} · via OpenStreetMap`,
    })));
  };

  return (
    <Sheet onClose={onClose} title="Ontdek de omgeving">
      <div style={{ padding: '16px 20px 24px' }}>
        {staysWithCoords.length === 0 ? (
          <div style={{ fontSize: 14, color: COLORS.ink, lineHeight: 1.6 }}>
            Geen verblijf met een locatie gevonden. Stel eerst bij "Reis instellen"
            een locatie in voor je camping of huisje — daarna kan ik de omgeving
            doorzoeken op bezienswaardigheden, zwemplekken en supermarkten.
          </div>
        ) : (
          <>
            <p style={{ fontSize: 13, color: COLORS.inkLight, margin: '0 0 14px', lineHeight: 1.5 }}>
              Zoekt via OpenStreetMap naar bezienswaardigheden, musea, kastelen,
              uitkijkpunten, zwemplekken, markten en supermarkten rond je verblijf.
              Vink aan wat je interessant vindt — die komen in je activiteitenlijst.
            </p>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
              {staysWithCoords.map(s => (
                <button
                  key={s.id}
                  onClick={() => { setStayId(s.id); setState('idle'); setResults([]); }}
                  style={{
                    padding: '8px 14px', borderRadius: 99, fontSize: 13, fontWeight: 600,
                    fontFamily: "'DM Sans', sans-serif", cursor: 'pointer',
                    background: stayId === s.id ? s.color : 'transparent',
                    color: stayId === s.id ? COLORS.cream : COLORS.ink,
                    border: `1px solid ${stayId === s.id ? s.color : COLORS.hairline}`,
                  }}
                >🏡 {s.name}</button>
              ))}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <span style={{ fontSize: 13, color: COLORS.ink }}>Zoekstraal:</span>
              {[10, 20, 30].map(km => (
                <button
                  key={km}
                  onClick={() => setRadiusKm(km)}
                  style={{
                    padding: '6px 12px', borderRadius: 99, fontSize: 12, fontWeight: 600,
                    fontFamily: "'DM Sans', sans-serif", cursor: 'pointer',
                    background: radiusKm === km ? COLORS.forest : 'transparent',
                    color: radiusKm === km ? COLORS.cream : COLORS.ink,
                    border: `1px solid ${radiusKm === km ? COLORS.forest : COLORS.hairline}`,
                  }}
                >{km} km</button>
              ))}
            </div>

            <button
              onClick={search}
              disabled={state === 'loading' || !stay}
              style={{
                width: '100%', padding: 13,
                background: state === 'loading' ? COLORS.inkLight : COLORS.forest,
                color: COLORS.cream, border: 'none', borderRadius: 12,
                fontSize: 14, fontWeight: 600, fontFamily: "'DM Sans', sans-serif",
                cursor: state === 'loading' ? 'wait' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                marginBottom: 16,
              }}
            >
              {state === 'loading'
                ? <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Omgeving doorzoeken…</>
                : <><Compass size={16} /> Zoek rond {stay?.name ?? 'verblijf'}</>}
            </button>

            {state === 'error' && (
              <div style={{
                padding: 12, borderRadius: 10, fontSize: 13,
                background: 'rgba(201, 125, 93, 0.12)', color: COLORS.sunset,
                marginBottom: 12,
              }}>{errMsg}</div>
            )}

            {state === 'done' && results.length === 0 && (
              <div style={{ fontSize: 13, color: COLORS.inkLight }}>
                Niets nieuws gevonden binnen {radiusKm} km. Probeer een grotere
                zoekstraal, of voeg zelf activiteiten toe.
              </div>
            )}

            {results.length > 0 && (
              <>
                {CATEGORY_ORDER.map(catKey => {
                  const list = grouped[catKey];
                  if (!list || list.length === 0) return null;
                  const cat = CATEGORIES[catKey];
                  return (
                    <div key={catKey} style={{ marginBottom: 18 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                        <span style={{ fontSize: 14 }}>{cat.emoji}</span>
                        <span style={{
                          fontFamily: "'Fraunces', serif", fontSize: 15,
                          fontWeight: 500, color: cat.color,
                        }}>{cat.name}</span>
                        <span style={{ flex: 1, height: 1, background: COLORS.hairline }} />
                        <span style={{ fontSize: 11, color: COLORS.inkLight }}>{list.length}</span>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {list.map(r => (
                          <button
                            key={r.idx}
                            onClick={() => toggle(r.idx)}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 10,
                              padding: '10px 12px', width: '100%', textAlign: 'left',
                              background: selected.has(r.idx) ? `${cat.color}1A` : COLORS.creamSoft,
                              border: `1px solid ${selected.has(r.idx) ? cat.color : 'transparent'}`,
                              borderRadius: 10, cursor: 'pointer',
                              fontFamily: "'DM Sans', sans-serif",
                            }}
                          >
                            <span style={{
                              width: 18, height: 18, borderRadius: 5, flexShrink: 0,
                              border: `2px solid ${selected.has(r.idx) ? cat.color : COLORS.hairline}`,
                              background: selected.has(r.idx) ? cat.color : 'transparent',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                              {selected.has(r.idx) && <Check size={12} color={COLORS.cream} />}
                            </span>
                            <span style={{ fontSize: 14 }}>{r.emoji}</span>
                            <span style={{ flex: 1, fontSize: 13, color: COLORS.charcoal, fontWeight: 500 }}>
                              {r.name}
                            </span>
                            <span style={{ fontSize: 11, color: COLORS.inkLight, whiteSpace: 'nowrap' }}>
                              {r.distKm} km
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}

                <button
                  onClick={confirmAdd}
                  disabled={selected.size === 0}
                  style={{
                    width: '100%', padding: 14, marginTop: 4,
                    background: selected.size === 0 ? COLORS.hairline : COLORS.sunset,
                    color: selected.size === 0 ? COLORS.inkLight : COLORS.cream,
                    border: 'none', borderRadius: 12,
                    fontSize: 14, fontWeight: 600, fontFamily: "'DM Sans', sans-serif",
                    cursor: selected.size === 0 ? 'default' : 'pointer',
                  }}
                >
                  {selected.size === 0
                    ? 'Vink activiteiten aan om toe te voegen'
                    : `${selected.size} ${selected.size === 1 ? 'activiteit' : 'activiteiten'} toevoegen`}
                </button>
              </>
            )}
          </>
        )}
      </div>
    </Sheet>
  );
};

const SettingsSheet = ({ onClose, onOpenTripSettings, onClearPlan, onNewVacation }) => (
  <Sheet onClose={onClose} title="Planning beheren">
    <div style={{ padding: '8px 20px 24px', display: 'flex', flexDirection: 'column', gap: 10 }}>
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

export default function Planner({ authRequired }) {
  const [unlocked, setUnlocked] = useState(!authRequired);
  const [activeTab, setActiveTab] = useState('plan');
  const [plan, setPlan] = useState({});
  const [customActivities, setCustomActivities] = useState([]);
  const [locationOverrides, setLocationOverrides] = useState({});
  const [tripConfig, setTripConfig] = useState(DEFAULT_TRIP_CONFIG);
  const [loading, setLoading] = useState(true);
  const [sheet, setSheet] = useState(null);
  const [syncStatus, setSyncStatus] = useState('idle'); // 'idle' | 'syncing' | 'synced' | 'offline'
  const [serverUpdate, setServerUpdate] = useState({ at: null, by: null });
  const [name, setName] = useState('');

  const saveTimer = useRef(null);
  const skipNextSave = useRef(true);
  const firstLoad = useRef(true);

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
      setPlan(data.plan || {});
      setCustomActivities(data.customActivities || []);
      setLocationOverrides(data.locationOverrides || {});
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
    if (unlocked) fetchData();
  }, [unlocked, fetchData]);

  // Refresh on focus
  useEffect(() => {
    if (!unlocked) return;
    const onFocus = () => fetchData(false);
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [unlocked, fetchData]);

  // Debounced auto-save
  useEffect(() => {
    if (!unlocked || loading) return;
    if (skipNextSave.current) {
      skipNextSave.current = false;
      return;
    }
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setSyncStatus('syncing');
    saveTimer.current = setTimeout(async () => {
      try {
        const data = await apiPut(plan, customActivities, locationOverrides, tripConfig, name);
        setServerUpdate({ at: data.updatedAt, by: data.updatedBy });
        setSyncStatus('synced');
        setTimeout(() => setSyncStatus('idle'), 1500);
      } catch (e) {
        setSyncStatus('offline');
      }
    }, 500);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [plan, customActivities, locationOverrides, tripConfig, name, unlocked, loading]);

  // Dynamische dagenlijst uit de reisconfiguratie
  const days = useMemo(() => buildDays(tripConfig), [tripConfig]);
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
      // Voor built-in activities: gebruik override-record
      return { ...o, [activityId]: override };
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

  if (authRequired && !unlocked) {
    return <PinGate onUnlock={() => setUnlocked(true)} />;
  }

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

        {activeTab === 'plan' ? (
          <PlanView
            days={days}
            plan={plan}
            activityById={activityById}
            onAddClick={(dayKey) => setSheet({ type: 'pick-activity', dayKey })}
            onRemove={removeFromDay}
            onEditLocation={(act) => setSheet({ type: 'edit-location', activityId: act.id })}
            onMove={moveInDay}
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
          existingNames={new Set(allActivities.map(a => a.name.toLowerCase()))}
          onAdd={(picked) => {
            const ts = Date.now();
            setCustomActivities(cs => [
              ...cs,
              ...picked.map((p, i) => ({
                id: `sugg_${ts}_${i}`,
                name: p.name,
                category: p.category,
                emoji: p.emoji,
                coords: p.coords,
                note: p.note,
                custom: true,
              })),
            ]);
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
          onClearPlan={() => {
            setSheet({
              type: 'confirm',
              title: 'Hele planning wissen?',
              message: `Alle ${days.length || ''} dagen worden leeggemaakt. Eigen activiteiten en reisinstellingen blijven bewaard.`,
              confirmText: 'Alles wissen',
              onConfirm: () => setPlan({}),
            });
          }}
          onNewVacation={() => {
            setSheet({
              type: 'confirm',
              title: 'Nieuwe vakantie starten?',
              message: 'De planning en eigen activiteiten worden gewist. Daarna stel je de nieuwe periode en verblijven in. De inpaklijst en auto-checklist blijven staan.',
              confirmText: 'Nieuwe vakantie',
              onConfirm: () => {
                setPlan({});
                setCustomActivities([]);
                setLocationOverrides({});
                setTripConfig(DEFAULT_TRIP_CONFIG);
                // Open daarna direct de reisinstellingen
                setTimeout(() => setSheet({ type: 'trip-settings' }), 0);
              },
            });
          }}
          onClose={() => setSheet(null)}
        />
      )}

      {sheet?.type === 'confirm' && (
        <ConfirmSheet
          title={sheet.title}
          message={sheet.message}
          confirmText={sheet.confirmText}
          onConfirm={sheet.onConfirm}
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
