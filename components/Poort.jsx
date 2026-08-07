'use client';

// De inlogpoort, in twee smaken.
//
// Hij stond eerst als `PinGate` binnenin components/Planner.jsx, en dat was
// precies het probleem: alleen het beginscherm kon om een PIN vragen. Elke
// andere pagina las hem uit localStorage en ging ervan uit dat hij er stond.
// Wie /reservekopie opende op een apparaat dat nooit via / binnenkwam — een
// tweede browser, de geïnstalleerde app naast de browser — kreeg 401's zonder
// enige manier om alsnog in te loggen.
//
// Daarom staat hij hier, als wrapper die elke pagina om zich heen kan zetten.

import React, { useState, useEffect, useCallback } from 'react';
import { Lock, AlertCircle, ShieldCheck } from 'lucide-react';
import { COLORS } from '@/lib/data';
import { getPin, setPin } from '@/lib/maps';

// ── Beheercode: zelfde idee als de PIN, andere sleutel ──────────────
export const getBeheerCode = () => {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem('planner-beheer') || '';
};
export const setBeheerCode = (code) => {
  if (typeof window === 'undefined') return;
  localStorage.setItem('planner-beheer', code);
};

// Headers voor een beheer-aanroep: de PIN én de beheercode.
export const beheerHeaders = (extra = {}) => ({
  'X-Family-Pin': getPin(),
  'X-Beheer-Code': getBeheerCode(),
  ...extra,
});

// ── Het formulier ───────────────────────────────────────────────────

