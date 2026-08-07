import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toggleItem, setPacked, changeQty, invariantKlopt } from '../lib/packing.js';

// Valkuil 9 uit CLAUDE.md: `checked` is waar precies wanneer `packed >= qty`.
// Drie handelingen raken die regel; als er één afwijkt, klopt de lijst stil niet
// meer — en dat merk je pas als er iets thuis blijft liggen.

const maak = (over = {}) => ({ id: 'x', label: 'Sokken', qty: 6, packed: 0, checked: false, ...over });

test('vinkje aan pakt alles, vinkje uit pakt niets', () => {
  const aan = toggleItem(maak());
  assert.equal(aan.checked, true);
  assert.equal(aan.packed, 6);

  const uit = toggleItem(aan);
  assert.equal(uit.checked, false);
  assert.equal(uit.packed, 0);
});

test('deelteller vol vinkt vanzelf af, eronder niet', () => {
  assert.equal(setPacked(maak(), 5).checked, false);
  assert.equal(setPacked(maak(), 6).checked, true);
});

test('deelteller blijft binnen 0 en qty', () => {
  assert.equal(setPacked(maak(), 99).packed, 6);
  assert.equal(setPacked(maak(), -3).packed, 0);
  assert.equal(setPacked(maak(), 'onzin').packed, 0);
  assert.equal(setPacked(maak(), 2.7).packed, 2); // naar beneden afronden
});

test('aantal verlagen clampt de deelteller mee en zet het vinkje', () => {
  // 4 van 6 gepakt, dan het aantal naar 3 → 3 van 3 dus afgevinkt
  const na = changeQty(maak({ packed: 4 }), -3);
  assert.equal(na.qty, 3);
  assert.equal(na.packed, 3);
  assert.equal(na.checked, true);
});

test('aantal verhogen haalt het vinkje er weer af', () => {
  const vol = toggleItem(maak());          // 6/6, afgevinkt
  const meer = changeQty(vol, 2);          // nu 6 van 8
  assert.equal(meer.qty, 8);
  assert.equal(meer.packed, 6);
  assert.equal(meer.checked, false);
});

test('aantal 0 betekent "niet mee", niet "afgevinkt"', () => {
  const nul = changeQty(maak({ qty: 1, packed: 1, checked: true }), -1);
  assert.equal(nul.qty, 0);
  assert.equal(nul.packed, 0);
  // Het vinkje wordt bewust NIET automatisch gezet: de gebruiker beslist zelf
  assert.equal(nul.checked, true, 'bestaande vinkje blijft zoals het was');
});

test('aantal gaat nooit onder nul', () => {
  assert.equal(changeQty(maak({ qty: 0 }), -5).qty, 0);
});

test('een item zonder packed-veld (van vóór de deelteller) blijft kloppen', () => {
  // Oude items hebben alleen checked; changeQty leidt packed daaruit af
  const oud = { id: 'y', label: 'Trui', qty: 3, checked: true };
  const na = changeQty(oud, -1);
  assert.equal(na.qty, 2);
  assert.equal(na.packed, 2);
  assert.equal(na.checked, true);
});

test('de invariant houdt stand na willekeurige reeksen handelingen', () => {
  let item = maak();
  const stappen = [
    () => toggleItem(item),
    () => setPacked(item, Math.floor(Math.random() * 10) - 2),
    () => changeQty(item, 1),
    () => changeQty(item, -1),
    () => changeQty(item, -3),
  ];
  for (let i = 0; i < 400; i++) {
    item = stappen[Math.floor(Math.random() * stappen.length)]();
    assert.ok(
      invariantKlopt(item),
      `invariant gebroken na stap ${i}: ${JSON.stringify(item)}`,
    );
  }
});
