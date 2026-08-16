'use client';

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { upload } from '@vercel/blob/client';
import {
  ArrowLeft, Plus, Trash2, Star, MapPin, Camera, Loader2, X, ChevronDown,
  SlidersHorizontal, RefreshCw, Maximize2, Minimize2, Calendar as CalendarIcon,
  Globe, Check, Footprints, Pencil,
} from 'lucide-react';
import {
  COLORS, formatDateRange, DEFAULT_ACTIVITIES, applyLocationOverride, CATEGORIES,
} from '@/lib/data';
import { bezoekPerVerblijf, voegBezoekToe, handmatigBezoek } from '@/lib/bezoek';
import { getPin } from '@/lib/maps';
import { plekUitParams } from '@/lib/deelPlek';
import LocationPicker from '@/components/LocationPicker';
import ConflictMelding from '@/components/ConflictMelding';
import {
  uid, fetchStayLog, saveStayLog, archiveTripStays,
  reverseCountry, countryFromAddress, groepeerReizen, jarenVanVerblijf, hernoemReis,
} from '@/lib/stayLog';
import {
  STAY_TYPES, stayTypeLabel, countryFlag,
} from '@/lib/stayTypes';

const getName = () => {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem('planner-name') || '';
};

// Kleur van de speld op de kaart en van de cijferbadge
const scoreColor = (score) => {
  if (score == null) return COLORS.slate;
  if (score >= 8) return COLORS.moss;
  if (score >= 6) return COLORS.wood;
  return COLORS.wine;
};

// In welke jaren viel dit verblijf? Meestal één, bij een oudejaarsvakantie
// twee. De jaar-bepaling zelf staat in lib/stayLog.js, want het reisverslag
// rekent met precies dezelfde regel.
const jarenVan = jarenVanVerblijf;

// ── Kaart met alle verblijven ───────────────────────────────────────
// Zelfde patroon als DayOverview: Leaflet browser-only via dynamic import,
// CSS als <link data-leaflet>, kaart opruimen in de cleanup.

// Kaart passend maken op alle markers. maxZoom 13 (niet 11) zodat verblijven
// die dicht bij elkaar liggen ver genoeg uit elkaar getrokken worden om ze nog
// los te kunnen aanklikken.
function fit(map, L, pts) {
  if (pts.length === 1) map.setView(pts[0], 11);
  else if (pts.length > 1) map.fitBounds(L.latLngBounds(pts), { padding: [36, 36], maxZoom: 13 });
}

// Binnen hoeveel schermpixels twee verblijven als één bolletje worden getoond.
// Iets meer dan de breedte van een speld, zodat ze samenvallen zodra ze elkaar
// visueel zouden overlappen.
const CLUSTER_PX = 46;

// Verder inzoomen dan dit heeft geen zin; dan liggen de verblijven echt op
// dezelfde plek en toont een klik een keuzelijst in plaats van nog een zoom.
const MAX_CLUSTER_ZOOM = 17;

// ── Losse speld ─────────────────────────────────────────────────────
// Compact gehouden: op deze kaart staan alle verblijven van alle vakanties
// tegelijk, niet één dag zoals op /kaart. Het gekozen verblijf wordt groter
// getekend en komt bovenop te liggen.
function losseMarker(L, map, s, selectedId, onSelect) {
  const color = scoreColor(s.score);
  const active = s.id === selectedId;
  const label = s.score != null ? String(s.score).replace('.', ',') : '·';

  const icon = L.divIcon({
    className: '',
    html: `
      <div style="position: relative; width: 24px; height: 30px;
                  filter: drop-shadow(0 1px 2px rgba(0,0,0,${active ? 0.45 : 0.3}));
                  transform: scale(${active ? 1.35 : 1}); transform-origin: bottom center;">
        <svg viewBox="0 0 32 40" width="24" height="30" xmlns="http://www.w3.org/2000/svg">
          <path d="M16 0 C7 0 0 7 0 16 C0 25 16 40 16 40 C16 40 32 25 32 16 C32 7 25 0 16 0 Z"
                fill="${color}" stroke="${active ? COLORS.charcoal : '#FAF3E1'}" stroke-width="2"/>
          <circle cx="16" cy="15" r="7" fill="#FAF3E1"/>
        </svg>
        <div style="position: absolute; top: 4px; left: 0; right: 0; text-align: center;
                    font-family: 'DM Sans', sans-serif; font-size: ${label.length > 2 ? 7 : 9}px;
                    font-weight: 700; color: ${color}; line-height: 13px;">${label}</div>
      </div>`,
    iconSize: [24, 30],
    iconAnchor: [12, 30],
    popupAnchor: [0, -27],
  });

  const marker = L.marker(s.coords, { icon, zIndexOffset: active ? 1000 : 0 }).addTo(map);
  const period = formatDateRange(s.startDate, s.endDate) || s.periodLabel || '';
  marker.bindPopup(
    `<strong>${escapeHtml(s.name)}</strong>` +
    (period ? `<br><span style="color:#5A6B8C">${escapeHtml(period)}</span>` : '') +
    (s.score != null ? `<br>Cijfer: ${String(s.score).replace('.', ',')}` : '')
  );
  marker.on('click', () => onSelect(s.id));
  return marker;
}

// ── Samengevoegde markers ───────────────────────────────────────────
// Bolletje met het aantal erin, in de kleur van het gemiddelde cijfer.
// Klikken zoomt in op het gebied; liggen de verblijven op precies dezelfde
// plek, dan helpt zoomen niet en toont hij een keuzelijst.
function groepMarker(L, map, groep, onSelect) {
  const scores = groep.filter(s => s.score != null).map(s => s.score);
  const gemiddelde = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
  const color = scoreColor(gemiddelde);
  const maat = groep.length > 9 ? 38 : groep.length > 4 ? 34 : 30;

  const icon = L.divIcon({
    className: '',
    html: `
      <div style="width: ${maat}px; height: ${maat}px; border-radius: 50%;
                  background: ${color}; border: 2px solid #FAF3E1;
                  box-shadow: 0 1px 4px rgba(0,0,0,0.35);
                  display: flex; align-items: center; justify-content: center;
                  font-family: 'DM Sans', sans-serif; font-weight: 700;
                  font-size: ${maat > 34 ? 14 : 13}px; color: #FAF3E1;">${groep.length}</div>`,
    iconSize: [maat, maat],
    iconAnchor: [maat / 2, maat / 2],
  });

  const marker = L.marker(groep[0].coords, { icon }).addTo(map);

  marker.on('click', () => {
    const bounds = L.latLngBounds(groep.map(s => s.coords));
    const zelfdePlek = bounds.getNorthEast().equals(bounds.getSouthWest());

    // Zit je al zo diep dat verder zoomen ze niet uit elkaar trekt, of staan
    // ze op precies dezelfde plek? Dan een lijstje om uit te kiezen.
    if (zelfdePlek || map.getZoom() >= MAX_CLUSTER_ZOOM) {
      const rijen = groep.map(s => {
        const period = formatDateRange(s.startDate, s.endDate) || s.periodLabel || '';
        const cijfer = s.score != null ? String(s.score).replace('.', ',') : '–';
        return `<button data-stay-id="${escapeHtml(s.id)}" style="
            display: flex; align-items: center; gap: 8px; width: 100%;
            padding: 7px 6px; margin: 0; cursor: pointer; text-align: left;
            background: transparent; border: none;
            border-bottom: 1px solid rgba(31,41,34,0.10);
            font-family: 'DM Sans', sans-serif; font-size: 13px;">
            <span style="flex-shrink: 0; width: 22px; height: 22px; border-radius: 6px;
                         background: ${scoreColor(s.score)}; color: #FAF3E1;
                         display: flex; align-items: center; justify-content: center;
                         font-weight: 700; font-size: 11px;">${cijfer}</span>
            <span>
              <span style="font-weight: 600; color: #2D4F3E;">${escapeHtml(s.name)}</span>
              ${period ? `<br><span style="color:#5A6B8C; font-size: 11px;">${escapeHtml(period)}</span>` : ''}
            </span>
          </button>`;
      }).join('');

      const popup = L.popup({ minWidth: 210, maxHeight: 260 })
        .setLatLng(groep[0].coords)
        .setContent(
          `<div style="font-family:'DM Sans',sans-serif;">
             <div style="font-size:11px; text-transform:uppercase; letter-spacing:0.5px;
                         color:#5A6B8C; font-weight:600; margin-bottom:4px;">
               ${groep.length} verblijven op deze plek
             </div>${rijen}</div>`
        )
        .openOn(map);

      // Knoppen aanhangen zodra de popup in de DOM staat
      setTimeout(() => {
        popup.getElement()?.querySelectorAll('[data-stay-id]').forEach((knop) => {
          knop.addEventListener('click', () => {
            onSelect(knop.getAttribute('data-stay-id'));
            map.closePopup();
          });
        });
      }, 0);
      return;
    }

    map.fitBounds(bounds, { padding: [60, 60], maxZoom: MAX_CLUSTER_ZOOM });
  });

  return marker;
}

