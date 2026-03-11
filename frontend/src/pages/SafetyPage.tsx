import { useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppHeader, ScoreRing } from '../components';
import { useT, tpl } from '../i18n';
import type { Translations } from '../i18n/en';
import type { SafetyRoom } from '../types';

function getSafetyRooms(t: Translations): SafetyRoom[] {
  const s = t.safety;
  return [
    {
      id: 'bathroom',
      name: s.bathroom,
      icon: '\u{1F6BF}',
      questions: [
        { id: 'grab-bars', text: s.bathroomQ1, recommendation: s.bathroomR1 },
        { id: 'non-slip-mat', text: s.bathroomQ2, recommendation: s.bathroomR2 },
        { id: 'lighting', text: s.bathroomQ3, recommendation: s.bathroomR3 },
        { id: 'raised-seat', text: s.bathroomQ4, recommendation: s.bathroomR4 },
      ],
    },
    {
      id: 'bedroom',
      name: s.bedroom,
      icon: '\u{1F6CF}\uFE0F',
      questions: [
        { id: 'bed-height', text: s.bedroomQ1, recommendation: s.bedroomR1 },
        { id: 'bedside-light', text: s.bedroomQ2, recommendation: s.bedroomR2 },
        { id: 'clear-path', text: s.bedroomQ3, recommendation: s.bedroomR3 },
        { id: 'phone-reach', text: s.bedroomQ4, recommendation: s.bedroomR4 },
      ],
    },
    {
      id: 'kitchen',
      name: s.kitchen,
      icon: '\u{1F373}',
      questions: [
        { id: 'items-reach', text: s.kitchenQ1, recommendation: s.kitchenR1 },
        { id: 'step-stool', text: s.kitchenQ2, recommendation: s.kitchenR2 },
        { id: 'floor-dry', text: s.kitchenQ3, recommendation: s.kitchenR3 },
        { id: 'fire-safety', text: s.kitchenQ4, recommendation: s.kitchenR4 },
      ],
    },
    {
      id: 'living',
      name: s.livingRoom,
      icon: '\u{1FA91}',
      questions: [
        { id: 'furniture-stable', text: s.livingQ1, recommendation: s.livingR1 },
        { id: 'cords-tucked', text: s.livingQ2, recommendation: s.livingR2 },
        { id: 'rugs-secured', text: s.livingQ3, recommendation: s.livingR3 },
        { id: 'chair-armrests', text: s.livingQ4, recommendation: s.livingR4 },
      ],
    },
    {
      id: 'walkways',
      name: s.walkways,
      icon: '\u{1F6B6}',
      questions: [
        { id: 'hallway-clear', text: s.walkwaysQ1, recommendation: s.walkwaysR1 },
        { id: 'handrails', text: s.walkwaysQ2, recommendation: s.walkwaysR2 },
        { id: 'stair-lighting', text: s.walkwaysQ3, recommendation: s.walkwaysR3 },
        { id: 'outdoor-path', text: s.walkwaysQ4, recommendation: s.walkwaysR4 },
        { id: 'doorway-width', text: s.walkwaysQ5, recommendation: s.walkwaysR5 },
      ],
    },
  ];
}

const STORAGE_KEY = 'silvergait-safety';
const TOTAL_QUESTIONS = 21;

function loadChecked(): Record<string, boolean> {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return data.items || {};
  } catch { return {}; }
}

function saveChecked(items: Record<string, boolean>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    date: new Date().toISOString().slice(0, 10),
    items,
  }));
}

export function SafetyPage() {
  const navigate = useNavigate();
  const t = useT();
  const rooms = useMemo(() => getSafetyRooms(t), [t]);
  const [checked, setChecked] = useState<Record<string, boolean>>(loadChecked);
  const [openRoom, setOpenRoom] = useState<string | null>(null);

  const checkedCount = Object.values(checked).filter(Boolean).length;
  const scorePercent = Math.round((checkedCount / TOTAL_QUESTIONS) * 100);
  const riskLabel = scorePercent >= 80 ? t.safety.riskLow : scorePercent >= 50 ? t.safety.riskModerate : t.safety.riskNeedsAttention;
  const riskClass = scorePercent >= 80 ? 'low' : scorePercent >= 50 ? 'moderate' : 'high';

  const toggle = useCallback((key: string) => {
    setChecked((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      saveChecked(next);
      return next;
    });
  }, []);

  const uncheckedRecommendations = rooms.flatMap((room) =>
    room.questions
      .filter((q) => !checked[`${room.id}-${q.id}`])
      .map((q) => q.recommendation)
  );

  const handleShare = async () => {
    const summary = `${t.safety.shareTitle}\n\n${tpl(t.safety.shareScore, { score: scorePercent, risk: riskLabel })}\n${tpl(t.safety.shareChecked, { done: checkedCount, total: TOTAL_QUESTIONS })}\n\n` +
      (uncheckedRecommendations.length > 0
        ? `${t.safety.recommendations}:\n${uncheckedRecommendations.slice(0, 5).map((r, i) => `${i + 1}. ${r}`).join('\n')}`
        : t.safety.allChecked);

    if (navigator.share) {
      try { await navigator.share({ title: t.safety.shareTitle, text: summary }); } catch { /* cancelled */ }
    } else {
      await navigator.clipboard.writeText(summary);
    }
  };

  return (
    <div className="page">
      <AppHeader />

      <div className="page-title">
        <h1>{t.safety.title}</h1>
        <p className="subtitle">{t.safety.subtitle}</p>
      </div>

      {/* Score summary */}
      <div className="safety-score-card">
        <ScoreRing score={checkedCount} maxScore={TOTAL_QUESTIONS} size="md" label={`${scorePercent}%`} />
        <div className="safety-score-info">
          <span className={`risk-badge ${riskClass}`}>{riskLabel}</span>
          <p>{tpl(t.safety.itemsChecked, { done: checkedCount, total: TOTAL_QUESTIONS })}</p>
        </div>
      </div>

      {/* Room accordion */}
      <div className="safety-rooms">
        {rooms.map((room) => {
          const roomChecked = room.questions.filter((q) => checked[`${room.id}-${q.id}`]).length;
          const isOpen = openRoom === room.id;
          return (
            <div key={room.id} className="safety-room">
              <button
                className="safety-room-header"
                onClick={() => setOpenRoom(isOpen ? null : room.id)}
              >
                <span className="safety-room-icon">{room.icon}</span>
                <span className="safety-room-name">{room.name}</span>
                <span className="safety-room-count">{roomChecked}/{room.questions.length}</span>
                <span className={`faq-chevron${isOpen ? ' open' : ''}`}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </span>
              </button>
              <div className={`safety-room-body${isOpen ? ' open' : ''}`}>
                {room.questions.map((q) => {
                  const key = `${room.id}-${q.id}`;
                  return (
                    <label key={key} className="safety-question">
                      <input
                        type="checkbox"
                        checked={!!checked[key]}
                        onChange={() => toggle(key)}
                      />
                      <span>{q.text}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Recommendations */}
      {uncheckedRecommendations.length > 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <h2>{t.safety.recommendations}</h2>
          <ul style={{ paddingLeft: 18, margin: '8px 0 0' }}>
            {uncheckedRecommendations.slice(0, 5).map((rec) => (
              <li key={rec} style={{ marginBottom: 6, color: 'var(--muted)', fontSize: '0.9rem' }}>{rec}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="progress-actions">
        <button className="btn-primary" onClick={handleShare}>{t.safety.shareResults}</button>
        <button className="btn-link" onClick={() => navigate('/help')}>{t.safety.backHelp}</button>
      </div>
    </div>
  );
}
