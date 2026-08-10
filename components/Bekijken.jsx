'use client';

// De alleen-lezen weergave achter een deel-link. Bewust een eigen, kale
// component en niet een variant van Planner: hier hoort geen enkele knop te
// zitten die iets opslaat, en dat is makkelijker te garanderen als er ook geen
// opslagcode in het bestand staat.
//
// Deze pagina kent de familie-PIN niet en heeft hem ook niet nodig — hij praat
// alleen met /api/delen/bekijk, dat zelf op het token controleert.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  MapPin, Star, CalendarRange, Link2Off, Car, Footprints, Route as RouteIcon,
  ChevronDown, Loader2,
} from 'lucide-react';
import {
  COLORS, CATEGORIES, DEFAULT_ACTIVITIES, buildDays, formatPeriod,
  formatDistance, formatDuration,
} from '@/lib/data';
import { routePunten } from '@/lib/volgorde';

export default function Bekijken() {
  const [staat, setStaat] = useState('laden'); // laden | ok | weg | fout
  const [data, setData] = useState(null);
  const [token, setToken] = useState('');
  // Eén dag tegelijk open: zo leeft er nooit meer dan één kaart.
  const [openDag, setOpenDag] = useState(null);

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get('token') || '';
    setToken(token);
    (async () => {
      try {
        const res = await fetch(`/api/delen/bekijk?token=${encodeURIComponent(token)}`, { cache: 'no-store' });
        if (res.status === 404) { setStaat('weg'); return; }
        if (!res.ok) { setStaat('fout'); return; }
        setData(await res.json());
        setStaat('ok');
      } catch {
        setStaat('fout');
      }
    })();
  }, []);

  const dagen = useMemo(
    () => (data?.tripConfig ? buildDays(data.tripConfig) : []),
    [data],
  );

  // De ingebouwde activiteiten staan in de app zelf; de link stuurt alleen de
  // eigen activiteiten en de aanpassingen mee.
  const perId = useMemo(() => {
    const uit = {};
    for (const a of DEFAULT_ACTIVITIES) uit[a.id] = a;
    for (const a of data?.activiteiten || []) if (a?.id) uit[a.id] = a;
    for (const [id, o] of Object.entries(data?.overrides || {})) {
      if (o) uit[id] = { ...(uit[id] || { id }), ...o };
    }
    return uit;
  }, [data]);

  if (staat === 'laden') return <Kaal tekst="Laden…" />;
  if (staat === 'weg') {
    return (
      <Kaal
        icoon={<Link2Off size={26} />}
        kop="Deze link werkt niet meer"
        tekst="De link is ingetrokken of klopt niet. Vraag het gezin om een nieuwe."
      />
    );
  }
  if (staat === 'fout') return <Kaal kop="Er ging iets mis" tekst="Probeer het later nog eens." />;

  const cfg = data.tripConfig;
  if (!cfg?.startDate) {
    return <Kaal kop="Nog niets te zien" tekst="Er is nog geen reis ingesteld om te bekijken." />;
  }

  return (
    <div style={S.pagina}>
      <p style={S.kicker}>Meekijken</p>
      <h1 style={S.titel}>{cfg.title || 'Vakantie'}</h1>
      <p style={S.periode}>
        <CalendarRange size={14} /> {formatPeriod(cfg)}
        {dagen.length > 0 && <> · {dagen.length} dagen</>}
      </p>

      <Kaartje dagen={dagen} perId={perId} stays={cfg.stays || []} plan={data.plan || {}} />

      <div style={S.dagen}>
        {dagen.map(dag => (
          <Dag
            key={dag.key}
            dag={dag}
            ids={data.plan?.[dag.key] || []}
            perId={perId}
            token={token}
            open={openDag === dag.key}
            onToggle={() => setOpenDag(k => (k === dag.key ? null : dag.key))}
          />
        ))}
      </div>

      <p style={S.voet}>
        Meekijkweergave — je kunt hier niets wijzigen.
        {data.bijgewerkt && <> Laatst bijgewerkt op {new Date(data.bijgewerkt).toLocaleDateString('nl-NL')}.</>}
      </p>
    </div>
  );
}

