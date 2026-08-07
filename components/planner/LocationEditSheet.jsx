'use client';

// ============ LOCATION EDIT SHEET (voor bestaande activiteit) ============

import React, { useState, useMemo } from 'react';
import { COLORS } from '@/lib/data';
import LocationPicker from '@/components/LocationPicker';
import Sheet, { labelStyle } from '@/components/planner/Sheet';

const LocationEditSheet = ({ activity, currentOverride, onSave, onClear, onClose }) => {
  const initial = useMemo(() => {
    if (activity?.coords) {
      return {
        label: activity.locationLabel || activity.mapsQuery || activity.name,
        coords: activity.coords,
      };
    }
    return null;
  }, [activity]);

  const [location, setLocation] = useState(initial);
  const hasOverride = Boolean(currentOverride && Object.keys(currentOverride).length > 0);

  const handleSave = () => {
    if (location?.coords) {
      onSave({
        coords: location.coords,
        locationLabel: location.label,
        mapsQuery: location.fullName || location.label,
        mapsPlaceId: null, // wis oude place ID, want override gebruikt eigen zoekquery
      });
    } else {
      onSave({ coords: null, locationLabel: null, mapsQuery: null, mapsPlaceId: null });
    }
  };

  if (!activity) return null;

  return (
    <Sheet onClose={onClose} title="Locatie wijzigen">
      <div style={{ padding: '8px 20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '10px 12px',
          background: COLORS.creamSoft,
          borderRadius: 10,
        }}>
          <span style={{ fontSize: 22 }}>{activity.emoji}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 500, color: COLORS.charcoal }}>{activity.name}</div>
            {activity.note && (
              <div style={{ fontSize: 11, color: COLORS.inkLight, marginTop: 2 }}>{activity.note}</div>
            )}
          </div>
        </div>

        <div>
          <label style={labelStyle}>Locatie</label>
          <div style={{ marginTop: 6 }}>
            <LocationPicker value={location} onChange={setLocation} />
          </div>
          <div style={{ fontSize: 11, color: COLORS.inkLight, marginTop: 6, lineHeight: 1.4 }}>
            Wijzigt waar deze activiteit op de kaart verschijnt en wat de "Open in Google Maps" knop opent. Geldt voor het hele gezin.
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          {hasOverride && (
            <button
              onClick={onClear}
              style={{
                flex: 1, padding: 12, background: 'transparent',
                color: COLORS.wine, border: `1px solid ${COLORS.wine}40`,
                borderRadius: 10, fontFamily: "'DM Sans', sans-serif",
                fontSize: 13, fontWeight: 500, cursor: 'pointer',
              }}
            >Standaard herstellen</button>
          )}
          <button
            onClick={handleSave}
            style={{
              flex: 1, padding: 12, background: COLORS.forest,
              color: COLORS.cream, border: 'none', borderRadius: 10,
              fontFamily: "'DM Sans', sans-serif",
              fontSize: 14, fontWeight: 600, cursor: 'pointer',
            }}
          >Opslaan</button>
        </div>
      </div>
    </Sheet>
  );
};

export default LocationEditSheet;
