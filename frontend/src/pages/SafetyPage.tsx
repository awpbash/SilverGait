import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppHeader, ScoreRing } from '../components';
import type { SafetyRoom } from '../types';

const SAFETY_ROOMS: SafetyRoom[] = [
  {
    id: 'bathroom',
    name: 'Bathroom',
    icon: '\u{1F6BF}',
    questions: [
      { id: 'grab-bars', text: 'Grab bars installed near toilet and shower', recommendation: 'Install grab bars near the toilet and in the shower area.' },
      { id: 'non-slip-mat', text: 'Non-slip mat in shower or tub', recommendation: 'Place non-slip mats in wet areas to prevent falls.' },
      { id: 'lighting', text: 'Good lighting, including a night light', recommendation: 'Add bright lighting and a night light for nighttime trips.' },
      { id: 'raised-seat', text: 'Raised toilet seat or support rails', recommendation: 'Consider a raised toilet seat with support rails for easier use.' },
    ],
  },
  {
    id: 'bedroom',
    name: 'Bedroom',
    icon: '\u{1F6CF}\uFE0F',
    questions: [
      { id: 'bed-height', text: 'Bed is at a comfortable height to get in/out', recommendation: 'Adjust bed height so feet touch the floor when sitting on the edge.' },
      { id: 'bedside-light', text: 'Light switch or lamp within reach from bed', recommendation: 'Place a lamp or light switch within arm\u2019s reach of the bed.' },
      { id: 'clear-path', text: 'Clear path from bed to bathroom', recommendation: 'Remove clutter and ensure a clear, wide path to the bathroom.' },
      { id: 'phone-reach', text: 'Phone within reach from the bed', recommendation: 'Keep a phone or emergency button near the bed.' },
    ],
  },
  {
    id: 'kitchen',
    name: 'Kitchen',
    icon: '\u{1F373}',
    questions: [
      { id: 'items-reach', text: 'Frequently used items within easy reach', recommendation: 'Move everyday items to lower shelves to avoid reaching or climbing.' },
      { id: 'step-stool', text: 'Sturdy step stool available (not a chair)', recommendation: 'Use a sturdy step stool with a handrail instead of climbing on chairs.' },
      { id: 'floor-dry', text: 'Floor kept dry and free of spills', recommendation: 'Wipe up spills immediately and use non-slip mats near the sink.' },
      { id: 'fire-safety', text: 'Stove has auto-shut-off or timer', recommendation: 'Use a stove timer and consider an auto-shut-off device for safety.' },
    ],
  },
  {
    id: 'living',
    name: 'Living Room',
    icon: '\u{1FA91}',
    questions: [
      { id: 'furniture-stable', text: 'Furniture is stable and not wobbly', recommendation: 'Secure or replace any wobbly furniture that could topple.' },
      { id: 'cords-tucked', text: 'Electrical cords are tucked away', recommendation: 'Secure loose cords along walls to prevent tripping.' },
      { id: 'rugs-secured', text: 'Rugs are secured or removed', recommendation: 'Use non-slip backing on rugs or remove them entirely.' },
      { id: 'chair-armrests', text: 'At least one chair with sturdy armrests', recommendation: 'Keep a chair with firm armrests for easier sitting and standing.' },
    ],
  },
  {
    id: 'walkways',
    name: 'Walkways & Stairs',
    icon: '\u{1F6B6}',
    questions: [
      { id: 'hallway-clear', text: 'Hallways are clear of clutter', recommendation: 'Remove obstacles from hallways to ensure a clear walking path.' },
      { id: 'handrails', text: 'Handrails on both sides of stairs', recommendation: 'Install handrails on both sides of all stairways.' },
      { id: 'stair-lighting', text: 'Stairs are well lit', recommendation: 'Add bright lighting at the top and bottom of stairs.' },
      { id: 'outdoor-path', text: 'Outdoor paths are even and well maintained', recommendation: 'Repair uneven outdoor surfaces and keep paths clear of debris.' },
      { id: 'doorway-width', text: 'Doorways are wide enough for easy passage', recommendation: 'Ensure doorways are at least 80cm wide for comfortable movement.' },
    ],
  },
];

const STORAGE_KEY = 'silvergait-safety';

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

const TOTAL_QUESTIONS = SAFETY_ROOMS.reduce((sum, room) => sum + room.questions.length, 0);

export function SafetyPage() {
  const navigate = useNavigate();
  const [checked, setChecked] = useState<Record<string, boolean>>(loadChecked);
  const [openRoom, setOpenRoom] = useState<string | null>(null);

  const checkedCount = Object.values(checked).filter(Boolean).length;
  const scorePercent = Math.round((checkedCount / TOTAL_QUESTIONS) * 100);
  const riskLabel = scorePercent >= 80 ? 'Low Risk' : scorePercent >= 50 ? 'Moderate' : 'Needs Attention';
  const riskClass = scorePercent >= 80 ? 'low' : scorePercent >= 50 ? 'moderate' : 'high';

  const toggle = useCallback((key: string) => {
    setChecked((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      saveChecked(next);
      return next;
    });
  }, []);

  const uncheckedRecommendations = SAFETY_ROOMS.flatMap((room) =>
    room.questions
      .filter((q) => !checked[`${room.id}-${q.id}`])
      .map((q) => q.recommendation)
  );

  const handleShare = async () => {
    const summary = `SilverGait Home Safety Check\n\nScore: ${scorePercent}% (${riskLabel})\nChecked: ${checkedCount} of ${TOTAL_QUESTIONS} items\n\n` +
      (uncheckedRecommendations.length > 0
        ? `Recommendations:\n${uncheckedRecommendations.slice(0, 5).map((r, i) => `${i + 1}. ${r}`).join('\n')}`
        : 'All safety items checked!');

    if (navigator.share) {
      try { await navigator.share({ title: 'SilverGait Safety Check', text: summary }); } catch { /* cancelled */ }
    } else {
      await navigator.clipboard.writeText(summary);
    }
  };

  return (
    <div className="page">
      <AppHeader />

      <div className="page-title">
        <h1>Home Safety Check</h1>
        <p className="subtitle">Room-by-room fall prevention guide</p>
      </div>

      {/* Score summary */}
      <div className="safety-score-card">
        <ScoreRing score={checkedCount} maxScore={TOTAL_QUESTIONS} size="md" label={`${scorePercent}%`} />
        <div className="safety-score-info">
          <span className={`risk-badge ${riskClass}`}>{riskLabel}</span>
          <p>{checkedCount} of {TOTAL_QUESTIONS} items checked</p>
        </div>
      </div>

      {/* Room accordion */}
      <div className="safety-rooms">
        {SAFETY_ROOMS.map((room) => {
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
          <h2>Recommendations</h2>
          <ul style={{ paddingLeft: 18, margin: '8px 0 0' }}>
            {uncheckedRecommendations.slice(0, 5).map((rec) => (
              <li key={rec} style={{ marginBottom: 6, color: 'var(--muted)', fontSize: '0.9rem' }}>{rec}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="progress-actions">
        <button className="btn-primary" onClick={handleShare}>Share Results</button>
        <button className="btn-link" onClick={() => navigate('/help')}>Back to Help</button>
      </div>
    </div>
  );
}
