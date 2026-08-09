'use client';

// "Wat is hier?" — zoekt op je huidige locatie naar plekken in de buurt, en
// zet er in één keer een bezochte activiteit van.
//
// Bedoeld voor onderweg: je staat ergens, je vindt het de moeite waard, en je
// wilt het vastleggen zonder eerst op de kaart te zoeken. Het antwoord komt
// van /api/suggest — dezelfde route als "Ontdek de omgeving", alleen met je
// eigen positie als middelpunt in plaats van een verblijf.

import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, MapPin, Check, Crosshair, RefreshCw } from 'lucide-react';
import { COLORS, CATEGORIES } from '@/lib/data';
import { getPin } from '@/lib/maps';
import Sheet, { labelStyle, inputBaseStyle } from '@/components/planner/Sheet';

// Klein genoeg dat je alleen ziet wat je te voet kunt bereiken, groot genoeg
// dat een camping buiten het dorp ook het dorp vindt.
const STRAAL_M = 3000;

export default function InDeBuurtSheet({ days, onCreate, onClose }) {
  const [staat, setStaat] = useState('locatie');  // locatie | zoeken | lijst | fout
  const [fout, setFout] = useState('');
  const [positie, setPositie] = useState(null);
  const [plekken, setPlekken] = useState([]);
  const [gekozenDag, setGekozenDag] = useState(() => standaardDag(days));
  const [bezig, setBezig] = useState(null);
  const [toegevoegd, setToegevoegd] = useState([]);

  const zoek = useCallback(async (coords) => {
    setStaat('zoeken');
    try {
      const [lat, lng] = coords;
      const res = await fetch(
        `/api/suggest?lat=${lat}&lng=${lng}&radius=${STRAAL_M}`,
        { headers: { 'X-Family-Pin': getPin() }, cache: 'no-store' },
      );
      if (!res.ok) throw new Error(res.status === 429 ? 'te_druk' : `HTTP ${res.status}`);
      const data = await res.json();
      setPlekken(data.suggestions || []);
      setStaat('lijst');
    } catch (e) {
      setFout(e.message === 'te_druk'
        ? 'Even te veel zoekopdrachten achter elkaar. Probeer het over een minuutje nog eens.'
        : 'Zoeken lukte niet. De kaartendienst is soms even onbereikbaar.');
      setStaat('fout');
    }
  }, []);

  const bepaalPositie = useCallback(() => {
    setFout('');
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setFout('Deze browser geeft je locatie niet door.');
      setStaat('fout');
      return;
    }
    setStaat('locatie');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords = [pos.coords.latitude, pos.coords.longitude];
        setPositie(coords);
        zoek(coords);
      },
      (err) => {
        // Toestemming geweigerd is iets anders dan "lukt niet" — dat wil je
        // weten, want het is met één tik op te lossen in de browserinstellingen.
        setFout(err?.code === 1
          ? 'Geen toestemming voor je locatie. Zet dat aan in de browser en probeer opnieuw.'
          : 'Je locatie kon niet worden bepaald. Sta je binnen? Even naar buiten helpt vaak.');
        setStaat('fout');
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 60_000 },
    );
  }, [zoek]);

  useEffect(() => { bepaalPositie(); }, [bepaalPositie]);

  const voegToe = async (plek) => {
    setBezig(plek.name);
    try {
      await onCreate({
        name: plek.name,
        emoji: plek.emoji || '📍',
        category: CATEGORIES[plek.category] ? plek.category : 'custom',
        coords: plek.coords,
        note: plek.label || null,
      }, gekozenDag);
      setToegevoegd(t => [...t, plek.name]);
    } finally {
      setBezig(null);
    }
  };

  return (
    <Sheet onClose={onClose} title="Wat is hier in de buurt?">
      <div style={{ padding: '14px 20px 26px' }}>

        {staat === 'locatie' && (
          <div style={S.bezig}>
            <Crosshair size={16} /> Je locatie bepalen…
          </div>
        )}

        {staat === 'zoeken' && (
          <div style={S.bezig}>
            <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
            Zoeken binnen {STRAAL_M / 1000} km…
          </div>
        )}

        {staat === 'fout' && (
          <>
            <p style={S.fout}>{fout}</p>
            <button onClick={bepaalPositie} style={S.primair}>
              <RefreshCw size={15} /> Opnieuw proberen
            </button>
          </>
        )}

        {staat === 'lijst' && (
          <>
            {positie && (
              <p style={S.positie}>
                <MapPin size={12} /> {positie[0].toFixed(4)}, {positie[1].toFixed(4)}
                <button onClick={bepaalPositie} style={S.opnieuw} title="Opnieuw bepalen">
                  <RefreshCw size={11} />
                </button>
              </p>
            )}

            {days.length > 0 && (
              <>
                <label style={labelStyle}>Toevoegen aan dag</label>
                <select
                  value={gekozenDag || ''}
                  onChange={(e) => setGekozenDag(e.target.value || null)}
                  style={{ ...inputBaseStyle, marginTop: 6, marginBottom: 14 }}
                >
                  <option value="">Alleen in de bibliotheek</option>
                  {days.map(d => (
                    <option key={d.key} value={d.key}>
                      {d.dayShort} {d.date}{d.stay?.name ? ` — ${d.stay.name}` : ''}
                    </option>
                  ))}
                </select>
              </>
            )}

            {plekken.length === 0 ? (
              <p style={S.leeg}>
                Niets gevonden binnen {STRAAL_M / 1000} km. Dat kan echt zo zijn,
                maar vaker is het de kaartendienst die even niet meewerkt.
              </p>
            ) : (
              <ul style={S.lijst}>
                {plekken.map((plek, i) => {
                  const gedaan = toegevoegd.includes(plek.name);
                  return (
                    <li key={`${plek.name}-${i}`}>
                      <button
                        onClick={() => voegToe(plek)}
                        disabled={gedaan || bezig !== null}
                        style={{ ...S.plek, ...(gedaan ? S.plekGedaan : {}) }}
                      >
                        <span style={S.plekEmoji}>{plek.emoji || '📍'}</span>
                        <span style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                          <span style={S.plekNaam}>{plek.name}</span>
                          <span style={S.plekMeta}>
                            {[plek.label, plek.distKm != null && `${plek.distKm} km`]
                              .filter(Boolean).join(' · ')}
                          </span>
                        </span>
                        {gedaan
                          ? <Check size={16} color={COLORS.moss} />
                          : bezig === plek.name
                            ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} />
                            : <span style={S.plus}>+</span>}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}

            <p style={S.uitleg}>
              Wat je hier toevoegt staat meteen als <b>bezocht</b> aangevinkt — je
              bent er tenslotte. Bij het verblijf verschijnt het via “Bijwerken uit
              de planning”.
            </p>
          </>
        )}
      </div>
    </Sheet>
  );
}

// Vandaag als die dag in de reis valt; anders de eerste dag. Zo hoef je meestal
// niets te kiezen.
function standaardDag(days) {
  if (!days?.length) return null;
  const vandaag = new Date().toISOString().slice(0, 10);
  return days.some(d => d.key === vandaag) ? vandaag : days[0].key;
}

const S = {
  bezig: {
    display: 'flex', alignItems: 'center', gap: 10,
    color: COLORS.ink, fontSize: 14, padding: '10px 0',
  },
  fout: { fontSize: 14, color: COLORS.ink, lineHeight: 1.6, margin: '0 0 14px' },
  positie: {
    display: 'flex', alignItems: 'center', gap: 5,
    fontSize: 11.5, color: COLORS.inkLight, margin: '0 0 14px',
  },
  opnieuw: {
    border: 'none', background: 'transparent', cursor: 'pointer',
    color: COLORS.lake, padding: 2, display: 'inline-flex',
  },
  leeg: { fontSize: 13, color: COLORS.inkLight, lineHeight: 1.55 },
  lijst: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 },
  plek: {
    display: 'flex', alignItems: 'center', gap: 10, width: '100%',
    padding: '11px 12px', background: COLORS.creamSoft,
    borderWidth: 1, borderStyle: 'solid', borderColor: COLORS.hairline,
    borderRadius: 11, cursor: 'pointer',
    fontFamily: "'DM Sans', sans-serif",
  },
  plekGedaan: { opacity: 0.6, cursor: 'default', borderColor: `${COLORS.moss}66` },
  plekEmoji: { fontSize: 18 },
  plekNaam: {
    display: 'block', fontSize: 14, fontWeight: 500, color: COLORS.charcoal,
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  },
  plekMeta: { display: 'block', fontSize: 11.5, color: COLORS.inkLight, marginTop: 1 },
  plus: { fontSize: 18, color: COLORS.forest, fontWeight: 600, lineHeight: 1 },
  primair: {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '11px 15px', borderRadius: 999, border: 'none',
    background: COLORS.forest, color: COLORS.cream,
    fontFamily: "'DM Sans', sans-serif", fontSize: 13.5, fontWeight: 600,
    cursor: 'pointer',
  },
  uitleg: {
    fontSize: 11.5, color: COLORS.inkLight, lineHeight: 1.55,
    margin: '16px 0 0',
  },
};
