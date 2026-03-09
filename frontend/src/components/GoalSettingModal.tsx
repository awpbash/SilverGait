import { useState } from 'react';
import { useGoalStore } from '../stores';
import { useT } from '../i18n';

interface GoalSettingModalProps {
  onClose: () => void;
}

function Stepper({ label, value, onChange, min, max, step }: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
}) {
  return (
    <div className="goal-stepper">
      <span className="goal-stepper-label">{label}</span>
      <div className="goal-stepper-controls">
        <button
          className="goal-stepper-btn"
          onClick={() => onChange(Math.max(min, value - step))}
          disabled={value <= min}
          aria-label={`Decrease ${label}`}
        >
          &minus;
        </button>
        <span className="goal-stepper-value">{value.toLocaleString()}</span>
        <button
          className="goal-stepper-btn"
          onClick={() => onChange(Math.min(max, value + step))}
          disabled={value >= max}
          aria-label={`Increase ${label}`}
        >
          +
        </button>
      </div>
    </div>
  );
}

export function GoalSettingModal({ onClose }: GoalSettingModalProps) {
  const { goals, setGoals, resetGoals } = useGoalStore();
  const [draft, setDraft] = useState(goals);
  const t = useT();

  const handleSave = () => {
    setGoals(draft);
    onClose();
  };

  const handleReset = () => {
    resetGoals();
    onClose();
  };

  return (
    <div className="pain-modal-overlay" onClick={onClose}>
      <div className="pain-modal" onClick={(e) => e.stopPropagation()}>
        <h2>{t.goals.title}</h2>
        <p style={{ color: 'var(--muted)', marginBottom: 16 }}>
          {t.goals.subtitle}
        </p>

        <Stepper
          label={t.goals.exerciseDays}
          value={draft.exerciseDaysTarget}
          onChange={(v) => setDraft({ ...draft, exerciseDaysTarget: v })}
          min={1}
          max={7}
          step={1}
        />

        <Stepper
          label={t.goals.dailySteps}
          value={draft.stepsTarget}
          onChange={(v) => setDraft({ ...draft, stepsTarget: v })}
          min={1000}
          max={15000}
          step={1000}
        />

        <Stepper
          label={t.goals.assessmentsWeek}
          value={draft.assessmentsTarget}
          onChange={(v) => setDraft({ ...draft, assessmentsTarget: v })}
          min={1}
          max={7}
          step={1}
        />

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 16 }}>
          <button className="btn-primary" onClick={handleSave}>{t.goals.saveGoals}</button>
          <button className="btn-ghost" onClick={handleReset}>{t.goals.resetDefaults}</button>
          <button className="btn-link" onClick={onClose}>{t.common.cancel}</button>
        </div>
      </div>
    </div>
  );
}
