// Welke activiteiten heb je bij welk verblijf werkelijk bezocht?
//
// Twee documenten die elkaar niet kennen:
//
//   planner:trip       de planning — dagen, activiteiten, en de `visited`-vlag
//   planner:verblijven het logboek — overleeft "nieuwe vakantie starten"
//
// Daarom staat het bezoek als **momentopname** op het verblijf (`stay.bezocht`)
// en niet als verwijzing naar de planning. Zou het een verwijzing zijn, dan was
// je terugblik leeg zodra je een nieuwe vakantie begint — en dat is precies het
// moment waarop je hem wilt kunnen bekijken. Zelfde afweging als bij de foto's.
//
// Geen 'use client': dit is pure logica en wordt door de tests buiten Next om
// geladen.

// Een dag hoort bij een verblijf als hij binnen de periode valt. De vertrekdag
// telt mee — je bent er die ochtend nog.
export function dagBinnenVerblijf(dagKey, stay) {
  if (!dagKey || !stay?.startDate) return false;
  const eind = stay.endDate || stay.startDate;
  return dagKey >= stay.startDate && dagKey <= eind;
}

// Uit de planning halen wat er als bezocht is aangevinkt, per verblijf.
//
//   plan          { 'YYYY-MM-DD': [activityId, …] }
//   activityById  { id: activiteit }  (mét overrides al toegepast)
//   stays         de verblijven uit tripConfig
//
// Geeft { [stayId]: [bezoek, …] } terug. Een activiteit die op twee dagen bij
// hetzelfde verblijf staat komt één keer terug, met de eerste datum — je bent
// er niet twee keer voor het eerst geweest.
export function bezoekPerVerblijf(plan, activityById, stays) {
  const uit = {};
  for (const stay of stays || []) {
    if (!stay?.id) continue;
    const gezien = new Map();
    // Op datum doorlopen, niet in invoegvolgorde: bij een activiteit die op
    // twee dagen staat willen we de vroegste datum bewaren.
    for (const dagKey of Object.keys(plan || {}).sort()) {
      const ids = plan[dagKey];
      if (!Array.isArray(ids) || !dagBinnenVerblijf(dagKey, stay)) continue;
      for (const id of ids) {
        const a = activityById?.[id];
        if (!a?.visited || gezien.has(id)) continue;
        gezien.set(id, maakBezoek(a, dagKey));
      }
    }
    uit[stay.id] = [...gezien.values()].sort(opDatum);
  }
  return uit;
}

// Wat we van een activiteit bewaren. Bewust een kopie van een paar velden en
// niet het hele object: het logboek moet los kunnen staan van hoe een
// activiteit er in de planner uitziet.
export function maakBezoek(activity, datum = null) {
  return {
    id: String(activity?.id ?? ''),
    name: String(activity?.name ?? 'Activiteit').slice(0, 90),
    emoji: activity?.emoji ?? null,
    category: activity?.category ?? null,
    note: activity?.note ? String(activity.note).slice(0, 300) : null,
    coords: Array.isArray(activity?.coords) && activity.coords.length === 2
      ? [Number(activity.coords[0]), Number(activity.coords[1])]
      : null,
    datum: /^\d{4}-\d{2}-\d{2}$/.test(datum) ? datum : null,
  };
}

// Een bezoek dat níét uit de planning komt. Een camping van vroeger heeft geen
// planning om uit te putten — daar is de enige weg naar binnen: zelf intypen.
//
// Het id is het enige echte verschil met `maakBezoek()`. Een bezoek uit de
// planning erft het activiteit-id; hier is er geen, dus maken we er zelf een in
// een eigen ruimte (`hand_…`). Dat botst nooit met een `g_*`- of `custom_*`-id,
// en dus laat "Bijwerken uit de planning" een handmatige regel met rust in
// plaats van hem te overschrijven of er een tweede naast te zetten.
export function handmatigBezoek(velden) {
  const id = `hand_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  return maakBezoek({ ...velden, id }, velden?.datum ?? null);
}

// Nieuwe bezoeken bij een verblijf voegen, zonder dubbelingen en zonder
// bestaande weg te gooien. Wat er al stond wint: daar kan de gebruiker een
// datum of notitie in hebben aangepast.
export function voegBezoekToe(bestaand, nieuwe) {
  const uit = [...(bestaand || [])];
  const ids = new Set(uit.map(b => b?.id).filter(Boolean));
  for (const b of nieuwe || []) {
    if (!b?.id || ids.has(b.id)) continue;
    ids.add(b.id);
    uit.push(b);
  }
  return uit.sort(opDatum);
}

// Een bestaand bezoek bijwerken. Naam, datum en notitie zijn van de gebruiker
// en mogen dus achteraf recht — een bezoek dat uit de planning kwam had geen
// datum als het nergens op een dag stond, en een handmatige regel typ je wel
// eens te snel.
//
// Twee dingen liggen hier vast:
//
//  - **De regel gaat opnieuw door `maakBezoek()`.** Zo gelden dezelfde klemmen
//    op naam (90) en notitie (300) als bij het aanmaken, op één plek.
//  - **De lijst wordt opnieuw gesorteerd.** Een gewijzigde datum hoort de regel
//    te verplaatsen; zonder hersortering staat hij op zijn oude plek en lijkt
//    de lijst kapot.
//
// Het id blijft wat het was: dáárop dedupliceert `voegBezoekToe()`, en een
// nieuw id zou de volgende "Bijwerken uit de planning" een tweede regel laten
// aanmaken naast deze.
export function pasBezoekAan(bestaand, id, patch) {
  if (!id) return [...(bestaand || [])];
  let geraakt = false;
  const uit = (bestaand || []).map((b) => {
    if (b?.id !== id) return b;
    geraakt = true;
    const datum = patch?.datum !== undefined ? patch.datum : b.datum;
    return maakBezoek({ ...b, ...patch, id: b.id }, datum);
  });
  // Onbekend id? Dan de lijst met rust laten, ook qua volgorde.
  return geraakt ? uit.sort(opDatum) : uit;
}

// Bewust géén localeCompare: die sorteert leestekens naar eigen inzicht, en
// dan belandt een bezoek zonder datum vóór een bezoek uit 2026 in plaats van
// erachter. Een kale vergelijking gaat op tekencode en doet wat je verwacht.
function opDatum(a, b) {
  const x = a?.datum || '9999';   // zonder datum: achteraan
  const y = b?.datum || '9999';
  if (x === y) return 0;
  return x < y ? -1 : 1;
}
