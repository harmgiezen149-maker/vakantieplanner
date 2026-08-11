'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft, ChevronLeft, ChevronRight, ExternalLink, Car, Download, Check,
  Maximize2, Minimize2, Footprints, ListChecks,
} from 'lucide-react';
import {
  COLORS, CATEGORIES, DEFAULT_ACTIVITIES,
  DEFAULT_TRIP_CONFIG, buildDays, staysWithColors,
  getMapsLink, applyLocationOverride, formatDistance, formatDuration,
} from '@/lib/data';
import { useRoute } from '@/lib/useRoute';
import { kiesVervoer, routePunten } from '@/lib/volgorde';
import { useWeer } from '@/lib/useWeer';
import { formatTemp } from '@/lib/weer';
import OfflineMelding from '@/components/OfflineMelding';
import ConflictMelding from '@/components/ConflictMelding';
import { bewaarLokaal, leesLokaal } from '@/lib/offline';

const getPin = () => {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem('planner-pin') || '';
};

// Vandaag in de tijdzone van het apparaat, niet in UTC — anders is het hier
// tussen middernacht en twee uur 's nachts nog "gisteren".
const vandaagKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// Bouw een GPX-bestand uit de route-geometrie en download het.
function buildGpx(act) {
  const pts = act.routeGeometry || [];
  const esc = (s) => String(s).replace(/[<>&'"]/g, c => (
    { '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]
  ));
  const name = esc(act.name || 'Wandelroute');
  const trkpts = pts.map(([lat, lng]) => `      <trkpt lat="${lat}" lon="${lng}"></trkpt>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Vakantieplanner" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata><name>${name}</name></metadata>
  <trk>
    <name>${name}</name>
    <trkseg>
${trkpts}
    </trkseg>
  </trk>
</gpx>`;
}

function downloadGpx(act) {
  try {
    const gpx = buildGpx(act);
    const blob = new Blob([gpx], { type: 'application/gpx+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const safe = (act.name || 'wandelroute')
      .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
    a.href = url;
    a.download = `${safe || 'wandelroute'}.gpx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (e) {
    window.alert('Kon het GPX-bestand niet maken.');
  }
}

async function fetchPlan() {
  const res = await fetch('/api/plan', {
    method: 'GET',
    headers: { 'X-Family-Pin': getPin() },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// Deze pagina was lang alleen-lezen. Sinds je hier activiteiten als bezocht
// kunt aanvinken schrijft hij wél, en dus horen er twee dingen bij:
//
//   1. tripConfig en suggestExclusions sturen we NIET mee — de route haalt die
//      uit de opgeslagen staat terug (valkuil 3). Zouden we ze wel meesturen,
//      dan overschrijft dit scherm de reisinstellingen met wat het toevallig
//      geladen had.
//   2. basisVersie mee, zodat een botsing zichtbaar wordt (valkuil 4).
async function savePlan(plan, customActivities, locationOverrides, basisVersie) {
  const res = await fetch('/api/plan', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'X-Family-Pin': getPin() },
    body: JSON.stringify({
      plan, customActivities, locationOverrides,
      updatedBy: (typeof window !== 'undefined' && localStorage.getItem('planner-name')) || null,
      basisVersie,
    }),
  });
  if (res.status === 409) {
    const info = await res.json().catch(() => ({}));
    const err = new Error('conflict');
    err.conflict = info;
    throw err;
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// Kaart met genummerde markers in geplande volgorde + routelijn
const DayRouteMap = ({ day, acts, routeGeometry }) => {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const leafletRef = useRef(null);
  const layersRef = useRef([]);
  // De punten van de laatste tekenbeurt, zodat we na een formaatwissel opnieuw
  // passend kunnen maken (zelfde patroon als StayMap in StayLog.jsx).
  const ptsRef = useRef([]);
  const [ready, setReady] = useState(false);
  const [full, setFull] = useState(false);

  // Bij het wisselen van formaat moet Leaflet opnieuw meten, en daarna opnieuw
  // passend maken — het venster heeft een andere verhouding. Zonder dit blijft
  // de kaart in zijn oude afmeting hangen, met grijze randen.
  useEffect(() => {
    const t = setTimeout(() => {
      const map = mapRef.current;
      const L = leafletRef.current;
      if (!map) return;
      map.invalidateSize();
      if (L && ptsRef.current.length > 0) {
        map.fitBounds(L.latLngBounds(ptsRef.current), { padding: [28, 28], maxZoom: 15 });
      }
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
          center: day?.startCoords || [48.8, 6.5],
          zoom: 10,
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const L = leafletRef.current;
    if (!map || !L || !ready) return;

    layersRef.current.forEach(l => l.remove());
    layersRef.current = [];

    const pts = [];

    // Verblijf-markers (start/eind)
    const stayIcon = (color, emoji) => L.divIcon({
      className: '',
      html: `<div style="
        width: 32px; height: 32px; border-radius: 50%;
        background: ${color}; border: 3px solid #FAF3E1;
        display: flex; align-items: center; justify-content: center;
        font-size: 15px; box-shadow: 0 2px 8px rgba(31,41,34,0.35);
      ">${emoji}</div>`,
      iconSize: [32, 32], iconAnchor: [16, 16],
    });

    if (day?.startCoords) {
      const m = L.marker(day.startCoords, {
        icon: stayIcon(day.stay?.color || COLORS.forest, '🏡'),
        zIndexOffset: 900,
      }).addTo(map);
      layersRef.current.push(m);
      pts.push(day.startCoords);
    }

    // Genummerde activiteit-markers in geplande volgorde
    acts.forEach((act, i) => {
      if (!act.coords) return;
      const cat = CATEGORIES[act.category] || CATEGORIES.custom;
      const icon = L.divIcon({
        className: '',
        html: `<div style="
          width: 28px; height: 28px; border-radius: 50%;
          background: ${cat.color}; color: #FAF3E1;
          border: 2px solid rgba(250,243,225,0.9);
          display: flex; align-items: center; justify-content: center;
          font-size: 13px; font-weight: 700;
          font-family: 'DM Sans', sans-serif;
          box-shadow: 0 2px 6px rgba(31,41,34,0.3);
        ">${i + 1}</div>`,
        iconSize: [28, 28], iconAnchor: [14, 14],
      });
      const m = L.marker(act.coords, { icon }).addTo(map);
      m.bindPopup(`<div style="font-family:'DM Sans',sans-serif;font-size:12px;">
        <strong>${i + 1}. ${act.emoji} ${act.name}</strong>
      </div>`);
      layersRef.current.push(m);
      pts.push(act.coords);

      // Wandelroute: teken de opgeslagen geometrie als groene lijn
      if (Array.isArray(act.routeGeometry) && act.routeGeometry.length > 1) {
        const hikeLine = L.polyline(act.routeGeometry, {
          color: cat.color, weight: 4, opacity: 0.8,
        }).addTo(map);
        layersRef.current.push(hikeLine);
        act.routeGeometry.forEach(p => pts.push(p));
      }
    });

    if (day?.endCoords && (
      !day?.startCoords ||
      day.endCoords[0] !== day.startCoords[0] ||
      day.endCoords[1] !== day.startCoords[1]
    )) {
      const m = L.marker(day.endCoords, {
        icon: stayIcon(day.endStay?.color || day.stay?.color || COLORS.gold, '🏡'),
        zIndexOffset: 900,
      }).addTo(map);
      layersRef.current.push(m);
      pts.push(day.endCoords);
    }

    // Routelijn (echte route als beschikbaar, anders rechte verbindingen)
    if (routeGeometry?.coordinates?.length > 1) {
      const latlngs = routeGeometry.coordinates.map(([lng, lat]) => [lat, lng]);
      const line = L.polyline(latlngs, {
        color: COLORS.forest, weight: 4, opacity: 0.75,
      }).addTo(map);
      layersRef.current.push(line);
    } else if (pts.length > 1) {
      const line = L.polyline(pts, {
        color: COLORS.forest, weight: 3, opacity: 0.5, dashArray: '6 8',
      }).addTo(map);
      layersRef.current.push(line);
    }

    ptsRef.current = pts;
    if (pts.length > 0) {
      map.fitBounds(L.latLngBounds(pts), { padding: [28, 28], maxZoom: 13 });
    }
  }, [day, acts, routeGeometry, ready]);

  return (
    <div style={full ? {
      position: 'fixed', inset: 0, zIndex: 70, background: COLORS.cream,
      padding: 10, display: 'flex', flexDirection: 'column',
    } : { position: 'relative' }}>
      <div
        ref={containerRef}
        style={{
          width: '100%', height: full ? '100%' : 300, flex: full ? 1 : undefined,
          borderRadius: full ? 12 : 14,
          overflow: 'hidden', border: `1px solid ${COLORS.hairline}`,
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

export default function DayOverview() {
  const [plan, setPlan] = useState(null);
  const [customActivities, setCustomActivities] = useState([]);
  const [locationOverrides, setLocationOverrides] = useState({});
  // Route-instellingen per dag; hier alleen gelezen, want dit scherm zet geen
  // ankers. De PUT stuurt het veld dus ook niet mee (valkuil 3 vangt dat op).
  const [routeAnkers, setRouteAnkers] = useState({});
  const [tripConfig, setTripConfig] = useState(DEFAULT_TRIP_CONFIG);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [dayIndex, setDayIndex] = useState(null);
  const [offlineOp, setOfflineOp] = useState(null);
  const [conflict, setConflict] = useState(null);
  const [opslaan, setOpslaan] = useState(false);
  const versie = useRef(null);

  const days = useMemo(() => buildDays(tripConfig), [tripConfig]);

  // Eén oproep voor de hele reis: de verwachting per dag komt uit dezelfde
  // lijst, en dat scheelt een verzoek per keer dat je een dag verder klikt.
  const weerCoords = useMemo(() => {
    const metCoords = (tripConfig?.stays || []).find(s => Array.isArray(s.coords));
    return metCoords?.coords || null;
  }, [tripConfig]);
  const weerPerDag = useWeer(weerCoords, days[0]?.key, days[days.length - 1]?.key);

  useEffect(() => {
    (async () => {
      try {
        const data = await fetchPlan();
        bewaarLokaal('trip', data);
        setOfflineOp(null);
        versie.current = data.updatedAt ?? null;
        setPlan(data.plan || {});
        setCustomActivities(data.customActivities || []);
        setLocationOverrides(data.locationOverrides || {});
        setRouteAnkers(data.routeAnkers || {});
        if (data.tripConfig) setTripConfig(data.tripConfig);
      } catch {
        // Geen verbinding: de laatst geladen versie tonen, met de balk erboven.
        // Aanvinken is dan uit — zie het commentaar bij markeerBezocht.
        const kopie = leesLokaal('trip');
        if (kopie) {
          setPlan(kopie.data.plan || {});
          setCustomActivities(kopie.data.customActivities || []);
          setLocationOverrides(kopie.data.locationOverrides || {});
          setRouteAnkers(kopie.data.routeAnkers || {});
          if (kopie.data.tripConfig) setTripConfig(kopie.data.tripConfig);
          setOfflineOp(kopie.op);
        } else {
          setError('Kon de planning niet laden. Controleer je verbinding.');
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Welke dag openen we? Eerst ?dag=YYYY-MM-DD uit het adres — daarmee springt
  // de planning naar precies deze dag. Anders vandaag, en anders de eerste dag.
  useEffect(() => {
    if (dayIndex !== null || days.length === 0) return;
    const gevraagd = new URLSearchParams(window.location.search).get('dag');
    const uitUrl = gevraagd ? days.findIndex(d => d.key === gevraagd) : -1;
    if (uitUrl >= 0) { setDayIndex(uitUrl); return; }
    const idx = days.findIndex(d => d.key === vandaagKey());
    setDayIndex(idx >= 0 ? idx : 0);
  }, [days, dayIndex]);

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

  // Bezocht aanvinken. De vlag hoort bij de activiteit, niet bij de dag
  // (valkuil 1), dus custom → customActivities, ingebouwd → locationOverrides.
  const markeerBezocht = async (activity) => {
    if (offlineOp || opslaan) return;   // offline niet schrijven (valkuil 19)

    const isCustom = customActivities.some(a => a.id === activity.id);
    const patch = { visited: !activity.visited };
    const nieuweCustom = isCustom
      ? customActivities.map(a => (a.id === activity.id ? { ...a, ...patch } : a))
      : customActivities;
    const nieuweOverrides = isCustom
      ? locationOverrides
      : { ...locationOverrides, [activity.id]: { ...(locationOverrides[activity.id] || {}), ...patch } };

    setCustomActivities(nieuweCustom);
    setLocationOverrides(nieuweOverrides);
    setOpslaan(true);
    try {
      const data = await savePlan(plan, nieuweCustom, nieuweOverrides, versie.current);
      versie.current = data.updatedAt ?? null;
      setConflict(null);
    } catch (e) {
      if (e?.conflict) setConflict(e.conflict);
      // Andere fouten: de volgende tik probeert het opnieuw. De vlag staat
      // lokaal al goed, dus je ziet wat je bedoelde.
    } finally {
      setOpslaan(false);
    }
  };

  const day = dayIndex !== null ? days[dayIndex] : null;
  const acts = useMemo(() => {
    if (!day || !plan) return [];
    return (plan[day.key] || []).map(id => activityById[id]).filter(Boolean);
  }, [day, plan, activityById]);

  // Te voet of met de auto? Dezelfde regel als de knop "Slimme volgorde" in de
  // planner, met dezelfde functie — anders kunnen de twee schermen uit elkaar
  // gaan lopen voor dezelfde dag.
  const stops = useMemo(() => acts.filter(a => a.coords).map(a => a.coords), [acts]);
  const vervoer = useMemo(
    () => kiesVervoer(stops, day ? routeAnkers[day.key]?.vervoer : null),
    [stops, routeAnkers, day],
  );
  const lopen = vervoer === 'lopen';

  // Routepunten in geplande volgorde. Bij rijden hoort het verblijf erbij, bij
  // lopen niet — zie routePunten() in lib/volgorde.js.
  const routePoints = useMemo(() => {
    if (!day) return null;
    const pts = routePunten(stops, {
      begin: day.startCoords, eind: day.endCoords, vervoer,
    });
    return pts.length >= 2 ? pts : null;
  }, [day, stops, vervoer]);

  const { route, loading: routeLoading } = useRoute(routePoints, !!routePoints, vervoer);

  // Per activiteit: welk route-segment hoort bij de weg ernaartoe?
  // (Activiteiten zonder coördinaten doen niet mee in de route.)
  //
  // Let op: dit hangt ervan af of de route écht bij het verblijf begint, niet of
  // de dag een verblijf hééft. In wandelmodus valt dat startpunt weg, en dan
  // zouden alle afstanden één plaats opschuiven.
  const startBijVerblijf = Boolean(!lopen && day?.startCoords
    && routePoints?.[0] === day.startCoords);
  const legIndexByAct = useMemo(() => {
    const res = acts.map(() => null);
    let coordPos = 0;
    acts.forEach((a, i) => {
      if (!a.coords) return;
      const legIdx = startBijVerblijf ? coordPos : coordPos - 1;
      coordPos++;
      if (legIdx >= 0) res[i] = legIdx;
    });
    return res;
  }, [acts, startBijVerblijf]);

  const fmtDate = (d) => `${d.dayShort} ${d.date}`;

  if (loading) {
    return (
      <div style={{
        fontFamily: "'DM Sans', sans-serif", background: COLORS.cream,
        minHeight: '100vh', display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        color: COLORS.ink, fontSize: 14,
      }}>Laden…</div>
    );
  }

  return (
    <div style={{
      fontFamily: "'DM Sans', sans-serif",
      background: COLORS.cream, minHeight: '100vh',
    }}>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '18px 20px 60px' }}>
        {/* Terug naar de planning, en dan naar dezelfde dag: dat is precies
            het heen-en-weer waar je bij het plannen op vastloopt. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <Link href="/" style={{
            color: COLORS.forest, fontSize: 14, textDecoration: 'none',
            display: 'inline-flex', alignItems: 'center', gap: 6,
          }}>
            <ArrowLeft size={16} /> Planner
          </Link>
          {day && (
            <Link
              href={`/?dag=${day.key}`}
              title="Deze dag openen in de planning"
              style={{
                marginLeft: 'auto',
                border: `1px solid ${COLORS.hairline}`, borderRadius: 99,
                padding: '4px 11px', textDecoration: 'none',
                color: COLORS.inkLight, fontSize: 12, fontWeight: 600,
                display: 'inline-flex', alignItems: 'center', gap: 5,
              }}
            >
              <ListChecks size={13} /> In de planning
            </Link>
          )}
        </div>

        {offlineOp && (
          <div style={{ marginTop: 16 }}>
            <OfflineMelding op={offlineOp} onOpnieuw={() => window.location.reload()} />
          </div>
        )}

        {conflict && (
          <div style={{ marginTop: 16 }}>
            <ConflictMelding
              door={conflict.door}
              onLaadHunVersie={() => { setConflict(null); window.location.reload(); }}
              onForceer={async () => {
                setConflict(null);
                try {
                  const data = await savePlan(plan, customActivities, locationOverrides, undefined);
                  versie.current = data.updatedAt ?? null;
                } catch { /* volgende tik probeert het opnieuw */ }
              }}
            />
          </div>
        )}

        {error && (
          <div style={{
            marginTop: 20, padding: 16, borderRadius: 12,
            background: COLORS.creamSoft, color: COLORS.ink, fontSize: 14,
          }}>{error}</div>
        )}

        {!error && days.length === 0 && (
          <div style={{
            marginTop: 20, padding: 20, borderRadius: 12,
            background: COLORS.creamSoft, color: COLORS.ink,
            fontSize: 14, lineHeight: 1.6,
          }}>
            <div style={{ fontFamily: "'Fraunces', serif", fontSize: 18, color: COLORS.forest, marginBottom: 6 }}>
              Nog geen reis ingesteld
            </div>
            Stel eerst de reisperiode en verblijven in via de planner.
          </div>
        )}

        {!error && day && (
          <>
            {/* Dag-navigatie */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              marginTop: 16, marginBottom: 4,
            }}>
              <button
                onClick={() => setDayIndex(i => Math.max(0, i - 1))}
                disabled={dayIndex === 0}
                aria-label="Vorige dag"
                style={{
                  width: 38, height: 38, borderRadius: 11,
                  border: `1px solid ${COLORS.hairline}`,
                  background: COLORS.cream, color: COLORS.forest,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: dayIndex === 0 ? 'default' : 'pointer',
                  opacity: dayIndex === 0 ? 0.35 : 1,
                }}
              ><ChevronLeft size={19} /></button>

              <div style={{ flex: 1, textAlign: 'center' }}>
                <div style={{
                  fontFamily: "'Fraunces', serif", fontSize: 24,
                  color: COLORS.forest, fontWeight: 500,
                }}>
                  {fmtDate(day)}
                </div>
                <div style={{ fontSize: 12, color: COLORS.inkLight, marginTop: 2 }}>
                  {day.label ? `${day.label} · ` : ''}
                  {day.stay?.name}
                  {day.endStay && day.endStay.id !== day.stay?.id ? ` → ${day.endStay.name}` : ''}
                  {' · '}dag {dayIndex + 1} van {days.length}
                </div>
                {weerPerDag[day.key] && (
                  <div
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                      marginTop: 6, padding: '3px 10px', borderRadius: 999,
                      background: COLORS.creamSoft,
                      border: `1px solid ${COLORS.hairline}`,
                      fontSize: 12, color: COLORS.ink,
                    }}
                    title={weerPerDag[day.key].label}
                  >
                    <span style={{ fontSize: 14 }}>{weerPerDag[day.key].emoji}</span>
                    <span style={{ fontWeight: 600 }}>{formatTemp(weerPerDag[day.key].maxC)}</span>
                    <span style={{ color: COLORS.inkLight }}>{formatTemp(weerPerDag[day.key].minC)}</span>
                    {weerPerDag[day.key].neerslagMm > 0 && (
                      <span style={{ color: COLORS.lake }}>
                        {Math.round(weerPerDag[day.key].neerslagMm)} mm
                      </span>
                    )}
                  </div>
                )}
              </div>

              <button
                onClick={() => setDayIndex(i => Math.min(days.length - 1, i + 1))}
                disabled={dayIndex === days.length - 1}
                aria-label="Volgende dag"
                style={{
                  width: 38, height: 38, borderRadius: 11,
                  border: `1px solid ${COLORS.hairline}`,
                  background: COLORS.cream, color: COLORS.forest,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: dayIndex === days.length - 1 ? 'default' : 'pointer',
                  opacity: dayIndex === days.length - 1 ? 0.35 : 1,
                }}
              ><ChevronRight size={19} /></button>
            </div>

            {/* Dag-strip om snel te springen */}
            <div style={{
              display: 'flex', gap: 6, overflowX: 'auto',
              padding: '10px 2px 14px', WebkitOverflowScrolling: 'touch',
            }}>
              {days.map((d, i) => {
                const has = (plan?.[d.key] || []).length > 0;
                const active = i === dayIndex;
                return (
                  <button
                    key={d.key}
                    onClick={() => setDayIndex(i)}
                    style={{
                      flexShrink: 0, padding: '6px 10px', borderRadius: 99,
                      fontSize: 11.5, fontWeight: 600,
                      fontFamily: "'DM Sans', sans-serif", cursor: 'pointer',
                      background: active ? (d.stay?.color || COLORS.forest) : 'transparent',
                      color: active ? COLORS.cream : has ? COLORS.charcoal : COLORS.inkLight,
                      border: `1px solid ${active ? (d.stay?.color || COLORS.forest) : COLORS.hairline}`,
                    }}
                  >
                    {d.date}{has ? ' •' : ''}
                  </button>
                );
              })}
            </div>

            {acts.length === 0 ? (
              <div style={{
                padding: 24, borderRadius: 14,
                background: COLORS.creamSoft, color: COLORS.ink,
                fontSize: 14, lineHeight: 1.6, textAlign: 'center',
              }}>
                Nog niets gepland voor deze dag.
                <div style={{ marginTop: 6, fontSize: 13, color: COLORS.inkLight }}>
                  Een vrije dag is ook vakantie 🌿 — of plan iets in via de planner.
                </div>
              </div>
            ) : (
              <>
                {/* Route-kaart */}
                {routePoints && (
                  <div style={{ marginBottom: 8 }}>
                    <DayRouteMap day={day} acts={acts} routeGeometry={route?.geometry} />
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '8px 4px 0', fontSize: 12.5, color: COLORS.ink,
                    }}>
                      {lopen
                        ? <Footprints size={14} color={COLORS.forest} />
                        : <Car size={14} color={COLORS.forest} />}
                      {routeLoading
                        ? 'Route berekenen…'
                        : route?.totalDistance
                          ? <>
                              {lopen ? 'Wandeling' : 'Totale route'}:{' '}
                              <strong>{formatDistance(route.totalDistance)}</strong>
                              {' '}· ≈ {formatDuration(route.totalDuration)} {lopen ? 'lopen' : 'rijden'}
                            </>
                          : lopen
                            ? 'Wandelroute niet beschikbaar — de stippellijn toont de volgorde'
                            : 'Route niet beschikbaar — markers tonen de geplande volgorde'}
                    </div>
                  </div>
                )}

                {/* Activiteiten in geplande volgorde */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 14 }}>
                  {acts.map((act, i) => {
                    const cat = CATEGORIES[act.category] || CATEGORIES.custom;
                    const mapsLink = getMapsLink(act);
                    const leg = legIndexByAct[i] != null
                      ? route?.segments?.[legIndexByAct[i]]
                      : null;
                    return (
                      <div key={`${act.id}-${i}`}>
                        {leg && (
                          <div style={{
                            display: 'flex', alignItems: 'center', gap: 6,
                            padding: '0 0 10px 13px',
                            fontSize: 11.5, color: COLORS.inkLight,
                          }}>
                            <span style={{
                              width: 2, height: 14, background: COLORS.hairline,
                              borderRadius: 2, marginRight: 4,
                            }} />
                            {lopen ? <Footprints size={12} /> : <Car size={12} />}
                            {formatDistance(leg.distance)} · {formatDuration(leg.duration)}
                          </div>
                        )}
                        <div style={{
                          display: 'flex', gap: 12, alignItems: 'flex-start',
                          padding: '14px 16px',
                          background: COLORS.creamSoft, borderRadius: 14,
                          borderLeft: `4px solid ${cat.color}`,
                        }}>
                          <span style={{
                            width: 26, height: 26, borderRadius: '50%',
                            background: cat.color, color: COLORS.cream,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 13, fontWeight: 700, flexShrink: 0, marginTop: 1,
                          }}>{i + 1}</span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{
                              fontSize: 15, fontWeight: 600, color: COLORS.charcoal,
                              display: 'flex', alignItems: 'center', gap: 6,
                            }}>
                              {act.important && <span style={{ color: '#C97D5D' }}>★</span>}
                              <span style={{ opacity: act.visited ? 0.75 : 1 }}>
                                {act.emoji} {act.name}
                              </span>
                            </div>
                            <div style={{ fontSize: 11, color: COLORS.inkLight, marginTop: 2 }}>
                              {cat.name}
                            </div>
                            {act.note && (
                              <div style={{
                                fontSize: 12.5, color: COLORS.ink,
                                marginTop: 6, lineHeight: 1.5,
                              }}>{act.note}</div>
                            )}
                          </div>
                          <button
                            onClick={() => markeerBezocht(act)}
                            disabled={!!offlineOp}
                            style={{
                              border: 'none', borderRadius: 8, padding: 5, flexShrink: 0,
                              cursor: offlineOp ? 'default' : 'pointer',
                              background: act.visited ? `${COLORS.moss}22` : 'transparent',
                              color: act.visited ? COLORS.moss : COLORS.inkLight,
                              opacity: offlineOp ? 0.35 : (act.visited ? 1 : 0.55),
                              display: 'flex', alignItems: 'center',
                            }}
                            aria-label={act.visited ? 'Toch niet bezocht' : 'Markeren als bezocht'}
                            title={offlineOp
                              ? 'Offline — wijzigingen worden niet bewaard'
                              : act.visited ? 'Bezocht — tik om terug te draaien' : 'Ik ben hier geweest'}
                          ><Check size={16} /></button>
                          {mapsLink && (
                            <a
                              href={mapsLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              aria-label="Open in Google Maps"
                              style={{
                                color: cat.color, flexShrink: 0,
                                display: 'flex', alignItems: 'center', padding: 4,
                              }}
                            ><ExternalLink size={16} /></a>
                          )}
                          {Array.isArray(act.routeGeometry) && act.routeGeometry.length > 1 && (
                            <button
                              onClick={() => downloadGpx(act)}
                              aria-label="Download GPX"
                              title="Download als GPX (voor je wandel-app of GPS)"
                              style={{
                                color: cat.color, flexShrink: 0,
                                display: 'flex', alignItems: 'center', gap: 3,
                                background: 'transparent', border: 'none', cursor: 'pointer',
                                padding: 4, fontFamily: "'DM Sans', sans-serif",
                                fontSize: 11, fontWeight: 600,
                              }}
                            ><Download size={16} /> GPX</button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
