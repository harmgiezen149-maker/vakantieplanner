'use client';

// "Ontdek de omgeving": bezienswaardigheden en wandelroutes rond een
// verblijf, met een eigen kaart per tab. Het grootste blok uit Planner.jsx,
// en het enige dat zijn eigen Leaflet-instanties beheert.

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  X, ChevronRight, Check, MapPin, Loader2, ExternalLink,
  Compass, Maximize2, Minimize2, EyeOff,
} from 'lucide-react';
import { COLORS, CATEGORIES, CATEGORY_ORDER } from '@/lib/data';
import { getPin } from '@/lib/maps';
import Sheet from '@/components/planner/Sheet';
import WhatsHereSheet from '@/components/planner/WhatsHereSheet';

// ============ WANDELROUTES-KAART ============

// Tekent gevonden wandelroutes als lijnen; tik een route aan om te markeren.
const HikingMap = ({ anchor, hikes, activeIdx, onSelect }) => {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const leafletRef = useRef(null);
  const layersRef = useRef([]);
  const [ready, setReady] = useState(false);
  const [full, setFull] = useState(false);

  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  useEffect(() => {
    const t = setTimeout(() => mapRef.current?.invalidateSize(), 80);
    return () => clearTimeout(t);
  }, [full]);

  useEffect(() => {
    if (!full) return;
    const onKey = (e) => { if (e.key === 'Escape') setFull(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [full]);

  useEffect(() => {
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
      if (!mapRef.current && containerRef.current) {
        const map = L.map(containerRef.current, {
          center: anchor?.coords || [48.8, 6.5], zoom: 11, scrollWheelZoom: true,
        });
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '© OpenStreetMap contributors', maxZoom: 19,
        }).addTo(map);
        mapRef.current = map;
        setReady(true);
        setTimeout(() => map.invalidateSize(), 320);
      }
    })();
    return () => {
      mounted = false;
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Routes tekenen / opnieuw tekenen bij selectie
  useEffect(() => {
    const map = mapRef.current;
    const L = leafletRef.current;
    if (!map || !L || !ready) return;

    layersRef.current.forEach(l => l.remove());
    layersRef.current = [];
    const baseColor = CATEGORIES.hiking?.color || '#4A6F4F';

    // Verblijf/anker
    if (anchor?.coords) {
      const m = L.marker(anchor.coords, {
        icon: L.divIcon({
          className: '',
          html: `<div style="width:30px;height:30px;border-radius:50%;background:${anchor.color || baseColor};border:3px solid #FAF3E1;display:flex;align-items:center;justify-content:center;font-size:14px;box-shadow:0 2px 8px rgba(31,41,34,0.35);">📍</div>`,
          iconSize: [30, 30], iconAnchor: [15, 15],
        }), zIndexOffset: 1000,
      }).addTo(map);
      layersRef.current.push(m);
    }

    const allPts = [];
    hikes.forEach((h, i) => {
      const active = i === activeIdx;
      (h.segments || []).forEach(seg => {
        const line = L.polyline(seg, {
          color: active ? '#C2410C' : baseColor,
          weight: active ? 5 : 3,
          opacity: active ? 0.95 : (activeIdx == null ? 0.7 : 0.35),
        }).addTo(map);
        line.on('click', () => onSelectRef.current(i));
        layersRef.current.push(line);
        if (active || activeIdx == null) seg.forEach(p => allPts.push(p));
      });
      // Startmarker met volgnummer
      if (h.coords) {
        const m = L.marker(h.coords, {
          icon: L.divIcon({
            className: '',
            html: `<div style="width:24px;height:24px;border-radius:50%;background:${active ? '#C2410C' : baseColor};color:#FAF3E1;border:2px solid #FAF3E1;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;font-family:'DM Sans',sans-serif;box-shadow:0 1px 4px rgba(31,41,34,0.3);">${i + 1}</div>`,
            iconSize: [24, 24], iconAnchor: [12, 12],
          }), zIndexOffset: active ? 800 : 400,
        }).addTo(map);
        m.on('click', () => onSelectRef.current(i));
        m.bindTooltip(`${i + 1}. ${h.name}${h.lengthKm ? ` · ${h.lengthKm} km` : ''}`, { direction: 'top' });
        layersRef.current.push(m);
      }
    });

    const fitPts = allPts.length ? allPts : hikes.flatMap(h => h.segments?.[0] || []);
    if (fitPts.length > 0) {
      map.fitBounds(L.latLngBounds(fitPts), { padding: [30, 30], maxZoom: 14 });
    }
  }, [hikes, activeIdx, anchor, ready]);

  return (
    <div style={full ? {
      position: 'fixed', inset: 0, zIndex: 70, background: COLORS.cream,
      padding: 10, display: 'flex', flexDirection: 'column',
    } : { position: 'relative', marginBottom: 14 }}>
      <div ref={containerRef} style={{
        width: '100%', height: full ? '100%' : 340, flex: full ? 1 : undefined,
        borderRadius: 12, overflow: 'hidden', border: `1px solid ${COLORS.hairline}`,
        zIndex: 0, position: 'relative',
      }} />
      <button
        onClick={() => setFull(f => !f)}
        title={full ? 'Verkleinen' : 'Volledig scherm'}
        style={{
          position: 'absolute', top: full ? 16 : 10, right: full ? 16 : 10, zIndex: 1001,
          width: 36, height: 36, borderRadius: 10, border: `1px solid ${COLORS.hairline}`,
          background: COLORS.cream, color: COLORS.forest,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', boxShadow: '0 2px 8px rgba(31,41,34,0.2)',
        }}
      >{full ? <Minimize2 size={17} /> : <Maximize2 size={17} />}</button>
    </div>
  );
};

// ============ OMGEVINGSSUGGESTIES ============

// Kaartweergave van zoekresultaten. Markers per categorie (kleur + emoji),
// hover/klik toont popup met info en een selecteer-knop.
const SuggestionsMap = ({ stay, results, selected, onToggle, onHide, topBar, onMapClick }) => {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const leafletRef = useRef(null);
  // idx (origineel) → { marker, result }
  const markerMapRef = useRef(new Map());
  const [ready, setReady] = useState(false);
  const [full, setFull] = useState(false);

  // Kaartmaat herberekenen bij wisselen klein ↔ volledig scherm
  useEffect(() => {
    const t = setTimeout(() => mapRef.current?.invalidateSize(), 80);
    return () => clearTimeout(t);
  }, [full]);

  // Esc sluit volledig scherm
  useEffect(() => {
    if (!full) return;
    const onKey = (e) => { if (e.key === 'Escape') setFull(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [full]);

  // Refs zodat handlers altijd de actuele props zien
  const onToggleRef = useRef(onToggle);
  onToggleRef.current = onToggle;
  const onHideRef = useRef(onHide);
  onHideRef.current = onHide;
  const onMapClickRef = useRef(onMapClick);
  onMapClickRef.current = onMapClick;
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const resultsRef = useRef(results);
  resultsRef.current = results;

  const markerIcon = (L, r, isSel) => {
    const cat = CATEGORIES[r.category] || CATEGORIES.custom;
    return L.divIcon({
      className: '',
      html: `<div style="
        width: 30px; height: 30px; border-radius: 50%;
        background: ${cat.color};
        border: ${isSel ? '3px solid #2D4F3E' : '2px solid rgba(250,243,225,0.9)'};
        display: flex; align-items: center; justify-content: center;
        font-size: 14px; box-shadow: 0 2px 6px rgba(31,41,34,0.3);
        position: relative;
      ">${r.emoji}${isSel ? `<span style="
        position: absolute; top: -5px; right: -5px;
        width: 15px; height: 15px; border-radius: 50%;
        background: #2D4F3E; color: #FAF3E1;
        font-size: 10px; line-height: 15px; text-align: center;
        font-weight: 700;
      ">✓</span>` : ''}</div>`,
      iconSize: [30, 30], iconAnchor: [15, 15],
    });
  };

  const popupHtml = (r, idx, isSel) => {
    const cat = CATEGORIES[r.category] || CATEGORIES.custom;
    const sub = [r.label, r.place, `${r.distKm} km`].filter(Boolean).join(' · ');
    const img = r.image
      ? `<img src="${r.image}" loading="lazy" alt="" style="
          width:100%; height:96px; object-fit:cover;
          border-radius:8px; margin-top:6px; display:block;
        " onerror="this.style.display='none'" />`
      : '';
    const desc = r.description
      ? `<div style="font-size:11px;color:#1F2922;font-style:italic;margin-top:5px;line-height:1.45;">${r.description}</div>`
      : '';
    const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${r.coords[0]},${r.coords[1]}`;
    const websiteLink = r.website
      ? `<a href="${r.website}" target="_blank" rel="noopener noreferrer" style="
          font-size:11px; color:${cat.color}; text-decoration:none; font-weight:600;
          white-space:nowrap;
        ">Website ↗</a>`
      : '';
    return `
      <div style="font-family:'DM Sans',sans-serif;min-width:190px;max-width:240px;">
        <div style="font-size:13px;font-weight:600;color:#1F2922;">${r.emoji} ${r.name}</div>
        <div style="font-size:10px;color:rgba(31,41,34,0.55);margin-top:2px;">${sub}</div>
        ${img}
        ${desc}
        <div style="display:flex;gap:8px;margin-top:8px;align-items:center;">
          <button data-sugg-idx="${idx}" style="
            flex:1; padding:7px 10px; border:none; border-radius:8px;
            font-family:'DM Sans',sans-serif; font-size:12px; font-weight:600;
            cursor:pointer;
            background:${isSel ? '#E8E0CC' : '#2D4F3E'};
            color:${isSel ? '#1F2922' : '#FAF3E1'};
          ">${isSel ? '✓ Geselecteerd — weghalen' : '+ Selecteren'}</button>
          <a href="${mapsUrl}" target="_blank" rel="noopener noreferrer" style="
            font-size:11px; color:${cat.color}; text-decoration:none; font-weight:600;
            white-space:nowrap;
          ">Maps ↗</a>
          ${websiteLink}
        </div>
        <button data-sugg-hide="${idx}" style="
          width:100%; margin-top:6px; padding:5px 8px;
          border:none; background:transparent; cursor:pointer;
          font-family:'DM Sans',sans-serif; font-size:10.5px;
          color:rgba(31,41,34,0.5); text-decoration:underline;
        ">Niet meer tonen in suggesties</button>
      </div>`;
  };

  // Leaflet laden + kaart initialiseren + gedelegeerde knop-handler.
  // Delegatie op containerniveau overleeft het vervangen van popup-inhoud,
  // dus de knoppen blijven áltijd werken.
  useEffect(() => {
    let mounted = true;
    const container = containerRef.current;

    const onContainerClick = (e) => {
      const selBtn = e.target.closest('[data-sugg-idx]');
      if (selBtn) {
        e.preventDefault();
        onToggleRef.current(Number(selBtn.dataset.suggIdx));
        return;
      }
      const hideBtn = e.target.closest('[data-sugg-hide]');
      if (hideBtn) {
        e.preventDefault();
        mapRef.current?.closePopup();
        onHideRef.current(Number(hideBtn.dataset.suggHide));
      }
    };
    container?.addEventListener('click', onContainerClick);

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

      if (!mapRef.current && containerRef.current) {
        const map = L.map(containerRef.current, {
          center: stay?.coords || [48.8, 6.5],
          zoom: 10,
          scrollWheelZoom: true,
        });
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '© OpenStreetMap contributors',
          maxZoom: 19,
        }).addTo(map);
        mapRef.current = map;
        setReady(true);
        // Sheet-animatie kan de containermaat beïnvloeden — herbereken
        setTimeout(() => map.invalidateSize(), 320);

        // Klik op een leeg punt → "wat ligt hier?"
        map.on('click', (e) => {
          if (onMapClickRef.current) onMapClickRef.current([e.latlng.lat, e.latlng.lng]);
        });
      }
    })();

    return () => {
      mounted = false;
      container?.removeEventListener('click', onContainerClick);
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Markers (her)tekenen wanneer de resultaten of het verblijf wijzigen.
  // Selectie-wijzigingen vallen hier bewust búíten: die passen alleen
  // icoon en popup-inhoud aan, zodat een open popup open blijft.
  useEffect(() => {
    const map = mapRef.current;
    const L = leafletRef.current;
    if (!map || !L || !ready) return;

    markerMapRef.current.forEach(({ marker }) => marker.remove());
    markerMapRef.current = new Map();

    // Verblijf-marker
    if (stay?.coords) {
      const stayIcon = L.divIcon({
        className: '',
        html: `<div style="
          width: 34px; height: 34px; border-radius: 50%;
          background: ${stay.color}; border: 3px solid #FAF3E1;
          display: flex; align-items: center; justify-content: center;
          font-size: 16px; box-shadow: 0 2px 8px rgba(31,41,34,0.35);
        ">🏡</div>`,
        iconSize: [34, 34], iconAnchor: [17, 17],
      });
      const m = L.marker(stay.coords, { icon: stayIcon, zIndexOffset: 1000 }).addTo(map);
      m.bindPopup(`<div style="font-family:'DM Sans',sans-serif;">
        <div style="font-family:'Fraunces',serif;font-size:14px;color:#2D4F3E;">${stay.name}</div>
      </div>`);
      markerMapRef.current.set('__stay__', { marker: m, result: null });
    }

    // Suggestie-markers — r.idx is de originele index in de volledige
    // resultatenlijst (nodig wanneer de kaart een gefilterde subset toont)
    results.forEach((r, i) => {
      const idx = r.idx ?? i;
      const isSel = selectedRef.current.has(idx);
      const m = L.marker(r.coords, { icon: markerIcon(L, r, isSel) }).addTo(map);
      m.bindPopup(popupHtml(r, idx, isSel), { closeButton: false, maxWidth: 260 });
      // Hover opent de popup (desktop); tikken doet dat standaard al.
      // Selecteren gebeurt uitsluitend via de knop in de popup.
      m.on('mouseover', () => m.openPopup());
      markerMapRef.current.set(idx, { marker: m, result: r });
    });

    // Inzoomen op de resultaten
    if (results.length > 0) {
      const pts = results.map(r => r.coords);
      if (stay?.coords) pts.push(stay.coords);
      map.fitBounds(L.latLngBounds(pts), { padding: [30, 30], maxZoom: 13 });
    }
  }, [results, stay, ready]);

  // Selectie-wijziging: alleen icoon + popup-inhoud verversen, in situ.
  useEffect(() => {
    const L = leafletRef.current;
    if (!L || !ready) return;
    markerMapRef.current.forEach(({ marker, result }, idx) => {
      if (!result) return; // verblijf-marker
      const isSel = selected.has(idx);
      marker.setIcon(markerIcon(L, result, isSel));
      marker.setPopupContent(popupHtml(result, idx, isSel));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, ready]);

  return (
    <div
      style={full ? {
        position: 'fixed', inset: 0, zIndex: 70,
        background: COLORS.cream, padding: 10,
        display: 'flex', flexDirection: 'column',
      } : {
        position: 'relative', marginBottom: 14,
      }}
    >
      {full && topBar && (
        <div style={{ marginBottom: 8, paddingRight: 56 }}>{topBar}</div>
      )}
      <div
        ref={containerRef}
        style={{
          width: '100%',
          height: full ? '100%' : 380,
          flex: full ? 1 : undefined,
          borderRadius: 12,
          overflow: 'hidden', border: `1px solid ${COLORS.hairline}`,
          zIndex: 0, position: 'relative',
        }}
      />
      <button
        onClick={() => setFull(f => !f)}
        title={full ? 'Verkleinen' : 'Volledig scherm'}
        aria-label={full ? 'Verkleinen' : 'Volledig scherm'}
        style={{
          position: 'absolute',
          top: full ? 16 : 10,
          right: full ? 16 : 10,
          zIndex: 1001,
          width: 36, height: 36, borderRadius: 10,
          border: `1px solid ${COLORS.hairline}`,
          background: COLORS.cream, color: COLORS.forest,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer',
          boxShadow: '0 2px 8px rgba(31,41,34,0.2)',
        }}
      >
        {full ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
      </button>
    </div>
  );
};

const SuggestionsSheet = ({ stays, days, plan, activityById, existingNames, existingCoords, exclusions, onExclude, onClearExclusions, onAdd, onCreateAt, onClose }) => {
  const [choosingDay, setChoosingDay] = useState(false);
  const [whatsHerePoint, setWhatsHerePoint] = useState(null);
  // Een suggestie geldt als "al toegevoegd" wanneer de naam overeenkomt
  // óf wanneer hij binnen ~60 m van een bestaande activiteit ligt.
  const isAlreadyAdded = (sugg) => {
    if (existingNames.has(sugg.name.toLowerCase())) return true;
    return (existingCoords || []).some(([la, ln]) =>
      Math.abs(la - sugg.coords[0]) < 0.0006 && Math.abs(ln - sugg.coords[1]) < 0.0009
    );
  };

  // Door de gebruiker verborgen suggesties (naam óf locatie binnen ~60 m)
  const isExcluded = (sugg) => (exclusions || []).some(ex =>
    ex.name?.toLowerCase() === sugg.name.toLowerCase() ||
    (Array.isArray(ex.coords) &&
      Math.abs(ex.coords[0] - sugg.coords[0]) < 0.0006 &&
      Math.abs(ex.coords[1] - sugg.coords[1]) < 0.0009)
  );

  // Verberg een resultaat: registreer de uitsluiting en haal hem uit de
  // huidige lijst. Selectie-indices schuiven mee.
  const hideResult = (idx) => {
    const r = results[idx];
    if (!r) return;
    onExclude({ name: r.name, coords: r.coords });
    setResults(rs => rs.filter((_, i) => i !== idx));
    setSelected(prev => {
      const next = new Set();
      prev.forEach(i => {
        if (i === idx) return;
        next.add(i > idx ? i - 1 : i);
      });
      return next;
    });
  };
  const staysWithCoords = stays.filter(s => s.coords);

  // Zoek-ankers: verblijven + alle geplande activiteiten met coördinaten.
  // Per anker bewaren we waar het vandaan komt zodat we het kunnen groeperen.
  const plannedAnchors = useMemo(() => {
    const out = [];
    const seen = new Set();
    (days || []).forEach(d => {
      (plan?.[d.key] || []).forEach(id => {
        const a = activityById?.[id];
        if (!a || !a.coords || seen.has(id)) return;
        seen.add(id);
        out.push({
          id: `act:${id}`,
          name: a.name,
          emoji: a.emoji || '📍',
          coords: a.coords,
          color: (CATEGORIES[a.category] || CATEGORIES.custom).color,
          dayLabel: `${d.dayShort} ${d.date}`,
          stayId: d.stay?.id || null,
          stayName: d.stay?.name || null,
        });
      });
    });
    return out;
  }, [days, plan, activityById]);

  const anchors = useMemo(() => ([
    ...staysWithCoords.map(s => ({
      id: `stay:${s.id}`, name: s.name, emoji: '🏡',
      coords: s.coords, color: s.color, kind: 'stay',
    })),
    ...plannedAnchors.map(a => ({ ...a, kind: 'activity' })),
  ]), [staysWithCoords, plannedAnchors]);

  const [anchorId, setAnchorId] = useState(null);
  // Filter de geplande-activiteit-lijst op verblijf (null = alle verblijven)
  const [anchorStayFilter, setAnchorStayFilter] = useState(null);
  // Sectie "rond een geplande activiteit" in-/uitklappen
  const [plannedOpen, setPlannedOpen] = useState(false);
  const filteredPlannedAnchors = useMemo(() =>
    anchorStayFilter
      ? plannedAnchors.filter(a => a.stayId === anchorStayFilter)
      : plannedAnchors,
    [plannedAnchors, anchorStayFilter]);
  // Welke verblijven komen voor in de geplande activiteiten (voor de filterknoppen)
  const staysInPlanned = useMemo(() => {
    const ids = new Set(plannedAnchors.map(a => a.stayId).filter(Boolean));
    return staysWithCoords.filter(s => ids.has(s.id));
  }, [plannedAnchors, staysWithCoords]);
  // Standaard het eerste verblijf; valt terug op eerste anker
  const effectiveAnchorId = anchorId ?? anchors[0]?.id ?? null;
  const anchor = anchors.find(a => a.id === effectiveAnchorId) || null;
  // Afstandsbanden: [van, tot] in km
  const BANDS = [[0, 10], [10, 20], [20, 30], [30, 50]];
  const [band, setBand] = useState(BANDS[0]);
  const [state, setState] = useState('idle'); // idle | loading | done | error
  const [view, setView] = useState('list'); // list | map
  const [mode, setMode] = useState('sights'); // sights | hiking
  // Categoriefilter: lege set = alles tonen
  const [catFilter, setCatFilter] = useState(new Set());
  const [results, setResults] = useState([]);
  const [hikes, setHikes] = useState([]);
  const [hikeView, setHikeView] = useState('list'); // list | map (wandelroutes)
  const [activeHike, setActiveHike] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [errMsg, setErrMsg] = useState('');

  const searchHiking = async () => {
    if (!anchor) return;
    setState('loading');
    setHikes([]);
    try {
      const res = await fetch('/api/hiking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Family-Pin': getPin() },
        body: JSON.stringify({
          lat: anchor.coords[0], lng: anchor.coords[1],
          rMin: band[0] * 1000, rMax: band[1] * 1000,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        if (d.error === 'rate_limited') throw new Error('Even te veel aanvragen — probeer het over een minuut opnieuw.');
        const detail = d.detail ? ` (${d.detail})` : '';
        throw new Error(`Wandelroutes ophalen mislukt${detail}. De OpenStreetMap-servers zijn soms traag of weigeren tijdelijk; probeer het zo nog eens.`);
      }
      const data = await res.json();
      const existing = new Set(existingNames);
      const fresh = (data.routes || []).filter(r => !existing.has(r.name.toLowerCase()));
      setHikes(fresh);
      setActiveHike(null);
      setState('done');
    } catch (e) {
      setErrMsg(e.message);
      setState('error');
    }
  };

  const search = async () => {
    if (!anchor) return;
    setState('loading');
    setResults([]);
    setSelected(new Set());
    try {
      const res = await fetch('/api/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Family-Pin': getPin() },
        body: JSON.stringify({
          lat: anchor.coords[0], lng: anchor.coords[1],
          rMin: band[0] * 1000, rMax: band[1] * 1000,
        }),
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
        .filter(s => !isAlreadyAdded(s) && !isExcluded(s));
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

  // Welke categorieën komen in de resultaten voor (met aantallen)
  const catCounts = useMemo(() => {
    const counts = {};
    results.forEach(r => {
      const cat = CATEGORIES[r.category] ? r.category : 'custom';
      counts[cat] = (counts[cat] || 0) + 1;
    });
    return counts;
  }, [results]);

  const catVisible = (catKey) => catFilter.size === 0 || catFilter.has(catKey);

  const toggleCat = (catKey) => {
    setCatFilter(prev => {
      const next = new Set(prev);
      if (next.has(catKey)) next.delete(catKey); else next.add(catKey);
      return next;
    });
  };

  // Resultaten voor de kaart, gefilterd maar mét hun originele index
  const mapResults = useMemo(() =>
    results
      .map((r, idx) => ({ ...r, idx }))
      .filter(r => catVisible(CATEGORIES[r.category] ? r.category : 'custom')),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [results, catFilter]);

  // Categorie-chips — gedeeld tussen de sheet en de fullscreen-kaart
  const catChips = results.length === 0 ? null : (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {CATEGORY_ORDER.filter(k => catCounts[k]).map(catKey => {
        const cat = CATEGORIES[catKey];
        const active = catFilter.has(catKey);
        return (
          <button
            key={catKey}
            onClick={() => toggleCat(catKey)}
            style={{
              padding: '5px 10px', borderRadius: 99,
              fontSize: 12, fontWeight: 600,
              fontFamily: "'DM Sans', sans-serif", cursor: 'pointer',
              background: active ? cat.color : 'transparent',
              color: active ? COLORS.cream : COLORS.ink,
              border: `1px solid ${active ? cat.color : COLORS.hairline}`,
              display: 'flex', alignItems: 'center', gap: 5,
            }}
          >
            <span>{cat.emoji}</span>
            {cat.name}
            <span style={{ opacity: 0.7, fontWeight: 500 }}>{catCounts[catKey]}</span>
          </button>
        );
      })}
      {catFilter.size > 0 && (
        <button
          onClick={() => setCatFilter(new Set())}
          style={{
            padding: '5px 10px', borderRadius: 99,
            fontSize: 12, fontWeight: 600,
            fontFamily: "'DM Sans', sans-serif", cursor: 'pointer',
            background: 'transparent', color: COLORS.inkLight,
            border: 'none', textDecoration: 'underline',
          }}
        >wis filter</button>
      )}
    </div>
  );

  // Zwaartepunt van de aangevinkte suggesties (voor nabijheid per dag)
  const selectionCenter = useMemo(() => {
    const picked = results.filter((_, idx) => selected.has(idx)).filter(r => r.coords);
    if (picked.length === 0) return null;
    const lat = picked.reduce((s, r) => s + r.coords[0], 0) / picked.length;
    const lng = picked.reduce((s, r) => s + r.coords[1], 0) / picked.length;
    return [lat, lng];
  }, [results, selected]);

  const kmBetween = (a, b) => {
    const R = 6371;
    const dLat = (b[0] - a[0]) * Math.PI / 180;
    const dLng = (b[1] - a[1]) * Math.PI / 180;
    const x = Math.sin(dLat / 2) ** 2 +
      Math.cos(a[0] * Math.PI / 180) * Math.cos(b[0] * Math.PI / 180) *
      Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  };

  const NEARBY_KM = 25; // straal waarbinnen we een geplande activiteit "in de buurt" noemen

  // Per dag: welke al-geplande activiteiten liggen in de buurt van de selectie
  const dayInsights = useMemo(() => {
    const map = {};
    (days || []).forEach(d => {
      const ids = plan?.[d.key] || [];
      const planned = ids.map(id => activityById?.[id]).filter(Boolean);
      let near = [];
      if (selectionCenter) {
        near = planned
          .filter(a => a.coords)
          .map(a => ({ act: a, km: kmBetween(selectionCenter, a.coords) }))
          .filter(x => x.km <= NEARBY_KM)
          .sort((a, b) => a.km - b.km);
      }
      map[d.key] = { total: ids.length, near };
    });
    return map;
  }, [days, plan, activityById, selectionCenter]);

  // Dagen sorteren: meeste nabije activiteiten eerst, dan op datum (origineel)
  const sortedDays = useMemo(() => {
    const arr = (days || []).map((d, i) => ({ d, i }));
    arr.sort((a, b) => {
      const na = dayInsights[a.d.key]?.near.length || 0;
      const nb = dayInsights[b.d.key]?.near.length || 0;
      if (na !== nb) return nb - na;
      return a.i - b.i;
    });
    return arr.map(x => x.d);
  }, [days, dayInsights]);

  const confirmAdd = (dayKey = null) => {
    const picked = results.filter((_, idx) => selected.has(idx));
    if (picked.length === 0) return;
    onAdd(picked.map(p => ({
      name: p.name,
      category: p.category,
      emoji: p.emoji,
      coords: p.coords,
      note: [p.label, p.place, `≈ ${p.distKm} km van ${anchor?.name ?? 'startpunt'}`]
        .filter(Boolean).join(' · '),
    })), dayKey);
  };

  // Eén wandelroute toevoegen aan de activiteitenlijst
  // Vereenvoudig de routegeometrie tot één reeks punten en dun uit,
  // zodat de opgeslagen activiteit compact blijft (max ~200 punten).
  const simplifyRoute = (segments) => {
    if (!Array.isArray(segments) || segments.length === 0) return null;
    const flat = [];
    segments.forEach(seg => seg.forEach(p => flat.push(p)));
    if (flat.length === 0) return null;
    const maxPts = 200;
    if (flat.length <= maxPts) return flat;
    const step = Math.ceil(flat.length / maxPts);
    const out = [];
    for (let i = 0; i < flat.length; i += step) out.push(flat[i]);
    // zorg dat het laatste punt erbij zit
    if (out[out.length - 1] !== flat[flat.length - 1]) out.push(flat[flat.length - 1]);
    return out.map(p => [Math.round(p[0] * 1e5) / 1e5, Math.round(p[1] * 1e5) / 1e5]);
  };

  // GPX downloaden van een gevonden route (vóór toevoegen)
  const downloadHikeGpx = (h) => {
    try {
      const flat = [];
      (h.segments || []).forEach(seg => seg.forEach(p => flat.push(p)));
      if (flat.length < 2) { window.alert('Geen routelijn beschikbaar voor GPX.'); return; }
      const esc = (s) => String(s).replace(/[<>&'"]/g, c => (
        { '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));
      const name = esc(h.name || 'Wandelroute');
      const trkpts = flat.map(([lat, lng]) => `      <trkpt lat="${lat}" lon="${lng}"></trkpt>`).join('\n');
      const gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Vakantieplanner" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata><name>${name}</name></metadata>
  <trk><name>${name}</name><trkseg>
${trkpts}
  </trkseg></trk>
</gpx>`;
      const blob = new Blob([gpx], { type: 'application/gpx+xml' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const safe = (h.name || 'wandelroute').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
      a.href = url; a.download = `${safe || 'wandelroute'}.gpx`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      window.alert('Kon het GPX-bestand niet maken.');
    }
  };

  const addHike = (h) => {
    const parts = [];
    if (h.lengthKm) parts.push(`${h.lengthKm} km`);
    if (h.durationMin) {
      const u = Math.floor(h.durationMin / 60);
      const m = h.durationMin % 60;
      parts.push(`≈ ${u > 0 ? `${u}u ` : ''}${m}min lopen`);
    }
    if (h.roundtrip) parts.push('rondwandeling');
    parts.push(`start ≈ ${h.distKm} km van ${anchor?.name ?? 'startpunt'}`);
    onAdd([{
      name: h.name,
      category: 'hiking',
      emoji: '🥾',
      coords: h.coords,
      note: parts.join(' · '),
      routeGeometry: simplifyRoute(h.segments),
    }], null, { keepOpen: true });
    // Haal de toegevoegde route uit de lijst zodat je voortgang ziet
    setHikes(hs => hs.filter(x => x !== h));
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
            <div style={{
              display: 'flex', gap: 0, marginBottom: 14,
              border: `1px solid ${COLORS.hairline}`, borderRadius: 10, overflow: 'hidden',
            }}>
              {[['sights', '📍 Bezienswaardigheden'], ['hiking', '🥾 Wandelroutes']].map(([key, lbl]) => (
                <button
                  key={key}
                  onClick={() => { setMode(key); setState('idle'); }}
                  style={{
                    flex: 1, padding: '10px 0', border: 'none', cursor: 'pointer',
                    fontFamily: "'DM Sans', sans-serif", fontSize: 12.5, fontWeight: 600,
                    background: mode === key ? COLORS.forest : 'transparent',
                    color: mode === key ? COLORS.cream : COLORS.ink,
                  }}
                >{lbl}</button>
              ))}
            </div>

            <p style={{ fontSize: 13, color: COLORS.inkLight, margin: '0 0 14px', lineHeight: 1.5 }}>
              {mode === 'hiking'
                ? 'Zoekt gemarkeerde wandelroutes uit OpenStreetMap rond een verblijf óf een geplande activiteit, met lengte en geschatte wandeltijd.'
                : 'Zoekt naar bezienswaardigheden, musea, kastelen, uitkijkpunten, zwemplekken, markten en supermarkten rond een verblijf óf een geplande activiteit. Vink aan wat je interessant vindt.'}
            </p>

            <div style={{ marginBottom: 10 }}>
              <div style={{ marginBottom: 4 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: COLORS.inkLight, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
                  Zoek rond een verblijf
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: plannedAnchors.length ? 12 : 0 }}>
                  {staysWithCoords.map(s => {
                    const id = `stay:${s.id}`;
                    const active = effectiveAnchorId === id;
                    return (
                      <button
                        key={id}
                        onClick={() => { setAnchorId(id); setState('idle'); setResults([]); }}
                        style={{
                          padding: '8px 14px', borderRadius: 99, fontSize: 13, fontWeight: 600,
                          fontFamily: "'DM Sans', sans-serif", cursor: 'pointer',
                          background: active ? s.color : 'transparent',
                          color: active ? COLORS.cream : COLORS.ink,
                          border: `1px solid ${active ? s.color : COLORS.hairline}`,
                        }}
                      >🏡 {s.name}</button>
                    );
                  })}
                </div>

                {plannedAnchors.length > 0 && (
                  <>
                    <button
                      onClick={() => setPlannedOpen(o => !o)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 6, width: '100%',
                        background: 'transparent', border: 'none', cursor: 'pointer',
                        padding: '2px 0', marginBottom: plannedOpen ? 6 : 0,
                        fontFamily: "'DM Sans', sans-serif",
                        fontSize: 11, fontWeight: 600, color: COLORS.inkLight,
                        textTransform: 'uppercase', letterSpacing: '0.05em',
                      }}
                    >
                      <span style={{
                        display: 'inline-flex', transition: 'transform 0.15s ease',
                        transform: plannedOpen ? 'rotate(90deg)' : 'none',
                      }}>
                        <ChevronRight size={14} />
                      </span>
                      …of rond een geplande activiteit
                      <span style={{ opacity: 0.6, fontWeight: 500 }}>({plannedAnchors.length})</span>
                    </button>

                    {plannedOpen && (<>
                    {staysInPlanned.length > 1 && (
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                        <button
                          onClick={() => setAnchorStayFilter(null)}
                          style={{
                            padding: '4px 11px', borderRadius: 99, fontSize: 11.5, fontWeight: 600,
                            fontFamily: "'DM Sans', sans-serif", cursor: 'pointer',
                            background: anchorStayFilter === null ? COLORS.forest : 'transparent',
                            color: anchorStayFilter === null ? COLORS.cream : COLORS.ink,
                            border: `1px solid ${anchorStayFilter === null ? COLORS.forest : COLORS.hairline}`,
                          }}
                        >Alle verblijven</button>
                        {staysInPlanned.map(s => {
                          const active = anchorStayFilter === s.id;
                          return (
                            <button
                              key={s.id}
                              onClick={() => setAnchorStayFilter(s.id)}
                              style={{
                                padding: '4px 11px', borderRadius: 99, fontSize: 11.5, fontWeight: 600,
                                fontFamily: "'DM Sans', sans-serif", cursor: 'pointer',
                                background: active ? s.color : 'transparent',
                                color: active ? COLORS.cream : COLORS.ink,
                                border: `1px solid ${active ? s.color : COLORS.hairline}`,
                              }}
                            >🏡 {s.name}</button>
                          );
                        })}
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', maxHeight: 132, overflowY: 'auto' }}>
                      {filteredPlannedAnchors.map(a => {
                        const active = effectiveAnchorId === a.id;
                        return (
                          <button
                            key={a.id}
                            onClick={() => { setAnchorId(a.id); setState('idle'); setResults([]); }}
                            title={`${a.name} · ${a.dayLabel}${a.stayName ? ` · ${a.stayName}` : ''}`}
                            style={{
                              padding: '7px 12px', borderRadius: 99, fontSize: 12.5, fontWeight: 600,
                              fontFamily: "'DM Sans', sans-serif", cursor: 'pointer',
                              background: active ? a.color : 'transparent',
                              color: active ? COLORS.cream : COLORS.ink,
                              border: `1px solid ${active ? a.color : COLORS.hairline}`,
                              display: 'inline-flex', alignItems: 'center', gap: 5,
                              maxWidth: 220,
                            }}
                          >
                            <span>{a.emoji}</span>
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</span>
                            <span style={{ opacity: 0.7, fontWeight: 500, fontSize: 11 }}>· {a.dayLabel}</span>
                          </button>
                        );
                      })}
                    </div>
                    </>)}
                  </>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13, color: COLORS.ink }}>Afstand:</span>
              {BANDS.map(b => {
                const active = band[0] === b[0] && band[1] === b[1];
                return (
                  <button
                    key={b.join('-')}
                    onClick={() => setBand(b)}
                    style={{
                      padding: '6px 12px', borderRadius: 99, fontSize: 12, fontWeight: 600,
                      fontFamily: "'DM Sans', sans-serif", cursor: 'pointer',
                      background: active ? COLORS.forest : 'transparent',
                      color: active ? COLORS.cream : COLORS.ink,
                      border: `1px solid ${active ? COLORS.forest : COLORS.hairline}`,
                    }}
                  >{b[0]}–{b[1]} km</button>
                );
              })}
            </div>

            <button
              onClick={mode === 'hiking' ? searchHiking : search}
              disabled={state === 'loading' || !anchor}
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
                ? <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> {mode === 'hiking' ? 'Wandelroutes zoeken…' : 'Omgeving doorzoeken…'}</>
                : <><Compass size={16} /> {mode === 'hiking' ? 'Wandelroutes rond' : 'Zoek rond'} {anchor?.name ?? 'startpunt'}</>}
            </button>

            {state === 'error' && (
              <div style={{
                padding: 12, borderRadius: 10, fontSize: 13,
                background: 'rgba(201, 125, 93, 0.12)', color: COLORS.sunset,
                marginBottom: 12,
              }}>{errMsg}</div>
            )}

            {/* Wandelroutes-resultaten */}
            {mode === 'hiking' && state === 'done' && hikes.length === 0 && (
              <div style={{ fontSize: 13, color: COLORS.inkLight }}>
                Geen gemarkeerde wandelroutes gevonden tussen {band[0]} en {band[1]} km.
                Niet elke route staat in OpenStreetMap — probeer een andere
                afstandsband of een ander startpunt.
              </div>
            )}

            {mode === 'hiking' && hikes.length > 0 && (
              <>
                <div style={{
                  display: 'flex', gap: 0, marginBottom: 12,
                  border: `1px solid ${COLORS.hairline}`, borderRadius: 10, overflow: 'hidden',
                }}>
                  {[['list', 'Lijst'], ['map', 'Kaart']].map(([key, lbl]) => (
                    <button
                      key={key}
                      onClick={() => setHikeView(key)}
                      style={{
                        flex: 1, padding: '9px 0', border: 'none', cursor: 'pointer',
                        fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600,
                        background: hikeView === key ? COLORS.forest : 'transparent',
                        color: hikeView === key ? COLORS.cream : COLORS.ink,
                      }}
                    >{lbl}</button>
                  ))}
                </div>

                {hikeView === 'map' && (
                  <HikingMap
                    anchor={anchor}
                    hikes={hikes}
                    activeIdx={activeHike}
                    onSelect={(i) => setActiveHike(prev => prev === i ? null : i)}
                  />
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {hikes.map((h, i) => (
                  <div
                    key={`${h.name}-${i}`}
                    onClick={() => hikeView === 'map' && setActiveHike(i)}
                    style={{
                      padding: '12px 14px', background: COLORS.creamSoft,
                      border: `1px solid ${activeHike === i && hikeView === 'map' ? '#C2410C' : COLORS.hairline}`,
                      borderLeft: `4px solid ${activeHike === i && hikeView === 'map' ? '#C2410C' : (CATEGORIES.hiking?.color || COLORS.forest)}`,
                      borderRadius: 12,
                      cursor: hikeView === 'map' ? 'pointer' : 'default',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                      <span style={{
                        width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                        background: activeHike === i && hikeView === 'map' ? '#C2410C' : (CATEGORIES.hiking?.color || COLORS.forest),
                        color: COLORS.cream, display: 'flex', alignItems: 'center',
                        justifyContent: 'center', fontSize: 11, fontWeight: 700,
                      }}>{i + 1}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: COLORS.charcoal }}>
                          {h.name}
                        </div>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 5 }}>
                          {h.lengthKm != null && (
                            <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: `${COLORS.forest}1A`, color: COLORS.forest }}>
                              📏 {h.lengthKm} km{h.lengthEstimated ? '*' : ''}
                            </span>
                          )}
                          {h.durationMin != null && (
                            <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: `${COLORS.lake}1A`, color: COLORS.lake }}>
                              ⏱ {Math.floor(h.durationMin / 60) > 0 ? `${Math.floor(h.durationMin / 60)}u ` : ''}{h.durationMin % 60}min
                            </span>
                          )}
                          {h.roundtrip && (
                            <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 99, background: COLORS.cream, color: COLORS.inkLight, border: `1px solid ${COLORS.hairline}` }}>
                              ↺ rondwandeling
                            </span>
                          )}
                          <span style={{ fontSize: 11, color: COLORS.inkLight, alignSelf: 'center' }}>
                            start ≈ {h.distKm} km
                          </span>
                        </div>
                        {h.lengthEstimated && (
                          <div style={{ fontSize: 10.5, color: COLORS.inkLight, marginTop: 4, fontStyle: 'italic' }}>
                            * lengte berekend uit de route (niet als tag opgegeven)
                          </div>
                        )}
                        {h.lengthKm == null && (
                          <div style={{ fontSize: 10.5, color: COLORS.inkLight, marginTop: 4, fontStyle: 'italic' }}>
                            lengte niet bekend
                          </div>
                        )}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                      <button
                        onClick={(e) => { e.stopPropagation(); addHike(h); }}
                        style={{
                          flex: 1, padding: '9px 12px', border: 'none', borderRadius: 9,
                          background: COLORS.forest, color: COLORS.cream,
                          fontSize: 12.5, fontWeight: 600, fontFamily: "'DM Sans', sans-serif",
                          cursor: 'pointer',
                        }}
                      >+ Toevoegen aan activiteiten</button>
                      <a
                        href={h.website || `https://www.google.com/maps/search/?api=1&query=${h.coords[0]},${h.coords[1]}`}
                        target="_blank" rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        style={{
                          padding: '9px 12px', borderRadius: 9,
                          border: `1px solid ${COLORS.hairline}`,
                          color: COLORS.forest, fontSize: 12.5, fontWeight: 600,
                          textDecoration: 'none', whiteSpace: 'nowrap',
                          display: 'flex', alignItems: 'center',
                        }}
                      >{h.website ? 'Website ↗' : 'Maps ↗'}</a>
                      {h.segments && h.segments.length > 0 && (
                        <button
                          onClick={(e) => { e.stopPropagation(); downloadHikeGpx(h); }}
                          title="Download als GPX"
                          style={{
                            padding: '9px 12px', borderRadius: 9,
                            border: `1px solid ${COLORS.hairline}`,
                            background: 'transparent', color: COLORS.forest,
                            fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
                            fontFamily: "'DM Sans', sans-serif",
                            display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap',
                          }}
                        >GPX ↓</button>
                      )}
                    </div>
                  </div>
                ))}
                </div>
                <div style={{ fontSize: 11, color: COLORS.inkLight, marginTop: 8, lineHeight: 1.5 }}>
                  Wandeltijd is een schatting op ~4,5 km/u en houdt geen rekening met hoogteverschil.
                  {hikeView === 'map' && ' Tik een route of nummer op de kaart aan om hem te markeren.'}
                </div>
              </>
            )}

            {mode === 'sights' && state === 'done' && results.length === 0 && (
              <div style={{ fontSize: 13, color: COLORS.inkLight }}>
                Niets nieuws gevonden tussen {band[0]} en {band[1]} km. Probeer een
                andere afstandsband, of voeg zelf activiteiten toe.
              </div>
            )}

            {mode === 'sights' && results.length > 0 && (
              <>
                <div style={{ marginBottom: 10 }}>{catChips}</div>

                <div style={{
                  display: 'flex', gap: 0, marginBottom: 14,
                  border: `1px solid ${COLORS.hairline}`, borderRadius: 10,
                  overflow: 'hidden',
                }}>
                  {[['list', 'Lijst'], ['map', 'Kaart']].map(([key, lbl]) => (
                    <button
                      key={key}
                      onClick={() => setView(key)}
                      style={{
                        flex: 1, padding: '9px 0', border: 'none', cursor: 'pointer',
                        fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600,
                        background: view === key ? COLORS.forest : 'transparent',
                        color: view === key ? COLORS.cream : COLORS.ink,
                      }}
                    >{lbl}</button>
                  ))}
                </div>

                {view === 'map' && (
                  <SuggestionsMap
                    stay={anchor}
                    results={mapResults}
                    selected={selected}
                    onToggle={toggle}
                    onHide={hideResult}
                    topBar={catChips}
                    onMapClick={(pt) => setWhatsHerePoint(pt)}
                  />
                )}

                {view === 'list' && CATEGORY_ORDER.map(catKey => {
                  const list = grouped[catKey];
                  if (!list || list.length === 0 || !catVisible(catKey)) return null;
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
                          <div
                            key={r.idx}
                            onClick={() => toggle(r.idx)}
                            style={{
                              display: 'flex', alignItems: 'flex-start', gap: 10,
                              padding: '10px 12px', width: '100%', textAlign: 'left',
                              background: selected.has(r.idx) ? `${cat.color}1A` : COLORS.creamSoft,
                              border: `1px solid ${selected.has(r.idx) ? cat.color : 'transparent'}`,
                              borderRadius: 10, cursor: 'pointer',
                              fontFamily: "'DM Sans', sans-serif",
                            }}
                          >
                            <span style={{
                              width: 18, height: 18, borderRadius: 5, flexShrink: 0, marginTop: 2,
                              border: `2px solid ${selected.has(r.idx) ? cat.color : COLORS.hairline}`,
                              background: selected.has(r.idx) ? cat.color : 'transparent',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                              {selected.has(r.idx) && <Check size={12} color={COLORS.cream} />}
                            </span>
                            <span style={{ fontSize: 14, marginTop: 1 }}>{r.emoji}</span>
                            <span style={{ flex: 1, minWidth: 0 }}>
                              <span style={{ display: 'block', fontSize: 13, color: COLORS.charcoal, fontWeight: 500 }}>
                                {r.name}
                              </span>
                              <span style={{ display: 'block', fontSize: 10, color: COLORS.inkLight, marginTop: 1 }}>
                                {[r.label, r.place].filter(Boolean).join(' · ')}
                              </span>
                              {r.description && (
                                <span style={{
                                  display: 'block', fontSize: 11, color: COLORS.ink,
                                  marginTop: 3, lineHeight: 1.4, fontStyle: 'italic',
                                }}>
                                  {r.description}
                                </span>
                              )}
                            </span>
                            <span style={{
                              display: 'flex', flexDirection: 'column',
                              alignItems: 'flex-end', gap: 4, flexShrink: 0,
                            }}>
                              <span style={{ fontSize: 11, color: COLORS.inkLight, whiteSpace: 'nowrap' }}>
                                {r.distKm} km
                              </span>
                              <span style={{ display: 'flex', gap: 6 }}>
                                <button
                                  onClick={(e) => { e.stopPropagation(); hideResult(r.idx); }}
                                  title="Niet meer tonen"
                                  aria-label="Niet meer tonen"
                                  style={{
                                    border: 'none', background: 'transparent',
                                    color: COLORS.inkLight, display: 'flex',
                                    alignItems: 'center', padding: 2, cursor: 'pointer',
                                  }}
                                ><EyeOff size={13} /></button>
                                <a
                                  href={`https://www.google.com/maps/search/?api=1&query=${r.coords[0]},${r.coords[1]}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  title="Open in Google Maps"
                                  aria-label="Open in Google Maps"
                                  style={{
                                    color: cat.color, display: 'flex',
                                    alignItems: 'center', padding: 2,
                                  }}
                                ><MapPin size={14} /></a>
                                {r.website && (
                                  <a
                                    href={r.website}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={(e) => e.stopPropagation()}
                                    title="Website"
                                    aria-label="Website"
                                    style={{
                                      color: cat.color, display: 'flex',
                                      alignItems: 'center', padding: 2,
                                    }}
                                  ><ExternalLink size={13} /></a>
                                )}
                              </span>
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}

                {!choosingDay ? (
                  <button
                    onClick={() => setChoosingDay(true)}
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
                ) : (
                  <div style={{
                    marginTop: 4, padding: 14, borderRadius: 12,
                    background: COLORS.creamSoft,
                  }}>
                    <div style={{
                      fontFamily: "'Fraunces', serif", fontSize: 15,
                      color: COLORS.forest, marginBottom: 4,
                    }}>
                      Meteen inplannen?
                    </div>
                    <div style={{ fontSize: 12, color: COLORS.inkLight, marginBottom: 10 }}>
                      Kies een dag voor {selected.size === 1 ? 'deze activiteit' : `alle ${selected.size} activiteiten`}, of voeg ze alleen toe aan de lijst.
                      {selectionCenter && (
                        <> Dagen met al ingeplande activiteiten <strong style={{ color: COLORS.forest }}>in de buurt</strong> staan bovenaan.</>
                      )}
                    </div>
                    <div style={{
                      maxHeight: 280, overflowY: 'auto',
                      display: 'flex', flexDirection: 'column', gap: 6,
                      marginBottom: 10,
                    }}>
                      {sortedDays.map(d => {
                        const info = dayInsights[d.key] || { total: 0, near: [] };
                        const hasNear = info.near.length > 0;
                        return (
                          <button
                            key={d.key}
                            onClick={() => confirmAdd(d.key)}
                            style={{
                              display: 'flex', flexDirection: 'column', gap: 4,
                              padding: '10px 12px', width: '100%', textAlign: 'left',
                              background: hasNear ? `${COLORS.forest}0F` : COLORS.cream,
                              border: `1px solid ${hasNear ? COLORS.forest : COLORS.hairline}`,
                              borderLeft: `4px solid ${d.stay?.color || COLORS.forest}`,
                              borderRadius: 10, cursor: 'pointer',
                              fontFamily: "'DM Sans', sans-serif",
                            }}
                          >
                            <span style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%' }}>
                              <span style={{ fontSize: 13, fontWeight: 600, color: COLORS.charcoal }}>
                                {d.dayShort} {d.date}
                              </span>
                              <span style={{ fontSize: 11, color: COLORS.inkLight }}>
                                {d.label ? `${d.label} · ` : ''}{d.stay?.name}
                              </span>
                              <span style={{ marginLeft: 'auto', fontSize: 11, color: COLORS.inkLight }}>
                                {info.total > 0 ? `${info.total} gepland` : ''}
                              </span>
                            </span>
                            {hasNear && (
                              <span style={{
                                display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 2,
                              }}>
                                {info.near.slice(0, 4).map(({ act, km }) => {
                                  const c = CATEGORIES[act.category] || CATEGORIES.custom;
                                  return (
                                    <span
                                      key={act.id}
                                      style={{
                                        fontSize: 10.5, padding: '2px 7px', borderRadius: 99,
                                        background: `${c.color}1F`, color: c.color, fontWeight: 600,
                                        display: 'inline-flex', alignItems: 'center', gap: 3,
                                        maxWidth: 150, overflow: 'hidden',
                                      }}
                                      title={`${act.name} — ${km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`}`}
                                    >
                                      <span>{act.emoji}</span>
                                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {act.name}
                                      </span>
                                      <span style={{ opacity: 0.7 }}>
                                        {km < 1 ? `${Math.round(km * 1000)} m` : `${Math.round(km)} km`}
                                      </span>
                                    </span>
                                  );
                                })}
                                {info.near.length > 4 && (
                                  <span style={{ fontSize: 10.5, color: COLORS.inkLight, alignSelf: 'center' }}>
                                    +{info.near.length - 4} meer in de buurt
                                  </span>
                                )}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        onClick={() => confirmAdd(null)}
                        style={{
                          flex: 1, padding: 11,
                          background: 'transparent', color: COLORS.forest,
                          border: `1px solid ${COLORS.forest}`, borderRadius: 10,
                          fontSize: 13, fontWeight: 600, fontFamily: "'DM Sans', sans-serif",
                          cursor: 'pointer',
                        }}
                      >Zonder dag toevoegen</button>
                      <button
                        onClick={() => setChoosingDay(false)}
                        style={{
                          padding: '11px 16px',
                          background: 'transparent', color: COLORS.inkLight,
                          border: 'none', borderRadius: 10,
                          fontSize: 13, fontFamily: "'DM Sans', sans-serif",
                          cursor: 'pointer', textDecoration: 'underline',
                        }}
                      >Terug</button>
                    </div>
                  </div>
                )}
              </>
            )}

            {(exclusions?.length ?? 0) > 0 && (
              <div style={{
                marginTop: 14, fontSize: 12, color: COLORS.inkLight,
                display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center',
              }}>
                <EyeOff size={13} />
                {exclusions.length} {exclusions.length === 1 ? 'suggestie' : 'suggesties'} verborgen
                <button
                  onClick={onClearExclusions}
                  style={{
                    border: 'none', background: 'transparent', cursor: 'pointer',
                    fontFamily: "'DM Sans', sans-serif", fontSize: 12,
                    color: COLORS.forest, textDecoration: 'underline', padding: 0,
                  }}
                >alles opnieuw tonen</button>
              </div>
            )}
          </>
        )}
      </div>

      {whatsHerePoint && (
        <WhatsHereSheet
          point={whatsHerePoint}
          onCreate={(act) => { onCreateAt(act); setWhatsHerePoint(null); }}
          onClose={() => setWhatsHerePoint(null)}
        />
      )}
    </Sheet>
  );
};

export default SuggestionsSheet;
