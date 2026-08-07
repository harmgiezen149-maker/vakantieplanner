// Botsingen tussen bewerkers herkennen.
//
// Tot nu toe gold overal "de laatste wint", stilzwijgend: bewerkte iemand
// tegelijk met jou, dan verdween zijn werk zonder waarschuwing. Nu stuurt de
// client mee op welke versie hij zich baseert — de `updatedAt` van het
// document zoals hij die kent — en weigert de server te schrijven als er
// intussen iets nieuwers staat.
//
// De `updatedAt` is de versie: hij verandert bij elke schrijfactie en staat al
// in alle vier de documenten, dus er hoefde niets aan het datamodel te
// veranderen.

export const CONFLICT_STATUS = 409;

// Botst deze schrijfactie met wat er is opgeslagen?
//
// Bewust toegeeflijk in twee gevallen:
// - geen basisVersie meegestuurd → een oudere versie van de app die nog open
//   staat; die mag gewoon schrijven, anders breekt hij tijdens een deploy
// - nog niets opgeslagen → er valt niets te botsen
export function isConflict(opgeslagenUpdatedAt, basisVersie) {
  if (basisVersie === undefined || basisVersie === null) return false;
  if (!opgeslagenUpdatedAt) return false;
  return basisVersie !== opgeslagenUpdatedAt;
}

// Antwoord bij een botsing: de client krijgt de huidige serverstaat mee, zodat
// hij kan laten zien wat er intussen is gebeurd zonder eerst opnieuw te halen.
export function conflictAntwoord(huidig) {
  return {
    error: 'conflict',
    detail: 'Iemand anders heeft intussen iets opgeslagen.',
    huidig: huidig ?? null,
    serverVersie: huidig?.updatedAt ?? null,
    door: huidig?.updatedBy ?? null,
  };
}
