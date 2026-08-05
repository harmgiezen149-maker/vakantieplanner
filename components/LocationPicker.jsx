'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, MapPin, Search, Loader2 } from 'lucide-react';
import { COLORS } from '@/lib/data';
import {
  COORDS_RE, isGoogleMapsUrl, isShortMapsUrl, parseMapsUrlClient,
  apiGeocode, apiResolveMaps,
} from '@/lib/maps';

// Locatieveld met vier manieren van invoeren:
//   1. kale coördinaten ("48.12345, 6.65432")
//   2. een volledige Google Maps-URL
//   3. een korte maps.app.goo.gl-link (via /api/resolve-maps)
//   4. een gewone zoekterm (via /api/geocode → Nominatim)
//
// value: { label, coords: [lat,lng] } | null
// onChange krijgt { label, coords, fullName } of null bij wissen.
const LocationPicker = ({ value, onChange, accentColor = COLORS.forest, placeholder }) => {
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

  // Pas een herkende plek (uit link/coördinaten) direct toe
  const applyParsed = ({ name, coords }) => {
    const label = name || `${coords[0].toFixed(5)}, ${coords[1].toFixed(5)}`;
    setQuery(label);
    setPickedCoords(coords);
    setShowResults(false);
    setResults([]);
    setLoading(false);
    onChange({ label, coords, fullName: name || label });
  };

  const onChangeText = async (txt) => {
    setQuery(txt);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (pickedCoords && txt !== value?.label) setPickedCoords(null);

    // 1. Kale coördinaten geplakt ("48.12345, 6.65432")
    const cm = COORDS_RE.exec(txt);
    if (cm) {
      applyParsed({ name: null, coords: [Number(cm[1]), Number(cm[2])] });
      return;
    }

    // 2. Google Maps-link geplakt
    if (isGoogleMapsUrl(txt)) {
      setShowResults(false);
      setResults([]);
      const direct = parseMapsUrlClient(txt);
      if (direct.coords) {
        applyParsed(direct);
        return;
      }
      if (isShortMapsUrl(txt)) {
        // Korte link → server lost de redirect op
        setLoading(true);
        try {
          const data = await apiResolveMaps(txt.trim());
          applyParsed(data);
        } catch {
          setLoading(false);
          setQuery('');
          window.alert('Kon deze Maps-link niet uitlezen. Open de link in je browser en plak de volledige URL uit de adresbalk, of plak de coördinaten (rechtsklik op de plek in Google Maps).');
        }
        return;
      }
      window.alert('Geen locatie gevonden in deze link. Plak de volledige Maps-URL van een plek, of de coördinaten.');
      return;
    }

    // 3. Gewone zoekterm
    setShowResults(true);
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

export default LocationPicker;
