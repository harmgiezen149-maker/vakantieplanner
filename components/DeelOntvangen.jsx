'use client';

// Landingsplek voor een plek die vanuit een andere app is gedeeld — in de
// praktijk de Google Maps-app: Delen → Vakantieplanner.
//
// Het manifest wijst hier met een `share_target` naartoe (methode GET, want een
// POST-doel vereist een service worker en die willen we bewust niet — valkuil
// 19). De telefoon zet dan ?title=&text=&url= achter deze pagina.
//
// Er zijn drie bestemmingen, want een camping is iets anders dan een uitje, en
// een uitje van vroeger iets anders dan een idee voor straks:
//
//   "bij mijn ideeën"  → customActivities, hier ter plekke opgeslagen
//   "als verblijf"     → door naar /verblijven met het formulier voorgevuld
//   "bij een verblijf" → door naar /verblijven in kiesstand, en dan als bezoek
//                        aan een verblijf dat er al staat — ook eentje van 2019
//
// Dat tweede sturen we door in plaats van hier een tweede verblijfformulier te
// bouwen. Het logboek heeft er al een, met datums, soort, cijfer en review, en
// een eigen opslagpad ernaast zou volgens valkuil 4 vroeg of laat uit elkaar
// lopen met dat van StayLog. Foto's kun je daar bovendien pas toevoegen nadat
// het verblijf bestaat — dus je wilt er tóch eindigen.
//
// Wat hij niet doet: vragen op wélke dag het moet. Een activiteit komt in de
// bibliotheek en die sleep je daarna in de planner op een dag. Een dagkeuze
// hier zou de snelste weg — delen en klaar — weer traag maken.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ChevronLeft, Loader2, MapPin, Check, ExternalLink, Tent, Lightbulb, Footprints } from 'lucide-react';
import { COLORS } from '@/lib/data';
import {
  getPin, extractUrl, labelBeforeUrl, isGoogleMapsUrl,
  parseMapsUrlClient, apiResolveMaps,
} from '@/lib/maps';
import { plekNaarParams } from '@/lib/deelPlek';