// ── Eén dag, met de route erbij ─────────────────────────────────────
//
// De route komt van /api/delen/dagroute: die krijgt alleen een datum mee en
// zoekt zelf op wat er die dag staat. Pas als je de dag openklapt gaat er een
// verzoek de deur uit — zo kost een reis van drie weken niet twintig routes.

function Dag({ dag, ids, perId, token, open, onToggle }) {
  const [route, setRoute] = useState(null);   // { route, vervoer } | null
  const [bezig, setBezig] = useState(false);
  const [mislukt, setMislukt] = useState(false);

  const acts = useMemo(() => ids.map(id => perId[id]).filter(Boolean), [ids, perId]);
  const stops = useMemo(() => acts.map(a => a.coords).filter(Boolean), [acts]);
  const kanRoute = stops.length >= 2;

  // `bezig` hoort hier NIET in de afhankelijkheden: dan draait het effect
  // opnieuw zodra de spinner aangaat, en zet de opruiming van die eerste ronde
  // `levend` op false — precies van de ronde die het antwoord nog moet
  // verwerken. Je blijft dan eeuwig op "Route berekenen…" staan.
  useEffect(() => {
    if (!open || !kanRoute || route) return undefined;
    let levend = true;
    setBezig(true);
    setMislukt(false);
    (async () => {
      try {
        const res = await fetch(
          `/api/delen/dagroute?token=${encodeURIComponent(token)}&dag=${dag.key}`,
          { cache: 'no-store' },
        );
        if (!res.ok) throw new Error(String(res.status));
        const data = await res.json();
        if (levend) setRoute(data);
      } catch {
        // Geen route is geen ramp: de kaart tekent dan een stippellijn.
        if (levend) setMislukt(true);
      } finally {
        if (levend) setBezig(false);
      }
    })();
    return () => { levend = false; };
  }, [open, kanRoute, route, token, dag.key]);

  const vervoer = route?.vervoer || null;
  const lopen = vervoer === 'lopen';
  const punten = useMemo(
    () => routePunten(stops, {
      begin: dag.startCoords, eind: dag.endCoords, vervoer: vervoer || 'rijden',
    }),
    [stops, dag, vervoer],
  );
  // Begint de route écht bij het verblijf? In wandelmodus niet, en dan zouden
  // de etappe-afstanden één activiteit opschuiven.
  const startBijVerblijf = Boolean(punten[0] && punten[0] === dag.startCoords);

  const etappeVan = (i) => {
    const rij = route?.route?.segments;
    if (!rij) return null;
    let pos = 0;
    for (let k = 0; k < acts.length; k++) {
      if (!acts[k].coords) continue;
      if (k === i) {
        const idx = startBijVerblijf ? pos : pos - 1;
        return idx >= 0 ? rij[idx] : null;
      }
      pos++;
    }
    return null;
  };

  return (
    <section style={{ ...S.dag, borderLeft: `3px solid ${dag.stay?.color || COLORS.hairline}` }}>
      <div style={S.dagKop}>
        <span style={S.dagNaam}>{dag.dayShort}</span>
        <span style={S.dagDatum}>{dag.date}</span>
        {dag.label && <span style={S.dagLabel}>{dag.label}</span>}
        {dag.stay?.name && <span style={S.dagVerblijf}>{dag.stay.name}</span>}
      </div>

      {ids.length === 0 ? (
        <p style={S.leegDag}>Nog niets gepland</p>
      ) : (
        <>
          {kanRoute && (
            <button onClick={onToggle} style={S.routeKnop}>
              {bezig
                ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} />
                : <RouteIcon size={12} />}
              {open ? 'Route verbergen' : 'Route bekijken'}
              <ChevronDown
                size={13}
                style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}
              />
            </button>
          )}

          {open && kanRoute && (
            <>
              <DagKaart dag={dag} acts={acts} lijn={route?.route?.geometry} />
              <div style={S.routeRegel}>
                {lopen ? <Footprints size={13} /> : <Car size={13} />}
                {bezig
                  ? 'Route berekenen…'
                  : route?.route?.totalDistance
                    ? <>
                        {lopen ? 'Wandeling' : 'Totale route'}:{' '}
                        <strong>{formatDistance(route.route.totalDistance)}</strong>
                        {' '}· ≈ {formatDuration(route.route.totalDuration)} {lopen ? 'lopen' : 'rijden'}
                      </>
                    : mislukt || route
                      ? `${lopen ? 'Wandelroute' : 'Route'} niet beschikbaar — de stippellijn toont de volgorde`
                      : ''}
              </div>
            </>
          )}

          <ul style={S.lijst}>
            {acts.map((a, i) => {
              const cat = CATEGORIES[a.category] || CATEGORIES.custom;
              const etappe = open ? etappeVan(i) : null;
              return (
                <React.Fragment key={`${a.id}-${i}`}>
                  {etappe && etappe.distance > 50 && (
                    <li style={S.etappe}>
                      {lopen ? <Footprints size={11} /> : <Car size={11} />}
                      {formatDistance(etappe.distance)} · {formatDuration(etappe.duration)}
                    </li>
                  )}
                  <li style={S.item}>
                    {open && kanRoute && a.coords
                      ? <span style={{ ...S.itemNummer, background: cat?.color || COLORS.forest }}>
                          {acts.slice(0, i + 1).filter(x => x.coords).length}
                        </span>
                      : <span style={S.itemEmoji}>{a.emoji || '📍'}</span>}
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ ...S.itemNaam, color: cat?.color || COLORS.charcoal }}>
                        {a.name}
                        {a.important && <Star size={11} style={{ marginLeft: 5 }} />}
                      </span>
                      {a.note && <span style={S.itemNotitie}>{a.note}</span>}
                    </span>
                    {a.coords && <MapPin size={13} color={COLORS.inkLight} />}
                  </li>
                </React.Fragment>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}

// De kaart van één dag: genummerde stops in de geplande volgorde, het verblijf
// als tentje, en de route ertussen. Zelfde Leaflet-patroon als hieronder.
function DagKaart({ dag, acts, lijn }) {
  const houder = useRef(null);
  const kaart = useRef(null);

  useEffect(() => {
    let levend = true;
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
      if (!levend || !houder.current) return;
      if (kaart.current) { kaart.current.remove(); kaart.current = null; }

      const map = L.map(houder.current, { zoomControl: true, attributionControl: false });
      kaart.current = map;
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18 }).addTo(map);

      const punten = [];
      const laag = L.featureGroup().addTo(map);

      const tent = (coords) => {
        if (!Array.isArray(coords)) return;
        L.marker(coords, {
          icon: L.divIcon({
            className: '',
            html: `<div style="display:flex;align-items:center;justify-content:center;
              width:28px;height:28px;border-radius:50%;font-size:14px;
              background:${COLORS.forest};border:2px solid ${COLORS.cream};
              box-shadow:0 1px 4px rgba(31,41,34,.3);">⛺</div>`,
            iconSize: [28, 28], iconAnchor: [14, 14],
          }),
        }).addTo(laag);
        punten.push(coords);
      };
      tent(dag.startCoords);

      let n = 0;
      for (const a of acts) {
        if (!a.coords) continue;
        n++;
        const cat = CATEGORIES[a.category] || CATEGORIES.custom;
        L.marker(a.coords, {
          icon: L.divIcon({
            className: '',
            html: `<div style="display:flex;align-items:center;justify-content:center;
              width:26px;height:26px;border-radius:50%;font-size:12px;font-weight:700;
              font-family:'DM Sans',sans-serif;color:${COLORS.cream};
              background:${cat.color};border:2px solid rgba(250,243,225,.9);
              box-shadow:0 1px 4px rgba(31,41,34,.3);">${n}</div>`,
            iconSize: [26, 26], iconAnchor: [13, 13],
          }),
        }).addTo(laag).bindPopup(`${n}. ${a.emoji || ''} ${a.name || ''}`);
        punten.push(a.coords);
      }
      if (dag.endCoords && dag.endCoords !== dag.startCoords) tent(dag.endCoords);

      if (lijn?.coordinates?.length > 1) {
        L.polyline(lijn.coordinates.map(([lng, lat]) => [lat, lng]), {
          color: COLORS.forest, weight: 4, opacity: 0.75,
        }).addTo(laag);
      } else if (punten.length > 1) {
        L.polyline(punten, {
          color: COLORS.forest, weight: 3, opacity: 0.5, dashArray: '6 8',
        }).addTo(laag);
      }

      if (punten.length) map.fitBounds(laag.getBounds(), { padding: [26, 26], maxZoom: 15 });
    })();

    return () => {
      levend = false;
      if (kaart.current) { kaart.current.remove(); kaart.current = null; }
    };
  }, [dag, acts, lijn]);

  return <div ref={houder} style={S.dagKaart} />;
}