function Formulier({ soort, waarde, setWaarde, fout, bezig, onSubmit }) {
  const beheer = soort === 'beheer';
  return (
    <div style={S.scherm}>
      <div style={S.kaart}>
        <div style={S.icoon}>
          {beheer ? <ShieldCheck size={22} /> : <Lock size={22} />}
        </div>
        <h1 style={S.titel}>{beheer ? 'Beheer' : 'Familie-PIN'}</h1>
        <p style={S.uitleg}>
          {beheer
            ? 'Deze pagina kan reservekopieën terugzetten en gegevens wissen. Voer het beheerderswachtwoord in.'
            : 'Deze planner is alleen voor het gezin. Voer de gedeelde PIN in om verder te gaan.'}
        </p>
        <input
          type="password"
          value={waarde}
          onChange={(e) => setWaarde(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onSubmit()}
          placeholder={beheer ? 'Wachtwoord' : 'PIN'}
          autoFocus
          style={S.invoer}
        />
        {fout && (
          <div style={S.fout}><AlertCircle size={14} /> {fout}</div>
        )}
        <button
          onClick={onSubmit}
          disabled={bezig || !waarde.trim()}
          style={{
            ...S.knop,
            background: waarde.trim() ? COLORS.forest : COLORS.hairline,
            color: waarde.trim() ? COLORS.cream : COLORS.inkLight,
            cursor: waarde.trim() ? 'pointer' : 'not-allowed',
          }}
        >
          {bezig ? 'Controleren…' : 'Verder'}
        </button>
      </div>
    </div>
  );
}

// ── PinPoort: staat er iets achter de familie-PIN? ──────────────────
// `controle` is de URL die bevraagd wordt om te kijken of de PIN klopt.
// Standaard /api/plan, want die bestaat altijd.

export function PinPoort({ children, controle = '/api/plan' }) {
  const [status, setStatus] = useState('bezig'); // bezig | dicht | open
  const [waarde, setWaarde] = useState('');
  const [fout, setFout] = useState('');
  const [bezig, setBezig] = useState(false);

  const probeer = useCallback(async (pin) => {
    const res = await fetch(controle, {
      headers: { 'X-Family-Pin': pin },
      cache: 'no-store',
    });
    return res.status !== 401;
  }, [controle]);

  // Bij het laden meteen kijken of de opgeslagen PIN nog voldoet. Staat er
  // niets, dan is dat ook een geldig antwoord: zonder FAMILY_PIN is alles open.
  useEffect(() => {
    let weg = false;
    (async () => {
      try {
        const ok = await probeer(getPin());
        if (!weg) setStatus(ok ? 'open' : 'dicht');
      } catch {
        // Netwerkfout is geen weigering — laat de pagina zelf zijn gang gaan,
        // die heeft een eigen foutmelding.
        if (!weg) setStatus('open');
      }
    })();
    return () => { weg = true; };
  }, [probeer]);

  const submit = async () => {
    const pin = waarde.trim();
    if (!pin) return;
    setBezig(true);
    setFout('');
    try {
      if (await probeer(pin)) {
        setPin(pin);
        setStatus('open');
      } else {
        setFout('PIN klopt niet');
      }
    } catch {
      setFout('Netwerkfout');
    } finally {
      setBezig(false);
    }
  };

  if (status === 'bezig') return <div style={S.wachten} />;
  if (status === 'open') return children;
  return (
    <Formulier soort="pin" waarde={waarde} setWaarde={setWaarde}
      fout={fout} bezig={bezig} onSubmit={submit} />
  );
}

// ── BeheerPoort: de tweede laag, bovenop de PIN ─────────────────────
// Controleert tegen /api/backup, want dat is de route die beheer vereist.
// Antwoordt die met `slot: 'pin'`, dan is niet het wachtwoord het probleem
// maar de PIN — dan tonen we die poort.

export function BeheerPoort({ children }) {
  const [status, setStatus] = useState('bezig'); // bezig | pin | beheer | open
  const [waarde, setWaarde] = useState('');
  const [fout, setFout] = useState('');
  const [bezig, setBezig] = useState(false);

  // Vraagt /api/backup met een PIN en een code, en leest uit het antwoord
  // wélk slot er dicht zat. Zo hoeft deze poort maar één state-machine te zijn
  // in plaats van twee die elkaar in de weg zitten.
  const probeer = useCallback(async (pin, code) => {
    const res = await fetch('/api/backup', {
      headers: { 'X-Family-Pin': pin, 'X-Beheer-Code': code },
      cache: 'no-store',
    });
    // 501 = geen Blob ingesteld. Dat is geen weigering; de toegang klopte.
    if (res.status !== 401) return 'open';
    const info = await res.json().catch(() => ({}));
    return info?.slot === 'pin' ? 'pin' : 'beheer';
  }, []);

  useEffect(() => {
    let weg = false;
    (async () => {
      try {
        const uit = await probeer(getPin(), getBeheerCode());
        if (!weg) setStatus(uit);
      } catch {
        if (!weg) setStatus('open');
      }
    })();
    return () => { weg = true; };
  }, [probeer]);

  const submit = async () => {
    const ingevoerd = waarde.trim();
    if (!ingevoerd) return;
    setBezig(true);
    setFout('');
    try {
      // Wat de gebruiker intypt hoort bij het slot dat nú dicht is.
      const pin = status === 'pin' ? ingevoerd : getPin();
      const code = status === 'pin' ? getBeheerCode() : ingevoerd;
      const uit = await probeer(pin, code);

      if (status === 'pin') {
        if (uit === 'pin') { setFout('PIN klopt niet'); return; }
        // De PIN klopt; bewaren en doorschuiven naar het volgende slot.
        setPin(pin);
        setWaarde('');
        setStatus(uit);           // 'beheer' of 'open'
        return;
      }

      if (uit === 'open') {
        setBeheerCode(code);
        setStatus('open');
      } else if (uit === 'pin') {
        setWaarde('');
        setStatus('pin');
      } else {
        setFout('Wachtwoord klopt niet');
      }
    } catch {
      setFout('Netwerkfout');
    } finally {
      setBezig(false);
    }
  };

  if (status === 'bezig') return <div style={S.wachten} />;
  if (status === 'open') return children;
  return (
    <Formulier soort={status} waarde={waarde} setWaarde={setWaarde}
      fout={fout} bezig={bezig} onSubmit={submit} />
  );
}

const S = {
  wachten: { minHeight: '100vh', background: COLORS.cream },
  scherm: {
    minHeight: '100vh', background: COLORS.cream,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: 20,
  },
  kaart: {
    maxWidth: 360, width: '100%',
    background: COLORS.creamSoft,
    borderRadius: 20, padding: 28,
    boxShadow: '0 6px 24px rgba(31,41,34,0.08)',
    border: `1px solid ${COLORS.hairline}`,
  },
  icoon: {
    width: 48, height: 48, borderRadius: 12,
    background: COLORS.forest, color: COLORS.cream,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    marginBottom: 16,
  },
  titel: {
    fontFamily: "'Fraunces', serif", fontSize: 24, margin: '0 0 6px',
    color: COLORS.forest, fontWeight: 500, letterSpacing: '-0.01em',
  },
  uitleg: { color: COLORS.ink, fontSize: 13, margin: '0 0 18px', lineHeight: 1.5 },
  invoer: {
    width: '100%', padding: 14, background: COLORS.cream,
    border: `1px solid ${COLORS.hairline}`, borderRadius: 10,
    fontSize: 16, fontFamily: "'DM Sans', sans-serif",
    color: COLORS.charcoal, boxSizing: 'border-box',
  },
  fout: {
    marginTop: 10, fontSize: 12, color: '#B5443B',
    display: 'flex', alignItems: 'center', gap: 6,
  },
  knop: {
    marginTop: 16, width: '100%', padding: 14,
    border: 'none', borderRadius: 10, fontWeight: 600,
    fontFamily: "'DM Sans', sans-serif", fontSize: 14,
  },
};
