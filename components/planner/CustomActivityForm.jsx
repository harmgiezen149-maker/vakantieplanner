'use client';

import React, { useState } from 'react';
import { COLORS, CATEGORIES, CATEGORY_ORDER } from '@/lib/data';
import LocationPicker from '@/components/LocationPicker';
import Sheet, { labelStyle, inputBaseStyle } from '@/components/planner/Sheet';

const CustomActivityForm = ({ onSave, onClose }) => {
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const [emoji, setEmoji] = useState('✨');
  const [category, setCategory] = useState('custom');
  const [location, setLocation] = useState(null);
  // location shape: { label, coords: [lat,lng], fullName } | null

  const handleSave = () => {
    if (!name.trim()) return;
    const data = {
      name: name.trim(),
      note: note.trim(),
      emoji: emoji.trim() || '✨',
      category,
    };
    if (location?.coords) {
      data.coords = location.coords;
      data.locationLabel = location.label;
      // Voor Google Maps link
      data.mapsQuery = location.fullName || location.label;
    }
    onSave(data);
  };

  return (
    <Sheet onClose={onClose} title="Nieuwe eigen activiteit">
      <div style={{ padding: '16px 20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <label style={labelStyle}>Naam</label>
          <input
            type="text" value={name} onChange={(e) => setName(e.target.value)}
            placeholder="Bv. Kasteel bezoeken"
            style={{ ...inputBaseStyle, marginTop: 6 }} autoFocus
          />
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ width: 80 }}>
            <label style={labelStyle}>Emoji</label>
            <input
              type="text" value={emoji} onChange={(e) => setEmoji(e.target.value)}
              maxLength={2}
              style={{ ...inputBaseStyle, marginTop: 6, textAlign: 'center', fontSize: 22 }}
            />
          </div>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Categorie</label>
            <select
              value={category} onChange={(e) => setCategory(e.target.value)}
              style={{ ...inputBaseStyle, marginTop: 6 }}
            >
              {CATEGORY_ORDER.map((k) => (
                <option key={k} value={k}>{CATEGORIES[k].emoji} {CATEGORIES[k].name}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label style={labelStyle}>Notitie (optioneel)</label>
          <input
            type="text" value={note} onChange={(e) => setNote(e.target.value)}
            placeholder="Korte beschrijving"
            style={{ ...inputBaseStyle, marginTop: 6 }}
          />
        </div>

        <div>
          <label style={labelStyle}>Locatie (optioneel)</label>
          <div style={{ marginTop: 6 }}>
            <LocationPicker value={location} onChange={setLocation} />
          </div>
        </div>

        <button
          onClick={handleSave} disabled={!name.trim()}
          style={{
            marginTop: 8, padding: 14,
            background: name.trim() ? COLORS.forest : COLORS.hairline,
            color: name.trim() ? COLORS.cream : COLORS.inkLight,
            border: 'none', borderRadius: 10,
            fontFamily: "'DM Sans', sans-serif", fontSize: 14, fontWeight: 600,
            cursor: name.trim() ? 'pointer' : 'not-allowed',
            transition: 'all 0.15s',
          }}
        >
          Opslaan
        </button>
      </div>
    </Sheet>
  );
};

export default CustomActivityForm;
