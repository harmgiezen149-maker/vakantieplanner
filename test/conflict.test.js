import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isConflict, conflictAntwoord, CONFLICT_STATUS } from '../lib/conflict.js';

// Valkuil 4 was: "de laatste wint", stilzwijgend. Deze regel bepaalt wanneer
// de server weigert. Te streng en niemand kan meer opslaan; te laks en het
// werk van de ander verdwijnt alsnog ongemerkt.

const A = '2026-08-07T10:00:00.000Z';
const B = '2026-08-07T10:05:00.000Z';

test('gelijke versie is geen botsing', () => {
  assert.equal(isConflict(A, A), false);
});

test('afwijkende versie is wél een botsing', () => {
  assert.equal(isConflict(B, A), true, 'server is nieuwer dan waar de client van uitging');
});

test('zonder basisVersie schrijft de client gewoon door', () => {
  // Een oudere versie van de app die nog open staat mag niet stukgaan
  assert.equal(isConflict(A, undefined), false);
  assert.equal(isConflict(A, null), false);
});

test('een nog leeg document botst nooit', () => {
  assert.equal(isConflict(null, A), false);
  assert.equal(isConflict(undefined, A), false);
  assert.equal(isConflict('', A), false);
});

test('het antwoord bevat wat de gebruiker moet zien', () => {
  const huidig = { updatedAt: B, updatedBy: 'Harm', stays: [1, 2] };
  const uit = conflictAntwoord(huidig);
  assert.equal(uit.error, 'conflict');
  assert.equal(uit.door, 'Harm');
  assert.equal(uit.serverVersie, B);
  assert.deepEqual(uit.huidig, huidig, 'de serverstaat gaat mee zodat de client niet opnieuw hoeft te halen');
  assert.equal(CONFLICT_STATUS, 409);
});

test('een antwoord zonder staat valt niet om', () => {
  const uit = conflictAntwoord(null);
  assert.equal(uit.huidig, null);
  assert.equal(uit.door, null);
  assert.equal(uit.serverVersie, null);
});