// Leaflet is browser-only: importeren in een effect, CSS als <link> erbij
// (valkuil 5). Kaart opruimen in de cleanup, anders "Map container is already
// initialized" bij het tweede bezoek.
function Kaartje({ dagen, perId, stays, plan }) {
  const houder = useRef(null);
  const kaart = useRef(null);

  const punten = useMemo(() => {
    const uit = [];
    for (const s of stays) {
      if (Array.isArray(s.coords)) uit.push({ coords: s.coords, naam: s.name, verblijf: true });
    }
    const gezien = new Set();
    for (const ids of Object.values(plan)) {
      for (const id of ids || []) {
        if (gezien.has(id)) continue;
        gezien.add(id);
        const a = perId[id];
        if (a?.coords) uit.push({ coords: a.coords, naam: a.name, emoji: a.emoji });
      }
    }
    return uit;
  }, [stays, plan, perId]);

  useEffect(() => {
    let levend = true;
    if (!punten.length) return undefined;

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
      if (!levend || !houder.current || kaart.current) return;

      const map = L.map(houder.current, { zoomControl: true, attributionControl: false });
      kaart.current = map;
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18 }).addTo(map);

      const laag = L.featureGroup().addTo(map);
      for (const p of punten) {
        const icoon = L.divIcon({
          className: '',
          html: `<div style="
            display:flex;align-items:center;justify-content:center;
            width:${p.verblijf ? 30 : 24}px;height:${p.verblijf ? 30 : 24}px;
            border-radius:50%;font-size:${p.verblijf ? 15 : 12}px;
            background:${p.verblijf ? COLORS.forest : COLORS.cream};
            color:${COLORS.cream};
            border:2px solid ${p.verblijf ? COLORS.cream : COLORS.forest};
            box-shadow:0 1px 4px rgba(31,41,34,.3);
          ">${p.verblijf ? '⛺' : (p.emoji || '📍')}</div>`,
          iconSize: [p.verblijf ? 30 : 24, p.verblijf ? 30 : 24],
          iconAnchor: [p.verblijf ? 15 : 12, p.verblijf ? 15 : 12],
        });
        L.marker(p.coords, { icon: icoon }).addTo(laag).bindPopup(p.naam || '');
      }
      map.fitBounds(laag.getBounds(), { padding: [30, 30], maxZoom: 12 });
    })();

    return () => {
      levend = false;
      if (kaart.current) { kaart.current.remove(); kaart.current = null; }
    };
  }, [punten]);

  if (!punten.length) return null;
  return <div ref={houder} style={S.kaart} />;
}

