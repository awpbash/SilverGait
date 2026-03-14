import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppHeader, ScoreRing } from '../components';
import { useAssessmentStore, useUserStore } from '../stores';
import { useT, tpl } from '../i18n';
import { computeTotal } from '../utils/scoring';
import { useExerciseStats } from '../hooks/useExerciseStats';
import { contextApi } from '../services/api';

export function ActivityPage() {
  const { latestAssessment, history } = useAssessmentStore();
  const userId = useUserStore((s: { userId: string }) => s.userId);
  const navigate = useNavigate();
  const t = useT();
  const exerciseStats = useExerciseStats(7);
  const [trend, setTrend] = useState<string>('stable');
  const [tier, setTier] = useState<string | null>(null);

  useEffect(() => {
    contextApi.get(userId).then((data) => {
      setTrend(data.sppb_direction || 'stable');
      setTier(data.current_tier);
    }).catch(() => {});
  }, [userId]);

  const breakdown = latestAssessment?.sppb_breakdown;
  const sppbScore = breakdown
    ? (breakdown.balance_score ?? 0) + (breakdown.gait_score ?? 0) + (breakdown.chair_stand_score ?? 0)
    : Math.round((latestAssessment?.score ?? 0) * 3);

  const balanceScore = breakdown?.balance_score ?? 0;
  const gaitScore = breakdown?.gait_score ?? 0;
  const chairScore = breakdown?.chair_stand_score ?? 0;

  const previous = history?.[1];
  const previousTotal = previous ? computeTotal(previous) : null;
  const delta = previousTotal !== null ? sppbScore - previousTotal : null;

  const deltaClass = delta === null ? 'neutral' : delta > 0 ? 'positive' : delta < 0 ? 'negative' : 'neutral';
  const deltaText = delta === null
    ? t.activity.noPreviousData
    : delta === 0
    ? t.activity.sameAsLast
    : tpl(t.activity.deltaFrom, { delta: `${delta > 0 ? '+' : ''}${delta}` });

  // Daily checklist items
  const didAssessment = !!latestAssessment?.timestamp && isToday(latestAssessment.timestamp);
  const todayCount = exerciseStats.todayCompleted.length;
  const checklist = [
    { done: didAssessment, label: t.activity.checklistAssessment, action: () => navigate('/check') },
    { done: todayCount >= 1, label: tpl(t.activity.checklistExercise, { count: String(Math.max(3 - todayCount, 0)) }), action: () => navigate('/exercises') },
  ];

  return (
    <div className="page">
      <AppHeader />

      <div className="page-title">
        <h1>{t.activity.title}</h1>
        <p className="subtitle">{t.activity.todaySubtitle}</p>
      </div>

      {/* Decline warning */}
      {trend === 'declining' && (
        <div className="activity-decline-banner">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <span>{t.activity.declineWarning}</span>
        </div>
      )}

      {/* Hero Score Ring */}
      <div className="activity-hero">
        {tier && (
          <span className={`activity-tier-badge tier-${tier}`}>
            {tier.replace(/_/g, ' ')}
          </span>
        )}
        <ScoreRing
          score={sppbScore}
          maxScore={12}
          size="lg"
          label={t.activity.sppb}
          sublabel={sppbScore >= 9 ? t.activity.good : sppbScore >= 6 ? t.activity.fair : t.activity.needsWork}
        />
        <span className={`activity-delta ${deltaClass}`}>{deltaText}</span>
      </div>

      {/* 3-column breakdown */}
      <div className="activity-breakdown">
        <div className="breakdown-item">
          <ScoreRing score={balanceScore} maxScore={4} size="sm" />
          <span className="breakdown-label">{t.activity.balance}</span>
        </div>
        <div className="breakdown-item">
          <ScoreRing score={gaitScore} maxScore={4} size="sm" />
          <span className="breakdown-label">{t.activity.gait}</span>
        </div>
        <div className="breakdown-item">
          <ScoreRing score={chairScore} maxScore={4} size="sm" />
          <span className="breakdown-label">{t.activity.chair}</span>
        </div>
      </div>

      {/* Daily Checklist */}
      <div className="activity-checklist">
        <p className="card-title">{t.activity.todayChecklist}</p>
        {checklist.map((item) => (
          <button
            key={item.label}
            className={`checklist-item ${item.done ? 'done' : ''}`}
            onClick={item.action}
          >
            <span className="checklist-icon">
              {item.done ? (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--olive-600)" strokeWidth="2.5">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
              ) : (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="1.5">
                  <circle cx="12" cy="12" r="10" />
                </svg>
              )}
            </span>
            <span className="checklist-label">{item.label}</span>
            {!item.done && (
              <svg className="checklist-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 18l6-6-6-6" />
              </svg>
            )}
          </button>
        ))}
      </div>

      {/* Today's Stats */}
      <div className="activity-stats">
        <p className="card-title">{t.activity.todayStats}</p>
        <div className="stat-row">
          <span className="stat-icon" aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
          </span>
          <strong>{todayCount} {t.activity.exercisesToday}</strong>
          <span>{todayCount >= 5 ? t.activity.great : todayCount > 0 ? t.activity.keepMoving : t.activity.noData}</span>
        </div>
        <div className="stat-row">
          <span className="stat-icon" aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
            </svg>
          </span>
          <strong>{exerciseStats.streak} {t.activity.dayStreak}</strong>
          <span>{exerciseStats.streak >= 7 ? t.activity.great : exerciseStats.streak >= 3 ? t.activity.keepMoving : exerciseStats.streak > 0 ? t.activity.almostThere : t.activity.noData}</span>
        </div>
      </div>

      {/* Actions */}
      <div className="progress-actions">
        <button className="btn-primary" onClick={() => navigate('/check')}>
          {t.activity.startCheck}
        </button>
        <button className="btn-link" onClick={() => navigate('/report')}>
          {t.activity.weeklyReport}
        </button>
      </div>
    </div>
  );
}

function isToday(timestamp: string | null | undefined): boolean {
  if (!timestamp) return false;
  const d = new Date(timestamp);
  if (isNaN(d.getTime())) return false;
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}
