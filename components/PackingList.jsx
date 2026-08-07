'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { parseCsv } from '@/lib/csv';
import ConflictMelding from '@/components/ConflictMelding';
import {
  toggleItem as pakToggle,
  setPacked as pakSetPacked,
  changeQty as pakChangeQty,
} from '@/lib/packing';

// Unieke id-generator (geen externe dependency nodig)
const uid = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

export default function PackingList() {
  const [categories, setCategories] = useState([]);
  const [items, setItems] = useState([]);
  // Wie er meegaan. Leeg = de lijst is voor iedereen samen, zoals voorheen.
  const [personen, setPersonen] = useState([]);
  const [updatedBy, setUpdatedBy] = useState(null);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [conflict, setConflict] = useState(null);
  const [newCat, setNewCat] = useState('');
  const [draftItem, setDraftItem] = useState({}); // { [catId]: { label, qty } }

  // Filters (alleen visueel, raken de opgeslagen data niet)
  const [catFilter, setCatFilter] = useState([]); // lege array = alle categorieën
  const [hideChecked, setHideChecked] = useState(false);

  // Persoonlijke pagina: /inpakken?cat=<id> toont één categorie
  const [soloCat, setSoloCat] = useState(null);
  // Persoonlijke weergave: /inpakken?persoon=<naam>
  const [soloPersoon, setSoloPersoon] = useState(null);
  // Filterbalk: welke personen tonen (leeg = allemaal)
  const [persoonFilter, setPersoonFilter] = useState([]);
  // Welk item heeft zijn bewerk-/notitiepaneel open
  const [expandedItem, setExpandedItem] = useState(null);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setSoloCat(params.get('cat'));
    setSoloPersoon(params.get('persoon'));
  }, []);

  const saveTimer = useRef(null);
  // Houd de laatste staat vast zodat de debounced save altijd het nieuwste pakt
  const latest = useRef({ categories: [], items: [] });
  // True zolang er een lokale wijziging nog niet (volledig) is opgeslagen.
  // Voorkomt dat de focus-refresh (die o.a. vuurt na een confirm-popup)
  // de lokale wijziging overschrijft met oude serverdata.
  const dirty = useRef(false);
  // updatedAt van het document zoals wij het kennen — de versie waarop onze
  // wijziging is gebaseerd.
  const versie = useRef(null);

  const load = useCallback(async () => {
    if (dirty.current) return;
    try {
      const res = await fetch('/api/inpakken');
      const data = await res.json();
      setCategories(data.categories ?? []);
      setItems(data.items ?? []);
      setPersonen(data.personen ?? []);
      setUpdatedBy(data.updatedBy ?? null);
      setUpdatedAt(data.updatedAt ?? null);
      versie.current = data.updatedAt ?? null;
      latest.current = { categories: data.categories ?? [], items: data.items ?? [], personen: data.personen ?? [] };
    } catch {
      // stil falen
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const onFocus = () => load();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [load]);

  // Centrale opslag: debounced, gebruikt altijd de meest recente ref-waarden.
  // negeerVersie = "toch de mijne opslaan" na een botsing.
  const persist = useCallback((nextCats, nextItems, negeerVersie = false) => {
    latest.current = { ...latest.current, categories: nextCats, items: nextItems };
    dirty.current = true;
    clearTimeout(saveTimer.current);
    setSaving(true);
    saveTimer.current = setTimeout(async () => {
      try {
        const res = await fetch('/api/inpakken', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            categories: latest.current.categories,
            items: latest.current.items,
            personen: latest.current.personen ?? [],
            updatedBy: name || null,
            basisVersie: negeerVersie ? undefined : versie.current,
          }),
        });
        const data = await res.json();
        if (res.status === 409) {
          // Niet stilzwijgend overschrijven; de gebruiker kiest zelf
          setConflict(data);
          return;
        }
        setUpdatedBy(data.updatedBy ?? null);
        setUpdatedAt(data.updatedAt ?? null);
        versie.current = data.updatedAt ?? null;
        dirty.current = false;
        setConflict(null);
      } catch {
        // negeer; volgende wijziging probeert opnieuw (dirty blijft staan)
      } finally {
        setSaving(false);
      }
    }, 600);
  }, [name]);

  // Helper die state + opslag in één keer bijwerkt
  const apply = (nextCats, nextItems) => {
    setCategories(nextCats);
    setItems(nextItems);
    persist(nextCats, nextItems);
  };

  // Personen aanpassen loopt langs dezelfde opslag; latest.current is de bron
  // van waarheid, niet de state uit de closure.
  const applyPersonen = (next) => {
    setPersonen(next);
    latest.current = { ...latest.current, personen: next };
    persist(latest.current.categories, latest.current.items);
  };

  const addPersoon = (naam) => {
    const schoon = String(naam || '').trim().slice(0, 40);
    if (!schoon || personen.includes(schoon)) return;
    applyPersonen([...personen, schoon]);
  };

  // Iemand weghalen laat zijn items staan, maar zet ze terug op "voor iedereen".
  // Ze stilletjes verwijderen zou spullen uit de lijst laten verdwijnen.
  const removePersoon = (naam) => {
    const nextItems = items.map((it) => (it.person === naam ? { ...it, person: null } : it));
    setPersonen(personen.filter((p) => p !== naam));
    setItems(nextItems);
    latest.current = { ...latest.current, personen: personen.filter((p) => p !== naam), items: nextItems };
    persist(latest.current.categories, nextItems);
  };

  const setItemPersoon = (itemId, naam) => {
    apply(categories, items.map((it) => (it.id === itemId ? { ...it, person: naam || null } : it)));
  };

  // ── Categorie-acties ───────────────────────────────────────────────
  const addCategory = () => {
    const n = newCat.trim();
    if (!n) return;
    apply([...categories, { id: uid(), name: n.slice(0, 40) }], items);
    setNewCat('');
  };

  const removeCategory = (catId) => {
    const cat = categories.find((c) => c.id === catId);
    const count = items.filter((it) => it.categoryId === catId).length;
    const naam = cat ? `“${cat.name}”` : 'deze categorie';
    const itemTekst =
      count === 0
        ? 'Deze categorie is leeg.'
        : count === 1
          ? 'Hiermee verdwijnt ook 1 item.'
          : `Hiermee verdwijnen ook ${count} items.`;
    if (!window.confirm(`Categorie ${naam} verwijderen?\n\n${itemTekst}\n\nDit kan niet ongedaan worden gemaakt.`)) {
      return;
    }
    apply(
      categories.filter((c) => c.id !== catId),
      items.filter((it) => it.categoryId !== catId),
    );
    setCatFilter((f) => f.filter((id) => id !== catId));
  };

  // Categorie hernoemen. Krijgt de nieuwe naam (genormaliseerd) al een
  // bestaande categorie? Dan samenvoegen: items verhuizen, lege cat weg.
  const renameCategory = (catId, rawName) => {
    const name = rawName.trim().slice(0, 40);
    if (!name) return;
    const target = categories.find(
      (c) => c.id !== catId && c.name.toLowerCase() === name.toLowerCase());

    if (target) {
      if (!window.confirm(`Er bestaat al een categorie “${target.name}”. Samenvoegen?\n\nDe items uit deze categorie verhuizen ernaartoe.`)) {
        return;
      }
      apply(
        categories.filter((c) => c.id !== catId),
        items.map((it) => it.categoryId === catId ? { ...it, categoryId: target.id } : it),
      );
      setCatFilter((f) => f.filter((id) => id !== catId));
    } else {
      apply(
        categories.map((c) => c.id === catId ? { ...c, name } : c),
        items,
      );
    }
  };

  const toggleCatFilter = (catId) =>
    setCatFilter((f) => (f.includes(catId) ? f.filter((id) => id !== catId) : [...f, catId]));

  const moveCategory = (catId, dir) => {
    const idx = categories.findIndex((c) => c.id === catId);
    const target = idx + dir;
    if (idx < 0 || target < 0 || target >= categories.length) return;
    const next = [...categories];
    [next[idx], next[target]] = [next[target], next[idx]];
    apply(next, items);
  };

  // ── Item-acties ────────────────────────────────────────────────────
  // ── CSV-import ────────────────────────────────────────────────────
  const importInputRef = useRef(null);
  const [importing, setImporting] = useState(false);

  const handleImportFile = async (file) => {
    if (!file) return;
    setImporting(true);
    try {
      const rows = parseCsv(await file.text());

      // Kolomherkenning: zoek een kopregel met herkenbare woorden.
      // Zonder kopregel: kolom A = categorie, B = item, C = aantal.
      const norm = (v) => String(v ?? '').trim();
      const lower = (v) => norm(v).toLowerCase();
      let colCat = 0, colItem = 1, colQty = 2, startRow = 0;
      const headerRow = rows.findIndex(r => r.some(c => {
        const v = lower(c);
        return ['categorie', 'category', 'item', 'naam', 'artikel', 'omschrijving', 'aantal', 'qty', 'quantity'].includes(v);
      }));
      if (headerRow !== -1) {
        const hdr = rows[headerRow].map(lower);
        const find = (names) => hdr.findIndex(h => names.includes(h));
        const c = find(['categorie', 'category', 'rubriek']);
        const i = find(['item', 'naam', 'artikel', 'omschrijving', 'wat']);
        const q = find(['aantal', 'qty', 'quantity', 'aant', 'stuks']);
        if (i !== -1) {
          colItem = i;
          colCat = c; // -1 = geen categoriekolom
          colQty = q;
          startRow = headerRow + 1;
        }
      }

      // Rijen verwerken. Lege categoriecel = vorige categorie (zoals bij
      // samengevoegde cellen in een spreadsheet). Geen categorie = "Algemeen".
      const parsed = []; // { catName, label, qty }
      let lastCat = '';
      for (let r = startRow; r < rows.length; r++) {
        const row = rows[r] || [];
        const label = norm(row[colItem]);
        const catCell = colCat >= 0 ? norm(row[colCat]) : '';
        if (catCell) lastCat = catCell;
        if (!label) continue;
        const qtyRaw = colQty >= 0 ? row[colQty] : '';
        const qty = Math.max(1, parseInt(qtyRaw, 10) || 1);
        parsed.push({ catName: lastCat || 'Algemeen', label: label.slice(0, 80), qty });
      }

      if (parsed.length === 0) {
        window.alert('Geen items gevonden in dit CSV-bestand. Verwacht formaat: kolommen Categorie | Item | Aantal (kopregel optioneel), gescheiden door een puntkomma of komma.');
        return;
      }

      // Samenvoegen met bestaande lijst: categorieën op naam matchen,
      // dubbele items (zelfde naam binnen de categorie) overslaan.
      const nextCats = [...categories];
      const nextItems = [...items];
      const catByName = new Map(nextCats.map(c => [c.name.toLowerCase(), c]));
      let added = 0, skipped = 0, newCats = 0;

      for (const p of parsed) {
        let cat = catByName.get(p.catName.toLowerCase());
        if (!cat) {
          cat = { id: uid(), name: p.catName.slice(0, 40) };
          nextCats.push(cat);
          catByName.set(p.catName.toLowerCase(), cat);
          newCats++;
        }
        const dup = nextItems.some(it =>
          it.categoryId === cat.id && it.label.toLowerCase() === p.label.toLowerCase()
        );
        if (dup) { skipped++; continue; }
        nextItems.push({ id: uid(), categoryId: cat.id, label: p.label, qty: p.qty, checked: false });
        added++;
      }

      const summary = [
        `${added} item${added === 1 ? '' : 's'} toevoegen`,
        newCats > 0 ? `${newCats} nieuwe categorie${newCats === 1 ? '' : 'ën'}` : null,
        skipped > 0 ? `${skipped} al aanwezig (overgeslagen)` : null,
      ].filter(Boolean).join(', ');

      if (added === 0) {
        window.alert(`Niets toe te voegen — ${summary}.`);
        return;
      }
      if (window.confirm(`${summary}. Doorgaan?`)) {
        apply(nextCats, nextItems);
      }
    } catch (e) {
      window.alert('Bestand kon niet worden gelezen: ' + (e?.message || e));
    } finally {
      setImporting(false);
      if (importInputRef.current) importInputRef.current.value = '';
    }
  };

  const addItem = (catId) => {
    const draft = draftItem[catId] || {};
    const label = (draft.label || '').trim();
    if (!label) return;
    const qty = Math.max(1, parseInt(draft.qty, 10) || 1);
    const next = [
      ...items,
      { id: uid(), categoryId: catId, label: label.slice(0, 80), qty, checked: false },
    ];
    apply(categories, next);
    setDraftItem((d) => ({ ...d, [catId]: { label: '', qty: '' } }));
  };

  // De drie handelingen die samen de invariant `checked ⟺ packed >= qty`
  // bewaken staan in lib/packing.js, zodat ze op één plek kloppen en getest
  // kunnen worden.
  const toggleItem = (itemId) => {
    apply(categories, items.map((it) => it.id === itemId ? pakToggle(it) : it));
  };

  const setPacked = (itemId, raw) => {
    apply(categories, items.map((it) => it.id === itemId ? pakSetPacked(it, raw) : it));
  };

  const removeItem = (itemId) => {
    apply(categories, items.filter((it) => it.id !== itemId));
  };

  // Itemnaam wijzigen
  const renameItem = (itemId, label) => {
    const v = label.trim();
    if (!v) return;
    apply(categories, items.map((it) =>
      it.id === itemId ? { ...it, label: v.slice(0, 80) } : it));
  };

  // Item naar een andere categorie verplaatsen
  const moveItemToCategory = (itemId, newCatId) => {
    apply(categories, items.map((it) =>
      it.id === itemId ? { ...it, categoryId: newCatId } : it));
  };

  // Belangrijk-vlag aan/uit
  const toggleImportant = (itemId) => {
    apply(categories, items.map((it) =>
      it.id === itemId ? { ...it, important: !it.important } : it));
  };

  // Notitie bij een item opslaan
  const setItemNote = (itemId, note) => {
    apply(categories, items.map((it) =>
      it.id === itemId ? { ...it, note: note.slice(0, 500) } : it));
  };

  const changeQty = (itemId, delta) => {
    apply(categories, items.map((it) => it.id === itemId ? pakChangeQty(it, delta) : it));
  };

  const setDraft = (catId, field, value) =>
    setDraftItem((d) => ({ ...d, [catId]: { ...(d[catId] || {}), [field]: value } }));

  // ── Voortgang ──────────────────────────────────────────────────────
  const total = items.length;
  const done = items.filter((it) => it.checked).length;
  const pct = total ? Math.round((done / total) * 100) : 0;

  // Solo-modus: welke categorie hoort bij ?cat=…
  const soloCategory = soloCat
    ? categories.find((c) => String(c.id) === String(soloCat).trim()) || null
    : null;
  const soloItems = soloCategory ? items.filter((it) => it.categoryId === soloCategory.id) : null;
  const soloDone = soloItems ? soloItems.filter((it) => it.checked).length : 0;

  // Eén regel die bepaalt of een item in beeld hoort. `person === null` =
  // "gaat voor iedereen mee" en is dus altijd zichtbaar, ook in een
  // persoonlijke weergave — anders zou de tandpasta uit ieders lijst vallen.
  const zichtbaarVoorPersoon = (it) => {
    if (soloPersoon) return !it.person || it.person === soloPersoon;
    if (persoonFilter.length === 0) return true;
    return !it.person || persoonFilter.includes(it.person);
  };

  const formattedDate = updatedAt
    ? new Date(updatedAt).toLocaleString('nl-NL', {
        day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
      })
    : null;

  return (
    <div style={S.page}>
      <style>{globalCss}</style>

      <header style={S.header}>
        <a href="/" style={S.backLink}>‹ Terug naar planner</a>
        <p style={S.kicker}>
          {soloPersoon ? 'Vakantie · Persoonlijke lijst' : soloCategory ? 'Vakantie · Persoonlijke inpaklijst' : 'Vakantie · Inpakken'}
        </p>
        <h1 style={S.title}>
          {soloPersoon ? `Wat gaat er mee voor ${soloPersoon}` : soloCategory ? soloCategory.name : 'Wat gaat er mee'}
        </h1>
        {soloPersoon ? (
          <p style={S.sub}>
            Jouw spullen plus alles wat voor iedereen meegaat. Vinkjes worden
            gedeeld — ze staan ook in de{' '}
            <a href="/inpakken" style={{ color: teal, fontWeight: 600 }}>volledige lijst</a>.
          </p>
        ) : soloCategory ? (
          <p style={S.sub}>
            Jouw eigen lijst. Vinkjes worden centraal opgeslagen en zijn ook
            zichtbaar in de{' '}
            <a href="/inpakken" style={{ color: teal, fontWeight: 600 }}>volledige inpaklijst</a>.
          </p>
        ) : (
          <p style={S.sub}>
            Maak je eigen categorieën en items aan, met aantal. De lijst is
            gedeeld — iedereen vinkt af wat ingepakt is.
          </p>
        )}

        {conflict && (
          <ConflictMelding
            door={conflict.door}
            onLaadHunVersie={() => { dirty.current = false; setConflict(null); load(); }}
            onForceer={() => {
              setConflict(null);
              persist(latest.current.categories, latest.current.items, true);
            }}
          />
        )}

        <div style={{ display: soloCategory ? 'none' : 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
          <input
            ref={importInputRef}
            type="file"
            accept=".csv,text/csv"
            style={{ display: 'none' }}
            onChange={(e) => handleImportFile(e.target.files?.[0])}
          />
          <button
            onClick={() => importInputRef.current?.click()}
            disabled={importing}
            style={{ ...S.resetBtn, marginBottom: 0, opacity: importing ? 0.6 : 1 }}
          >
            {importing ? 'Bezig met lezen…' : '📥 Importeren uit CSV'}
          </button>
          {done > 0 && (
            <button
              onClick={() => {
                if (window.confirm('Alle vinkjes uitzetten? Je categorieën en items blijven staan — handig bij een nieuwe vakantie.')) {
                  apply(categories, items.map((it) => ({ ...it, checked: false, packed: 0 })));
                }
              }}
              style={{ ...S.resetBtn, marginBottom: 0 }}
            >
              ↺ Alle vinkjes resetten
            </button>
          )}
        </div>

        {!soloCategory && (
          <p style={S.importHint}>
            Kolommen <strong>Categorie · Item · Aantal</strong>, kopregel mag.
            In Excel of Numbers: <em>Opslaan als → CSV</em>. Puntkomma en komma
            worden allebei herkend.
          </p>
        )}

        <div style={S.progressWrap}>
          <div style={S.progressTrack}>
            <div style={{
              ...S.progressFill,
              width: `${soloItems
                ? (soloItems.length ? Math.round((soloDone / soloItems.length) * 100) : 0)
                : pct}%`,
            }} />
          </div>
          <span style={S.progressLabel}>
            {soloItems ? `${soloDone}/${soloItems.length} ingepakt` : `${done}/${total} ingepakt`}
          </span>
        </div>

        <div style={S.nameRow}>
          <input
            style={S.nameInput}
            placeholder="Je naam (voor 'laatst bijgewerkt door')"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <span style={S.saveState}>
            {saving ? 'Opslaan…' : formattedDate ? `${updatedBy ?? 'Iemand'} · ${formattedDate}` : ''}
          </span>
        </div>
      </header>

      {loading ? (
        <p style={S.loading}>Laden…</p>
      ) : (
        <div style={S.sections}>
          {soloCat && !soloCategory && categories.length > 0 && (
            <p style={S.empty}>
              Deze categorie bestaat niet (meer).{' '}
              <a href="/inpakken" style={{ color: teal, fontWeight: 600 }}>Naar de volledige lijst</a>
            </p>
          )}

          {categories.length === 0 && (
            <p style={S.empty}>
              Nog geen categorieën. Maak er hieronder een aan, bijvoorbeeld
              “Kleding”, “Keuken” of “Camping”.
            </p>
          )}

          {!soloCategory && !soloPersoon && (
            <PersonenBalk
              personen={personen}
              filter={persoonFilter}
              setFilter={setPersoonFilter}
              onToevoegen={addPersoon}
              onVerwijderen={removePersoon}
            />
          )}

          {categories.length > 0 && !soloCategory && (
            <div style={S.filterBar}>
              <div style={S.filterChips}>
                <button
                  style={{ ...S.filterChip, ...(catFilter.length === 0 ? S.filterChipOn : {}) }}
                  onClick={() => setCatFilter([])}
                >
                  Alle
                </button>
                {categories.map((cat) => {
                  const on = catFilter.includes(cat.id);
                  return (
                    <button
                      key={cat.id}
                      style={{ ...S.filterChip, ...(on ? S.filterChipOn : {}) }}
                      onClick={() => toggleCatFilter(cat.id)}
                    >
                      {cat.name}
                    </button>
                  );
                })}
              </div>
              <button
                style={{ ...S.hideToggle, ...(hideChecked ? S.hideToggleOn : {}) }}
                onClick={() => setHideChecked((v) => !v)}
              >
                {hideChecked ? '☑' : '☐'} Verberg ingepakt
              </button>
            </div>
          )}

          {(() => {
            const visibleCats = soloCategory
              ? [soloCategory]
              : (soloCat && categories.length > 0)
                ? [] // onbekende ?cat= → melding hierboven, geen volledige lijst
                : categories.filter(
                    (cat) => catFilter.length === 0 || catFilter.includes(cat.id),
                  );
            const anyVisibleItems = items.some(
              (it) =>
                (catFilter.length === 0 || catFilter.includes(it.categoryId)) &&
                zichtbaarVoorPersoon(it) &&
                (!hideChecked || !it.checked),
            );
            if (visibleCats.length > 0 && !anyVisibleItems && hideChecked) {
              return (
                <p style={S.empty}>
                  Alles in beeld is al ingepakt. Zet “Verberg ingepakt” uit om
                  alles weer te zien.
                </p>
              );
            }
            return visibleCats.map((cat) => {
              const catIndex = categories.findIndex((c) => c.id === cat.id);
              const catItems = items.filter((it) => it.categoryId === cat.id && zichtbaarVoorPersoon(it));
              const shownItems = hideChecked
                ? catItems.filter((it) => !it.checked)
                : catItems;
              const catDone = catItems.filter((it) => it.checked).length;
              const draft = draftItem[cat.id] || {};
              return (
                <section key={cat.id} style={S.section}>
                  <div style={S.sectionHead}>
                    {soloCategory ? (
                      <h2 style={S.sectionTitle}>{cat.name}</h2>
                    ) : (
                      <input
                        style={S.sectionTitleInput}
                        defaultValue={cat.name}
                        key={cat.name}
                        onBlur={(e) => { if (e.target.value.trim() && e.target.value !== cat.name) renameCategory(cat.id, e.target.value); }}
                        onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') { e.target.value = cat.name; e.target.blur(); } }}
                        title="Klik om de categorienaam te wijzigen"
                      />
                    )}
                    <span style={S.sectionCount}>{catDone}/{catItems.length}</span>
                    {!soloCategory && catFilter.length === 0 && categories.length > 1 && (
                      <span style={S.reorder}>
                        <button
                          style={{ ...S.reorderBtn, ...(catIndex === 0 ? S.reorderBtnOff : {}) }}
                          onClick={() => moveCategory(cat.id, -1)}
                          disabled={catIndex === 0}
                          title="Omhoog"
                        >
                          ↑
                        </button>
                        <button
                          style={{ ...S.reorderBtn, ...(catIndex === categories.length - 1 ? S.reorderBtnOff : {}) }}
                          onClick={() => moveCategory(cat.id, 1)}
                          disabled={catIndex === categories.length - 1}
                          title="Omlaag"
                        >
                          ↓
                        </button>
                      </span>
                    )}
                    {!soloCategory && (
                      <a
                        href={`/inpakken?cat=${cat.id}`}
                        title={`Eigen pagina van ${cat.name}`}
                        style={S.soloLink}
                      >
                        👤
                      </a>
                    )}
                    {!soloCategory && (
                      <button
                        style={S.catDelete}
                        onClick={() => removeCategory(cat.id)}
                        title="Categorie verwijderen"
                      >
                        ✕
                      </button>
                    )}
                </div>

                <ul style={S.list}>
                  {shownItems.map((it) => {
                    const open = expandedItem === it.id;
                    return (
                    <li key={it.id}>
                      <div style={{ ...S.item, ...(it.checked ? S.itemOn : {}) }}>
                        <button
                          onClick={() => toggleItem(it.id)}
                          style={{ ...S.box, ...(it.checked ? S.boxOn : {}) }}
                        >
                          {it.checked ? '✓' : ''}
                        </button>
                        {it.important && (
                          <span title="Belangrijk" style={S.starOn}>★</span>
                        )}
                        <span style={{ ...S.label, ...(it.checked ? S.labelOn : {}), ...(it.qty === 0 ? S.labelSkipped : {}) }}>
                          {it.label}
                          {it.qty === 0 ? <span style={S.skipTag} title="Dit jaar niet mee"> · niet mee</span> : null}
                          {it.note ? <span style={S.noteDot} title="Heeft notitie"> ✎</span> : null}
                          {it.person && !soloPersoon ? (
                            <span style={S.persoonTag} title={`Van ${it.person}`}>{it.person}</span>
                          ) : null}
                        </span>
                        {it.qty > 1 && !it.checked && (
                          <div style={S.packedWrap} title="Alvast gepakt aantal">
                            <input
                              type="number"
                              min="0"
                              max={it.qty}
                              value={it.packed ? String(it.packed) : ''}
                              placeholder="0"
                              onChange={(e) => setPacked(it.id, e.target.value)}
                              onFocus={(e) => e.target.select()}
                              style={S.packedInput}
                            />
                            <span style={S.packedSep}>/</span>
                          </div>
                        )}
                        <div style={S.qtyWrap}>
                          <button style={S.qtyBtn} onClick={() => changeQty(it.id, -1)}>−</button>
                          <span style={S.qtyNum}>{it.qty}</span>
                          <button style={S.qtyBtn} onClick={() => changeQty(it.id, 1)}>+</button>
                        </div>
                        <button
                          style={{ ...S.expandBtn, ...(open ? S.expandBtnOn : {}) }}
                          onClick={() => setExpandedItem(open ? null : it.id)}
                          title="Bewerken"
                        >
                          {open ? '▲' : '⋯'}
                        </button>
                      </div>

                      {open && (
                        <div style={S.editPanel}>
                          <label style={S.editLabel}>Naam</label>
                          <input
                            style={S.editInput}
                            defaultValue={it.label}
                            key={`name-${it.id}-${it.label}`}
                            onBlur={(e) => { if (e.target.value.trim() && e.target.value !== it.label) renameItem(it.id, e.target.value); }}
                            onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }}
                          />

                          <label style={S.editLabel}>Categorie</label>
                          <select
                            style={S.editInput}
                            value={it.categoryId}
                            onChange={(e) => moveItemToCategory(it.id, e.target.value)}
                          >
                            {categories.map((c) => (
                              <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                          </select>

                          {personen.length > 0 && (
                            <>
                              <label style={S.editLabel}>Van wie</label>
                              <select
                                style={S.editInput}
                                value={it.person || ''}
                                onChange={(e) => setItemPersoon(it.id, e.target.value)}
                              >
                                <option value="">Voor iedereen</option>
                                {personen.map((p) => (
                                  <option key={p} value={p}>{p}</option>
                                ))}
                              </select>
                            </>
                          )}

                          <label style={{ ...S.editLabel, display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginTop: 10 }}>
                            <input
                              type="checkbox"
                              checked={!!it.important}
                              onChange={() => toggleImportant(it.id)}
                              style={{ width: 16, height: 16, accentColor: '#C97D5D' }}
                            />
                            Belangrijk markeren
                          </label>

                          <label style={S.editLabel}>Notitie</label>
                          <textarea
                            style={{ ...S.editInput, minHeight: 60, resize: 'vertical', fontFamily: 'inherit' }}
                            defaultValue={it.note || ''}
                            key={`note-${it.id}`}
                            placeholder="Extra informatie, bv. waar het ligt of een herinnering…"
                            onBlur={(e) => { if ((e.target.value || '') !== (it.note || '')) setItemNote(it.id, e.target.value); }}
                          />

                          <button
                            style={S.editDelete}
                            onClick={() => { removeItem(it.id); setExpandedItem(null); }}
                          >
                            🗑 Item verwijderen
                          </button>
                        </div>
                      )}
                    </li>
                  );})}
                </ul>

                <div style={S.addItemRow}>
                  <input
                    style={S.addItemInput}
                    placeholder="Nieuw item…"
                    value={draft.label || ''}
                    onChange={(e) => setDraft(cat.id, 'label', e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') addItem(cat.id); }}
                  />
                  <input
                    style={S.addQtyInput}
                    type="number"
                    min="1"
                    placeholder="1"
                    value={draft.qty || ''}
                    onChange={(e) => setDraft(cat.id, 'qty', e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') addItem(cat.id); }}
                  />
                  <button style={S.addItemBtn} onClick={() => addItem(cat.id)}>+</button>
                </div>
              </section>
            );
            });
          })()}

          {!soloCategory && (
          <div style={S.addCatCard}>
            <input
              style={S.addCatInput}
              placeholder="Nieuwe categorie…"
              value={newCat}
              onChange={(e) => setNewCat(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') addCategory(); }}
            />
            <button style={S.addCatBtn} onClick={addCategory}>+ Categorie</button>
          </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Styling (zelfde tokens als de auto-checklist) ──────────────────────
const teal = '#0f766e';
const tealSoft = '#ccfbf1';
const ink = '#1c1917';
const paper = '#faf8f3';

const globalCss = `
@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700&family=DM+Sans:wght@400;500;600&display=swap');
* { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
body { margin: 0; }
input[type=number]::-webkit-inner-spin-button { opacity: 1; }
`;

// Wie gaan er mee, en van wie is wat. Zonder namen ziet niemand hier iets —
// dan is de lijst gewoon gedeeld, zoals hij altijd was.
function PersonenBalk({ personen, filter, setFilter, onToevoegen, onVerwijderen }) {
  const [open, setOpen] = useState(false);
  const [invoer, setInvoer] = useState('');

  const toggle = (naam) =>
    setFilter(filter.includes(naam) ? filter.filter((p) => p !== naam) : [...filter, naam]);

  return (
    <div style={S.persoonBalk}>
      <div style={S.persoonRij}>
        {personen.length > 0 && (
          <>
            <button
              style={{ ...S.filterChip, ...(filter.length === 0 ? S.filterChipOn : {}) }}
              onClick={() => setFilter([])}
            >Iedereen</button>
            {personen.map((p) => (
              <button
                key={p}
                style={{ ...S.filterChip, ...(filter.includes(p) ? S.filterChipOn : {}) }}
                onClick={() => toggle(p)}
              >{p}</button>
            ))}
          </>
        )}
        <button style={S.persoonBeheer} onClick={() => setOpen(!open)}>
          {open ? '▲ Klaar' : personen.length ? '⋯ Wie gaan er mee' : '＋ Wie gaan er mee'}
        </button>
      </div>

      {open && (
        <div style={S.persoonPaneel}>
          <p style={S.persoonUitleg}>
            Vul namen in om spullen aan iemand toe te wijzen. Items zonder naam
            gaan voor iedereen mee en blijven altijd zichtbaar.
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              style={{ ...S.addItemInput, flex: 1 }}
              placeholder="Naam"
              value={invoer}
              onChange={(e) => setInvoer(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { onToevoegen(invoer); setInvoer(''); } }}
            />
            <button
              style={S.persoonToevoegen}
              onClick={() => { onToevoegen(invoer); setInvoer(''); }}
            >Erbij</button>
          </div>
          {personen.length > 0 && (
            <ul style={S.persoonLijst}>
              {personen.map((p) => (
                <li key={p} style={S.persoonRegel}>
                  <span style={{ flex: 1 }}>{p}</span>
                  <a href={`/inpakken?persoon=${encodeURIComponent(p)}`} style={S.persoonLink}>eigen lijst</a>
                  <button style={S.persoonWis} onClick={() => onVerwijderen(p)}>verwijderen</button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

const S = {
  page: {
    fontFamily: "'DM Sans', sans-serif", background: paper, color: ink,
    minHeight: '100vh', maxWidth: 640, margin: '0 auto', padding: '24px 18px 64px',
    backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(15,118,110,0.06) 1px, transparent 0)',
    backgroundSize: '22px 22px',
  },
  header: { marginBottom: 24 },
  backLink: { display: 'inline-block', marginBottom: 14, fontSize: 13, fontWeight: 600, color: teal, textDecoration: 'none', padding: '6px 12px 6px 10px', background: tealSoft, borderRadius: 99 },
  kicker: { fontSize: 12, letterSpacing: '0.12em', textTransform: 'uppercase', color: teal, fontWeight: 600, margin: '0 0 6px' },
  title: { fontFamily: "'Fraunces', serif", fontSize: 34, fontWeight: 700, lineHeight: 1.05, margin: '0 0 8px' },
  sub: { fontSize: 15, lineHeight: 1.5, color: '#57534e', margin: '0 0 20px' },
  soloLink: {
    textDecoration: 'none', fontSize: 14, padding: '2px 6px',
    borderRadius: 8, lineHeight: 1,
  },
  sectionTitleInput: {
    fontFamily: "'Fraunces', serif", fontSize: 19, fontWeight: 500,
    color: '#2D4F3E', background: 'transparent', border: '1px solid transparent',
    borderRadius: 8, padding: '2px 6px', margin: '-2px -6px', flex: 'none',
    maxWidth: 200, cursor: 'text',
  },
  starOn: { color: '#C97D5D', fontSize: 14, marginRight: 2, flexShrink: 0 },
  noteDot: { color: '#3A7E84', fontSize: 12 },
  expandBtn: {
    width: 30, height: 30, border: 'none', borderRadius: 8,
    background: 'transparent', color: '#8a8478', fontSize: 14,
    cursor: 'pointer', flexShrink: 0, lineHeight: 1,
  },
  expandBtnOn: { background: '#efe9dd', color: '#2D4F3E' },
  editPanel: {
    margin: '2px 0 10px', padding: '12px 14px',
    background: '#f4efe4', borderRadius: 12,
    display: 'flex', flexDirection: 'column',
  },
  editLabel: {
    fontSize: 11, fontWeight: 600, color: '#8a8478',
    textTransform: 'uppercase', letterSpacing: '0.05em',
    margin: '8px 0 4px',
  },
  editInput: {
    fontFamily: 'inherit', fontSize: 14, padding: '9px 11px',
    border: '1px solid #e7e2d8', borderRadius: 10,
    background: '#fff', color: ink, width: '100%', boxSizing: 'border-box',
  },
  editDelete: {
    marginTop: 14, alignSelf: 'flex-start',
    fontFamily: 'inherit', fontSize: 13, fontWeight: 600,
    padding: '8px 14px', borderRadius: 10, cursor: 'pointer',
    background: 'transparent', color: '#b4452f',
    border: '1px solid #e3c4ba',
  },
  resetBtn: {
    fontFamily: 'inherit', fontSize: 13, fontWeight: 600,
    padding: '8px 14px', marginBottom: 16,
    background: 'transparent', color: teal,
    border: `1px solid ${teal}`, borderRadius: 999, cursor: 'pointer',
  },
  importHint: { fontSize: 12, lineHeight: 1.5, color: '#8a8478', margin: '-8px 0 16px' },
  progressWrap: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 },
  progressTrack: { flex: 1, height: 10, background: tealSoft, borderRadius: 999, overflow: 'hidden' },
  progressFill: { height: '100%', background: teal, borderRadius: 999, transition: 'width 0.35s ease' },
  progressLabel: { fontSize: 13, fontWeight: 600, color: teal, whiteSpace: 'nowrap' },
  nameRow: { display: 'flex', flexDirection: 'column', gap: 6 },
  nameInput: { fontFamily: 'inherit', fontSize: 14, padding: '10px 12px', border: '1px solid #e7e2d8', borderRadius: 10, background: '#fff', color: ink },
  saveState: { fontSize: 12, color: '#a8a29e', minHeight: 16 },
  loading: { color: '#a8a29e', fontStyle: 'italic' },
  empty: { color: '#a8a29e', fontStyle: 'italic', lineHeight: 1.5, marginTop: 0 },
  sections: { display: 'flex', flexDirection: 'column', gap: 22 },
  filterBar: { display: 'flex', flexDirection: 'column', gap: 10, padding: '14px', background: '#fff', border: '1px solid #ece7dd', borderRadius: 14 },
  filterChips: { display: 'flex', flexWrap: 'wrap', gap: 6 },
  filterChip: { fontFamily: 'inherit', fontSize: 13, fontWeight: 600, padding: '6px 12px', borderRadius: 99, borderWidth: 1, borderStyle: 'solid', borderColor: '#e0dad0', background: paper, color: '#57534e', cursor: 'pointer' },
  filterChipOn: { background: teal, borderColor: teal, color: '#fff' },
  persoonTag: { marginLeft: 6, fontSize: 10.5, fontWeight: 600, color: teal, background: tealSoft, padding: '1px 7px', borderRadius: 99, whiteSpace: 'nowrap' },
  persoonBalk: { marginBottom: 14 },
  persoonRij: { display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' },
  persoonBeheer: { fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, padding: '6px 12px', borderRadius: 99, borderWidth: 1, borderStyle: 'dashed', borderColor: '#e0dad0', background: 'transparent', color: '#8a8378', cursor: 'pointer' },
  persoonPaneel: { marginTop: 10, padding: 12, background: paper, border: '1px solid #e0dad0', borderRadius: 12 },
  persoonUitleg: { fontSize: 12.5, color: '#8a8378', lineHeight: 1.5, margin: '0 0 10px' },
  persoonToevoegen: { fontFamily: 'inherit', fontSize: 13, fontWeight: 700, padding: '8px 16px', borderRadius: 10, border: 'none', background: teal, color: '#fff', cursor: 'pointer' },
  persoonLijst: { listStyle: 'none', margin: '10px 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: 6 },
  persoonRegel: { display: 'flex', alignItems: 'center', gap: 10, fontSize: 13.5, padding: '6px 2px' },
  persoonLink: { fontSize: 12, color: teal, fontWeight: 600, textDecoration: 'none' },
  persoonWis: { border: 'none', background: 'transparent', color: '#cbb9b0', fontSize: 12, cursor: 'pointer', padding: 2 },
  hideToggle: { fontFamily: 'inherit', fontSize: 13, fontWeight: 600, padding: '8px 12px', borderRadius: 10, borderWidth: 1, borderStyle: 'solid', borderColor: '#e0dad0', background: paper, color: '#57534e', cursor: 'pointer', textAlign: 'left' },
  hideToggleOn: { background: tealSoft, borderColor: tealSoft, color: teal },
  section: {},
  sectionHead: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, paddingBottom: 6, borderBottom: `2px solid ${tealSoft}` },
  sectionTitle: { fontFamily: "'Fraunces', serif", fontSize: 19, fontWeight: 600, margin: 0, flex: 1 },
  sectionCount: { fontSize: 13, fontWeight: 600, color: '#a8a29e' },
  catDelete: { border: 'none', background: 'transparent', color: '#cbb9b0', fontSize: 14, cursor: 'pointer', padding: 4, lineHeight: 1 },
  reorder: { display: 'flex', gap: 2 },
  reorderBtn: { width: 26, height: 26, borderRadius: 7, border: '1px solid #e0dad0', background: paper, color: teal, fontSize: 14, fontWeight: 700, cursor: 'pointer', lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  reorderBtnOff: { color: '#d6cfc3', cursor: 'default' },
  list: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 },
  item: { display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: '#fff', border: '1px solid #ece7dd', borderRadius: 12, transition: 'background 0.15s, border-color 0.15s' },
  itemOn: { background: '#f0fdfa', borderColor: tealSoft },
  box: { flexShrink: 0, width: 22, height: 22, borderRadius: 6, border: '2px solid #cbd5cf', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, color: '#fff', background: '#fff', cursor: 'pointer', transition: 'all 0.15s' },
  boxOn: { background: teal, borderColor: teal },
  label: { fontSize: 14.5, lineHeight: 1.3, color: ink, flex: 1 },
  labelOn: { color: '#57534e', textDecoration: 'line-through', textDecorationColor: '#a7d3cd' },
  labelSkipped: { color: '#a8a29e', textDecoration: 'line-through', textDecorationColor: '#c9a17d', fontStyle: 'italic' },
  skipTag: { fontSize: 11, color: '#c9a17d', fontStyle: 'italic', fontWeight: 600 },
  qtyWrap: { display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 },
  packedWrap: { display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 },
  packedInput: {
    width: 34, textAlign: 'center', fontFamily: 'inherit', fontSize: 13,
    padding: '5px 2px', border: '1px solid #d9c9a8', borderRadius: 8,
    background: '#fdf9ee', color: '#8a6d1f', fontWeight: 600,
    MozAppearance: 'textfield',
  },
  packedSep: { fontSize: 12, color: '#8a8478', marginLeft: 2 },
  qtyBtn: { width: 26, height: 26, borderRadius: 7, border: '1px solid #e0dad0', background: '#faf8f3', color: teal, fontSize: 16, fontWeight: 600, cursor: 'pointer', lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  qtyNum: { minWidth: 22, textAlign: 'center', fontSize: 14, fontWeight: 600, color: ink },
  itemDelete: { border: 'none', background: 'transparent', fontSize: 14, cursor: 'pointer', padding: 2, opacity: 0.55, flexShrink: 0 },
  addItemRow: { display: 'flex', gap: 6, marginTop: 8 },
  addItemInput: { flex: 1, fontFamily: 'inherit', fontSize: 14, padding: '9px 11px', border: '1px solid #e7e2d8', borderRadius: 10, background: '#fff', color: ink },
  addQtyInput: { width: 58, fontFamily: 'inherit', fontSize: 14, padding: '9px 8px', border: '1px solid #e7e2d8', borderRadius: 10, background: '#fff', color: ink, textAlign: 'center' },
  addItemBtn: { width: 42, border: 'none', borderRadius: 10, background: tealSoft, color: teal, fontSize: 20, fontWeight: 600, cursor: 'pointer', lineHeight: 1 },
  addCatCard: { display: 'flex', gap: 8, padding: '14px', background: '#fff', border: '1px dashed #d6cfc3', borderRadius: 14, marginTop: 4 },
  addCatInput: { flex: 1, fontFamily: 'inherit', fontSize: 14, padding: '10px 12px', border: '1px solid #e7e2d8', borderRadius: 10, background: paper, color: ink },
  addCatBtn: { border: 'none', borderRadius: 10, background: teal, color: '#fff', fontSize: 14, fontWeight: 600, padding: '0 16px', cursor: 'pointer', whiteSpace: 'nowrap' },
};
