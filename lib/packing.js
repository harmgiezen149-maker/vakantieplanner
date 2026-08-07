// De rekenregels van de inpaklijst, los van de component.
//
// Er geldt één invariant over drie velden: `checked` is waar precies wanneer
// `packed >= qty`. Die regel werd op drie plekken los onderhouden (vinkje,
// deelteller, aantal wijzigen) — juist het soort verspreide logica waar een
// wijziging op één plek de andere twee stil kapotmaakt. Nu staat hij hier, en
// is hij te testen.
//
// Uitzondering: `qty === 0` betekent "dit jaar niet mee". Dat is géén afgevinkt
// item; het vinkje zet de gebruiker dan zelf.

// Vinkje om: alles gepakt ↔ niets gepakt.
export function toggleItem(item) {
  const nowChecked = !item.checked;
  return { ...item, checked: nowChecked, packed: nowChecked ? item.qty : 0 };
}

// Deelteller "alvast gepakt". Blijft binnen 0..qty; vol betekent afgevinkt.
export function setPacked(item, raw) {
  const n = Math.max(0, Math.min(item.qty, Math.floor(Number(raw) || 0)));
  return { ...item, packed: n, checked: n >= item.qty };
}

// Aantal wijzigen. De deelteller schuift mee naar beneden en de afvinkstatus
// volgt de nieuwe verhouding.
export function changeQty(item, delta) {
  const qty = Math.max(0, item.qty + delta);
  if (qty === 0) {
    // "Dit jaar niet mee": item blijft staan, doorgestreept. Vinkje niet
    // automatisch zetten — dat doet de gebruiker zelf.
    return { ...item, qty, packed: 0 };
  }
  const packed = Math.min(item.packed ?? (item.checked ? item.qty : 0), qty);
  return { ...item, qty, packed, checked: packed >= qty };
}

// Controleert of een item aan de invariant voldoet. Alleen voor tests en
// eventueel debuggen; de app roept dit niet aan.
export function invariantKlopt(item) {
  if (item.qty === 0) return item.packed === 0;
  const packed = item.packed ?? 0;
  if (packed < 0 || packed > item.qty) return false;
  return Boolean(item.checked) === (packed >= item.qty);
}
