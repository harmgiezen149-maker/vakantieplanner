// Een plek doorgeven van /toevoegen naar /verblijven, via de URL.
//
// De deelknop levert een plek op die je óf als activiteit óf als verblijf wilt
// opslaan. Voor dat tweede sturen we je door naar het logboek met het bestaande
// formulier voorgevuld — dat scheelt een tweede formulier én een tweede
// opslagpad naar /api/verblijven.
//
// De leeskant is echte logica en geen doorgeefluik: wat er in de adresbalk
// staat is invoer van buiten, dus `?lat=abc` mag geen speld ergens in zee
// opleveren. Vandaar dat dit hier staat en getest is.
//
// Relatieve import (niet '@/lib/…'): de tests draaien buiten Next om.
import { schoneWebsite } from './stayValidation.js';

// Dezelfde grens als StayForm.submit() aanhoudt voor de naam van een verblijf.
export const MAX_NAAM = 90;
export const MAX_LABEL = 200;

// Let op de lege-stringcontrole: `Number('')` en `Number(null)` zijn allebei
// **0**, niet NaN. Zonder die controle wordt een ontbrekende `lng` stilletjes
// een nul en zet /verblijven een speld in de Golf van Guinee.
const getal = (v) => {
  if (v === null || v === undefined || String(v).trim() === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

// { naam, coords, label, website } → querystring.
// Lege velden laten hun parameter weg in plaats van hem leeg mee te sturen:
// een URL met `&website=` erin suggereert dat er iets was.
export function plekNaarParams({ naam, coords, label, website } = {}) {
  const p = new URLSearchParams();
  if (Array.isArray(coords) && coords.length === 2) {
    p.set('lat', String(coords[0]));
    p.set('lng', String(coords[1]));
  }
  if (naam) p.set('naam', String(naam).slice(0, MAX_NAAM));
  if (label) p.set('label', String(label).slice(0, MAX_LABEL));
  if (website) p.set('site', String(website));
  return p.toString();
}

// Terug uit de URL. `bron` mag alles zijn met een .get() — een URLSearchParams
// of het object dat useSearchParams() teruggeeft.
//
// Geeft `null` als er geen bruikbaar coördinaat in staat: zonder plek valt er
// niets voor te vullen, en dan hoort het formulier gewoon dicht te blijven.
export function plekUitParams(bron) {
  if (!bron || typeof bron.get !== 'function') return null;

  const lat = getal(bron.get('lat'));
  const lng = getal(bron.get('lng'));
  if (lat === null || lng === null) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;

  const naam = (bron.get('naam') || '').trim().slice(0, MAX_NAAM) || null;
  const label = (bron.get('label') || '').trim().slice(0, MAX_LABEL) || null;
  // Een `javascript:`-adres komt straks in een href op de verblijfskaart te
  // staan; schoneWebsite() weert dat al, dus die niet opnieuw schrijven.
  const website = schoneWebsite(bron.get('site'));

  return { naam, coords: [lat, lng], label, website };
}