const Kaal = ({ icoon, kop, tekst }) => (
  <div style={S.kaal}>
    {icoon && <div style={S.kaalIcoon}>{icoon}</div>}
    {kop && <h1 style={{ ...S.titel, fontSize: 22 }}>{kop}</h1>}
    <p style={{ fontSize: 14, color: COLORS.ink, lineHeight: 1.6, margin: 0 }}>{tekst}</p>
  </div>
);

const S = {
  pagina: {
    minHeight: '100vh', background: COLORS.cream,
    fontFamily: "'DM Sans', sans-serif", color: COLORS.charcoal,
    padding: '22px 20px 50px', maxWidth: 720, margin: '0 auto',
  },
  kaal: {
    minHeight: '100vh', background: COLORS.cream,
    fontFamily: "'DM Sans', sans-serif",
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    justifyContent: 'center', textAlign: 'center', padding: 30, gap: 10,
  },
  kaalIcoon: { color: COLORS.slate },
  kicker: {
    fontSize: 11, letterSpacing: 1.4, textTransform: 'uppercase',
    color: COLORS.lake, fontWeight: 600, margin: '0 0 4px',
  },
  titel: {
    fontFamily: "'Fraunces', serif", fontSize: 28, fontWeight: 500,
    color: COLORS.forest, margin: '0 0 6px', letterSpacing: '-0.02em',
  },
  periode: {
    display: 'flex', alignItems: 'center', gap: 6,
    fontSize: 13, color: COLORS.inkLight, margin: '0 0 16px',
  },
  kaart: {
    height: 240, borderRadius: 14, overflow: 'hidden',
    border: `1px solid ${COLORS.hairline}`, marginBottom: 18,
  },
  dagen: { display: 'flex', flexDirection: 'column', gap: 10 },
  dag: {
    background: COLORS.creamSoft, border: `1px solid ${COLORS.hairline}`,
    borderRadius: 13, padding: '11px 14px',
  },
  dagKop: { display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 6 },
  dagNaam: {
    fontFamily: "'Fraunces', serif", fontSize: 11, textTransform: 'uppercase',
    letterSpacing: 1, color: COLORS.inkLight,
  },
  dagDatum: { fontFamily: "'Fraunces', serif", fontSize: 16, color: COLORS.forest, fontWeight: 500 },
  dagLabel: {
    fontSize: 10, color: COLORS.lake, background: 'rgba(58,126,132,0.10)',
    padding: '2px 8px', borderRadius: 99,
  },
  dagVerblijf: { fontSize: 11, color: COLORS.inkLight, marginLeft: 'auto' },
  leegDag: { fontSize: 12.5, color: COLORS.inkLight, margin: 0 },
  lijst: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 },
  item: { display: 'flex', alignItems: 'center', gap: 9 },
  itemEmoji: { fontSize: 17, width: 22, textAlign: 'center' },
  itemNummer: {
    width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: COLORS.cream, fontSize: 11.5, fontWeight: 700,
  },
  routeKnop: {
    display: 'inline-flex', alignItems: 'center', gap: 5, marginBottom: 8,
    padding: '5px 11px', borderRadius: 99,
    borderWidth: 1, borderStyle: 'solid', borderColor: `${COLORS.lake}66`,
    background: 'rgba(58,126,132,0.07)', color: COLORS.lake,
    fontFamily: "'DM Sans', sans-serif", fontSize: 11.5, fontWeight: 600,
    cursor: 'pointer',
  },
  dagKaart: {
    height: 220, borderRadius: 11, overflow: 'hidden',
    border: `1px solid ${COLORS.hairline}`, marginBottom: 7,
  },
  routeRegel: {
    display: 'flex', alignItems: 'center', gap: 6,
    fontSize: 12, color: COLORS.ink, marginBottom: 9,
  },
  etappe: {
    display: 'flex', alignItems: 'center', gap: 5,
    fontSize: 11, color: COLORS.inkLight, paddingLeft: 6,
  },
  itemNaam: { display: 'block', fontSize: 13.5, fontWeight: 500 },
  itemNotitie: { display: 'block', fontSize: 11.5, color: COLORS.inkLight, marginTop: 1 },
  voet: {
    fontSize: 11.5, color: COLORS.inkLight, marginTop: 22,
    textAlign: 'center', lineHeight: 1.6,
  },
};