export default function DeelOntvangen() {
  const params = useSearchParams();
  const [status, setStatus] = useState('bezig'); // bezig | klaar | mislukt | opgeslagen
  const [plek, setPlek] = useState(null);
  const [fout, setFout] = useState(null);
  const [bezigMetOpslaan, setBezigMetOpslaan] = useState(false);
  // De gedeelde tekst één keer verwerken: React 19 draait effecten in
  // strict mode dubbel, en dat zou twee keer /api/resolve-maps aanroepen.
  const gedaan = useRef(false);

  // De drie velden die een deelactie kan meesturen aan elkaar plakken. Welke
  // gevuld zijn verschilt per app: Maps zet de naam in `title` en de link in
  // `text` of in `url`, afhankelijk van de Android-versie.
  const gedeeld = [params.get('title'), params.get('text'), params.get('url')]
    .filter(Boolean)
    .join('\n');

  useEffect(() => {
    if (gedaan.current) return;
    gedaan.current = true;

    (async () => {
      if (!gedeeld.trim()) { setStatus('mislukt'); setFout({ reden: 'leeg' }); return; }

      const link = extractUrl(gedeeld);
      const naamHint = labelBeforeUrl(gedeeld) || params.get('title') || null;

      // Geen link erin? Dan is de gedeelde tekst zelf de zoekterm — daar kan de
      // gebruiker in de planner mee verder.
      if (!link) {
        setPlek({ naam: gedeeld.trim().slice(0, 80), coords: null, zoekterm: true });
        setStatus('klaar');
        return;
      }

      // Een volledige Maps-URL lezen we hier uit, zonder de server lastig te
      // vallen — precies zoals het locatieveld dat doet.
      const direct = parseMapsUrlClient(link);
      if (direct.coords) {
        setPlek({
          naam: direct.name || naamHint || 'Gedeelde plek',
          coords: direct.coords, bron: 'link', link,
        });
        setStatus('klaar');
        return;
      }

      if (!isGoogleMapsUrl(link)) {
        setStatus('mislukt');
        setFout({ reden: 'geen-maps', openen: link });
        return;
      }

      try {
        const data = await apiResolveMaps(link, naamHint);
        setPlek({
          naam: data.name || naamHint || 'Gedeelde plek',
          coords: data.coords,
          adres: data.adres || data.description || null,
          bron: data.bron,
          // Bewust de korte link die je deelde en niet data.finalUrl: die
          // laatste is een regel of drie lang, en deze opent dezelfde plek.
          link,
        });
        setStatus('klaar');
      } catch (e) {
        const d = e?.detail || {};
        setStatus('mislukt');
        setFout({
          reden: 'onleesbaar',
          openen: d.finalUrl && d.finalUrl !== link ? d.finalUrl : link,
          naam: d.naam || naamHint || null,
          diagnose: [e?.message || 'onbekend', d.status ? `status ${d.status}` : null]
            .filter(Boolean).join(' · '),
        });
      }
    })();
  }, [gedeeld, params]);

  // Opslaan volgt dezelfde twee regels als /dag: tripConfig en
  // suggestExclusions gaan NIET mee zodat de route ze uit de opgeslagen staat
  // terughaalt (valkuil 3), en basisVersie gaat wél mee zodat een botsing
  // zichtbaar wordt (valkuil 4).
  //
  // Wat hier ánders is dan elders: bij een 409 tonen we géén keuzebalk. Die
  // vraagt "hun versie of de jouwe", en dat is hier een valse keuze — een idee
  // toevoegen gooit niets van een ander weg. Het enige dat ontbreekt is een
  // verse basis, dus die halen we op en we proberen het nog één keer.
  const bewaar = useCallback(async () => {
    if (!plek?.coords) return;
    setBezigMetOpslaan(true);

    const nieuw = {
      id: `custom_${Date.now()}`,
      name: plek.naam,
      category: 'custom',
      emoji: '📍',
      coords: plek.coords,
      note: plek.adres || null,
      custom: true,
    };

    try {
      for (let poging = 0; poging < 2; poging++) {
        const huidig = await fetch('/api/plan', {
          headers: { 'X-Family-Pin': getPin() }, cache: 'no-store',
        }).then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); });

        const res = await fetch('/api/plan', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'X-Family-Pin': getPin() },
          body: JSON.stringify({
            plan: huidig.plan || {},
            customActivities: [...(huidig.customActivities || []), nieuw],
            locationOverrides: huidig.locationOverrides || {},
            updatedBy: (typeof window !== 'undefined' && localStorage.getItem('planner-name')) || null,
            basisVersie: huidig.updatedAt,
          }),
        });
        if (res.status === 409) continue;
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        setStatus('opgeslagen');
        return;
      }
      throw new Error('druk bezig — probeer het zo nog eens');
    } catch (e) {
      setFout({ reden: 'opslaan', diagnose: e?.message || 'onbekend' });
      setStatus('mislukt');
    } finally {
      setBezigMetOpslaan(false);
    }
  }, [plek]);

  return (
    <div style={S.pagina}>
      <Link href="/" style={S.terug}><ChevronLeft size={15} /> Planner</Link>
      <div style={S.kop}>Gedeeld met de planner</div>

      {status === 'bezig' && (
        <div style={S.kaart}>
          <Loader2 size={16} style={{ animation: 'spin 1s linear infinite', color: COLORS.inkLight }} />
          <span style={{ fontSize: 13, color: COLORS.ink }}>Locatie opzoeken…</span>
        </div>
      )}

      {status === 'klaar' && plek && (
        <div style={S.kaart}>
          <div style={{ width: '100%' }}>
            <div style={S.naam}>{plek.naam}</div>
            {plek.adres && <div style={S.adres}>{plek.adres}</div>}
            {plek.coords && (
              <div style={S.coords}>
                <MapPin size={11} /> {plek.coords[0].toFixed(5)}, {plek.coords[1].toFixed(5)}
              </div>
            )}
            {plek.bron === 'adres' && (
              <div style={S.benadering}>
                <b>Bij benadering.</b> De link gaf geen coördinaten, dus is er op het
                adres gezocht. Controleer de speld straks even op de kaart.
              </div>
            )}
            {plek.zoekterm && (
              <div style={S.benadering}>
                Hier zat geen kaartlink in. Zoek de plek op in de planner — de tekst
                staat hierboven.
              </div>
            )}

            {plek.coords ? (
              <div style={S.keuze}>
                <button onClick={bewaar} disabled={bezigMetOpslaan} style={S.knop}>
                  {bezigMetOpslaan
                    ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} />
                    : <><Lightbulb size={15} /> Bij mijn ideeën</>}
                </button>
                {/* Doorsturen in plaats van hier een tweede verblijfformulier:
                    het logboek heeft er al een, mét datums, soort en cijfer. */}
                <Link
                  href={`/verblijven?${plekNaarParams({
                    naam: plek.naam,
                    coords: plek.coords,
                    label: plek.adres,
                    website: plek.link,
                  })}`}
                  style={{ ...S.knop, ...S.knopTweede, textDecoration: 'none' }}
                ><Tent size={15} /> Als verblijf</Link>
                {/* De derde weg: aanhaken bij een verblijf dat er al staat. Voor
                    een camping van vroeger is dit de enige — daar valt niets uit
                    een planning te halen, die heeft nooit bestaan. */}
                <Link
                  href={`/verblijven?${plekNaarParams({
                    naam: plek.naam,
                    coords: plek.coords,
                    label: plek.adres,
                    doel: 'bezoek',
                  })}`}
                  style={{ ...S.knop, ...S.knopTweede, ...S.knopBreed, textDecoration: 'none' }}
                ><Footprints size={15} /> Bij een verblijf dat er al staat</Link>
              </div>
            ) : (
              <Link href="/" style={{ ...S.knop, marginTop: 14, textDecoration: 'none' }}>
                Openen in de planner
              </Link>
            )}
          </div>
        </div>
      )}

      {status === 'opgeslagen' && (
        <div style={S.kaart}>
          <div style={{ width: '100%', textAlign: 'center' }}>
            <div style={{ ...S.naam, display: 'flex', alignItems: 'center', gap: 7, justifyContent: 'center' }}>
              <Check size={17} style={{ color: COLORS.moss }} /> {plek?.naam}
            </div>
            <p style={{ fontSize: 12.5, color: COLORS.ink, lineHeight: 1.5, margin: '8px 0 14px' }}>
              Staat in je bibliotheek. Sleep hem in de planner op een dag.
            </p>
            <Link href="/" style={{ ...S.knop, marginTop: 0, textDecoration: 'none' }}>
              Naar de planner
            </Link>
          </div>
        </div>
      )}

      {status === 'mislukt' && (
        <div style={{ ...S.kaart, background: 'rgba(201, 125, 93, 0.12)' }}>
          <div style={{ width: '100%', fontSize: 13, color: COLORS.sunset, lineHeight: 1.5 }}>
            {fout?.reden === 'leeg' && 'Er kwam niets mee met dit deelbericht.'}
            {fout?.reden === 'geen-maps' && 'Dit is geen Google Maps-link.'}
            {fout?.reden === 'opslaan' && 'Opslaan lukte niet. Probeer het zo nog eens.'}
            {fout?.reden === 'onleesbaar' && 'Kon deze link niet uitlezen.'}
            {fout?.openen && (
              <a href={fout.openen} target="_blank" rel="noreferrer" style={S.uitweg}>
                <ExternalLink size={12} /> Openen in Google Maps
              </a>
            )}
            {fout?.diagnose && (
              <div style={{ marginTop: 8, fontSize: 11, opacity: 0.8 }}>[{fout.diagnose}]</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const S = {
  pagina: { maxWidth: 560, margin: '0 auto', padding: '18px 18px 40px' },
  terug: {
    display: 'inline-flex', alignItems: 'center', gap: 3,
    fontSize: 12.5, color: COLORS.ink, textDecoration: 'none', marginBottom: 14,
  },
  kop: {
    fontFamily: "'Fraunces', serif", fontSize: 24, color: COLORS.charcoal,
    margin: '0 0 16px', lineHeight: 1.15,
  },
  kaart: {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: 16, borderRadius: 14,
    background: COLORS.creamSoft, border: `1px solid ${COLORS.hairline}`,
  },
  naam: { fontFamily: "'Fraunces', serif", fontSize: 18, color: COLORS.charcoal, lineHeight: 1.2 },
  adres: { fontSize: 12.5, color: COLORS.ink, marginTop: 4, lineHeight: 1.45 },
  coords: {
    display: 'flex', alignItems: 'center', gap: 4,
    fontSize: 11, color: COLORS.inkLight, marginTop: 6,
  },
  benadering: {
    marginTop: 10, padding: '7px 9px', borderRadius: 8,
    background: 'rgba(58, 126, 132, 0.10)',
    fontSize: 11, color: COLORS.lake, lineHeight: 1.45,
  },
  // Twee gelijkwaardige bestemmingen naast elkaar: welke je wilt hangt af van
  // wat je deelt, niet van wat wij denken. Op een smal scherm onder elkaar.
  keuze: { display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 14 },
  knop: {
    flex: '1 1 150px', padding: 13,
    background: COLORS.forest, color: COLORS.cream,
    border: '1px solid transparent', borderRadius: 10, boxSizing: 'border-box',
    fontFamily: "'DM Sans', sans-serif", fontSize: 14, fontWeight: 600,
    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
  },
  knopTweede: {
    background: 'transparent', color: COLORS.forest,
    borderColor: COLORS.forest,
  },
  // Over de volle breedte eronder: dit is de langste tekst van de drie, en op
  // een telefoon breekt hij anders midden in een woord.
  knopBreed: { flex: '1 1 100%' },
  uitweg: {
    display: 'inline-flex', alignItems: 'center', gap: 5,
    marginTop: 9, padding: '6px 11px', borderRadius: 8,
    border: `1px solid ${COLORS.sunset}`, color: COLORS.sunset,
    textDecoration: 'none', fontSize: 12, fontWeight: 600,
  },
};
