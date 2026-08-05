'use client';

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import Link from 'next/link';
import { upload } from '@vercel/blob/client';
import {
  ArrowLeft, Plus, Trash2, Star, MapPin, Camera, Loader2, X, ChevronDown,
} from 'lucide-react';
import { COLORS, formatDateRange } from '@/lib/data';
import { getPin } from '@/lib/maps';
import LocationPicker from '@/components/LocationPicker';
import {
  uid, fetchStayLog, saveStayLog, archiveTripStays,
} from '@/lib/stayLog';

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

// ── Kaart met alle verblijven ───────────────────────────────────────
// Zelfde patroon als DayOverview: Leaflet browser-only via dynamic import,
// CSS als <link data-leaflet>, kaart opruimen in de cleanup.

const StayMap = ({ stays, selectedId, onSelect }) => {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const leafletRef = useRef(null);
  const markersRef = useRef([]);
  const [ready, setReady] = useState(false);

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

  // Markers opnieuw tekenen bij elke wijziging in de lijst of selectie
  useEffect(() => {
    const map = mapRef.current;
    const L = leafletRef.current;
    if (!map || !L || !ready) return;

    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];

    const withCoords = stays.filter(s => Array.isArray(s.coords));
    const pts = [];

    withCoords.forEach((s) => {
      const color = scoreColor(s.score);
      const active = s.id === selectedId;
      const label = s.score != null ? String(s.score).replace('.', ',') : '·';
      // Speld met het cijfer erin — zelfde vorm als de markers op /kaart
      const icon = L.divIcon({
        className: '',
        html: `
          <div style="position: relative; width: 32px; height: 40px;
                      filter: drop-shadow(0 2px 3px rgba(0,0,0,${active ? 0.45 : 0.3}));
                      transform: scale(${active ? 1.2 : 1}); transform-origin: bottom center;">
            <svg viewBox="0 0 32 40" width="32" height="40" xmlns="http://www.w3.org/2000/svg">
              <path d="M16 0 C7 0 0 7 0 16 C0 25 16 40 16 40 C16 40 32 25 32 16 C32 7 25 0 16 0 Z"
                    fill="${color}" stroke="${active ? COLORS.charcoal : '#FAF3E1'}" stroke-width="2"/>
              <circle cx="16" cy="15" r="7" fill="#FAF3E1"/>
            </svg>
            <div style="position: absolute; top: 7px; left: 0; right: 0; text-align: center;
                        font-family: 'DM Sans', sans-serif; font-size: ${label.length > 2 ? 9 : 11}px;
                        font-weight: 700; color: ${color}; line-height: 16px;">${label}</div>
          </div>`,
        iconSize: [32, 40],
        iconAnchor: [16, 40],
        popupAnchor: [0, -36],
      });

      const marker = L.marker(s.coords, { icon }).addTo(map);
      const period = formatDateRange(s.startDate, s.endDate) || s.periodLabel || '';
      marker.bindPopup(
        `<strong>${escapeHtml(s.name)}</strong>` +
        (period ? `<br><span style="color:#5A6B8C">${escapeHtml(period)}</span>` : '') +
        (s.score != null ? `<br>Cijfer: ${String(s.score).replace('.', ',')}` : '')
      );
      marker.on('click', () => onSelect(s.id));
      markersRef.current.push(marker);
      pts.push(s.coords);
    });

    if (pts.length === 1) {
      map.setView(pts[0], 9);
    } else if (pts.length > 1) {
      map.fitBounds(L.latLngBounds(pts), { padding: [40, 40], maxZoom: 11 });
    }
  }, [stays, selectedId, ready, onSelect]);

  return (
    <div style={{
      height: 300, borderRadius: 14, overflow: 'hidden',
      border: `1px solid ${COLORS.hairline}`, background: COLORS.creamSoft,
    }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
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
  const [importing, setImporting] = useState(false);
  const [uploadingFor, setUploadingFor] = useState(null);

  const saveTimer = useRef(null);
  const latest = useRef([]);
  // Zolang er lokaal iets niet is opgeslagen mag de focus-refresh niet
  // overschrijven met oudere serverdata (zelfde vangnet als de inpaklijst).
  const dirty = useRef(false);
  const cardRefs = useRef({});

  useEffect(() => { setName(getName()); }, []);

  const load = useCallback(async () => {
    if (dirty.current) return;
    try {
      const data = await fetchStayLog();
      setStays(data.stays || []);
      setUpdatedBy(data.updatedBy ?? null);
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

  const persist = useCallback((next) => {
    latest.current = next;
    dirty.current = true;
    clearTimeout(saveTimer.current);
    setSaving(true);
    saveTimer.current = setTimeout(async () => {
      try {
        const data = await saveStayLog(latest.current, getName());
        setUpdatedBy(data.updatedBy ?? null);
        dirty.current = false;
      } catch {
        // negeer; de volgende wijziging probeert het opnieuw
      } finally {
        setSaving(false);
      }
    }, 600);
  }, []);

  const apply = (next) => {
    setStays(next);
    persist(next);
  };

  const updateStay = (id, patch) => {
    apply(stays.map(s => s.id === id
      ? { ...s, ...patch, updatedAt: new Date().toISOString() }
      : s));
  };

  const addStay = (data) => {
    const now = new Date().toISOString();
    const stay = {
      id: `v_${uid()}`,
      name: data.name,
      locationLabel: data.locationLabel,
      coords: data.coords,
      startDate: data.startDate || null,
      endDate: data.endDate || null,
      periodLabel: data.periodLabel || null,
      tripTitle: null,
      score: data.score ?? null,
      review: data.review || null,
      photos: [],
      source: 'manual',
      createdAt: now,
      updatedAt: now,
    };
    apply([...stays, stay]);
    setAdding(false);
    setExpandedId(stay.id);
    setSelectedId(stay.id);
  };

  const removeStay = async (stay) => {
    const fotoTekst = stay.photos?.length
      ? `\n\nOok de ${stay.photos.length} foto${stay.photos.length === 1 ? '' : "'s"} worden verwijderd.`
      : '';
    if (!window.confirm(`“${stay.name}” uit het logboek verwijderen?${fotoTekst}\n\nDit kan niet ongedaan worden gemaakt.`)) {
      return;
    }
    apply(stays.filter(s => s.id !== stay.id));
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
        const next = latest.current.map(s => s.id === stayId
          ? { ...s, photos: [...(s.photos || []), ...nieuwe], updatedAt: new Date().toISOString() }
          : s);
        apply(next);
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
    const next = stays.map(s => s.id === stayId
      ? { ...s, photos: (s.photos || []).filter(p => p.id !== photo.id) }
      : s);
    apply(next);
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

  // Nieuwste bovenaan; verblijven zonder datum onderaan
  const sorted = useMemo(() => {
    return [...stays].sort((a, b) => {
      const da = a.startDate || a.endDate || '';
      const db = b.startDate || b.endDate || '';
      if (da && db) return db.localeCompare(da);
      if (da) return -1;
      if (db) return 1;
      return (a.name || '').localeCompare(b.name || '');
    });
  }, [stays]);

  const stats = useMemo(() => {
    const scored = stays.filter(s => s.score != null);
    const avg = scored.length
      ? Math.round((scored.reduce((a, s) => a + s.score, 0) / scored.length) * 10) / 10
      : null;
    return {
      total: stays.length,
      onMap: stays.filter(s => Array.isArray(s.coords)).length,
      avg,
    };
  }, [stays]);

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
        <Link href="/" style={S.backLink}>
          <ArrowLeft size={16} /> Planner
        </Link>

        <p style={S.kicker}>Vakantie · Logboek</p>
        <h1 style={S.title}>Waar we zijn geweest</h1>
        <p style={S.sub}>
          Alle verblijven van vroeger en nu op één kaart, met een cijfer en een
          korte review. Zo weet je volgend jaar weer welke camping het waard was.
        </p>

        {error && <div style={S.error}>{error}</div>}

        {stats.total > 0 && (
          <div style={S.statsRow}>
            <div>
              <div style={S.statNum}>{stats.total}</div>
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
              {saving ? 'Opslaan…' : updatedBy ? `Laatst: ${updatedBy}` : ''}
            </div>
          </div>
        )}

        {stats.onMap > 0 && (
          <StayMap stays={stays} selectedId={selectedId} onSelect={onSelectFromMap} />
        )}

        <div style={S.actions}>
          <button style={S.primaryBtn} onClick={() => setAdding(a => !a)}>
            <Plus size={16} /> Verblijf toevoegen
          </button>
          <button style={S.secondaryBtn} onClick={importCurrentTrip} disabled={importing}>
            {importing ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> : <MapPin size={15} />}
            {importing ? 'Bezig…' : 'Huidige reis toevoegen'}
          </button>
        </div>

        {adding && (
          <StayForm
            onSave={addStay}
            onCancel={() => setAdding(false)}
          />
        )}

        {sorted.length === 0 && !adding && (
          <div style={S.empty}>
            <div style={S.emptyTitle}>Nog niets in het logboek</div>
            Voeg de huidige reis toe met de knop hierboven, of zet er met
            “Verblijf toevoegen” een vakantie van vroeger in. Een adres, een
            Google Maps-link of kale coördinaten werken allemaal.
          </div>
        )}

        <div style={S.list}>
          {sorted.map((stay) => (
            <StayCard
              key={stay.id}
              stay={stay}
              selected={stay.id === selectedId}
              expanded={stay.id === expandedId}
              uploading={uploadingFor === stay.id}
              cardRef={(el) => { cardRefs.current[stay.id] = el; }}
              onToggle={() => {
                setExpandedId(id => id === stay.id ? null : stay.id);
                setSelectedId(stay.id);
              }}
              onUpdate={(patch) => updateStay(stay.id, patch)}
              onRemove={() => removeStay(stay)}
              onAddPhotos={(files) => addPhotos(stay.id, files)}
              onRemovePhoto={(photo) => removePhoto(stay.id, photo)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Formulier voor een nieuw verblijf ───────────────────────────────

const StayForm = ({ onSave, onCancel }) => {
  const [name, setName] = useState('');
  const [location, setLocation] = useState(null);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [periodLabel, setPeriodLabel] = useState('');
  const [score, setScore] = useState('');
  const [review, setReview] = useState('');
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
      startDate: startDate || null,
      endDate: endDate || null,
      periodLabel: periodLabel.trim().slice(0, 60) || null,
      score: score === '' ? null : Number(score),
      review: review.trim().slice(0, 2000) || null,
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

      <div style={S.dateRow}>
        <div style={{ flex: 1 }}>
          <label style={S.label}>Van</label>
          <input type="date" style={S.input} value={startDate}
                 onChange={(e) => setStartDate(e.target.value)} />
        </div>
        <div style={{ flex: 1 }}>
          <label style={S.label}>Tot</label>
          <input type="date" style={S.input} value={endDate}
                 onChange={(e) => setEndDate(e.target.value)} />
        </div>
      </div>

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
  stay, selected, expanded, uploading, cardRef,
  onToggle, onUpdate, onRemove, onAddPhotos, onRemovePhoto,
}) => {
  const fileRef = useRef(null);
  const period = formatDateRange(stay.startDate, stay.endDate) || stay.periodLabel || null;

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
            {period || 'Datum onbekend'}
            {stay.tripTitle ? ` · ${stay.tripTitle}` : ''}
            {!stay.coords ? ' · geen locatie' : ''}
          </div>
        </div>
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
            onChange={(loc) => onUpdate({
              coords: loc?.coords || null,
              locationLabel: loc?.fullName || loc?.label || null,
            })}
            placeholder="Zoek een plek of plak een Maps-link"
          />

          <div style={S.dateRow}>
            <div style={{ flex: 1 }}>
              <label style={S.label}>Van</label>
              <input type="date" style={S.input} value={stay.startDate || ''}
                     onChange={(e) => onUpdate({ startDate: e.target.value || null })} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={S.label}>Tot</label>
              <input type="date" style={S.input} value={stay.endDate || ''}
                     onChange={(e) => onUpdate({ endDate: e.target.value || null })} />
            </div>
          </div>

          <label style={S.label}>Of los uit het hoofd</label>
          <input
            style={S.input}
            value={stay.periodLabel || ''}
            onChange={(e) => onUpdate({ periodLabel: e.target.value.slice(0, 60) || null })}
            placeholder="Bv. “zomer 2003”"
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
  saveState: { fontSize: 11, color: COLORS.inkLight },
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
