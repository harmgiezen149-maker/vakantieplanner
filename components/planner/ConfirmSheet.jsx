'use client';

import React from 'react';
import { COLORS } from '@/lib/data';
import Sheet from '@/components/planner/Sheet';

// Met altText/onAlt krijg je een derde knop: een tweede manier om door te
// gaan (bv. "wel starten, niet bewaren"). Dan stapelen de knoppen, want drie
// naast elkaar wordt te krap op een telefoon.
const ConfirmSheet = ({ title, message, confirmText, onConfirm, onClose, altText, onAlt }) => {
  const cancelStyle = {
    flex: 1, padding: 12, background: 'transparent',
    color: COLORS.ink, border: `1px solid ${COLORS.hairline}`,
    borderRadius: 10, fontFamily: "'DM Sans', sans-serif",
    fontSize: 14, fontWeight: 500, cursor: 'pointer',
  };
  const confirmStyle = {
    flex: 1, padding: 12, background: COLORS.wine,
    color: COLORS.cream, border: 'none', borderRadius: 10,
    fontFamily: "'DM Sans', sans-serif",
    fontSize: 14, fontWeight: 600, cursor: 'pointer',
  };

  return (
    <Sheet onClose={onClose} title={title}>
      <div style={{ padding: '8px 20px 24px' }}>
        <p style={{ color: COLORS.ink, fontSize: 14, lineHeight: 1.5, marginBottom: 18 }}>
          {message}
        </p>
        {altText ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button onClick={() => { onConfirm(); onClose(); }} style={{ ...confirmStyle, flex: 'none' }}>
              {confirmText}
            </button>
            <button
              onClick={() => { onAlt(); onClose(); }}
              style={{ ...cancelStyle, flex: 'none', borderColor: `${COLORS.lake}80`, color: COLORS.lake, fontWeight: 600 }}
            >{altText}</button>
            <button onClick={onClose} style={{ ...cancelStyle, flex: 'none', border: 'none' }}>
              Annuleer
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={onClose} style={cancelStyle}>Annuleer</button>
            <button onClick={() => { onConfirm(); onClose(); }} style={confirmStyle}>
              {confirmText}
            </button>
          </div>
        )}
      </div>
    </Sheet>
  );
};

export default ConfirmSheet;
