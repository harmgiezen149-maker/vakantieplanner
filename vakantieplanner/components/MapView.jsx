'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import Link from 'next/link';
import { ArrowLeft, Filter, X, ExternalLink, ChevronLeft, ChevronRight, Plus, Eye, EyeOff, Loader2 } from 'lucide-react';
import {
  COLORS, CATEGORIES, DEFAULT_ACTIVITIES,
  DEFAULT_TRIP_CONFIG, buildDays, staysWithColors,
  getMapsLink, applyLocationOverride,
  formatDistance, formatDuration,
} from '@/lib/data';
import { fetchRoute } from '@/lib/useRoute';

// ============ API CLIENT ============

const getPin = () => {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem('planner-pin') || '';
};
const getName = () => {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem('planner-name') || '';
};

async function fetchPlan() {
  const res = await fetch('/api/plan', {
    method: 'GET',
    headers: { 'X-Family-Pin': getPin() },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(res.status === 401 ? 'unauthorized' : `HTTP ${res.status}`);
  return res.json();
}

async function savePlan(plan, customActivities, locationOverrides, tripConfig) {
  const res = await fetch('/api/plan', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'X-Family-Pin': getPin(),
    },
    body: JSON.stringify({
      plan,
      customActivities,
      locationOverrides,
      tripConfig,
      updatedBy: getName() || null,
    }),
  });
  if (!res.ok) throw new Error(res.status === 401 ? 'unauthorized' : `HTTP ${res.status}`);
  return res.json();
}

// ============ MARKER ICON GENERATOR ============

// SVG marker met categoriekleur en getal (= aantal dagen gepland)
function buildIcon(L, color, label) {
  const html = `
    <div style="
      position: relative;
      width: 32px; height: 40px;
      filter: drop-shadow(0 2px 3px rgba(0,0,0,0.30));
    ">
      <svg viewBox="0 0 32 40" width="32" height="40" xmlns="http://www.w3.org/2000/svg">
        <path d="M16 0 C7 0 0 7 0 16 C0 25 16 40 16 40 C16 40 32 25 32 16 C32 7 25 0 16 0 Z"
              fill="${color}" stroke="#FAF3E1" stroke-width="2"/>
        <circle cx="16" cy="15" r="7" fill="#FAF3E1"/>
      </svg>
      <div style="
        position: absolute; top: 7px; left: 0; right: 0;
        text-align: center;
        font-family: 'DM Sans', sans-serif;
        font-size: 12px; font-weight: 700; color: ${color};
        line-height: 16px;
      ">${label}</div>
    </div>
  `;
  return L.divIcon({
    html,
    className: '',
    iconSize: [32, 40],
    iconAnchor: [16, 40],
    popupAnchor: [0, -36],
  });
}

function buildStayIcon(L, color, emoji) {
  const html = `
    <div style="
      width: 38px; height: 38px;
      border-radius: 50%;
      background: ${color};
      border: 3px solid #FAF3E1;
      box-shadow: 0 2px 6px rgba(0,0,0,0.30);
      display: flex; align-items: center; justify-content: center;
      font-size: 18px;
    ">${emoji}</div>
  `;
  return L.divIcon({
    html, className: '',
    iconSize: [38, 38], iconAnchor: [19, 19], popupAnchor: [0, -19],
  });
}

// Marker voor niet-geplande activiteiten — kleinere, semi-transparante uitvoering
function buildSuggestionIcon(L, color, emoji) {
  const html = `
    <div style="
      position: relative;
      width: 26px; height: 32px;
      filter: drop-shadow(0 1px 2px rgba(0,0,0,0.20));
      opacity: 0.78;
    ">
      <svg viewBox="0 0 32 40" width="26" height="32" xmlns="http://www.w3.org/2000/svg">
        <path d="M16 0 C7 0 0 7 0 16 C0 25 16 40 16 40 C16 40 32 25 32 16 C32 7 25 0 16 0 Z"
              fill="#FAF3E1" stroke="${color}" stroke-width="2.5" stroke-dasharray="3 2"/>
        <circle cx="16" cy="15" r="7" fill="${color}" opacity="0.18"/>
      </svg>
      <div style="
        position: absolute; top: 4px; left: 0; right: 0;
        text-align: center;
        font-size: 12px;
        line-height: 16px;
      ">${emoji}</div>
    </div>
  `;
  return L.divIcon({
    html, className: '',
    iconSize: [26, 32], iconAnchor: [13, 32], popupAnchor: [0, -28],
  });
}

// Genummerde marker (1, 2, 3...) voor dag-route
function buildNumberedIcon(L, color, num) {
  const html = `
    <div style="
      position: relative;
      width: 34px; height: 42px;
      filter: drop-shadow(0 2px 3px rgba(0,0,0,0.35));
    ">
      <svg viewBox="0 0 32 40" width="34" height="42" xmlns="http://www.w3.org/2000/svg">
        <path d="M16 0 C7 0 0 7 0 16 C0 25 16 40 16 40 C16 40 32 25 32 16 C32 7 25 0 16 0 Z"
              fill="${color}" stroke="#FAF3E1" stroke-width="2"/>
        <circle cx="16" cy="15" r="8" fill="#FAF3E1"/>
      </svg>
      <div style="
        position: absolute; top: 5px; left: 0; right: 0;
        text-align: center;
        font-family: 'DM Sans', sans-serif;
        font-size: 13px; font-weight: 700; color: ${color};
        line-height: 18px;
      ">${num}</div>
    </div>
  `;
  return L.divIcon({
    html, className: '',
    iconSize: [34, 42], iconAnchor: [17, 42], popupAnchor: [0, -38],
  });
}

// ============ HELPER ============

function dayLabel(days, dayKey) {
  const d = days.find(dd => dd.key === dayKey);
  return d ? `${d.dayShort} ${d.date}` : dayKey;
}

// ============ HEADER ============

