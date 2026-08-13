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

// ── De nachtelijke cron ─────────────────────────────────────────────
//
// Een cron komt uit een datacenter en heeft geen browser, dus ook geen PIN uit
// localStorage. Hem controleren op `X-Family-Pin` betekent dus: hij komt er
// nooit langs. Dat is precies wat er misging — elke nacht een 401 en geen
// reservekopie, zonder dat iemand het merkte.
//
// Geeft terug hóe het verzoek binnenkwam, niet alleen of het mag: de aanroeper
// laat op basis daarvan de publieke blob-URL wel of niet in het antwoord staan.
//
//   'secret'      Authorization: Bearer $CRON_SECRET — het strengste pad
//   'cron-header' Vercels eigen x-vercel-cron, als er geen sleutel is ingesteld
//   'beheer'      met de hand afgetrapt vanaf /beheer
//   null          niets van dat alles
export function cronBron(request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    // Sleutel ingesteld? Dan is die leidend en telt de header niet meer mee.
    return request.headers.get('authorization') === `Bearer ${secret}` ? 'secret' : null;
  }
  if (request.headers.get('x-vercel-cron')) return 'cron-header';
  return magBeheren(request) ? 'beheer' : null;
}

// Eén antwoordvorm, zodat de client kan zien wélk slot dicht zat en de juiste
// poort kan tonen in plaats van een algemene foutmelding.
export function weigering(request) {
  const slot = !pinOk(request) ? 'pin' : 'beheer';
  return Response.json({ error: 'unauthorized', slot }, { status: 401 });
}
