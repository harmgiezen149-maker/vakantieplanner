'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, MapPin, Search, Loader2 } from 'lucide-react';
import { COLORS } from '@/lib/data';
import {
  COORDS_RE, isGoogleMapsUrl, isShortMapsUrl, parseMapsUrlClient,
  apiGeocode, apiResolveMaps, extractUrl, labelBeforeUrl,
} from '@/lib/maps';

const uitwegKnop = (kleur) => ({
  padding: '5px 10px', borderRadius: 7,
  border: `1px solid ${kleur}`, background: 'transparent', color: kleur,
  fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 600,
  cursor: 'pointer', lineHeight: 1.3,
});

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
  // Wat er onder het veld staat nadat een link is uitgelezen: óf een geruststelling
  // ("bij benadering, opgezocht bij dit adres"), óf een uitweg als het misging.
  const [bericht, setBericht] = useState(null);
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
  const applyParsed = ({ name, coords, bron, adres }) => {
    const label = name || `${coords[0].toFixed(5)}, ${coords[1].toFixed(5)}`;
    setQuery(label);
    setPickedCoords(coords);
    setShowResults(false);
    setResults([]);
    setLoading(false);
    // Kwam het coördinaat uit een adres-zoekopdracht in plaats van uit de link
    // zelf, dan zeggen we dat erbij. Een speld die stilletjes een straat
    // verderop staat is erger dan een speld met een bijschrift.
    setBericht(bron === 'adres'
      ? { soort: 'benadering', adres }
      : null);
    onChange({ label, coords, fullName: name || label });
  };

  const onChangeText = async (txt) => {
    setQuery(txt);
    setBericht(null);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (pickedCoords && txt !== value?.label) setPickedCoords(null);

    // 1. Kale coördinaten geplakt ("48.12345, 6.65432")
    const cm = COORDS_RE.exec(txt);
    if (cm) {
      applyParsed({ name: null, coords: [Number(cm[1]), Number(cm[2])] });
      return;
    }

    // 2. Google Maps-link geplakt. De app plakt de naam mee vóór de link,
    //    dus we vissen de URL uit de tekst in plaats van te eisen dat het
    //    hele veld één kale URL is.
    const link = extractUrl(txt);
    if (link && isGoogleMapsUrl(link)) {
      setShowResults(false);
      setResults([]);
      const naamHint = labelBeforeUrl(txt);
      const direct = parseMapsUrlClient(link);
      if (direct.coords) {
        applyParsed({ ...direct, name: direct.name || naamHint });
        return;
      }
      if (isShortMapsUrl(link)) {
        // Korte link → server lost de redirect op
        setLoading(true);
        try {
          const data = await apiResolveMaps(link, naamHint);
          applyParsed({ ...data, name: data.name || naamHint });
        } catch (e) {
          setLoading(false);
          // Het veld NIET leegmaken: je geplakte link is het enige wat je hebt
          // om mee verder te kunnen, dus die laten we staan. En de uitweg is
          // een knop in het formulier, geen systeempopup die je opdraagt het
          // zelf maar uit te zoeken.
          const d = e?.detail || {};
          setBericht({
            soort: 'mislukt',
            openen: d.finalUrl && d.finalUrl !== link ? d.finalUrl : link,
            naam: d.naam || naamHint || null,
            diagnose: [
              e?.message || 'onbekend',
              d.hops ? `${d.hops} stap${d.hops === 1 ? '' : 'pen'}` : null,
              d.status ? `status ${d.status}` : null,
            ].filter(Boolean).join(' · '),
          });
        }
        return;
      }
      setBericht({ soort: 'mislukt', openen: link, naam: naamHint || null, diagnose: 'geen plek in deze link' });
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
    // address komt uit Nominatim (addressdetails=1) en bevat o.a. het land.
    // Het verblijvenlogboek leidt daar het land uit af zonder extra verzoek;
    // de planner negeert het veld.
    onChange({ label: r.shortName, coords, fullName: r.name, address: r.address || null });
  };

  const onClear = () => {
    setQuery(''); setPickedCoords(null); setResults([]); setShowResults(false);
    setBericht(null);
    onChange(null);
  };

  // Laatste uitweg als het uitlezen mislukte maar we wél een naam hebben:
  // die gewoon als zoekterm behandelen. Vaak staat de plek gewoon in OSM.
  const zoekOpNaam = (naam) => {
    setBericht(null);
    setQuery(naam);
    setShowResults(true);
    doSearch(naam);
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
          onPaste={(e) => {
            // Een invoerveld van één regel plakt regeleindes weg, terwijl de
            // Maps-app juist "naam \n adres \n link" meestuurt. Lees daarom de
            // ruwe kleminhoud, dan blijft de naam los van het adres.
            const ruw = e.clipboardData?.getData('text');
            if (ruw && ruw.includes('\n') && extractUrl(ruw)) {
              e.preventDefault();
              onChangeText(ruw);
            }
          }}
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

      {pickedCoords && !showResults && bericht?.soort !== 'benadering' && (
        <div style={{
          marginTop: 6, fontSize: 11,
          color: accentColor, display: 'flex', alignItems: 'center', gap: 4,
        }}>
          <MapPin size={11} /> Locatie ingesteld
        </div>
      )}

      {/* De link gaf geen coördinaten prijs, dus is de plek bij het adres
          opgezocht. Dat adres erbij zetten is het verschil tussen een speld
          die je kunt controleren en een speld die je maar moet geloven. */}
      {bericht?.soort === 'benadering' && (
        <div style={{
          marginTop: 6, padding: '7px 9px', borderRadius: 8,
          background: 'rgba(58, 126, 132, 0.10)',
          fontSize: 11, color: COLORS.lake, lineHeight: 1.45,
        }}>
          <b>Locatie bij benadering.</b> De link zelf gaf geen coördinaten, dus is
          er gezocht op{bericht.adres ? ` ${bericht.adres}` : ' de naam'}. Controleer
          de speld even op de kaart.
        </div>
      )}

      {/* Mislukt: geen systeempopup maar een uitweg in het formulier zelf. */}
      {bericht?.soort === 'mislukt' && (
        <div style={{
          marginTop: 6, padding: '9px 10px', borderRadius: 8,
          background: 'rgba(201, 125, 93, 0.12)',
          fontSize: 11.5, color: COLORS.sunset, lineHeight: 1.5,
        }}>
          Kon deze link niet uitlezen.
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 7 }}>
            {bericht.naam && (
              <button
                type="button"
                onClick={() => zoekOpNaam(bericht.naam)}
                style={uitwegKnop(accentColor)}
              >Zoek op naam</button>
            )}
            <a
              href={bericht.openen}
              target="_blank"
              rel="noreferrer"
              style={{ ...uitwegKnop(COLORS.inkLight), textDecoration: 'none' }}
            >Openen in Maps</a>
          </div>
          <div style={{ marginTop: 6, fontSize: 10.5, opacity: 0.8 }}>
            Open je hem in Maps, wacht dan tot de kaart er staat en plak de URL uit
            de adresbalk hier terug. [{bericht.diagnose}]
          </div>
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
