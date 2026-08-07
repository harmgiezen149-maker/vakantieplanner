// Twee losse sloten, die vaak met elkaar verward worden.
//
//   FAMILY_PIN         → "is dit het gezin?"      header X-Family-Pin
//   BEHEER_WACHTWOORD  → "mag dit persoon beheren?" header X-Beheer-Code
//
// De PIN is er zodat het gezin erbij kan. Het beheerderswachtwoord is er zodat
// niet iedereen die erbij kan óók een oude momentopname over de huidige
// planning kan zetten, of het foutenlogboek kan wissen. Beheer is dus een
// extra laag bovenop de PIN, geen vervanging ervan.
//
// Allebei zijn ze optioneel: is de variabele niet ingesteld, dan staat dat slot
// open. Zo breekt er niets vóórdat de eigenaar hem zet — hetzelfde patroon dat
// FAMILY_PIN altijd al had.
//
// Geen 'use client': dit draait alleen op de server. De client heeft hier niets
// te zoeken; een knop verbergen in de UI is geen beveiliging.

export function pinIngesteld() {
  return Boolean(process.env.FAMILY_PIN);
}

export function beheerIngesteld() {
  return Boolean(process.env.BEHEER_WACHTWOORD);
}

export function pinOk(request) {
  const pin = process.env.FAMILY_PIN;
  if (!pin) return true;
  return request.headers.get('x-family-pin') === pin;
}

export function beheerOk(request) {
  const code = process.env.BEHEER_WACHTWOORD;
  if (!code) return true;
  return request.headers.get('x-beheer-code') === code;
}

// Voor alles wat kan wissen, overschrijven of naar buiten delen.
export function magBeheren(request) {
  return pinOk(request) && beheerOk(request);
}

// Eén antwoordvorm, zodat de client kan zien wélk slot dicht zat en de juiste
// poort kan tonen in plaats van een algemene foutmelding.
export function weigering(request) {
  const slot = !pinOk(request) ? 'pin' : 'beheer';
  return Response.json({ error: 'unauthorized', slot }, { status: 401 });
}