const StayMap = ({ stays, reizen, selectedId, onSelect }) => {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const leafletRef = useRef(null);
  const markersRef = useRef([]);
  const ptsRef = useRef([]);
  const drawRef = useRef(null);
  const fitKeyRef = useRef('');
  const [ready, setReady] = useState(false);
  const [full, setFull] = useState(false);

  // Bij het wisselen van formaat moet Leaflet opnieuw meten, en daarna
  // opnieuw passend maken — het venster heeft een andere verhouding.
  useEffect(() => {
    const t = setTimeout(() => {
      const map = mapRef.current;
      const L = leafletRef.current;
      if (!map) return;
      map.invalidateSize();
      if (L) fit(map, L, ptsRef.current);
    }, 80);
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
          center: [48.8, 6.5],
          zoom: 4,
          scrollWheelZoom: false,
        });
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '© OpenStreetMap contributors',
          maxZoom: 19,
        }).addTo(map);
        mapRef.current = map;
        setReady(true);
        setTimeout(() => map.invalidateSize(), 150);
      }
    })();
    return () => {
      mounted = false;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  // Markers tekenen. Verblijven die op het huidige zoomniveau binnen
  // CLUSTER_PX van elkaar vallen worden samengevoegd tot één bolletje met het
  // aantal erin; klikken zoomt in op dat groepje. Wordt opnieuw uitgevoerd bij
  // elke zoomwijziging, want wat samenvalt hangt van het zoomniveau af.
  useEffect(() => {
    const map = mapRef.current;
    const L = leafletRef.current;
    if (!map || !L || !ready) return;

    const withCoords = stays.filter(s => Array.isArray(s.coords));

    const draw = () => {
      markersRef.current.forEach(m => m.remove());
      markersRef.current = [];

      // Reisroutes eerst, zodat de markers er bovenop komen te liggen. Rechte
      // lijnen tussen de verblijven in datumvolgorde — dit is een overzicht van
      // waar je bent geweest, geen navigatie.
      (reizen || []).forEach((reis) => {
        const punten = reis.stays
          .filter(s => Array.isArray(s.coords))
          .map(s => s.coords);
        if (punten.length < 2) return;
        const lijn = L.polyline(punten, {
          color: reis.kleur,
          weight: 3,
          opacity: 0.7,
          dashArray: '6,7',
          lineCap: 'round',
        }).addTo(map);
        lijn.bindPopup(
          `<strong>${escapeHtml(reis.naam)}</strong>` +
          (reis.periode ? `<br><span style="color:#5A6B8C">${escapeHtml(reis.periode)}</span>` : '') +
          `<br>${reis.stays.length} verblijven`
        );
        markersRef.current.push(lijn);
      });

      // Posities in schermpixels; alleen zo weet je wat visueel overlapt.
      const punten = withCoords.map(s => ({ s, p: map.latLngToContainerPoint(s.coords) }));

      // Simpele greedy-groepering: loop de punten langs en trek alles wat
      // binnen CLUSTER_PX ligt in dezelfde groep. Voor een gezinslogboek
      // (tientallen verblijven) ruim snel genoeg.
      const gebruikt = new Set();
      const groepen = [];
      punten.forEach((a, i) => {
        if (gebruikt.has(i)) return;
        gebruikt.add(i);
        const groep = [a];
        punten.forEach((b, j) => {
          if (gebruikt.has(j)) return;
          if (a.p.distanceTo(b.p) <= CLUSTER_PX) { gebruikt.add(j); groep.push(b); }
        });
        groepen.push(groep);
      });

      groepen.forEach((groep) => {
        if (groep.length === 1) {
          markersRef.current.push(losseMarker(L, map, groep[0].s, selectedId, onSelect));
        } else {
          markersRef.current.push(groepMarker(L, map, groep.map(g => g.s), onSelect));
        }
      });
    };

    drawRef.current = draw;
    draw();

    // Alleen opnieuw passend maken als de vérzameling punten wijzigt — niet
    // bij het aanklikken van een verblijf, anders verlies je je eigen zoom
    // zodra je een marker aantikt.
    const key = withCoords.map(s => `${s.coords[0]},${s.coords[1]}`).sort().join('|');
    ptsRef.current = withCoords.map(s => s.coords);
    if (key !== fitKeyRef.current) {
      fitKeyRef.current = key;
      fit(map, L, ptsRef.current);
    }
  }, [stays, reizen, selectedId, ready, onSelect]);

  // Bij in- of uitzoomen valt de groepering anders uit
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const opnieuw = () => drawRef.current?.();
    map.on('zoomend', opnieuw);
    return () => { map.off('zoomend', opnieuw); };
  }, [ready]);

  return (
    <div style={full ? {
      position: 'fixed', inset: 0, zIndex: 70, background: COLORS.cream,
      padding: 10, display: 'flex', flexDirection: 'column',
    } : { position: 'relative', marginBottom: 4 }}>
      <div
        ref={containerRef}
        style={{
          width: '100%', height: full ? '100%' : 300, flex: full ? 1 : undefined,
          borderRadius: full ? 12 : 14, overflow: 'hidden',
          border: `1px solid ${COLORS.hairline}`, background: COLORS.creamSoft,
          zIndex: 0, position: 'relative',
        }}
      />
      <button
        onClick={() => setFull(f => !f)}
        title={full ? 'Verkleinen' : 'Volledig scherm'}
        aria-label={full ? 'Verkleinen' : 'Volledig scherm'}
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

function escapeHtml(s) {
  return String(s ?? '').replace(/[<>&"']/g, c => (
    { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

// ── Foto's verkleinen vóór het uploaden ─────────────────────────────
// Telefoonfoto's zijn 4-8 MB; dat hoeft niet voor een overzichtspagina.
// imageOrientation: 'from-image' zorgt dat staande foto's rechtop blijven.

async function downscale(file, maxSide = 1600, quality = 0.82) {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();

  const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', quality));
  if (!blob) throw new Error('verkleinen mislukt');
  return { blob, w, h };
}

// ── Hoofdcomponent ──────────────────────────────────────────────────

export default function StayLog() {
  const [stays, setStays] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [updatedBy, setUpdatedBy] = useState(null);

  const [selectedId, setSelectedId] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [adding, setAdding] = useState(false);
  // Voorgevulde plek uit de deelknop (/toevoegen → "Als verblijf").
  const [gedeeldePlek, setGedeeldePlek] = useState(null);
  const [importing, setImporting] = useState(false);
  const [uploadingFor, setUploadingFor] = useState(null);
  // Voortgang van het achteraf bepalen van landen: { done, total } | null
  const [countryProgress, setCountryProgress] = useState(null);
  const [conflict, setConflict] = useState(null);

  // Filters
  const [fCountry, setFCountry] = useState(null); // landcode, '' = onbekend
  const [fType, setFType] = useState('');
  const [fYear, setFYear] = useState('');         // '' = alle, '?' = onbekend
  const [fTrip, setFTrip] = useState('');
  const [fMinScore, setFMinScore] = useState(0);

  const saveTimer = useRef(null);
  const latest = useRef([]);
  // updatedAt van het document zoals wij het kennen; hierop controleert de
  // server of iemand anders er intussen tussendoor is gekomen.
  const versie = useRef(null);
  // Zolang er lokaal iets niet is opgeslagen mag de focus-refresh niet
  // overschrijven met oudere serverdata (zelfde vangnet als de inpaklijst).
  const dirty = useRef(false);
  const cardRefs = useRef({});
  const formRef = useRef(null);

  useEffect(() => { setName(getName()); }, []);

  // Kom je binnen vanaf de deelknop (/toevoegen → "Als verblijf"), dan staat de
  // plek in de URL. Formulier openen, voorvullen, en de URL daarna wissen:
  // zonder dat wissen opent een verversing — of de focus-refresh, die deze
  // pagina bij elke terugkeer doet — het formulier telkens opnieuw voorgevuld,
  // en typ je je verblijf twee keer in.
  const params = useSearchParams();
  const router = useRouter();
  const deelGedaan = useRef(false);
  useEffect(() => {
    if (deelGedaan.current) return;
    const plek = plekUitParams(params);
    if (!plek) return;
    deelGedaan.current = true;
    setGedeeldePlek(plek);
    setAdding(true);
    router.replace('/verblijven', { scroll: false });
  }, [params, router]);

  // Pas scrollen als het formulier er echt staat.
  useEffect(() => {
    if (!adding || !gedeeldePlek || !formRef.current) return;
    formRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [adding, gedeeldePlek]);

  const load = useCallback(async () => {
    if (dirty.current) return;
    try {
      const data = await fetchStayLog();
      setStays(data.stays || []);
      setUpdatedBy(data.updatedBy ?? null);
      versie.current = data.updatedAt ?? null;
      latest.current = data.stays || [];
      setError('');
    } catch (e) {
      setError(e.message === 'unauthorized'
        ? 'Geen toegang — open eerst de planner en vul de familie-PIN in.'
        : 'Kon het logboek niet laden.');
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

  // Verblijven die wél coördinaten maar nog geen land hebben (uit een reis
  // gearchiveerd, of van vóór deze functie) krijgen het land alsnog. Nominatim
  // staat één verzoek per seconde toe, dus dit gaat op de achtergrond en
  // netjes op een rij — nooit met Promise.all.
  const backfillDone = useRef(false);
  useEffect(() => {
    if (loading || backfillDone.current) return;
    const todo = stays.filter(s => Array.isArray(s.coords) && !s.country);
    if (todo.length === 0) { backfillDone.current = true; return; }

    backfillDone.current = true;
    let cancelled = false;

    (async () => {
      const gevonden = new Map();
      for (let i = 0; i < todo.length; i++) {
        if (cancelled) return;
        setCountryProgress({ done: i, total: todo.length });
        const res = await reverseCountry(todo[i].coords);
        if (res) gevonden.set(todo[i].id, res);
        if (i < todo.length - 1) await new Promise(r => setTimeout(r, 1100));
      }
      if (cancelled) return;
      setCountryProgress(null);
      if (gevonden.size === 0) return;
      // Eén keer opslaan aan het eind, op basis van de nieuwste staat
      mutate(list => list.map(s => gevonden.has(s.id)
        ? { ...s, ...gevonden.get(s.id) }
        : s));
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, stays.length]);

  // negeerVersie = "toch de mijne opslaan": schrijft zonder te controleren of
  // er intussen iets nieuwers staat.
  const persist = useCallback((next, negeerVersie = false) => {
    latest.current = next;
    dirty.current = true;
    clearTimeout(saveTimer.current);
    setSaving(true);
    saveTimer.current = setTimeout(async () => {
      try {
        const data = await saveStayLog(
          latest.current,
          getName(),
          negeerVersie ? undefined : versie.current,
        );
        setUpdatedBy(data.updatedBy ?? null);
        versie.current = data.updatedAt ?? null;
        dirty.current = false;
        setConflict(null);
      } catch (e) {
        if (e?.conflict) {
          // Niet stilzwijgend overschrijven: de gebruiker kiest zelf
          setConflict(e.conflict);
        }
        // Andere fouten: de volgende wijziging probeert het opnieuw
      } finally {
        setSaving(false);
      }
    }, 600);
  }, []);

  // Muteren gaat ALTIJD via latest.current, nooit via de `stays` uit de
  // closure. Anders draait een async callback — het land dat een seconde later
  // binnenkomt — de lijst terug naar hoe die was toen de callback werd
  // aangemaakt, en verdwijnt alles wat er intussen bij kwam.
  const mutate = (fn) => {
    const next = fn(latest.current);
    setStays(next);
    persist(next);
  };

  const updateStay = (id, patch) => {
    mutate(list => list.map(s => s.id === id
      ? { ...s, ...patch, updatedAt: new Date().toISOString() }
      : s));
  };

  // Locatie wijzigen betekent: land opnieuw bepalen. Komt het land al mee uit
  // het zoekresultaat, dan is dat gratis; anders vragen we het na via reverse
  // geocoding en werken we het verblijf zo nodig een tweede keer bij.
  // Haalt uit de lopende planning op wat je rond dit verblijf hebt aangevinkt
  // als bezocht, en zet dat als momentopname op het verblijf. Bestaande regels
  // blijven staan — daar kan de gebruiker iets aan hebben aangepast.
  const haalBezoekOp = async (stay) => {
    try {
      const res = await fetch('/api/plan', {
        headers: { 'X-Family-Pin': getPin() }, cache: 'no-store',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      const perId = {};
      for (const a of DEFAULT_ACTIVITIES) perId[a.id] = applyLocationOverride(a, data.locationOverrides || {});
      for (const a of data.customActivities || []) perId[a.id] = a;

      // Het verblijf uit het logboek heeft eigen datums; die zijn leidend.
      const gevonden = bezoekPerVerblijf(data.plan || {}, perId, [stay])[stay.id] || [];
      if (gevonden.length === 0) {
        setError('Niets gevonden — vink activiteiten in de planner eerst aan als bezocht.');
        setTimeout(() => setError(''), 4000);
        return;
      }
      updateStay(stay.id, { bezocht: voegBezoekToe(stay.bezocht, gevonden) });
    } catch {
      setError('Kon de planning niet ophalen.');
      setTimeout(() => setError(''), 4000);
    }
  };

  // ── Het logboek houdt zichzelf bij ────────────────────────────────
  //
  // De momentopname op een verblijf moet niet afhangen van iemand die eraan
  // denkt op "Bijwerken uit de planning" te drukken: wie dat vergeet en daarna
  // een nieuwe vakantie start, is zijn vinkjes kwijt. Zolang de planning er nog
  // staat vullen we bij het openen van deze pagina dus aan wat er ontbreekt.
  //
  // Vier regels, en ze zijn geen van alle vrijblijvend:
  //
  //  1. Eén keer per keer laden. De focus-refresh vuurt op deze pagina bij elke
  //     terugkeer; opnieuw ophalen zou een verzoek per tabwissel betekenen.
  //  2. Nooit terwijl `dirty` waar is — dat is het vangnet uit valkuil 4, en
  //     een automatische aanvulling mag daar niet dwars doorheen schrijven.
  //  3. Alleen opslaan als er echt iets bijkomt. Anders krijgt elk bezoek aan
  //     deze pagina een nieuwe updatedAt en botst het gezin met zichzelf.
  //  4. Stil falen. Geen planning te bereiken (offline, 401, nieuwe vakantie
  //     al gestart) betekent: niets doen. Het is een aanvulling, geen taak.
  const bijwerkenGedaan = useRef(false);
  useEffect(() => {
    if (loading || bijwerkenGedaan.current) return;
    if (!stays.length) return;
    bijwerkenGedaan.current = true;

    (async () => {
      if (dirty.current) return;
      let data;
      try {
        const res = await fetch('/api/plan', {
          headers: { 'X-Family-Pin': getPin() }, cache: 'no-store',
        });
        if (!res.ok) return;
        data = await res.json();
      } catch {
        return;
      }
      if (dirty.current) return;
      if (!data?.plan || !Object.keys(data.plan).length) return;

      const perId = {};
      for (const a of DEFAULT_ACTIVITIES) perId[a.id] = applyLocationOverride(a, data.locationOverrides || {});
      for (const a of data.customActivities || []) perId[a.id] = a;

      // bezoekPerVerblijf koppelt op datum, dus een verblijf uit 2019 krijgt
      // vanzelf niets uit een planning van 2026.
      const huidig = latest.current;
      const perVerblijf = bezoekPerVerblijf(data.plan, perId, huidig);
      let veranderd = false;
      const volgende = huidig.map((s) => {
        const gevonden = perVerblijf[s.id] || [];
        if (!gevonden.length) return s;
        const samen = voegBezoekToe(s.bezocht, gevonden);
        if (samen.length === (s.bezocht || []).length) return s;
        veranderd = true;
        return { ...s, bezocht: samen, updatedAt: new Date().toISOString() };
      });
      if (veranderd) mutate(() => volgende);
    })();
  }, [loading, stays.length]);

  // Een bezoek dat niet uit de planning komt. Loopt langs dezelfde weg als de
  // rest — voegBezoekToe zorgt voor de sortering, updateStay voor het opslaan,
  // dus debounce, versiecontrole en de botsingsbalk gelden vanzelf.
  const voegHandmatigBezoekToe = (stay, velden) => {
    updateStay(stay.id, {
      bezocht: voegBezoekToe(stay.bezocht, [handmatigBezoek(velden)]),
    });
  };

  const setLocation = (id, loc) => {
    const direct = countryFromAddress(loc?.address);
    updateStay(id, {
      coords: loc?.coords || null,
      locationLabel: loc?.fullName || loc?.label || null,
      country: direct?.country || null,
      countryCode: direct?.countryCode || null,
    });
    if (!loc?.coords || direct) return;
    reverseCountry(loc.coords).then((res) => {
      if (res) updateStay(id, res);
    });
  };

  const bepaalLand = async (stay) => {
    if (!stay.coords) return;
    setCountryProgress({ done: 0, total: 1 });
    const res = await reverseCountry(stay.coords);
    setCountryProgress(null);
    if (res) updateStay(stay.id, res);
    else window.alert('Kon het land niet bepalen. Probeer het zo nog eens — OpenStreetMap is soms even niet bereikbaar.');
  };

  const addStay = (data) => {
    const now = new Date().toISOString();
    const direct = countryFromAddress(data.address);
    const stay = {
      id: `v_${uid()}`,
      name: data.name,
      locationLabel: data.locationLabel,
      coords: data.coords,
      type: data.type || null,
      typeOther: data.type === 'anders' ? (data.typeOther || null) : null,
      country: direct?.country || null,
      countryCode: direct?.countryCode || null,
      startDate: data.startDate || null,
      endDate: data.endDate || null,
      periodLabel: data.periodLabel || null,
      tripTitle: null,
      website: data.website || null,
      score: data.score ?? null,
      review: data.review || null,
      photos: [],
      source: 'manual',
      createdAt: now,
      updatedAt: now,
    };
    mutate(list => [...list, stay]);
    setAdding(false);
    setGedeeldePlek(null);
    setExpandedId(stay.id);
    setSelectedId(stay.id);
    // Geen land uit het zoekresultaat? Dan alsnog achteraf bepalen.
    if (stay.coords && !stay.country) {
      reverseCountry(stay.coords).then((res) => {
        if (res) updateStay(stay.id, res);
      });
    }
  };

  const removeStay = async (stay) => {
    const fotoTekst = stay.photos?.length
      ? `\n\nOok de ${stay.photos.length} foto${stay.photos.length === 1 ? '' : "'s"} worden verwijderd.`
      : '';
    if (!window.confirm(`“${stay.name}” uit het logboek verwijderen?${fotoTekst}\n\nDit kan niet ongedaan worden gemaakt.`)) {
      return;
    }
    mutate(list => list.filter(s => s.id !== stay.id));
    if (stay.photos?.length) {
      // Best effort: mislukt dit, dan is het verblijf wél weg en blijft
      // alleen het bestand in Blob achter.
      try {
        await fetch('/api/verblijven/foto', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json', 'X-Family-Pin': getPin() },
          body: JSON.stringify({ urls: stay.photos.map(p => p.url) }),
        });
      } catch { /* stil */ }
    }
  };

  // ── Foto's ────────────────────────────────────────────────────────

  const addPhotos = async (stayId, files) => {
    if (!files || files.length === 0) return;
    setUploadingFor(stayId);
    const nieuwe = [];
    try {
      for (const file of Array.from(files).slice(0, 10)) {
        if (!file.type.startsWith('image/')) continue;
        const { blob, w, h } = await downscale(file);
        const safeName = (file.name || 'foto').replace(/[^\w.-]+/g, '-').slice(-60);
        const result = await upload(`verblijven/${stayId}/${safeName}.jpg`, blob, {
          access: 'public',
          handleUploadUrl: '/api/verblijven/upload',
          contentType: 'image/jpeg',
          clientPayload: getPin(),
        });
        nieuwe.push({ id: uid(), url: result.url, pathname: result.pathname, w, h, caption: null });
      }
      if (nieuwe.length) {
        mutate(list => list.map(s => s.id === stayId
          ? { ...s, photos: [...(s.photos || []), ...nieuwe], updatedAt: new Date().toISOString() }
          : s));
      }
    } catch (e) {
      const msg = String(e?.message ?? e);
      window.alert(
        msg.includes('501') || msg.toLowerCase().includes('not_configured')
          ? 'Fotoopslag is nog niet ingesteld. Voeg in het Vercel-dashboard onder Storage een Blob-store toe aan dit project.'
          : `Uploaden mislukt: ${msg}`
      );
    } finally {
      setUploadingFor(null);
    }
  };

  const removePhoto = async (stayId, photo) => {
    if (!window.confirm('Deze foto verwijderen?')) return;
    mutate(list => list.map(s => s.id === stayId
      ? { ...s, photos: (s.photos || []).filter(p => p.id !== photo.id) }
      : s));
    try {
      await fetch('/api/verblijven/foto', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', 'X-Family-Pin': getPin() },
        body: JSON.stringify({ url: photo.url }),
      });
    } catch { /* stil */ }
  };

  // ── Huidige reis importeren ───────────────────────────────────────

  const importCurrentTrip = async () => {
    setImporting(true);
    try {
      const res = await fetch('/api/plan', {
        headers: { 'X-Family-Pin': getPin() },
        cache: 'no-store',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const plan = await res.json();
      const result = await archiveTripStays(plan.tripConfig, getName());

      if (result.stays) {
        setStays(result.stays);
        latest.current = result.stays;
      }
      if (result.added === 0 && result.skipped === 0) {
        window.alert('De huidige reis heeft nog geen verblijven. Stel ze eerst in via de planner (Reis instellen).');
      } else if (result.added === 0) {
        window.alert('Deze verblijven staan al in het logboek.');
      } else {
        window.alert(
          `${result.added} ${result.added === 1 ? 'verblijf' : 'verblijven'} toegevoegd.` +
          (result.skipped ? ` ${result.skipped} stond${result.skipped === 1 ? '' : 'en'} er al in.` : '')
        );
      }
    } catch (e) {
      window.alert(`Kon de huidige reis niet ophalen: ${e.message}`);
    } finally {
      setImporting(false);
    }
  };

  // ── Afgeleide waarden ─────────────────────────────────────────────

  // Filteropties worden opgebouwd uit wat er daadwerkelijk in het logboek
  // staat, zodat de balk niet volloopt met landen waar je nooit bent geweest.
  const filterOpties = useMemo(() => {
    const landen = new Map();
    const typen = new Set();
    const jaren = new Set();
    let zonderJaar = false;
    stays.forEach((s) => {
      if (s.country) {
        landen.set(s.countryCode || s.country, { code: s.countryCode, naam: s.country });
      } else if (Array.isArray(s.coords) || s.locationLabel) {
        landen.set('', { code: null, naam: 'Land onbekend' });
      }
      if (s.type) typen.add(s.type);
      const j = jarenVan(s);
      if (j.length) j.forEach(x => jaren.add(x));
      else zonderJaar = true;
    });
    return {
      landen: [...landen.entries()]
        .map(([key, v]) => ({ key, ...v }))
        .sort((a, b) => (a.key === '' ? 1 : b.key === '' ? -1 : a.naam.localeCompare(b.naam))),
      typen: STAY_TYPES.filter(t => typen.has(t.id)),
      jaren: [...jaren].sort((a, b) => b.localeCompare(a)), // nieuwste eerst
      zonderJaar,
    };
  }, [stays]);

  // Verblijven die in de tijd tegen elkaar aan liggen horen bij dezelfde
  // vakantie. Wordt op de hele lijst berekend, niet op de gefilterde: anders
  // zou een filter een reis in stukken hakken.
  const alleReizen = useMemo(() => groepeerReizen(stays), [stays]);

  // Van verblijf-id naar de reis waar het bij hoort
  const reisVanStay = useMemo(() => {
    const m = new Map();
    alleReizen.forEach(r => r.stays.forEach(s => m.set(s.id, r)));
    return m;
  }, [alleReizen]);

  const filterActief = fCountry !== null || fType !== '' || fYear !== ''
    || fTrip !== '' || fMinScore > 0;

  const gefilterd = useMemo(() => {
    return stays.filter((s) => {
      if (fCountry !== null) {
        const key = s.country ? (s.countryCode || s.country) : '';
        if (key !== fCountry) return false;
      }
      if (fType && s.type !== fType) return false;
      if (fYear) {
        const j = jarenVan(s);
        if (fYear === '?' ? j.length > 0 : !j.includes(fYear)) return false;
      }
      if (fTrip && reisVanStay.get(s.id)?.id !== fTrip) return false;
      if (fMinScore > 0 && !(s.score != null && s.score >= fMinScore)) return false;
      return true;
    });
  }, [stays, fCountry, fType, fYear, fTrip, fMinScore, reisVanStay]);

  // Routes tekenen we alleen voor wat er nu te zien is, en alleen als er nog
  // minstens twee verblijven van die reis over zijn.
  const zichtbareReizen = useMemo(() => {
    const zichtbaar = new Set(gefilterd.map(s => s.id));
    return alleReizen
      .filter(r => !r.los)
      .map(r => ({ ...r, stays: r.stays.filter(s => zichtbaar.has(s.id)) }))
      .filter(r => r.stays.length >= 2);
  }, [alleReizen, gefilterd]);

  // Nieuwste bovenaan; verblijven zonder datum onderaan
  const sorted = useMemo(() => {
    return [...gefilterd].sort((a, b) => {
      const da = a.startDate || a.endDate || '';
      const db = b.startDate || b.endDate || '';
      if (da && db) return db.localeCompare(da);
      if (da) return -1;
      if (db) return 1;
      return (a.name || '').localeCompare(b.name || '');
    });
  }, [gefilterd]);

  // De lijst gebundeld per reis. De groepering komt van de héle lijst
  // (valkuil 14 — anders hakt een filter een reis in stukken); de filters
  // bepalen alleen welke verblijven binnen een groep zichtbaar zijn, en een
  // groep waar niets van overblijft valt weg.
  const perReis = useMemo(() => {
    const zichtbaar = new Set(gefilterd.map(s => s.id));
    return alleReizen
      .map(r => ({ ...r, zichtbareStays: r.stays.filter(s => zichtbaar.has(s.id)) }))
      .filter(r => r.zichtbareStays.length > 0)
      .sort((a, b) => {
        // Nieuwste reis bovenaan; reizen zonder datum onderaan.
        const da = a.stays[0]?.startDate || '';
        const db = b.stays[0]?.startDate || '';
        if (da && db) return db.localeCompare(da);
        if (da) return -1;
        if (db) return 1;
        return (a.naam || '').localeCompare(b.naam || '');
      });
  }, [alleReizen, gefilterd]);

  // Reis hernoemen: schrijft tripTitle op alle verblijven van die groep.
  const hernoem = (reisId, titel) => {
    mutate(list => hernoemReis(list, reisId, titel));
  };

  const stats = useMemo(() => {
    const scored = gefilterd.filter(s => s.score != null);
    const avg = scored.length
      ? Math.round((scored.reduce((a, s) => a + s.score, 0) / scored.length) * 10) / 10
      : null;
    return {
      total: gefilterd.length,
      alle: stays.length,
      onMap: gefilterd.filter(s => Array.isArray(s.coords)).length,
      avg,
    };
  }, [gefilterd, stays.length]);

  const wisFilters = () => {
    setFCountry(null); setFType(''); setFYear(''); setFTrip(''); setFMinScore(0);
  };

  const onSelectFromMap = useCallback((id) => {
    setSelectedId(id);
    const el = cardRefs.current[id];
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, []);

  if (loading) {
    return (
      <div style={{ ...S.page, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ color: COLORS.ink, fontSize: 14 }}>Laden…</span>
      </div>
    );
  }

  return (
    <div style={S.page}>
      <div style={S.inner}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <Link href="/" style={S.backLink}>
            <ArrowLeft size={16} /> Planner
          </Link>
          <Link href="/verslag" style={S.verslagLink}>
            Terugblik <ArrowLeft size={14} style={{ transform: 'rotate(180deg)' }} />
          </Link>
        </div>

        <p style={S.kicker}>Vakantie · Logboek</p>
        <h1 style={S.title}>Waar we zijn geweest</h1>
        <p style={S.sub}>
          Alle verblijven van vroeger en nu op één kaart, met een cijfer en een
          korte review. Zo weet je volgend jaar weer welke camping het waard was.
        </p>

        {error && <div style={S.error}>{error}</div>}

        {conflict && (
          <ConflictMelding
            door={conflict.door}
            onLaadHunVersie={() => {
              // Onze wijziging laten vallen en opnieuw ophalen
              dirty.current = false;
              setConflict(null);
              load();
            }}
            onForceer={() => {
              setConflict(null);
              persist(latest.current, true);
            }}
          />
        )}

        {stats.alle > 0 && (
          <div style={S.statsRow}>
            <div>
              <div style={S.statNum}>
                {stats.total}
                {filterActief && <span style={S.statVan}>/{stats.alle}</span>}
              </div>
              <div style={S.statLabel}>Verblijven</div>
            </div>
            <div style={S.statDivider} />
            <div>
              <div style={S.statNum}>
                {stats.avg != null ? String(stats.avg).replace('.', ',') : '—'}
              </div>
              <div style={S.statLabel}>Gemiddeld</div>
            </div>
            <div style={S.statDivider} />
            <div>
              <div style={S.statNum}>{stats.onMap}</div>
              <div style={S.statLabel}>Op de kaart</div>
            </div>
            <div style={{ flex: 1 }} />
            <div style={S.saveState}>
              {countryProgress
                ? `Land bepalen… ${countryProgress.done + 1}/${countryProgress.total}`
                : saving ? 'Opslaan…' : updatedBy ? `Laatst: ${updatedBy}` : ''}
            </div>
          </div>
        )}

        {stats.alle > 1 && (
          <FilterBar
            opties={filterOpties}
            fCountry={fCountry} setFCountry={setFCountry}
            fType={fType} setFType={setFType}
            fYear={fYear} setFYear={setFYear}
            fTrip={fTrip} setFTrip={setFTrip}
            reizen={alleReizen.filter(r => !r.los && r.stays.length > 1)}
            fMinScore={fMinScore} setFMinScore={setFMinScore}
            actief={filterActief}
            onWis={wisFilters}
          />
        )}

        {stats.onMap > 0 && (
          <StayMap
            stays={gefilterd}
            reizen={zichtbareReizen}
            selectedId={selectedId}
            onSelect={onSelectFromMap}
          />
        )}

        <div style={S.actions}>
          <button
            style={S.primaryBtn}
            onClick={() => { setGedeeldePlek(null); setAdding(a => !a); }}
          >
            <Plus size={16} /> Verblijf toevoegen
          </button>
          <button style={S.secondaryBtn} onClick={importCurrentTrip} disabled={importing}>
            {importing ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> : <MapPin size={15} />}
            {importing ? 'Bezig…' : 'Huidige reis toevoegen'}
          </button>
        </div>

        {adding && (
          <div ref={formRef}>
            <StayForm
              // key: kom je twee keer achter elkaar met een gedeelde plek
              // binnen, dan moet het formulier opnieuw beginnen in plaats van
              // zijn oude begin-state te houden.
              key={gedeeldePlek ? `deel-${gedeeldePlek.coords.join(',')}` : 'leeg'}
              initieel={gedeeldePlek}
              onSave={addStay}
              onCancel={() => { setAdding(false); setGedeeldePlek(null); }}
            />
          </div>
        )}

        {sorted.length === 0 && !adding && (
          filterActief ? (
            <div style={S.empty}>
              <div style={S.emptyTitle}>Niets gevonden</div>
              Geen verblijf voldoet aan deze combinatie.{' '}
              <button onClick={wisFilters} style={S.linkBtn}>Wis de filters</button>
            </div>
          ) : (
            <div style={S.empty}>
              <div style={S.emptyTitle}>Nog niets in het logboek</div>
              Voeg de huidige reis toe met de knop hierboven, of zet er met
              “Verblijf toevoegen” een vakantie van vroeger in. Een adres, een
              Google Maps-link of kale coördinaten werken allemaal.
            </div>
          )
        )}

        {/* Gebundeld per reis: de verblijven van één vakantie horen bij elkaar
            te staan, niet verspreid door een platte lijst. */}
        {perReis.map((reis) => (
          <div key={reis.id} style={S.reisGroep}>
            <ReisKop
              reis={reis}
              onHernoem={(titel) => hernoem(reis.id, titel)}
            />
            <div style={{ ...S.list, marginTop: 8 }}>
              {reis.zichtbareStays.map((stay) => (
                <StayCard
                  key={stay.id}
                  stay={stay}
                  selected={stay.id === selectedId}
                  expanded={stay.id === expandedId}
                  uploading={uploadingFor === stay.id}
                  reis={null}
                  cardRef={(el) => { cardRefs.current[stay.id] = el; }}
                  onToggle={() => {
                    setExpandedId(id => id === stay.id ? null : stay.id);
                    setSelectedId(stay.id);
                  }}
                  onUpdate={(patch) => updateStay(stay.id, patch)}
                  onLocation={(loc) => setLocation(stay.id, loc)}
                  onBepaalLand={() => bepaalLand(stay)}
                  onRemove={() => removeStay(stay)}
                  onAddPhotos={(files) => addPhotos(stay.id, files)}
                  onBijwerkenBezoek={() => haalBezoekOp(stay)}
                  onVoegBezoekToe={(velden) => voegHandmatigBezoekToe(stay, velden)}
                  onVerwijderBezoek={(bezoekId) => updateStay(stay.id, {
                    bezocht: (stay.bezocht || []).filter(b => b.id !== bezoekId),
                  })}
                  onRemovePhoto={(photo) => removePhoto(stay.id, photo)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── De kop boven een reis ───────────────────────────────────────────
//
// De naam is afgeleid ("jul 2019") tot je hem zelf zet. Hernoemen schrijft
// `tripTitle` op alle verblijven van de groep — zie hernoemReis() in
// lib/stayLog.js. Leegmaken brengt de afgeleide naam terug.

const ReisKop = ({ reis, onHernoem }) => {
  const [bewerken, setBewerken] = useState(false);
  const [naam, setNaam] = useState(reis.naam);
  const eigenNaam = reis.stays.some(s => s.tripTitle);

  const bewaar = () => {
    setBewerken(false);
    if (naam.trim() !== reis.naam) onHernoem(naam);
  };

  const cijfers = reis.zichtbareStays.filter(s => s.score != null).map(s => s.score);
  const gemiddeld = cijfers.length
    ? Math.round((cijfers.reduce((a, b) => a + b, 0) / cijfers.length) * 10) / 10
    : null;
  const aantal = reis.zichtbareStays.length;

  return (
    <div style={S.reisKop}>
      <span style={{ ...S.reisKleur, background: reis.kleur }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        {bewerken ? (
          <input
            autoFocus
            style={S.reisInput}
            value={naam}
            onChange={(e) => setNaam(e.target.value.slice(0, 80))}
            onBlur={bewaar}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.target.blur();
              if (e.key === 'Escape') { setNaam(reis.naam); setBewerken(false); }
            }}
            placeholder="Bv. Noorwegen 2019"
            aria-label="Naam van deze reis"
          />
        ) : (
          <button
            onClick={() => { setNaam(eigenNaam ? reis.naam : ''); setBewerken(true); }}
            style={S.reisNaamKnop}
            title="Naam van deze reis aanpassen"
          >
            {reis.naam}
            <Pencil size={12} style={{ opacity: 0.5, flexShrink: 0 }} />
          </button>
        )}
        <div style={S.reisMeta}>
          {[
            reis.periode,
            `${aantal} ${aantal === 1 ? 'verblijf' : 'verblijven'}`,
            gemiddeld != null ? `gem. ${String(gemiddeld).replace('.', ',')}` : null,
          ].filter(Boolean).join(' · ')}
        </div>
      </div>
    </div>
  );
};

// ── Formulier voor een nieuw verblijf ───────────────────────────────

// `initieel` vult naam, locatie en website vooruit in. Dat is wat er
// binnenkomt als je een plek vanuit de Google Maps-app deelt en "als verblijf"
// kiest — zie lib/deelPlek.js. Een effect is niet nodig: dit formulier wordt
// pas gemonteerd als `adding` waar is, dus de begin-state is de juiste.
//
// Datums, soort en cijfer laten we bewust leeg. De datums weten we niet, en
// het soort verblijf kunnen we niet raden: OpenStreetMap zegt hooguit
// "caravan_site", terwijl STAY_TYPES tent, caravan, camper en stacaravan
// onderscheidt. Een voorselectie die er soms naast zit is erger dan een lege,
// want die tik je niet weg.
const StayForm = ({ onSave, onCancel, initieel }) => {
  const [name, setName] = useState(initieel?.naam || '');
  const [location, setLocation] = useState(
    initieel?.coords
      ? { label: initieel.naam || initieel.label, coords: initieel.coords, fullName: initieel.label }
      : null,
  );
  const [website, setWebsite] = useState(initieel?.website || '');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [periodLabel, setPeriodLabel] = useState('');
  const [score, setScore] = useState('');
  const [review, setReview] = useState('');
  const [type, setType] = useState('');
  const [typeOther, setTypeOther] = useState('');
  const [err, setErr] = useState('');

  const submit = () => {
    const n = name.trim() || location?.label || '';
    if (!n) {
      setErr('Geef het verblijf een naam, of kies een locatie.');
      return;
    }
    if (startDate && endDate && endDate < startDate) {
      setErr('De einddatum ligt vóór de begindatum.');
      return;
    }
    onSave({
      name: n.slice(0, 90),
      locationLabel: location?.fullName || location?.label || null,
      coords: location?.coords || null,
      address: location?.address || null,
      type: type || null,
      typeOther: typeOther.trim().slice(0, 40) || null,
      startDate: startDate || null,
      endDate: endDate || null,
      periodLabel: periodLabel.trim().slice(0, 60) || null,
      score: score === '' ? null : Number(score),
      review: review.trim().slice(0, 2000) || null,
      website: website.trim().slice(0, 300) || null,
    });
  };

  return (
    <div style={S.formCard}>
      <div style={S.formTitle}>Nieuw verblijf</div>

      <label style={S.label}>Naam</label>
      <input
        style={S.input}
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Bv. Camping Les Deux Lacs"
      />

      <label style={S.label}>Locatie — adres, Google Maps-link of coördinaten</label>
      <LocationPicker
        value={location}
        onChange={setLocation}
        placeholder="Zoek een plek of plak een Maps-link"
      />
      <div style={S.hint}>Het land wordt hier automatisch uit afgeleid.</div>

      {/* Dit veld ontbrak, terwijl het datamodel het heeft en je het ná het
          opslaan wél kunt bewerken. Nu de deelknop er een Maps-link in kan
          zetten, moet je die kunnen zien en aanpassen — stille invoer die je
          later niet meer thuis kunt brengen is erger dan een veld extra. */}
      <label style={S.label}>Website of Maps-link</label>
      <input
        style={S.input}
        value={website}
        onChange={(e) => setWebsite(e.target.value)}
        placeholder="Optioneel — komt als link op de kaart van dit verblijf"
        inputMode="url"
      />

      <label style={S.label}>Soort verblijf</label>
      <TypeSelect
        value={type} onChange={setType}
        other={typeOther} onOther={setTypeOther}
      />

      <label style={S.label}>Wanneer</label>
      <DateRangePicker
        startDate={startDate || null}
        endDate={endDate || null}
        onChange={({ startDate: s, endDate: e }) => { setStartDate(s || ''); setEndDate(e || ''); }}
      />

      <label style={S.label}>Of los uit het hoofd</label>
      <input
        style={S.input}
        value={periodLabel}
        onChange={(e) => setPeriodLabel(e.target.value)}
        placeholder="Bv. “zomer 2003” — als je de datums niet meer weet"
      />

      <label style={S.label}>Cijfer</label>
      <ScorePicker value={score === '' ? null : Number(score)}
                   onChange={(v) => setScore(v == null ? '' : String(v))} />

      <label style={S.label}>Review</label>
      <textarea
        style={{ ...S.input, minHeight: 80, resize: 'vertical' }}
        value={review}
        onChange={(e) => setReview(e.target.value)}
        placeholder="Wat was er goed, wat viel tegen?"
      />

      {err && <div style={S.formErr}>{err}</div>}

      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        <button style={S.primaryBtn} onClick={submit}>Opslaan</button>
        <button style={S.ghostBtn} onClick={onCancel}>Annuleren</button>
      </div>
      <div style={S.formHint}>
        Foto's voeg je toe zodra het verblijf is opgeslagen.
      </div>
    </div>
  );
};

// ── Datumbereik in één kalender ─────────────────────────────────────
// Eerste tik zet de begindatum, tweede de einddatum. Tik je een datum vóór de
// begindatum, dan begint hij daar opnieuw — dat is wat mensen verwachten en
// scheelt een "wissen"-tik. Werkt met 'YYYY-MM-DD'-sleutels en niet met Date-
// objecten, zodat er geen tijdzone tussen kan komen.

const MAANDEN = ['januari', 'februari', 'maart', 'april', 'mei', 'juni',
  'juli', 'augustus', 'september', 'oktober', 'november', 'december'];
const WEEKDAGEN = ['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo'];

// Nieuwste jaar bovenaan: je voert vaker een recente vakantie in dan die van
// 1960. Tot 1960 terug is ruim genoeg voor een familielogboek.
const JAREN = (() => {
  const nu = new Date().getFullYear();
  return Array.from({ length: nu + 2 - 1960 + 1 }, (_, i) => nu + 2 - i);
})();

const toKey = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const parseKey = (k) => {
  const [y, m, d] = k.split('-').map(Number);
  return new Date(y, m - 1, d);
};

const DateRangePicker = ({ startDate, endDate, onChange }) => {
  const [open, setOpen] = useState(false);
  const [maand, setMaand] = useState(() => {
    const basis = startDate ? parseKey(startDate) : new Date();
    return new Date(basis.getFullYear(), basis.getMonth(), 1);
  });

  // Bij openen naar de maand van de begindatum springen — anders sta je bij
  // een oude vakantie alsnog in het huidige jaar te kijken.
  useEffect(() => {
    if (!open || !startDate) return;
    const d = parseKey(startDate);
    setMaand(new Date(d.getFullYear(), d.getMonth(), 1));
  }, [open, startDate]);

  const samenvatting = formatDateRange(startDate, endDate);

  const kies = (key) => {
    // Geen begindatum, of allebei al gezet → opnieuw beginnen
    if (!startDate || (startDate && endDate)) {
      onChange({ startDate: key, endDate: null });
      return;
    }
    if (key < startDate) {
      onChange({ startDate: key, endDate: null });
      return;
    }
    onChange({ startDate, endDate: key });
    setOpen(false);
  };

  // Rooster opbouwen: lege cellen tot de eerste dag, dan de dagen zelf.
  const jaar = maand.getFullYear();
  const mnd = maand.getMonth();
  const eersteDag = new Date(jaar, mnd, 1);
  const offset = (eersteDag.getDay() + 6) % 7; // maandag = 0
  const aantalDagen = new Date(jaar, mnd + 1, 0).getDate();
  const cellen = [
    ...Array(offset).fill(null),
    ...Array.from({ length: aantalDagen }, (_, i) => toKey(new Date(jaar, mnd, i + 1))),
  ];

  const vandaag = toKey(new Date());

  return (
    <div>
      <button type="button" onClick={() => setOpen(o => !o)} style={S.dateSummary}>
        <CalendarIcon size={15} style={{ color: COLORS.lake, flexShrink: 0 }} />
        <span style={{ flex: 1, textAlign: 'left' }}>
          {samenvatting || 'Kies de periode'}
          {startDate && !endDate && (
            <span style={{ color: COLORS.sunset, fontWeight: 600 }}> · kies de einddatum</span>
          )}
        </span>
        <ChevronDown
          size={16}
          style={{ color: COLORS.inkLight, transform: open ? 'rotate(180deg)' : 'none' }}
        />
      </button>

      {open && (
        <div style={S.kalender}>
          <div style={S.kalenderKop}>
            <button type="button" onClick={() => setMaand(new Date(jaar, mnd - 1, 1))}
                    style={S.kalenderPijl} aria-label="Vorige maand">‹</button>
            {/* Keuzelijsten in plaats van alleen pijlen: een vakantie van 2003
                opzoeken kost anders tweehonderd tikken. */}
            <select
              value={mnd}
              onChange={(e) => setMaand(new Date(jaar, Number(e.target.value), 1))}
              style={S.kalenderKeuze}
              aria-label="Maand"
            >
              {MAANDEN.map((m, i) => <option key={m} value={i}>{m}</option>)}
            </select>
            <select
              value={jaar}
              onChange={(e) => setMaand(new Date(Number(e.target.value), mnd, 1))}
              style={{ ...S.kalenderKeuze, flex: '0 0 auto' }}
              aria-label="Jaar"
            >
              {JAREN.map(j => <option key={j} value={j}>{j}</option>)}
            </select>
            <button type="button" onClick={() => setMaand(new Date(jaar, mnd + 1, 1))}
                    style={S.kalenderPijl} aria-label="Volgende maand">›</button>
          </div>

          <div style={S.kalenderRaster}>
            {WEEKDAGEN.map(d => (
              <div key={d} style={S.kalenderWeekdag}>{d}</div>
            ))}
            {cellen.map((key, i) => {
              if (!key) return <div key={`leeg-${i}`} />;
              const isStart = key === startDate;
              const isEind = key === endDate;
              const isTussen = startDate && endDate && key > startDate && key < endDate;
              const uiteinde = isStart || isEind;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => kies(key)}
                  style={{
                    ...S.kalenderDag,
                    background: uiteinde ? COLORS.forest : isTussen ? 'rgba(45,79,62,0.13)' : 'transparent',
                    color: uiteinde ? COLORS.cream : COLORS.charcoal,
                    fontWeight: uiteinde || isTussen ? 700 : 400,
                    boxShadow: key === vandaag && !uiteinde ? `inset 0 0 0 1px ${COLORS.lake}` : 'none',
                    borderRadius: isStart && isEind ? 9
                      : isStart ? '9px 0 0 9px'
                      : isEind ? '0 9px 9px 0'
                      : isTussen ? 0 : 9,
                  }}
                >{Number(key.slice(8))}</button>
              );
            })}
          </div>

          <div style={S.kalenderVoet}>
            <span style={{ color: COLORS.inkLight }}>
              {!startDate ? 'Tik de eerste dag aan'
                : !endDate ? 'Tik nu de laatste dag aan'
                : 'Tik een nieuwe dag aan om opnieuw te kiezen'}
            </span>
            {(startDate || endDate) && (
              <button
                type="button"
                onClick={() => { onChange({ startDate: null, endDate: null }); }}
                style={S.linkBtn}
              >Wissen</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// ── Soort verblijf ──────────────────────────────────────────────────
// Een <select> en geen chips: acht opties naast elkaar is te veel op een
// telefoon. Bij "anders" verschijnt een vrij tekstveld, zodat bv.
// "vakantiehuisje" niet als kale "Anders" in het logboek eindigt.

const TypeSelect = ({ value, onChange, other, onOther }) => (
  <>
    <select
      value={value || ''}
      onChange={(e) => onChange(e.target.value)}
      style={S.select}
    >
      <option value="">— niet ingevuld —</option>
      {STAY_TYPES.map(t => (
        <option key={t.id} value={t.id}>{t.emoji} {t.label}</option>
      ))}
    </select>
    {value === 'anders' && (
      <input
        style={{ ...S.input, marginTop: 8 }}
        value={other || ''}
        onChange={(e) => onOther(e.target.value.slice(0, 40))}
        placeholder="Wat was het? Bv. vakantiehuisje, boot, bij familie"
      />
    )}
  </>
);

// ── Zelf een bezoek toevoegen ───────────────────────────────────────
// Voor een camping uit 2003 valt er niets uit de planning te halen — die
// planning heeft nooit bestaan. Dit is dan de enige weg naar binnen.
//
// Bewust klein: alleen de naam moet. De soort levert de emoji (en vult meteen
// `category`, het veld dat het datamodel al kent), de rest is optioneel. Het
// formulier blijft na opslaan openstaan met lege velden, want wie een oude
// vakantie invult typt er zelden maar één.

const BezoekForm = ({ onSave, onSluit }) => {
  const [naam, setNaam] = useState('');
  const [cat, setCat] = useState('custom');
  const [datum, setDatum] = useState('');
  const [note, setNote] = useState('');
  const [plaats, setPlaats] = useState(null);
  const [toonLocatie, setToonLocatie] = useState(false);
  const [err, setErr] = useState('');

  const submit = () => {
    const n = naam.trim();
    if (!n) {
      setErr('Geef de activiteit een naam.');
      return;
    }
    onSave({
      name: n,
      emoji: CATEGORIES[cat]?.emoji || null,
      category: cat,
      note: note.trim() || null,
      datum: datum || null,
      coords: plaats?.coords || null,
    });
    setNaam(''); setCat('custom'); setDatum(''); setNote('');
    setPlaats(null); setToonLocatie(false); setErr('');
  };

  return (
    <div style={S.bezoekForm}>
      <input
        style={S.input}
        value={naam}
        onChange={(e) => { setNaam(e.target.value.slice(0, 90)); setErr(''); }}
        onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
        placeholder="Wat heb je gedaan? Bv. Kasteel van Bouillon"
        autoFocus
      />

      <div style={S.bezoekVeldLabel}>
        Soort <span style={{ color: COLORS.ink }}>· {CATEGORIES[cat]?.name}</span>
      </div>
      <div style={S.chipRow}>
        {Object.entries(CATEGORIES).map(([id, c]) => (
          <button
            key={id}
            type="button"
            onClick={() => setCat(id)}
            title={c.name}
            aria-label={c.name}
            aria-pressed={cat === id}
            style={{
              ...S.emojiChip,
              background: cat === id ? `${c.color}1F` : 'transparent',
              borderColor: cat === id ? c.color : COLORS.hairline,
            }}
          >{c.emoji}</button>
        ))}
      </div>

      <div style={S.bezoekVeldLabel}>Wanneer <span style={S.optioneel}>· mag leeg</span></div>
      <input
        type="date"
        style={S.input}
        value={datum}
        onChange={(e) => setDatum(e.target.value)}
      />

      <div style={S.bezoekVeldLabel}>Notitie <span style={S.optioneel}>· mag leeg</span></div>
      <input
        style={S.input}
        value={note}
        onChange={(e) => setNote(e.target.value.slice(0, 300))}
        placeholder="Bv. mooi uitzicht, druk"
      />

      {/* Locatie zit ingeklapt: de meeste regels zijn “we zijn er geweest”
          zonder dat er een speld bij hoeft. */}
      {toonLocatie ? (
        <>
          <div style={S.bezoekVeldLabel}>Locatie <span style={S.optioneel}>· mag leeg</span></div>
          <LocationPicker
            value={plaats}
            onChange={setPlaats}
            placeholder="Zoek een plek of plak een Maps-link"
          />
        </>
      ) : (
        <button type="button" onClick={() => setToonLocatie(true)} style={S.bezoekLocatieLink}>
          <MapPin size={12} /> Locatie erbij
        </button>
      )}

      {err && <div style={S.formErr}>{err}</div>}

      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button style={S.bezoekOpslaan} onClick={submit} aria-label="Bezoek toevoegen">
          <Plus size={14} /> Toevoegen
        </button>
        <button style={S.bezoekKlaar} onClick={onSluit}>Klaar</button>
      </div>
    </div>
  );
};

// ── Filterbalk ──────────────────────────────────────────────────────

const FilterBar = ({
  opties, fCountry, setFCountry, fType, setFType, fYear, setFYear,
  fTrip, setFTrip, reizen, fMinScore, setFMinScore, actief, onWis,
}) => (
  <div style={S.filterBar}>
    <div style={S.filterHead}>
      <SlidersHorizontal size={14} style={{ color: COLORS.lake }} />
      <span style={S.filterTitle}>Zoeken</span>
      {actief && (
        <button onClick={onWis} style={S.linkBtn}>Wis filters</button>
      )}
    </div>

    {opties.landen.length > 1 && (
      <div style={S.filterGroep}>
        <div style={S.filterLabel}>Land</div>
        <div style={S.chipRow}>
          <Chip on={fCountry === null} onClick={() => setFCountry(null)}>Alle</Chip>
          {opties.landen.map(l => (
            <Chip
              key={l.key}
              on={fCountry === l.key}
              onClick={() => setFCountry(fCountry === l.key ? null : l.key)}
            >
              {l.code ? `${countryFlag(l.code)} ${l.naam}` : l.naam}
            </Chip>
          ))}
        </div>
      </div>
    )}

    {(opties.typen.length > 0 || opties.jaren.length > 0) && (
      <div style={S.filterRij}>
        {opties.jaren.length > 0 && (
          <div style={{ ...S.filterGroep, flex: 1, minWidth: 0 }}>
            <div style={S.filterLabel}>Jaar</div>
            <select value={fYear} onChange={(e) => setFYear(e.target.value)} style={S.select}>
              <option value="">Alle jaren</option>
              {opties.jaren.map(j => <option key={j} value={j}>{j}</option>)}
              {opties.zonderJaar && <option value="?">Jaar onbekend</option>}
            </select>
          </div>
        )}
        {opties.typen.length > 0 && (
          <div style={{ ...S.filterGroep, flex: 1, minWidth: 0 }}>
            <div style={S.filterLabel}>Soort verblijf</div>
            <select value={fType} onChange={(e) => setFType(e.target.value)} style={S.select}>
              <option value="">Alle soorten</option>
              {opties.typen.map(t => (
                <option key={t.id} value={t.id}>{t.emoji} {t.label}</option>
              ))}
            </select>
          </div>
        )}
      </div>
    )}

    {reizen.length > 0 && (
      <div style={S.filterGroep}>
        <div style={S.filterLabel}>Reis</div>
        <select value={fTrip} onChange={(e) => setFTrip(e.target.value)} style={S.select}>
          <option value="">Alle reizen</option>
          {reizen.map(r => (
            <option key={r.id} value={r.id}>
              {r.naam} · {r.stays.length} verblijven
            </option>
          ))}
        </select>
      </div>
    )}

    <div style={S.filterGroep}>
      <div style={S.filterLabel}>Cijfer</div>
      <div style={S.chipRow}>
        <Chip on={fMinScore === 0} onClick={() => setFMinScore(0)}>Alle</Chip>
        {[6, 7, 8, 9].map(n => (
          <Chip key={n} on={fMinScore === n} onClick={() => setFMinScore(fMinScore === n ? 0 : n)}>
            {n}+
          </Chip>
        ))}
      </div>
    </div>
  </div>
);

const Chip = ({ on, onClick, children }) => (
  <button
    onClick={onClick}
    style={{
      ...S.chip,
      background: on ? COLORS.forest : 'transparent',
      color: on ? COLORS.cream : COLORS.ink,
      borderColor: on ? COLORS.forest : COLORS.hairline,
    }}
  >{children}</button>
);

// ── Cijfer 1-10 ─────────────────────────────────────────────────────

const ScorePicker = ({ value, onChange }) => (
  <div style={S.scoreRow}>
    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => {
      const on = value === n;
      return (
        <button
          key={n}
          type="button"
          onClick={() => onChange(on ? null : n)}
          style={{
            ...S.scoreBtn,
            background: on ? scoreColor(n) : COLORS.creamSoft,
            color: on ? COLORS.cream : COLORS.ink,
            borderColor: on ? scoreColor(n) : COLORS.hairline,
          }}
        >{n}</button>
      );
    })}
  </div>
);

// ── Eén verblijf in de lijst ────────────────────────────────────────

const StayCard = ({
  stay, selected, expanded, uploading, cardRef, reis,
  onToggle, onUpdate, onLocation, onBepaalLand, onRemove, onAddPhotos, onRemovePhoto,
  onBijwerkenBezoek, onVerwijderBezoek, onVoegBezoekToe,
}) => {
  const fileRef = useRef(null);
  const [bezoekOpen, setBezoekOpen] = useState(false);
  const period = formatDateRange(stay.startDate, stay.endDate) || stay.periodLabel || null;
  const typeLabel = stayTypeLabel(stay);
  const landLabel = stay.country
    ? `${countryFlag(stay.countryCode)} ${stay.country}`.trim()
    : null;

  return (
    <div
      ref={cardRef}
      style={{
        ...S.card,
        borderColor: selected ? scoreColor(stay.score) : COLORS.hairline,
        boxShadow: selected ? `0 0 0 2px ${scoreColor(stay.score)}22` : 'none',
      }}
    >
      <div style={S.cardHead} onClick={onToggle}>
        <div style={{ ...S.scoreBadge, background: scoreColor(stay.score) }}>
          {stay.score != null ? String(stay.score).replace('.', ',') : '–'}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={S.cardName}>
            {stay.name}
            {stay.source === 'trip' && <span style={S.tripTag}>uit reis</span>}
          </div>
          <div style={S.cardMeta}>
            {[
              landLabel,
              typeLabel,
              period || 'Datum onbekend',
              !stay.coords ? 'geen locatie' : null,
            ].filter(Boolean).join(' · ')}
          </div>
          {/* Reis waar dit verblijf bij hoort. Het bolletje heeft de kleur van
              de lijn op de kaart, zodat je ze aan elkaar kunt knopen. */}
          {reis && reis.stays.length > 1 && (
            <div style={S.reisRegel}>
              <span style={{ ...S.reisStip, background: reis.kleur }} />
              {reis.naam}
              <span style={{ color: COLORS.inkLight }}>
                · {reis.stays.length} verblijven
              </span>
            </div>
          )}
        </div>
        {stay.website && (
          // stopPropagation: anders klapt de kaart open/dicht bij het aantikken
          // van de link, en dat is precies niet wat je bedoelde.
          <a
            href={stay.website}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            style={S.siteLink}
            title={stay.website}
            aria-label={`Website van ${stay.name}`}
          ><Globe size={14} /></a>
        )}
        {stay.bezocht?.length > 0 && (
          <div style={{ ...S.photoCount, color: COLORS.moss }} title="Bezocht in de buurt">
            <Footprints size={12} /> {stay.bezocht.length}
          </div>
        )}
        {stay.photos?.length > 0 && (
          <div style={S.photoCount}><Camera size={12} /> {stay.photos.length}</div>
        )}
        <ChevronDown
          size={18}
          style={{
            color: COLORS.inkLight, flexShrink: 0,
            transform: expanded ? 'rotate(180deg)' : 'none',
            transition: 'transform 0.15s',
          }}
        />
      </div>

      {/* Foto's zijn ook zichtbaar zonder het paneel open te klappen */}
      {stay.photos?.length > 0 && (
        <div style={S.thumbRow}>
          {stay.photos.map((p) => (
            <a key={p.id} href={p.url} target="_blank" rel="noreferrer" style={S.thumbLink}>
              <img src={p.url} alt="" style={S.thumb} loading="lazy" />
            </a>
          ))}
        </div>
      )}

      {!expanded && stay.review && (
        <p style={S.reviewPreview}>{stay.review}</p>
      )}

      {expanded && (
        <div style={S.panel}>
          <label style={S.label}>Naam</label>
          <input
            style={S.input}
            value={stay.name}
            onChange={(e) => onUpdate({ name: e.target.value.slice(0, 90) })}
          />

          <label style={S.label}>Locatie</label>
          <LocationPicker
            value={stay.coords ? { label: stay.locationLabel || stay.name, coords: stay.coords } : null}
            onChange={onLocation}
            placeholder="Zoek een plek of plak een Maps-link"
          />
          <div style={S.landRow}>
            {landLabel ? (
              <span>Land: <strong style={{ color: COLORS.forest }}>{landLabel}</strong></span>
            ) : stay.coords ? (
              <>
                <span>Land nog niet bepaald.</span>
                <button onClick={onBepaalLand} style={S.linkBtn}>
                  <RefreshCw size={11} /> Opnieuw bepalen
                </button>
              </>
            ) : (
              <span>Geen locatie, dus ook geen land.</span>
            )}
          </div>

          <label style={S.label}>Soort verblijf</label>
          <TypeSelect
            value={stay.type}
            onChange={(v) => onUpdate({ type: v || null, typeOther: v === 'anders' ? stay.typeOther : null })}
            other={stay.typeOther}
            onOther={(v) => onUpdate({ typeOther: v || null })}
          />

          <label style={S.label}>Wanneer</label>
          <DateRangePicker
            startDate={stay.startDate || null}
            endDate={stay.endDate || null}
            onChange={({ startDate, endDate }) => onUpdate({ startDate, endDate })}
          />

          <label style={S.label}>Of los uit het hoofd</label>
          <input
            style={S.input}
            value={stay.periodLabel || ''}
            onChange={(e) => onUpdate({ periodLabel: e.target.value.slice(0, 60) || null })}
            placeholder="Bv. “zomer 2003”"
          />

          <label style={S.label}>Website (optioneel)</label>
          <input
            style={S.input}
            value={stay.website || ''}
            onChange={(e) => onUpdate({ website: e.target.value.slice(0, 300) || null })}
            placeholder="camping-voorbeeld.fr"
            inputMode="url"
            autoCapitalize="off"
            autoCorrect="off"
          />

          <label style={S.label}>Cijfer</label>
          <ScorePicker value={stay.score} onChange={(v) => onUpdate({ score: v })} />

          <label style={S.label}>Review</label>
          <textarea
            style={{ ...S.input, minHeight: 90, resize: 'vertical' }}
            value={stay.review || ''}
            onChange={(e) => onUpdate({ review: e.target.value.slice(0, 2000) || null })}
            placeholder="Wat was er goed, wat viel tegen?"
          />

          <label style={S.label}>
            Bezocht in de buurt
            {onBijwerkenBezoek && (
              <button onClick={onBijwerkenBezoek} style={S.linkBtn} title="Ophalen uit de huidige planning">
                <RefreshCw size={11} /> Bijwerken uit de planning
              </button>
            )}
          </label>
          {(stay.bezocht || []).length === 0 ? (
            <p style={S.bezoekLeeg}>
              Nog niets. Vink activiteiten in de planner aan als bezocht — bij
              “Nieuwe vakantie starten” gaan ze mee hierheen, of haal ze nu op
              met de knop hierboven. Bij een vakantie van vroeger is er geen
              planning: zet ze er dan zelf bij.
            </p>
          ) : (
            <ul style={S.bezoekLijst}>
              {(stay.bezocht || []).map((b) => (
                <li key={b.id} style={S.bezoekRegel}>
                  <span style={S.bezoekEmoji}>{b.emoji || '📍'}</span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={S.bezoekNaam}>{b.name}</span>
                    {(b.datum || b.note) && (
                      <span style={S.bezoekMeta}>
                        {[b.datum && formatDateRange(b.datum, b.datum), b.note].filter(Boolean).join(' · ')}
                      </span>
                    )}
                  </span>
                  <button
                    onClick={() => onVerwijderBezoek(b.id)}
                    style={S.bezoekWis}
                    aria-label={`${b.name} weghalen`}
                  ><X size={13} /></button>
                </li>
              ))}
            </ul>
          )}

          {onVoegBezoekToe && (
            bezoekOpen ? (
              <BezoekForm onSave={onVoegBezoekToe} onSluit={() => setBezoekOpen(false)} />
            ) : (
              <button onClick={() => setBezoekOpen(true)} style={S.bezoekToevoeg}>
                <Plus size={13} /> Zelf toevoegen
              </button>
            )
          )}

          <label style={S.label}>Foto's</label>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            style={{ display: 'none' }}
            onChange={(e) => { onAddPhotos(e.target.files); e.target.value = ''; }}
          />
          <div style={S.photoGrid}>
            {(stay.photos || []).map((p) => (
              <div key={p.id} style={S.photoTile}>
                <img src={p.url} alt="" style={S.photoImg} loading="lazy" />
                <button
                  style={S.photoDel}
                  onClick={() => onRemovePhoto(p)}
                  aria-label="Foto verwijderen"
                ><X size={13} /></button>
              </div>
            ))}
            <button
              style={S.photoAdd}
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
            >
              {uploading
                ? <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} />
                : <><Camera size={18} /><span style={{ fontSize: 11 }}>Toevoegen</span></>}
            </button>
          </div>

          <button style={S.deleteBtn} onClick={onRemove}>
            <Trash2 size={14} /> Verblijf verwijderen
          </button>
        </div>
      )}
    </div>
  );
};

// ── Styling (zelfde tokens als de planner en het dagoverzicht) ──────

const S = {
  page: {
    fontFamily: "'DM Sans', sans-serif",
    background: COLORS.cream, color: COLORS.charcoal, minHeight: '100vh',
  },
  inner: { maxWidth: 720, margin: '0 auto', padding: '18px 20px 60px' },
  verslagLink: {
    display: 'inline-flex', alignItems: 'center', gap: 4,
    fontSize: 13, color: COLORS.lake, textDecoration: 'none',
    fontWeight: 500, marginBottom: 18,
  },
  backLink: {
    color: COLORS.forest, fontSize: 14, textDecoration: 'none',
    display: 'inline-flex', alignItems: 'center', gap: 6,
  },
  kicker: {
    fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase',
    color: COLORS.lake, fontWeight: 600, margin: '18px 0 6px',
  },
  title: {
    fontFamily: "'Fraunces', serif", fontSize: 32, fontWeight: 500,
    lineHeight: 1.08, margin: '0 0 8px', color: COLORS.forest,
    letterSpacing: '-0.02em',
  },
  sub: { fontSize: 14, lineHeight: 1.55, color: COLORS.ink, margin: '0 0 18px' },
  error: {
    padding: 14, borderRadius: 12, background: COLORS.creamSoft,
    color: COLORS.wine, fontSize: 14, marginBottom: 16,
  },
  statsRow: {
    display: 'flex', gap: 14, alignItems: 'flex-end', marginBottom: 14,
  },
  statNum: {
    fontFamily: "'Fraunces', serif", fontSize: 22,
    color: COLORS.forest, fontWeight: 500,
  },
  statLabel: {
    color: COLORS.inkLight, fontSize: 10,
    letterSpacing: 0.5, textTransform: 'uppercase',
  },
  statDivider: { width: 1, background: COLORS.hairline, alignSelf: 'stretch' },
  statVan: { color: COLORS.inkLight, fontSize: 14 },
  saveState: { fontSize: 11, color: COLORS.inkLight, textAlign: 'right' },
  filterBar: {
    display: 'flex', flexDirection: 'column', gap: 10,
    padding: '12px 14px', marginBottom: 12,
    background: COLORS.creamSoft, border: `1px solid ${COLORS.hairline}`,
    borderRadius: 14,
  },
  filterHead: { display: 'flex', alignItems: 'center', gap: 7 },
  filterTitle: {
    fontSize: 11, letterSpacing: 0.5, textTransform: 'uppercase',
    fontWeight: 600, color: COLORS.lake, flex: 1,
  },
  filterGroep: { display: 'flex', flexDirection: 'column', gap: 6 },
  filterRij: { display: 'flex', gap: 10 },
  filterLabel: { fontSize: 11, color: COLORS.inkLight, fontWeight: 600 },
  chipRow: { display: 'flex', flexWrap: 'wrap', gap: 6 },
  chip: {
    padding: '6px 12px', borderRadius: 999, cursor: 'pointer',
    border: `1px solid ${COLORS.hairline}`,
    fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600,
  },
  select: {
    width: '100%', padding: '11px 13px', background: COLORS.cream,
    border: `1px solid ${COLORS.hairline}`, borderRadius: 10,
    fontFamily: "'DM Sans', sans-serif", fontSize: 14,
    color: COLORS.charcoal, outline: 'none', boxSizing: 'border-box',
  },
  linkBtn: {
    display: 'inline-flex', alignItems: 'center', gap: 4,
    background: 'transparent', border: 'none', padding: 0, cursor: 'pointer',
    color: COLORS.lake, fontFamily: "'DM Sans', sans-serif",
    fontSize: 12, fontWeight: 600, textDecoration: 'underline',
  },
  hint: { fontSize: 11, color: COLORS.inkLight, marginTop: 6 },
  landRow: {
    display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
    marginTop: 8, fontSize: 12, color: COLORS.ink,
  },
  actions: { display: 'flex', gap: 8, flexWrap: 'wrap', margin: '16px 0 4px' },
  primaryBtn: {
    display: 'inline-flex', alignItems: 'center', gap: 7,
    padding: '10px 16px', borderRadius: 999, border: 'none',
    background: COLORS.forest, color: COLORS.cream,
    fontFamily: "'DM Sans', sans-serif", fontSize: 14, fontWeight: 600,
    cursor: 'pointer',
  },
  secondaryBtn: {
    display: 'inline-flex', alignItems: 'center', gap: 7,
    padding: '10px 16px', borderRadius: 999,
    border: `1px solid ${COLORS.lake}`, background: 'transparent',
    color: COLORS.lake, fontFamily: "'DM Sans', sans-serif",
    fontSize: 14, fontWeight: 600, cursor: 'pointer',
  },
  ghostBtn: {
    padding: '10px 16px', borderRadius: 999,
    border: `1px solid ${COLORS.hairline}`, background: 'transparent',
    color: COLORS.ink, fontFamily: "'DM Sans', sans-serif",
    fontSize: 14, fontWeight: 600, cursor: 'pointer',
  },
  empty: {
    marginTop: 18, padding: 20, borderRadius: 14,
    background: COLORS.creamSoft, color: COLORS.ink,
    fontSize: 14, lineHeight: 1.6,
  },
  emptyTitle: {
    fontFamily: "'Fraunces', serif", fontSize: 18,
    color: COLORS.forest, marginBottom: 6,
  },
  list: { display: 'flex', flexDirection: 'column', gap: 10, marginTop: 18 },
  card: {
    background: COLORS.creamSoft, border: `1px solid ${COLORS.hairline}`,
    borderRadius: 14, padding: '12px 14px', transition: 'border-color 0.15s, box-shadow 0.15s',
  },
  cardHead: { display: 'flex', alignItems: 'center', gap: 11, cursor: 'pointer' },
  scoreBadge: {
    width: 38, height: 38, borderRadius: 10, flexShrink: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: COLORS.cream, fontWeight: 700, fontSize: 15,
    fontFamily: "'Fraunces', serif",
  },
  cardName: {
    fontSize: 15, fontWeight: 600, color: COLORS.forest,
    display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap',
  },
  tripTag: {
    fontSize: 10, fontWeight: 600, letterSpacing: 0.4, textTransform: 'uppercase',
    color: COLORS.lake, background: 'rgba(58,126,132,0.12)',
    padding: '2px 6px', borderRadius: 6,
  },
  cardMeta: { fontSize: 12, color: COLORS.inkLight, marginTop: 2 },
  reisRegel: {
    display: 'flex', alignItems: 'center', gap: 5, marginTop: 3,
    fontSize: 11, fontWeight: 600, color: COLORS.ink,
  },
  reisStip: {
    width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
    display: 'inline-block',
  },
  bezoekLeeg: { fontSize: 12.5, color: COLORS.inkLight, lineHeight: 1.5, margin: '0 0 4px' },
  bezoekLijst: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 },
  bezoekRegel: {
    display: 'flex', alignItems: 'center', gap: 9,
    background: COLORS.cream, border: `1px solid ${COLORS.hairline}`,
    borderRadius: 10, padding: '8px 10px',
  },
  bezoekEmoji: { fontSize: 16 },
  bezoekNaam: { display: 'block', fontSize: 13, fontWeight: 500, color: COLORS.charcoal },
  bezoekMeta: { display: 'block', fontSize: 11, color: COLORS.inkLight, marginTop: 1 },
  bezoekWis: {
    border: 'none', background: 'transparent', cursor: 'pointer',
    color: COLORS.inkLight, padding: 2, display: 'flex',
  },
  reisGroep: { marginTop: 20 },
  reisKop: { display: 'flex', alignItems: 'flex-start', gap: 10 },
  reisKleur: {
    width: 4, alignSelf: 'stretch', minHeight: 34, borderRadius: 99, flexShrink: 0,
  },
  reisNaamKnop: {
    display: 'inline-flex', alignItems: 'center', gap: 7, maxWidth: '100%',
    border: 'none', background: 'transparent', padding: 0, cursor: 'pointer',
    fontFamily: "'Fraunces', serif", fontSize: 19, fontWeight: 500,
    color: COLORS.forest, letterSpacing: '-0.01em', textAlign: 'left',
  },
  reisInput: {
    width: '100%', boxSizing: 'border-box', padding: '4px 8px',
    borderWidth: 1, borderStyle: 'solid', borderColor: COLORS.lake, borderRadius: 8,
    background: COLORS.cream, color: COLORS.forest,
    fontFamily: "'Fraunces', serif", fontSize: 19, fontWeight: 500,
  },
  reisMeta: { fontSize: 11.5, color: COLORS.inkLight, marginTop: 2 },
  bezoekToevoeg: {
    display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 8,
    padding: '7px 12px', borderRadius: 999,
    borderWidth: 1, borderStyle: 'dashed', borderColor: `${COLORS.lake}80`,
    background: 'transparent', color: COLORS.lake,
    fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600,
    cursor: 'pointer',
  },
  bezoekForm: {
    marginTop: 10, padding: 12, borderRadius: 12,
    background: COLORS.creamSoft,
    borderWidth: 1, borderStyle: 'dashed', borderColor: `${COLORS.lake}80`,
  },
  bezoekVeldLabel: {
    fontSize: 11, color: COLORS.inkLight, fontWeight: 600,
    letterSpacing: 0.4, textTransform: 'uppercase', margin: '12px 0 6px',
  },
  optioneel: { textTransform: 'none', letterSpacing: 0, fontWeight: 400 },
  emojiChip: {
    width: 38, height: 34, borderRadius: 10, cursor: 'pointer',
    borderWidth: 1, borderStyle: 'solid',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 17, lineHeight: 1, padding: 0,
  },
  bezoekLocatieLink: {
    display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 12,
    background: 'transparent', border: 'none', padding: 0, cursor: 'pointer',
    color: COLORS.lake, fontFamily: "'DM Sans', sans-serif",
    fontSize: 12.5, fontWeight: 600, textDecoration: 'underline',
  },
  bezoekOpslaan: {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '9px 15px', borderRadius: 999, border: 'none',
    background: COLORS.forest, color: COLORS.cream,
    fontFamily: "'DM Sans', sans-serif", fontSize: 13.5, fontWeight: 600,
    cursor: 'pointer',
  },
  bezoekKlaar: {
    padding: '9px 15px', borderRadius: 999,
    borderWidth: 1, borderStyle: 'solid', borderColor: COLORS.hairline,
    background: 'transparent', color: COLORS.ink,
    fontFamily: "'DM Sans', sans-serif", fontSize: 13.5, fontWeight: 600,
    cursor: 'pointer',
  },
  siteLink: {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    width: 28, height: 28, borderRadius: 8, flexShrink: 0,
    color: COLORS.lake, background: 'rgba(58, 126, 132, 0.10)',
    textDecoration: 'none',
  },
  photoCount: {
    display: 'flex', alignItems: 'center', gap: 3,
    fontSize: 11, color: COLORS.inkLight, flexShrink: 0,
  },
  thumbRow: { display: 'flex', gap: 6, marginTop: 10, overflowX: 'auto', paddingBottom: 2 },
  thumbLink: { flexShrink: 0, lineHeight: 0 },
  thumb: {
    width: 76, height: 58, objectFit: 'cover', borderRadius: 8,
    border: `1px solid ${COLORS.hairline}`,
  },
  reviewPreview: {
    margin: '10px 0 0', fontSize: 13, lineHeight: 1.55, color: COLORS.ink,
    display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
  },
  panel: {
    marginTop: 12, paddingTop: 12,
    borderTop: `1px solid ${COLORS.hairline}`,
  },
  formCard: {
    marginTop: 14, padding: '16px 16px 18px',
    background: COLORS.creamSoft, border: `1px dashed ${COLORS.lake}80`,
    borderRadius: 14,
  },
  formTitle: {
    fontFamily: "'Fraunces', serif", fontSize: 18,
    color: COLORS.forest, marginBottom: 6,
  },
  formErr: { marginTop: 10, fontSize: 13, color: COLORS.wine },
  formHint: { marginTop: 10, fontSize: 12, color: COLORS.inkLight },
  label: {
    display: 'block', fontSize: 11, color: COLORS.inkLight,
    letterSpacing: 0.5, textTransform: 'uppercase', fontWeight: 600,
    margin: '14px 0 6px',
  },
  input: {
    width: '100%', padding: '11px 13px', background: COLORS.cream,
    border: `1px solid ${COLORS.hairline}`, borderRadius: 10,
    fontFamily: "'DM Sans', sans-serif", fontSize: 14,
    color: COLORS.charcoal, outline: 'none', boxSizing: 'border-box',
  },
  dateRow: { display: 'flex', gap: 10 },
  dateSummary: {
    width: '100%', display: 'flex', alignItems: 'center', gap: 9,
    padding: '11px 13px', background: COLORS.cream,
    border: `1px solid ${COLORS.hairline}`, borderRadius: 10, cursor: 'pointer',
    fontFamily: "'DM Sans', sans-serif", fontSize: 14, color: COLORS.charcoal,
    boxSizing: 'border-box',
  },
  kalender: {
    marginTop: 8, padding: 10, borderRadius: 12,
    background: COLORS.cream, border: `1px solid ${COLORS.hairline}`,
  },
  kalenderKop: {
    display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8,
  },
  kalenderTitel: {
    flex: 1, textAlign: 'center', fontFamily: "'Fraunces', serif",
    fontSize: 16, color: COLORS.forest,
  },
  kalenderKeuze: {
    flex: 1, minWidth: 0, padding: '7px 4px',
    background: COLORS.creamSoft, border: `1px solid ${COLORS.hairline}`,
    borderRadius: 9, cursor: 'pointer',
    fontFamily: "'DM Sans', sans-serif", fontSize: 14, fontWeight: 600,
    color: COLORS.forest, textAlign: 'center', outline: 'none',
  },
  kalenderPijl: {
    width: 32, height: 32, borderRadius: 9, cursor: 'pointer',
    border: `1px solid ${COLORS.hairline}`, background: 'transparent',
    color: COLORS.forest, fontSize: 18, lineHeight: 1,
    fontFamily: "'DM Sans', sans-serif",
  },
  kalenderRaster: {
    display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px 0',
  },
  kalenderWeekdag: {
    textAlign: 'center', fontSize: 10, fontWeight: 600,
    color: COLORS.inkLight, textTransform: 'uppercase', paddingBottom: 4,
  },
  kalenderDag: {
    height: 38, border: 'none', cursor: 'pointer', padding: 0,
    fontFamily: "'DM Sans', sans-serif", fontSize: 14,
  },
  kalenderVoet: {
    display: 'flex', alignItems: 'center', gap: 8,
    marginTop: 8, fontSize: 11,
  },
  scoreRow: { display: 'flex', gap: 4, flexWrap: 'wrap' },
  scoreBtn: {
    width: 32, height: 34, borderRadius: 8, cursor: 'pointer',
    border: `1px solid ${COLORS.hairline}`,
    fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600,
  },
  photoGrid: { display: 'flex', flexWrap: 'wrap', gap: 8 },
  photoTile: { position: 'relative', lineHeight: 0 },
  photoImg: {
    width: 92, height: 70, objectFit: 'cover', borderRadius: 10,
    border: `1px solid ${COLORS.hairline}`,
  },
  photoDel: {
    position: 'absolute', top: -6, right: -6,
    width: 22, height: 22, borderRadius: '50%', cursor: 'pointer',
    border: `1px solid ${COLORS.hairline}`, background: COLORS.cream,
    color: COLORS.wine, display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: 0,
  },
  photoAdd: {
    width: 92, height: 70, borderRadius: 10, cursor: 'pointer',
    border: `1px dashed ${COLORS.lake}80`, background: 'transparent',
    color: COLORS.lake, display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center', gap: 3,
    fontFamily: "'DM Sans', sans-serif",
  },
  deleteBtn: {
    display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 18,
    padding: '9px 14px', borderRadius: 10, cursor: 'pointer',
    background: 'transparent', color: COLORS.wine,
    border: `1px solid ${COLORS.wine}55`,
    fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600,
  },
};
