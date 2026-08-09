'use client';

// De twee keuzesheets: welke activiteit voeg je toe aan deze dag, en op
// welke dag zet je deze activiteit.

import React, { useMemo } from 'react';
import { Plus, Sparkles, ChevronRight } from 'lucide-react';
import { COLORS, CATEGORIES, CATEGORY_ORDER } from '@/lib/data';
import Sheet from '@/components/planner/Sheet';

export const PickActivitySheet = ({ activities, plan, days, dayKey, onPick, onClose, onCreateCustom }) => {
  const day = days.find(d => d.key === dayKey);
  const planUsage = useMemo(() => {
    const usage = {};
    Object.values(plan).flat().forEach(id => { usage[id] = (usage[id] || 0) + 1; });
    return usage;
  }, [plan]);

  const grouped = useMemo(() => {
    const out = {};
    activities.forEach(a => {
      const cat = CATEGORIES[a.category] ? a.category : 'custom';
      if (!out[cat]) out[cat] = [];
      out[cat].push(a);
    });
    return out;
  }, [activities]);

  return (
    <Sheet onClose={onClose} title={`Voeg toe aan ${day?.dayShort} ${day?.date}`}>
      <div style={{ padding: '16px 20px 24px' }}>
        <button
          onClick={onCreateCustom}
          style={{
            width: '100%', padding: 12, background: 'transparent',
            color: COLORS.sunset,
            border: `1px dashed ${COLORS.sunset}`, borderRadius: 10,
            fontSize: 13, fontFamily: "'DM Sans', sans-serif",
            fontWeight: 500, cursor: 'pointer', marginBottom: 20,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}
        >
          <Sparkles size={14} /> Nieuwe eigen activiteit
        </button>

        {CATEGORY_ORDER.map(catKey => {
          const items = grouped[catKey];
          if (!items || items.length === 0) return null;
          const cat = CATEGORIES[catKey];
          return (
            <div key={catKey} style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, paddingLeft: 2 }}>
                <span style={{ fontSize: 13 }}>{cat.emoji}</span>
                <span style={{
                  fontSize: 11, fontWeight: 600, color: cat.color,
                  letterSpacing: 1, textTransform: 'uppercase',
                }}>{cat.name}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {items.map(a => {
                  const used = planUsage[a.id] || 0;
                  return (
                    <button
                      key={a.id}
                      onClick={() => onPick(a.id)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '10px 12px', background: COLORS.creamSoft,
                        border: 'none', borderLeft: `3px solid ${cat.color}`,
                        borderRadius: 8, cursor: 'pointer', textAlign: 'left',
                        fontFamily: "'DM Sans', sans-serif", width: '100%',
                      }}
                    >
                      <span style={{ fontSize: 18 }}>{a.emoji}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, color: COLORS.charcoal, fontWeight: 500 }}>{a.name}</div>
                        {a.note && <div style={{ fontSize: 10, color: COLORS.inkLight, marginTop: 1 }}>{a.note}</div>}
                      </div>
                      {used > 0 && (
                        <span style={{
                          fontSize: 10, color: cat.color, fontWeight: 600,
                          background: 'rgba(0,0,0,0.04)',
                          padding: '2px 6px', borderRadius: 99,
                        }}>{used}×</span>
                      )}
                      <ChevronRight size={14} color={COLORS.inkLight} />
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </Sheet>
  );
};

// `titel` overschrijft de kop: dezelfde sheet wordt ook gebruikt om te vragen
// op wélke dag je ergens bent geweest, en dan klopt "toevoegen aan" niet.
export const PickDaySheet = ({ activity, plan, days, onPick, onClose, titel }) => (
  <Sheet onClose={onClose} title={titel || `"${activity?.name}" toevoegen aan…`}>
    <div style={{ padding: '16px 20px 24px', display: 'flex', flexDirection: 'column', gap: 6 }}>
      {days.map(day => {
        const count = (plan[day.key] || []).length;
        return (
          <button
            key={day.key}
            onClick={() => onPick(day.key)}
            style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: 12,
              background: COLORS.creamSoft, border: 'none', borderRadius: 10,
              cursor: 'pointer', textAlign: 'left',
              fontFamily: "'DM Sans', sans-serif", width: '100%',
              borderLeft: `3px solid ${day.stay?.color || COLORS.hairline}`,
            }}
          >
            <div style={{
              fontFamily: "'Fraunces', serif", fontSize: 11,
              color: COLORS.inkLight, textTransform: 'uppercase',
              letterSpacing: 1, minWidth: 22,
            }}>{day.dayShort}</div>
            <div style={{
              fontFamily: "'Fraunces', serif", fontSize: 16,
              color: COLORS.forest, fontWeight: 500, minWidth: 60,
            }}>{day.date}</div>
            {day.label && (
              <span style={{
                fontSize: 10, color: COLORS.lake,
                background: 'rgba(58, 126, 132, 0.10)',
                padding: '2px 8px', borderRadius: 99,
              }}>{day.label}</span>
            )}
            <span style={{ flex: 1 }} />
            {count > 0 && (
              <span style={{ fontSize: 11, color: COLORS.inkLight }}>
                {count} activiteit{count !== 1 ? 'en' : ''}
              </span>
            )}
            <Plus size={14} color={COLORS.forest} />
          </button>
        );
      })}
    </div>
  </Sheet>
);
