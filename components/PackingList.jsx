'use client';

import { useEffect, useState, useRef, useCallback } from 'react';

// Unieke id-generator (geen externe dependency nodig)
const uid = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

export default function PackingList() {
  const [categories, setCategories] = useState([]);
  const [items, setItems] = useState([]);
  const [updatedBy, setUpdatedBy] = useState(null);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [newCat, setNewCat] = useState('');
  const [draftItem, setDraftItem] = useState({}); // { [catId]: { label, qty } }

  // Filters (alleen visueel, raken de opgeslagen data niet)
  const [catFilter, setCatFilter] = useState([]); // lege array = alle categorieën
  const [hideChecked, setHideChecked] = useState(false);

  const saveTimer = useRef(null);
  // Houd de laatste staat vast zodat de debounced save altijd het nieuwste pakt
  const latest = useRef({ categories: [], items: [] });

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/inpakken');
      const data = await res.json();
      setCategories(data.categories ?? []);
      setItems(data.items ?? []);
      setUpdatedBy(data.updatedBy ?? null);
      setUpdatedAt(data.updatedAt ?? null);
      latest.current = { categories: data.categories ?? [], items: data.items ?? [] };
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

  // Centrale opslag: debounced, gebruikt altijd de meest recente ref-waarden
  const persist = useCallback((nextCats, nextItems) => {
    latest.current = { categories: nextCats, items: nextItems };
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
            updatedBy: name || null,
          }),
        });
        const data = await res.json();
        setUpdatedBy(data.updatedBy ?? null);
        setUpdatedAt(data.updatedAt ?? null);
      } catch {
        // negeer; volgende wijziging probeert opnieuw
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

  const toggleItem = (itemId) => {
    apply(categories, items.map((it) =>
      it.id === itemId ? { ...it, checked: !it.checked } : it,
    ));
  };

  const removeItem = (itemId) => {
    apply(categories, items.filter((it) => it.id !== itemId));
  };

  const changeQty = (itemId, delta) => {
    apply(categories, items.map((it) =>
      it.id === itemId ? { ...it, qty: Math.max(1, it.qty + delta) } : it,
    ));
  };

  const setDraft = (catId, field, value) =>
    setDraftItem((d) => ({ ...d, [catId]: { ...(d[catId] || {}), [field]: value } }));

  // ── Voortgang ──────────────────────────────────────────────────────
  const total = items.length;
  const done = items.filter((it) => it.checked).length;
  const pct = total ? Math.round((done / total) * 100) : 0;

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
        <p style={S.kicker}>Vakantie · Inpakken</p>
        <h1 style={S.title}>Wat gaat er mee</h1>
        <p style={S.sub}>
          Maak je eigen categorieën en items aan, met aantal. De lijst is
          gedeeld — iedereen vinkt af wat ingepakt is.
        </p>

        {done > 0 && (
          <button
            onClick={() => {
              if (window.confirm('Alle vinkjes uitzetten? Je categorieën en items blijven staan — handig bij een nieuwe vakantie.')) {
                apply(categories, items.map((it) => ({ ...it, checked: false })));
              }
            }}
            style={S.resetBtn}
          >
            ↺ Alle vinkjes resetten
          </button>
        )}

        <div style={S.progressWrap}>
          <div style={S.progressTrack}>
            <div style={{ ...S.progressFill, width: `${pct}%` }} />
          </div>
          <span style={S.progressLabel}>{done}/{total} ingepakt</span>
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
          {categories.length === 0 && (
            <p style={S.empty}>
              Nog geen categorieën. Maak er hieronder een aan, bijvoorbeeld
              “Kleding”, “Keuken” of “Camping”.
            </p>
          )}

          {categories.length > 0 && (
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
            const visibleCats = categories.filter(
              (cat) => catFilter.length === 0 || catFilter.includes(cat.id),
            );
            const anyVisibleItems = items.some(
              (it) =>
                (catFilter.length === 0 || catFilter.includes(it.categoryId)) &&
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
              const catItems = items.filter((it) => it.categoryId === cat.id);
              const shownItems = hideChecked
                ? catItems.filter((it) => !it.checked)
                : catItems;
              const catDone = catItems.filter((it) => it.checked).length;
              const draft = draftItem[cat.id] || {};
              return (
                <section key={cat.id} style={S.section}>
                  <div style={S.sectionHead}>
                    <h2 style={S.sectionTitle}>{cat.name}</h2>
                    <span style={S.sectionCount}>{catDone}/{catItems.length}</span>
                    {catFilter.length === 0 && categories.length > 1 && (
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
                    <button
                      style={S.catDelete}
                      onClick={() => removeCategory(cat.id)}
                      title="Categorie verwijderen"
                    >
                      ✕
                    </button>
                </div>

                <ul style={S.list}>
                  {shownItems.map((it) => (
                    <li key={it.id}>
                      <div style={{ ...S.item, ...(it.checked ? S.itemOn : {}) }}>
                        <button
                          onClick={() => toggleItem(it.id)}
                          style={{ ...S.box, ...(it.checked ? S.boxOn : {}) }}
                        >
                          {it.checked ? '✓' : ''}
                        </button>
                        <span style={{ ...S.label, ...(it.checked ? S.labelOn : {}) }}>
                          {it.label}
                        </span>
                        <div style={S.qtyWrap}>
                          <button style={S.qtyBtn} onClick={() => changeQty(it.id, -1)}>−</button>
                          <span style={S.qtyNum}>{it.qty}</span>
                          <button style={S.qtyBtn} onClick={() => changeQty(it.id, 1)}>+</button>
                        </div>
                        <button
                          style={S.itemDelete}
                          onClick={() => removeItem(it.id)}
                          title="Item verwijderen"
                        >
                          🗑
                        </button>
                      </div>
                    </li>
                  ))}
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
  resetBtn: {
    fontFamily: 'inherit', fontSize: 13, fontWeight: 600,
    padding: '8px 14px', marginBottom: 16,
    background: 'transparent', color: teal,
    border: `1px solid ${teal}`, borderRadius: 999, cursor: 'pointer',
  },
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
  filterChip: { fontFamily: 'inherit', fontSize: 13, fontWeight: 600, padding: '6px 12px', borderRadius: 99, border: '1px solid #e0dad0', background: paper, color: '#57534e', cursor: 'pointer' },
  filterChipOn: { background: teal, borderColor: teal, color: '#fff' },
  hideToggle: { fontFamily: 'inherit', fontSize: 13, fontWeight: 600, padding: '8px 12px', borderRadius: 10, border: '1px solid #e0dad0', background: paper, color: '#57534e', cursor: 'pointer', textAlign: 'left' },
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
  qtyWrap: { display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 },
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