const Header = ({ count, totalDays, suggestionCount, showSuggestions, setShowSuggestions }) => (
  <div style={{
    padding: '14px 16px 12px',
    borderBottom: `1px solid ${COLORS.hairline}`,
    background: COLORS.cream,
    position: 'relative', zIndex: 10,
  }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
      <Link
        href="/"
        style={{
          color: COLORS.forest, textDecoration: 'none',
          display: 'flex', alignItems: 'center', gap: 4,
          fontSize: 13, fontFamily: "'DM Sans', sans-serif",
        }}
      >
        <ArrowLeft size={16} /> Planning
      </Link>
      <span style={{ flex: 1 }} />
      <button
        onClick={() => setShowSuggestions(!showSuggestions)}
        style={{
          display: 'flex', alignItems: 'center', gap: 4,
          padding: '4px 10px',
          background: showSuggestions ? 'rgba(201, 125, 93, 0.15)' : 'transparent',
          color: showSuggestions ? COLORS.sunset : COLORS.inkLight,
          border: `1px solid ${showSuggestions ? COLORS.sunset : COLORS.hairline}`,
          borderRadius: 99,
          cursor: 'pointer',
          fontFamily: "'DM Sans', sans-serif",
          fontSize: 11, fontWeight: 600, letterSpacing: 0.3,
        }}
        title={showSuggestions ? 'Verberg suggesties' : 'Toon suggesties'}
      >
        {showSuggestions ? <Eye size={11} /> : <EyeOff size={11} />}
        Suggesties {showSuggestions ? `(${suggestionCount})` : ''}
      </button>
    </div>
    <h1 style={{
      fontFamily: "'Fraunces', serif",
      fontSize: 22, margin: 0,
      color: COLORS.forest, fontWeight: 500, letterSpacing: '-0.01em',
    }}>
      Kaart <span style={{ fontStyle: 'italic', color: COLORS.lake }}>· {count} markers · {totalDays} dagen</span>
    </h1>
  </div>
);

// ============ FILTER BAR ============

const FilterBar = ({ days, stays, stayFilter, setStayFilter, dayFilter, setDayFilter }) => {
  const scrollRef = useRef(null);

  const stayFilters = [
    { key: 'all', label: 'Hele reis' },
    ...stays.map(s => ({ key: s.id, label: s.name, color: s.color })),
  ];

  // Filter de dagen op basis van verblijf-selectie
  const visibleDays = useMemo(() => {
    if (stayFilter === 'all') return days;
    return days.filter(d => d.stay?.id === stayFilter);
  }, [stayFilter, days]);

  return (
    <div style={{
      borderBottom: `1px solid ${COLORS.hairline}`,
      background: COLORS.cream,
      position: 'relative', zIndex: 9,
    }}>
      {/* Verblijf-rij (alleen tonen bij meerdere verblijven) */}
      {stays.length > 1 && (
        <div style={{
          display: 'flex', gap: 6,
          padding: '8px 16px 6px',
          overflowX: 'auto',
        }}>
          {stayFilters.map(f => (
            <button
              key={f.key}
              onClick={() => {
                setStayFilter(f.key);
                // Als huidige dagselectie buiten nieuw verblijf valt, reset
                if (dayFilter && dayFilter !== 'all' && f.key !== 'all') {
                  const d = days.find(dd => dd.key === dayFilter);
                  if (d && d.stay?.id !== f.key) setDayFilter('all');
                }
              }}
              style={{
                padding: '5px 11px',
                background: stayFilter === f.key ? (f.color || COLORS.forest) : 'transparent',
                color: stayFilter === f.key ? COLORS.cream : COLORS.ink,
                border: `1px solid ${stayFilter === f.key ? (f.color || COLORS.forest) : COLORS.hairline}`,
                borderRadius: 99,
                fontFamily: "'DM Sans', sans-serif",
                fontSize: 11, fontWeight: 600, letterSpacing: 0.3,
                cursor: 'pointer', whiteSpace: 'nowrap',
                flexShrink: 0,
              }}
            >{f.label}</button>
          ))}
        </div>
      )}
      {/* Dag-rij */}
      <div
        ref={scrollRef}
        style={{
          display: 'flex', gap: 5,
          padding: '4px 16px 10px',
          overflowX: 'auto',
          scrollSnapType: 'x proximity',
        }}
      >
        <button
          onClick={() => setDayFilter('all')}
          style={{
            padding: '5px 11px',
            background: dayFilter === 'all' ? COLORS.lake : 'transparent',
            color: dayFilter === 'all' ? COLORS.cream : COLORS.inkLight,
            border: `1px solid ${dayFilter === 'all' ? COLORS.lake : COLORS.hairline}`,
            borderRadius: 99,
            fontFamily: "'DM Sans', sans-serif",
            fontSize: 11, fontWeight: 500,
            cursor: 'pointer', whiteSpace: 'nowrap',
            flexShrink: 0,
          }}
        >Alle dagen</button>
        {visibleDays.map(d => {
          const isActive = dayFilter === d.key;
          const stay = d.stay;
          return (
            <button
              key={d.key}
              onClick={() => setDayFilter(d.key)}
              style={{
                display: 'flex', alignItems: 'center', gap: 4,
                padding: '5px 10px',
                background: isActive ? COLORS.lake : 'transparent',
                color: isActive ? COLORS.cream : COLORS.ink,
                border: `1px solid ${isActive ? COLORS.lake : (stay?.color ? `${stay.color}40` : COLORS.hairline)}`,
                borderRadius: 99,
                fontFamily: "'DM Sans', sans-serif",
                fontSize: 11, fontWeight: 500,
                cursor: 'pointer', whiteSpace: 'nowrap',
                flexShrink: 0,
                scrollSnapAlign: 'center',
              }}
            >
              <span style={{
                fontSize: 9, fontWeight: 600, opacity: 0.7,
                textTransform: 'uppercase', letterSpacing: 0.3,
              }}>{d.dayShort}</span>
              {d.date}
            </button>
          );
        })}
      </div>
    </div>
  );
};

// ============ DAY PICKER POPUP (voor toevoegen vanaf kaart) ============

const AddToDaySheet = ({ activity, plan, days, onPick, onClose, title }) => {
  if (!activity) return null;
  const cat = CATEGORIES[activity.category] || CATEGORIES.custom;

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0,
          background: 'rgba(31, 41, 34, 0.45)',
          zIndex: 1000,
          animation: 'fadeIn 0.2s ease',
        }}
      />
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        background: COLORS.cream,
        borderRadius: '20px 20px 0 0',
        maxHeight: '85vh',
        overflowY: 'auto',
        zIndex: 1001,
        animation: 'slideUp 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
        boxShadow: '0 -8px 32px rgba(31, 41, 34, 0.18)',
      }}>
        <div style={{
          position: 'sticky', top: 0,
          background: COLORS.cream,
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
            fontSize: 16, fontWeight: 500, color: COLORS.forest,
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <span style={{ fontSize: 18 }}>{activity.emoji}</span>
            <span>{title || `"${activity.name}" toevoegen aan…`}</span>
          </h3>
          <button
            onClick={onClose}
            style={{
              border: 'none', background: 'transparent', cursor: 'pointer',
              padding: 4, marginTop: 8, color: COLORS.ink,
            }}
          ><X size={20} /></button>
        </div>

        <div style={{ padding: '16px 20px 24px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {days.map(day => {
            const count = (plan[day.key] || []).length;
            const stay = day.stay;
            return (
              <button
                key={day.key}
                onClick={() => onPick(day.key)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: 12,
                  background: COLORS.creamSoft, border: 'none', borderRadius: 10,
                  cursor: 'pointer', textAlign: 'left',
                  fontFamily: "'DM Sans', sans-serif", width: '100%',
                  borderLeft: `3px solid ${stay?.color || COLORS.hairline}`,
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
                    {count}
                  </span>
                )}
                <Plus size={14} color={cat.color} />
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
};

// ============ "WAT LIGT HIER?" ============

const WhatsHereSheet = ({ point, onCreate, onClose }) => {
  const [state, setState] = useState('loading');
  const [results, setResults] = useState([]);
  const [clicked, setClicked] = useState(point);

  useEffect(() => {
    let alive = true;
    (async () => {
      setState('loading');
      try {
        const res = await fetch('/api/whats-here', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Family-Pin': getPin() },
          body: JSON.stringify({ lat: point[0], lng: point[1] }),
        });
        if (!res.ok) throw new Error('failed');
        const data = await res.json();
        if (!alive) return;
        setResults(data.suggestions || []);
        setClicked(data.clicked || point);
        setState('done');
      } catch {
        if (alive) setState('error');
      }
    })();
    return () => { alive = false; };
  }, [point]);

  const makeActivity = (r) => onCreate({
    name: r.name,
    coords: r.coords,
    note: [r.kind, r.place].filter(Boolean).join(' · ') || null,
    emoji: r.emoji,
  });

  return (
    <>
      <div onClick={onClose} style={{
        position: 'fixed', inset: 0, background: 'rgba(31, 41, 34, 0.45)',
        zIndex: 1000, animation: 'fadeIn 0.2s ease',
      }} />
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        background: COLORS.cream, borderRadius: '20px 20px 0 0',
        maxHeight: '80vh', overflowY: 'auto', zIndex: 1001,
        maxWidth: 720, margin: '0 auto',
        animation: 'slideUp 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
        boxShadow: '0 -8px 32px rgba(31, 41, 34, 0.18)',
      }}>
        <div style={{
          position: 'sticky', top: 0, background: COLORS.cream,
          borderBottom: `1px solid ${COLORS.hairline}`, padding: '14px 20px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', zIndex: 1,
        }}>
          <h3 style={{
            margin: 0, fontFamily: "'Fraunces', serif",
            fontSize: 16, fontWeight: 500, color: COLORS.forest,
          }}>Wat ligt hier?</h3>
          <button onClick={onClose} style={{
            border: 'none', background: 'transparent', cursor: 'pointer', padding: 4, color: COLORS.ink,
          }}><X size={20} /></button>
        </div>

        <div style={{ padding: '12px 20px 24px' }}>
          {state === 'loading' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: COLORS.ink, fontSize: 14, padding: '8px 0' }}>
              <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
              Zoeken wat hier in de buurt ligt…
            </div>
          )}
          {state === 'error' && (
            <div style={{ fontSize: 14, color: COLORS.ink, lineHeight: 1.6 }}>
              Kon niet ophalen wat hier ligt. Je kunt het exacte klikpunt wel toevoegen:
              <button onClick={() => makeActivity({ name: 'Gekozen locatie', coords: clicked, emoji: '📍' })}
                style={{ marginTop: 12, width: '100%', padding: 12, background: COLORS.forest, color: COLORS.cream, border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 600, fontFamily: "'DM Sans', sans-serif", cursor: 'pointer' }}>
                📍 Voeg deze plek toe
              </button>
            </div>
          )}
          {state === 'done' && (
            <>
              <p style={{ fontSize: 13, color: COLORS.inkLight, margin: '0 0 12px', lineHeight: 1.5 }}>
                Kies een plek om er een activiteit van te maken.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
                {results.map((r, i) => (
                  <button key={`${r.name}-${i}`} onClick={() => makeActivity(r)}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 12px', width: '100%', textAlign: 'left', background: COLORS.creamSoft, border: `1px solid ${COLORS.hairline}`, borderRadius: 10, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}>
                    <span style={{ fontSize: 18 }}>{r.emoji}</span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: 'block', fontSize: 14, fontWeight: 500, color: COLORS.charcoal, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
                      <span style={{ display: 'block', fontSize: 11, color: COLORS.inkLight, marginTop: 1 }}>{[r.kind, r.place].filter(Boolean).join(' · ')}</span>
                    </span>
                    {r.distM > 0 && (
                      <span style={{ fontSize: 11, color: COLORS.inkLight, whiteSpace: 'nowrap' }}>
                        {r.distM < 1000 ? `${r.distM} m` : `${(r.distM / 1000).toFixed(1)} km`}
                      </span>
                    )}
                    <Plus size={16} style={{ color: COLORS.forest, flexShrink: 0 }} />
                  </button>
                ))}
                {results.length === 0 && (
                  <div style={{ fontSize: 13, color: COLORS.inkLight }}>Niets benoembaars gevonden op deze plek.</div>
                )}
              </div>
              <button onClick={() => makeActivity({ name: 'Gekozen locatie', coords: clicked, emoji: '📍' })}
                style={{ width: '100%', padding: 11, background: 'transparent', color: COLORS.forest, border: `1px solid ${COLORS.forest}`, borderRadius: 10, fontSize: 13, fontWeight: 600, fontFamily: "'DM Sans', sans-serif", cursor: 'pointer' }}>
                📍 Of: voeg het exacte klikpunt toe
              </button>
            </>
          )}
        </div>
      </div>
    </>
  );
};

