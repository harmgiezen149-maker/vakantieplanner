'use client';

// De bodemsheet waar alle andere sheets in zitten, plus de twee
// formulierstijlen die ze delen. Los van Planner.jsx omdat elke sheet
// hem importeert.

import React from 'react';
import { X } from 'lucide-react';
import { COLORS } from '@/lib/data';

const Sheet = ({ children, onClose, title }) => (
  <>
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(31, 41, 34, 0.45)',
        zIndex: 50, animation: 'fadeIn 0.2s ease',
      }}
    />
    <div style={{
      position: 'fixed', bottom: 0, left: 0, right: 0,
      width: '100%', maxWidth: 720, margin: '0 auto',
      background: COLORS.cream, borderRadius: '20px 20px 0 0',
      maxHeight: '85vh', overflowY: 'auto', zIndex: 51,
      animation: 'slideUp 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
      boxShadow: '0 -8px 32px rgba(31, 41, 34, 0.18)',
    }}>
      <div style={{
        position: 'sticky', top: 0, background: COLORS.cream,
        borderBottom: `1px solid ${COLORS.hairline}`,
        padding: '14px 20px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        zIndex: 1,
      }}>
        <div style={{
          width: 32, height: 4, background: COLORS.hairline, borderRadius: 2,
          position: 'absolute', left: '50%', transform: 'translateX(-50%)', top: 6,
        }} />
        <h3 style={{
          margin: '8px 0 0', fontFamily: "'Fraunces', serif",
          fontSize: 18, fontWeight: 500, color: COLORS.forest,
        }}>{title}</h3>
        <button
          onClick={onClose}
          style={{
            border: 'none', background: 'transparent', cursor: 'pointer',
            padding: 4, marginTop: 8, color: COLORS.ink,
          }}
        ><X size={20} /></button>
      </div>
      {children}
    </div>
  </>
);

export const labelStyle = {
  fontSize: 11, color: COLORS.inkLight, letterSpacing: 0.5,
  textTransform: 'uppercase', fontWeight: 600,
};

export const inputBaseStyle = {
  width: '100%', padding: '12px 14px',
  background: COLORS.creamSoft,
  border: `1px solid ${COLORS.hairline}`, borderRadius: 10,
  fontFamily: "'DM Sans', sans-serif", fontSize: 14,
  color: COLORS.charcoal, outline: 'none', boxSizing: 'border-box',
};

export default Sheet;
