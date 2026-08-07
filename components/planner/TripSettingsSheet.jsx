'use client';

// Hier stel je titel, periode en verblijven in — het hart van de
// generieke planner.

import React, { useState } from 'react';
import { Plus, Trash2, AlertCircle, Home } from 'lucide-react';
import { COLORS, staysWithColors } from '@/lib/data';
import LocationPicker from '@/components/LocationPicker';
import Sheet, { labelStyle, inputBaseStyle } from '@/components/planner/Sheet';

const TripSettingsSheet = ({ tripConfig, onSave, onClose }) => {
  const [title, setTitle] = useState(tripConfig.title || '');
  const [startDate, setStartDate] = useState(tripConfig.startDate || '');
  const [endDate, setEndDate] = useState(tripConfig.endDate || '');
  const [stays, setStays] = useState(() =>
    (tripConfig.stays || []).map(s => ({ ...s }))
  );
  const [error, setError] = useState('');

  const updateStay = (id, patch) => {
    setStays(arr => arr.map(s => (s.id === id ? { ...s, ...patch } : s)));
  };

  const addStay = () => {
    setStays(arr => [
      ...arr,
      {
        id: `stay_${Date.now()}`,
        name: '',
        startDate: arr.length === 0 ? startDate : (arr[arr.length - 1].endDate || ''),
        endDate: arr.length === 0 ? endDate : '',
        coords: null,
        locationLabel: null,
      },
    ]);
  };

  const removeStay = (id) => {
    setStays(arr => arr.filter(s => s.id !== id));
  };

  const handleSave = () => {
    setError('');
    if (!startDate || !endDate) {
      setError('Vul een begin- en einddatum in.');
      return;
    }
    if (endDate < startDate) {
      setError('De einddatum ligt vóór de begindatum.');
      return;
    }
    for (const s of stays) {
      if (!s.name.trim()) {
        setError('Geef elk verblijf een naam.');
        return;
      }
      if (!s.startDate || !s.endDate) {
        setError(`Vul van/tot-datums in voor "${s.name}".`);
        return;
      }
      if (s.endDate < s.startDate) {
        setError(`De tot-datum van "${s.name}" ligt vóór de van-datum.`);
        return;
      }
    }
    onSave({
      title: title.trim() || 'Onze vakantie',
      startDate,
      endDate,
      stays: stays.map(s => ({
        id: s.id,
        name: s.name.trim(),
        startDate: s.startDate,
        endDate: s.endDate,
        coords: s.coords || null,
        locationLabel: s.locationLabel || null,
      })),
    });
  };

  const colored = staysWithColors({ stays });

  return (
    <Sheet onClose={onClose} title="Reis instellen">
      <div style={{ padding: '16px 20px 24px', display: 'flex', flexDirection: 'column', gap: 18 }}>

        {/* Titel */}
        <div>
          <label style={labelStyle}>Titel van de vakantie</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Bv. Dordogne 2027"
            style={{ ...inputBaseStyle, marginTop: 6 }}
          />
        </div>

        {/* Periode */}
        <div>
          <label style={labelStyle}>Periode</label>
          <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 10, color: COLORS.inkLight, marginBottom: 4 }}>Van</div>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                style={inputBaseStyle}
              />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 10, color: COLORS.inkLight, marginBottom: 4 }}>Tot en met</div>
              <input
                type="date"
                value={endDate}
                min={startDate || undefined}
                onChange={(e) => setEndDate(e.target.value)}
                style={inputBaseStyle}
              />
            </div>
          </div>
        </div>

        {/* Verblijven */}
        <div>
          <label style={labelStyle}>Verblijven (camping / Airbnb / hotel)</label>
          <div style={{ fontSize: 11, color: COLORS.inkLight, marginTop: 4, lineHeight: 1.5 }}>
            Per deelperiode één verblijf. Overlapt een dag met twee verblijven
            (uitchecken + inchecken), dan wordt dat automatisch een wisseldag.
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
            {colored.map((stay) => (
              <div
                key={stay.id}
                style={{
                  background: COLORS.creamSoft,
                  border: `1px solid ${COLORS.hairline}`,
                  borderLeft: `4px solid ${stay.color}`,
                  borderRadius: 12, padding: 14,
                  display: 'flex', flexDirection: 'column', gap: 10,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Home size={15} color={stay.color} style={{ flexShrink: 0 }} />
                  <input
                    type="text"
                    value={stay.name}
                    onChange={(e) => updateStay(stay.id, { name: e.target.value })}
                    placeholder="Naam verblijf, bv. Camping Les Pins"
                    style={{ ...inputBaseStyle, background: COLORS.cream }}
                  />
                  <button
                    onClick={() => removeStay(stay.id)}
                    style={{
                      border: 'none', background: 'transparent', cursor: 'pointer',
                      color: COLORS.inkLight, padding: 6, flexShrink: 0,
                    }}
                    aria-label="Verblijf verwijderen"
                    title="Verblijf verwijderen"
                  ><Trash2 size={15} /></button>
                </div>

                <div style={{ display: 'flex', gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 10, color: COLORS.inkLight, marginBottom: 4 }}>Van</div>
                    <input
                      type="date"
                      value={stay.startDate || ''}
                      min={startDate || undefined}
                      max={endDate || undefined}
                      onChange={(e) => updateStay(stay.id, { startDate: e.target.value })}
                      style={{ ...inputBaseStyle, background: COLORS.cream }}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 10, color: COLORS.inkLight, marginBottom: 4 }}>Tot en met</div>
                    <input
                      type="date"
                      value={stay.endDate || ''}
                      min={stay.startDate || startDate || undefined}
                      max={endDate || undefined}
                      onChange={(e) => updateStay(stay.id, { endDate: e.target.value })}
                      style={{ ...inputBaseStyle, background: COLORS.cream }}
                    />
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: 10, color: COLORS.inkLight, marginBottom: 4 }}>
                    Locatie (voor kaart & ritafstanden)
                  </div>
                  <LocationPicker
                    value={stay.coords ? { label: stay.locationLabel || stay.name, coords: stay.coords } : null}
                    onChange={(loc) => updateStay(stay.id, {
                      coords: loc?.coords || null,
                      locationLabel: loc?.label || null,
                    })}
                    accentColor={stay.color}
                    placeholder="Zoek het adres of de plaats"
                  />
                </div>
              </div>
            ))}
          </div>

          <button
            onClick={addStay}
            style={{
              marginTop: 12, width: '100%', padding: 12,
              background: 'transparent',
              border: `1px dashed ${COLORS.forest}`,
              borderRadius: 10, color: COLORS.forest,
              fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 500,
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}
          >
            <Plus size={14} /> Verblijf toevoegen
          </button>
        </div>

        {error && (
          <div style={{
            fontSize: 12, color: '#B5443B',
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <AlertCircle size={14} /> {error}
          </div>
        )}

        <button
          onClick={handleSave}
          style={{
            padding: 14,
            background: COLORS.forest, color: COLORS.cream,
            border: 'none', borderRadius: 10,
            fontFamily: "'DM Sans', sans-serif", fontSize: 14, fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Opslaan
        </button>
      </div>
    </Sheet>
  );
};

export default TripSettingsSheet;