// ============ LEGEND ============

const Legend = ({ visibleCategories }) => {
  const cats = Object.entries(CATEGORIES).filter(([k]) => visibleCategories.has(k));
  if (cats.length === 0) return null;
  return (
    <div style={{
      position: 'absolute',
      bottom: 12, left: 12, right: 12,
      background: 'rgba(244, 235, 213, 0.96)',
      backdropFilter: 'blur(8px)',
      WebkitBackdropFilter: 'blur(8px)',
      borderRadius: 12,
      padding: '10px 12px',
      border: `1px solid ${COLORS.hairline}`,
      boxShadow: '0 4px 12px rgba(0,0,0,0.10)',
      zIndex: 400,
      maxHeight: '40vh', overflowY: 'auto',
    }}>
      <div style={{
        fontSize: 10, letterSpacing: 1.2, textTransform: 'uppercase',
        color: COLORS.inkLight, fontWeight: 600, marginBottom: 8,
      }}>Legenda</div>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: 6,
      }}>
        {cats.map(([key, cat]) => (
          <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
            <span style={{
              display: 'inline-block', width: 10, height: 10, borderRadius: '50%',
              background: cat.color, flexShrink: 0,
            }} />
            <span style={{ color: COLORS.ink, fontWeight: 500 }}>{cat.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

// ============ MAIN ============

export default function MapView({ authRequired }) {
  const [plan, setPlan] = useState(null);
  const [customActivities, setCustomActivities] = useState([]);
  const [locationOverrides, setLocationOverrides] = useState({});
  const [tripConfig, setTripConfig] = useState(DEFAULT_TRIP_CONFIG);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Dynamische dagen + verblijven uit tripConfig
  const days = useMemo(() => buildDays(tripConfig), [tripConfig]);
  const stays = useMemo(() => staysWithColors(tripConfig), [tripConfig]);

  // Filter state
  const [stayFilter, setStayFilter] = useState('all');
  const [dayFilter, setDayFilter] = useState('all'); // 'all' | dayKey
  const [showSuggestions, setShowSuggestions] = useState(true);

  // Add-to-day sheet
  const [pendingActivity, setPendingActivity] = useState(null);
  // Activiteit die we verplaatsen vanaf een specifieke dag: { activity, fromDayKey }
  const [movingActivity, setMovingActivity] = useState(null);
  // Klik-op-kaart: "wat ligt hier?" punt
  const [whatsHerePoint, setWhatsHerePoint] = useState(null);
  const [toast, setToast] = useState(null);

  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const routeLayerRef = useRef(null);
  const leafletRef = useRef(null);

  // Route-data voor geselecteerde dag
  const [dayRoute, setDayRoute] = useState(null);

  // Fetch plan from server
  useEffect(() => {
    (async () => {
      try {
        const data = await fetchPlan();
        setPlan(data.plan || {});
        setCustomActivities(data.customActivities || []);
        setLocationOverrides(data.locationOverrides || {});
        if (data.tripConfig) setTripConfig(data.tripConfig);
      } catch (e) {
        if (e.message === 'unauthorized') {
          setError('Geen toegang — open eerst de planner om de PIN in te voeren.');
        } else {
          setError('Kan planning niet laden: ' + e.message);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Dynamically load Leaflet (browser-only)
  useEffect(() => {
    if (loading || error) return;
    let mounted = true;

    (async () => {
      if (!document.querySelector('link[data-leaflet]')) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
        link.integrity = 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=';
        link.crossOrigin = '';
        link.setAttribute('data-leaflet', '1');
        document.head.appendChild(link);
      }
      const L = await import('leaflet');
      if (!mounted) return;
      leafletRef.current = L;

      if (!mapRef.current && mapContainerRef.current) {
        const map = L.map(mapContainerRef.current, {
          center: [48.8, 6.5],
          zoom: 7,
          scrollWheelZoom: true,
        });
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '© OpenStreetMap contributors',
          maxZoom: 19,
        }).addTo(map);
        map.on('click', (e) => {
          setWhatsHerePoint([e.latlng.lat, e.latlng.lng]);
        });
        mapRef.current = map;
      }
    })();

    return () => {
      mounted = false;
    };
  }, [loading, error, days.length]);

  // Activities lookup met overrides
  const allActivities = useMemo(
    () => [...DEFAULT_ACTIVITIES, ...customActivities],
    [customActivities]
  );
  const activityById = useMemo(() => {
    const obj = {};
    allActivities.forEach(a => {
      obj[a.id] = applyLocationOverride(a, locationOverrides);
    });
    return obj;
  }, [allActivities, locationOverrides]);

  // Effectieve verblijf-filter; wanneer een specifieke dag actief is, leiden we het verblijf af
  const effectiveStayFilter = useMemo(() => {
    if (dayFilter && dayFilter !== 'all') {
      const d = days.find(dd => dd.key === dayFilter);
      if (d?.stay?.id) return d.stay.id;
    }
    return stayFilter;
  }, [dayFilter, stayFilter, days]);

  // Geplande activiteiten — gegroepeerd per id met de geplande dagen
  // markerData = [{ activity, days: [...] }]
  const markerData = useMemo(() => {
    if (!plan) return [];
    const map = new Map();
    Object.entries(plan).forEach(([dayKey, ids]) => {
      const day = days.find(d => d.key === dayKey);
      if (!day) return;
      // dag-filter heeft voorrang
      if (dayFilter !== 'all' && dayKey !== dayFilter) return;
      // anders: verblijf-filter
      if (dayFilter === 'all' && stayFilter !== 'all') {
        if (day.stay?.id !== stayFilter) return;
      }
      (ids || []).forEach(id => {
        const act = activityById[id];
        if (!act || !act.coords) return;
        if (!map.has(id)) map.set(id, { activity: act, days: [] });
        map.get(id).days.push(dayKey);
      });
    });
    return [...map.values()];
  }, [plan, activityById, stayFilter, dayFilter, days]);

  // Niet-geplande activiteiten met coördinaten (suggesties)
  const suggestionData = useMemo(() => {
    if (!plan) return [];
    // Verzamel alle id's die ergens gepland staan
    const plannedIds = new Set();
    Object.values(plan).forEach(ids => (ids || []).forEach(id => plannedIds.add(id)));

    return allActivities
      .map(a => applyLocationOverride(a, locationOverrides))
      .filter(a => a.coords && !plannedIds.has(a.id));
  }, [plan, allActivities, locationOverrides]);

  const visibleCategories = useMemo(() => {
    const s = new Set();
    markerData.forEach(m => s.add(m.activity.category));
    if (showSuggestions) suggestionData.forEach(a => s.add(a.category));
    return s;
  }, [markerData, suggestionData, showSuggestions]);

  // Bepaal route-punten voor geselecteerde dag
  const dayRoutePoints = useMemo(() => {
    if (dayFilter === 'all' || !plan) return null;
    const day = days.find(d => d.key === dayFilter);
    if (!day) return null;
    const ids = plan[dayFilter] || [];
    const acts = ids.map(id => activityById[id]).filter(a => a && a.coords);
    if (acts.length === 0) return null;
    const pts = [day.startCoords, ...acts.map(a => a.coords), day.endCoords].filter(Boolean);
    if (pts.length < 2) return null;
    // Dedupliceer aangrenzende identieke coördinaten
    const cleaned = pts.filter((p, i) => {
      if (i === 0) return true;
      const [la, ln] = p;
      const [pla, pln] = pts[i - 1];
      return Math.abs(la - pla) > 0.0001 || Math.abs(ln - pln) > 0.0001;
    });
    return cleaned.length >= 2 ? cleaned : null;
  }, [dayFilter, plan, activityById, days]);

  // Fetch route wanneer dag-selectie verandert
  useEffect(() => {
    if (!dayRoutePoints) {
      setDayRoute(null);
      return;
    }
    let cancelled = false;
    fetchRoute(dayRoutePoints)
      .then(r => { if (!cancelled) setDayRoute(r); })
      .catch(() => { if (!cancelled) setDayRoute(null); });
    return () => { cancelled = true; };
  }, [dayRoutePoints]);

  // Voeg activiteit toe aan een dag (vanaf kaart)
  // Activiteit uit een specifieke dag halen
  const removeFromDay = async (activityId, dayKey) => {
    if (!plan) return;
    const newPlan = {
      ...plan,
      [dayKey]: (plan[dayKey] || []).filter(id => id !== activityId),
    };
    setPlan(newPlan);
    setPendingActivity(null);
    setMovingActivity(null);
    const act = activityById[activityId];
    const d = days.find(dd => dd.key === dayKey);
    setToast(`"${act?.name}" verwijderd uit ${d?.dayShort} ${d?.date}`);
    setTimeout(() => setToast(null), 2500);
    try {
      await savePlan(newPlan, customActivities, locationOverrides, tripConfig);
    } catch (e) {
      setToast('⚠️ Niet opgeslagen — controleer verbinding');
      setTimeout(() => setToast(null), 3500);
    }
  };

  // Activiteit van de ene dag naar de andere verplaatsen
  const moveToDay = async (activityId, fromDayKey, toDayKey) => {
    if (!plan || fromDayKey === toDayKey) { setMovingActivity(null); return; }
    const newPlan = {
      ...plan,
      [fromDayKey]: (plan[fromDayKey] || []).filter(id => id !== activityId),
      [toDayKey]: [...(plan[toDayKey] || []).filter(id => id !== activityId), activityId],
    };
    setPlan(newPlan);
    setMovingActivity(null);
    const act = activityById[activityId];
    const d = days.find(dd => dd.key === toDayKey);
    setToast(`"${act?.name}" verplaatst naar ${d?.dayShort} ${d?.date}`);
    setTimeout(() => setToast(null), 2500);
    try {
      await savePlan(newPlan, customActivities, locationOverrides, tripConfig);
    } catch (e) {
      setToast('⚠️ Niet opgeslagen — controleer verbinding');
      setTimeout(() => setToast(null), 3500);
    }
  };

  // Maak een nieuwe activiteit aan vanaf een kaartklik (en sla op)
  const createActivityHere = async ({ name, coords, note, emoji }) => {
    const id = `custom_${Date.now()}`;
    const newAct = {
      id, name, category: 'custom',
      emoji: emoji || '📍', coords, note: note || null, custom: true,
    };
    const newCustom = [...customActivities, newAct];
    setCustomActivities(newCustom);
    setWhatsHerePoint(null);
    setToast(`"${name}" toegevoegd aan je activiteiten`);
    setTimeout(() => setToast(null), 2500);
    try {
      await savePlan(plan, newCustom, locationOverrides, tripConfig);
    } catch (e) {
      setToast('⚠️ Niet opgeslagen — controleer verbinding');
      setTimeout(() => setToast(null), 3500);
    }
  };

  const addToDay = async (activityId, dayKey) => {
    if (!plan) return;
    const newPlan = {
      ...plan,
      [dayKey]: [...(plan[dayKey] || []), activityId],
    };
    setPlan(newPlan);
    setPendingActivity(null);
    const act = activityById[activityId];
    const d = days.find(dd => dd.key === dayKey);
    setToast(`"${act?.name}" toegevoegd aan ${d?.dayShort} ${d?.date}`);
    setTimeout(() => setToast(null), 2500);
    try {
      await savePlan(newPlan, customActivities, locationOverrides, tripConfig);
    } catch (e) {
      setToast('⚠️ Niet opgeslagen — controleer verbinding');
      setTimeout(() => setToast(null), 3500);
    }
  };

  // Render markers
  useEffect(() => {
    const map = mapRef.current;
    const L = leafletRef.current;
    if (!map || !L) return;
    const allDays = days;

    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];

    // Stay markers — dynamisch op basis van geconfigureerde verblijven
    const stayMarkers = [];
    stays.forEach((stay, i) => {
      if (!stay.coords) return;
      if (effectiveStayFilter !== 'all' && stay.id !== effectiveStayFilter) return;
      const emoji = i % 2 === 0 ? '🏕️' : '🏡';
      const m = L.marker(stay.coords, {
        icon: buildStayIcon(L, stay.color, emoji),
        zIndexOffset: 1000,
      }).addTo(map);
      const sub = [stay.locationLabel, `${stay.startDate} t/m ${stay.endDate}`]
        .filter(Boolean).join(' · ');
      m.bindPopup(
        `<div style="font-family: 'DM Sans', sans-serif; min-width: 160px;">
          <div style="font-family: 'Fraunces', serif; font-size: 15px; color: #2D4F3E; font-weight: 500;">${stay.name}</div>
          <div style="font-size: 11px; color: rgba(31,41,34,0.55); margin-top: 2px;">${sub}</div>
        </div>`
      );
      stayMarkers.push(m);
    });
    markersRef.current.push(...stayMarkers);

    // Bepaal volgorde van markers wanneer een specifieke dag is geselecteerd
    // Dan willen we ze nummeren in de volgorde waarop ze in het dagplan staan
    const dayOrderMap = {};
    if (dayFilter !== 'all' && plan) {
      const ids = plan[dayFilter] || [];
      ids.forEach((id, i) => {
        // Eerste keer voorkomen wint
        if (dayOrderMap[id] === undefined) dayOrderMap[id] = i;
      });
    }
    const useNumbered = dayFilter !== 'all';

    // Geplande activiteiten — volle markers
    markerData.forEach(({ activity, days }) => {
      const cat = CATEGORIES[activity.category] || CATEGORIES.custom;
      let icon;
      if (useNumbered && dayOrderMap[activity.id] !== undefined) {
        icon = buildNumberedIcon(L, cat.color, dayOrderMap[activity.id] + 1);
      } else {
        const label = days.length === 1 ? '' : String(days.length);
        icon = buildIcon(L, cat.color, label);
      }
      const marker = L.marker(activity.coords, { icon, zIndexOffset: 500 }).addTo(map);

      const dayChips = days
        .sort()
        .map(d => `<span style="
          display: inline-block;
          padding: 2px 7px;
          margin: 2px 3px 2px 0;
          background: ${cat.color}22;
          color: ${cat.color};
          border-radius: 99px;
          font-size: 10px;
          font-weight: 600;
          letter-spacing: 0.3px;
        ">${dayLabel(allDays, d)}</span>`)
        .join('');

      const mapsLink = getMapsLink(activity);
      const mapsBtn = mapsLink
        ? `<a href="${mapsLink}" target="_blank" rel="noopener noreferrer"
              style="
                display: inline-flex; align-items: center; gap: 4px;
                margin-top: 10px;
                padding: 6px 10px;
                background: ${cat.color};
                color: #FAF3E1;
                border-radius: 8px;
                font-size: 11px; font-weight: 600;
                text-decoration: none;
                font-family: 'DM Sans', sans-serif;
              ">Open in Google Maps ↗</a>`
        : '';

      const noteHtml = activity.note
        ? `<div style="font-size: 11px; color: rgba(31,41,34,0.55); margin-top: 4px;">${activity.note}</div>`
        : '';

      // Op een specifieke dag: knoppen om uit die dag te halen of te verplaatsen
      const onThisDay = dayFilter !== 'all' && (plan?.[dayFilter] || []).includes(activity.id);
      const removeId = `rm-${activity.id}`;
      const moveId = `mv-${activity.id}`;
      const manageBtns = onThisDay
        ? `<div style="display:flex; gap:6px; margin-top:10px; flex-wrap:wrap;">
            <button id="${removeId}" style="
              flex:1; min-width:120px; padding:7px 10px;
              background:#FAF3E1; color:#B4452F;
              border:1px solid #E3C4BA; border-radius:8px;
              font-size:11px; font-weight:600; cursor:pointer;
              font-family:'DM Sans',sans-serif;
            ">✕ Uit deze dag halen</button>
            <button id="${moveId}" style="
              flex:1; min-width:120px; padding:7px 10px;
              background:${cat.color}; color:#FAF3E1;
              border:none; border-radius:8px;
              font-size:11px; font-weight:600; cursor:pointer;
              font-family:'DM Sans',sans-serif;
            ">→ Verplaats naar…</button>
          </div>`
        : '';

      marker.bindPopup(
        `<div style="font-family: 'DM Sans', sans-serif; min-width: 200px; max-width: 260px;">
          <div style="display:flex; align-items:center; gap:6px; margin-bottom: 4px;">
            <span style="font-size: 18px;">${activity.emoji}</span>
            <div style="font-family: 'Fraunces', serif; font-size: 15px; color: #2D4F3E; font-weight: 500; line-height: 1.2;">${activity.name}</div>
          </div>
          ${noteHtml}
          <div style="margin-top: 8px;">${dayChips}</div>
          ${mapsBtn}
          ${manageBtns}
        </div>`
      );

      if (onThisDay) {
        marker.on('popupopen', () => {
          const rm = document.getElementById(removeId);
          if (rm) rm.onclick = () => { marker.closePopup(); removeFromDay(activity.id, dayFilter); };
          const mv = document.getElementById(moveId);
          if (mv) mv.onclick = () => { marker.closePopup(); setMovingActivity({ activity, fromDayKey: dayFilter }); };
        });
      }

      markersRef.current.push(marker);
    });

    // Suggestie-markers (niet-gepland)
    if (showSuggestions) {
      suggestionData.forEach(activity => {
        const cat = CATEGORIES[activity.category] || CATEGORIES.custom;
        const icon = buildSuggestionIcon(L, cat.color, activity.emoji);
        const marker = L.marker(activity.coords, { icon, zIndexOffset: 200 }).addTo(map);

        const noteHtml = activity.note
          ? `<div style="font-size: 11px; color: rgba(31,41,34,0.55); margin-top: 4px;">${activity.note}</div>`
          : '';

        const popupId = `add-${activity.id}`;
        const activeDay = dayFilter !== 'all' ? days.find(d => d.key === dayFilter) : null;
        const addLabel = activeDay
          ? `+ Inplannen op ${activeDay.dayShort} ${activeDay.date}`
          : '+ Inplannen';
        const mapsLink = getMapsLink(activity);
        const mapsBtn = mapsLink
          ? `<a href="${mapsLink}" target="_blank" rel="noopener noreferrer"
                style="
                  display: inline-flex; align-items: center; gap: 4px;
                  padding: 6px 10px;
                  background: transparent;
                  color: ${cat.color};
                  border: 1px solid ${cat.color}80;
                  border-radius: 8px;
                  font-size: 11px; font-weight: 600;
                  text-decoration: none;
                  font-family: 'DM Sans', sans-serif;
                ">Open Maps ↗</a>`
          : '';

        marker.bindPopup(
          `<div style="font-family: 'DM Sans', sans-serif; min-width: 200px; max-width: 260px;">
            <div style="display:flex; align-items:center; gap:6px; margin-bottom: 4px;">
              <span style="font-size: 18px;">${activity.emoji}</span>
              <div style="font-family: 'Fraunces', serif; font-size: 15px; color: #2D4F3E; font-weight: 500; line-height: 1.2;">${activity.name}</div>
            </div>
            <div style="
              display: inline-block;
              margin-top: 4px;
              padding: 2px 8px;
              background: ${cat.color}1A;
              color: ${cat.color};
              border-radius: 99px;
              font-size: 10px; font-weight: 600;
              letter-spacing: 0.3px;
            ">Nog niet gepland</div>
            ${noteHtml}
            <div style="display: flex; gap: 6px; margin-top: 10px; flex-wrap: wrap;">
              <button id="${popupId}"
                style="
                  display: inline-flex; align-items: center; gap: 4px;
                  padding: 6px 10px;
                  background: ${cat.color};
                  color: #FAF3E1;
                  border: none;
                  border-radius: 8px;
                  font-size: 11px; font-weight: 600;
                  cursor: pointer;
                  font-family: 'DM Sans', sans-serif;
                ">${addLabel}</button>
              ${mapsBtn}
            </div>
          </div>`
        );

        // Wire up the "Inplannen" button when popup opens
        marker.on('popupopen', () => {
          const btn = document.getElementById(popupId);
          if (btn) {
            btn.onclick = () => {
              marker.closePopup();
              // Staat de kaart op één specifieke dag? Dan meteen op die dag
              // inplannen — geen dubbele dagkeuze nodig.
              if (dayFilter !== 'all' && plan && !(plan[dayFilter] || []).includes(activity.id)) {
                addToDay(activity.id, dayFilter);
              } else {
                setPendingActivity(activity);
              }
            };
          }
        });

        markersRef.current.push(marker);
      });
    }

    // Teken route-lijn als een specifieke dag is geselecteerd en route data beschikbaar is
    if (routeLayerRef.current) {
      routeLayerRef.current.remove();
      routeLayerRef.current = null;
    }
    if (dayFilter !== 'all' && dayRoute?.geometry) {
      // GeoJSON LineString → Leaflet wil [lat, lng]
      const coords = dayRoute.geometry.coordinates.map(([lng, lat]) => [lat, lng]);
      const polyline = L.polyline(coords, {
        color: COLORS.lake,
        weight: 4,
        opacity: 0.85,
        dashArray: '8 6',
        lineCap: 'round',
        lineJoin: 'round',
      }).addTo(map);
      routeLayerRef.current = polyline;
    }

    // Auto-fit:
    //  - Specifieke dag geselecteerd + route geladen: zoom in op de dag-route + de marker iconen
    //    (gebruikt alleen de dag-markers, niet alle suggesties)
    //  - Anders: zoom op alle zichtbare markers (week- of all-view)
    if (dayFilter !== 'all') {
      // Bij dag-selectie: alleen op de daadwerkelijke dag-route + dag-markers
      const dayActivityIds = new Set(plan?.[dayFilter] || []);
      const dayMarkers = markersRef.current.filter(m => {
        // De stay-markers willen we niet meenemen want die kunnen ver buiten beeld liggen
        const opts = m.options || {};
        return opts.zIndexOffset !== 1000; // 1000 = stay marker
      });
      // We willen wél de route-lijn en de markers van deze dag
      // Markers van deze dag = markers waarvan de coords matchen met dag-activiteiten
      const dayCoords = (plan?.[dayFilter] || [])
        .map(id => activityById[id])
        .filter(a => a && a.coords)
        .map(a => a.coords);

      // Voeg ook start/eind coords toe (verblijf)
      const day = allDays.find(d => d.key === dayFilter);
      if (day) {
        if (day.startCoords) dayCoords.push(day.startCoords);
        if (day.endCoords) dayCoords.push(day.endCoords);
      }

      if (dayCoords.length > 0) {
        try {
          // Gebruik route-geometrie indien beschikbaar voor strakkere bounds
          const bounds = routeLayerRef.current
            ? routeLayerRef.current.getBounds()
            : L.latLngBounds(dayCoords);
          map.fitBounds(bounds.pad(0.15), { animate: true, duration: 0.6 });
        } catch (e) { /* ignore */ }
      }
    } else if (markersRef.current.length > 0) {
      // Alle dagen of week-filter: gebruik alle markers
      const allLayers = routeLayerRef.current
        ? [...markersRef.current, routeLayerRef.current]
        : markersRef.current;
      const group = L.featureGroup(allLayers);
      try {
        map.fitBounds(group.getBounds().pad(0.15), { animate: false });
      } catch (e) { /* ignore */ }
    }
  }, [markerData, suggestionData, showSuggestions, effectiveStayFilter, dayFilter, dayRoute, plan, activityById, days, stays]);

  const totalDays = useMemo(() => {
    if (!plan) return 0;
    return Object.keys(plan).filter(k => (plan[k] || []).length > 0).length;
  }, [plan]);

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh', background: COLORS.cream,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: "'DM Sans', sans-serif", color: COLORS.ink,
      }}>Kaart laden…</div>
    );
  }

  if (error) {
    return (
      <div style={{
        minHeight: '100vh', background: COLORS.cream,
        padding: 20, fontFamily: "'DM Sans', sans-serif",
      }}>
        <Link href="/" style={{ color: COLORS.forest, fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
          <ArrowLeft size={16} /> Terug
        </Link>
        <div style={{
          marginTop: 24, padding: 20,
          background: COLORS.creamSoft, borderRadius: 12,
          color: COLORS.ink, fontSize: 14,
        }}>{error}</div>
      </div>
    );
  }

  return (
    <div style={{
      fontFamily: "'DM Sans', sans-serif",
      background: COLORS.cream,
      minHeight: '100vh',
      display: 'flex', flexDirection: 'column',
    }}>
      {days.length === 0 && (
        <div style={{ padding: 20 }}>
          <Link href="/" style={{ color: COLORS.forest, fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
            <ArrowLeft size={16} /> Terug naar planner
          </Link>
          <div style={{
            marginTop: 24, padding: 24,
            background: COLORS.creamSoft, borderRadius: 12,
            color: COLORS.ink, fontSize: 14, lineHeight: 1.6,
          }}>
            <div style={{ fontFamily: "'Fraunces', serif", fontSize: 18, color: COLORS.forest, marginBottom: 8 }}>
              Nog geen reis ingesteld
            </div>
            Stel eerst de reisperiode en verblijven in via de planner, daarna verschijnt hier de kaart met je dagen en activiteiten.
          </div>
        </div>
      )}
      {days.length > 0 && (<>
      <Header
        count={markerData.length}
        totalDays={totalDays}
        suggestionCount={suggestionData.length}
        showSuggestions={showSuggestions}
        setShowSuggestions={setShowSuggestions}
      />
      <FilterBar
        days={days}
        stays={stays}
        stayFilter={stayFilter}
        setStayFilter={setStayFilter}
        dayFilter={dayFilter}
        setDayFilter={setDayFilter}
      />
      <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
        <div
          ref={mapContainerRef}
          style={{ position: 'absolute', inset: 0, background: '#dde6e6' }}
        />
        {dayFilter !== 'all' && dayRoute && dayRoute.totalDistance > 0 && (
          <div style={{
            position: 'absolute',
            top: 12, left: 12, right: 12,
            background: 'rgba(244, 235, 213, 0.96)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            borderRadius: 10,
            padding: '8px 12px',
            border: `1px solid ${COLORS.hairline}`,
            boxShadow: '0 4px 12px rgba(0,0,0,0.10)',
            display: 'flex', alignItems: 'center', gap: 10,
            fontSize: 12, color: COLORS.lake, fontWeight: 600,
            zIndex: 400,
          }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center',
              padding: '2px 8px', borderRadius: 99,
              background: 'rgba(58, 126, 132, 0.12)',
              fontSize: 11, letterSpacing: 0.3,
            }}>
              {days.find(d => d.key === dayFilter)?.dayShort} {days.find(d => d.key === dayFilter)?.date}
            </span>
            <span>{formatDistance(dayRoute.totalDistance)}</span>
            <span style={{ opacity: 0.5 }}>·</span>
            <span>{formatDuration(dayRoute.totalDuration)} rijden</span>
            <span style={{ flex: 1 }} />
            <span style={{ fontSize: 9, color: COLORS.inkLight, fontWeight: 500, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              heen+terug
            </span>
          </div>
        )}
        <Legend visibleCategories={visibleCategories} />
        {toast && (
          <div style={{
            position: 'absolute',
            top: 16, left: '50%', transform: 'translateX(-50%)',
            background: COLORS.forest, color: COLORS.cream,
            padding: '10px 16px', borderRadius: 99,
            fontSize: 13, fontWeight: 500,
            boxShadow: '0 4px 14px rgba(0,0,0,0.25)',
            zIndex: 999,
            animation: 'fadeIn 0.2s ease',
            maxWidth: 'calc(100% - 32px)',
            textAlign: 'center',
          }}>{toast}</div>
        )}
      </div>

      {pendingActivity && (
        <AddToDaySheet
          activity={pendingActivity}
          plan={plan}
          days={days}
          onPick={(dayKey) => addToDay(pendingActivity.id, dayKey)}
          onClose={() => setPendingActivity(null)}
        />
      )}

      {movingActivity && (
        <AddToDaySheet
          activity={movingActivity.activity}
          plan={plan}
          days={days.filter(d => d.key !== movingActivity.fromDayKey)}
          title="Verplaats naar welke dag?"
          onPick={(dayKey) => moveToDay(movingActivity.activity.id, movingActivity.fromDayKey, dayKey)}
          onClose={() => setMovingActivity(null)}
        />
      )}

      {whatsHerePoint && (
        <WhatsHereSheet
          point={whatsHerePoint}
          onCreate={createActivityHere}
          onClose={() => setWhatsHerePoint(null)}
        />
      )}
      </>)}

      <style>{`
        .leaflet-popup-content-wrapper {
          border-radius: 12px !important;
          background: #FAF3E1 !important;
        }
        .leaflet-popup-tip {
          background: #FAF3E1 !important;
        }
        .leaflet-popup-content {
          margin: 12px 14px !important;
        }
        html, body { overflow: hidden; }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
      `}</style>
    </div>
  );
}
