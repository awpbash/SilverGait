import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppHeader, ScoreRing } from '../components';
import { useAssessmentStore, useUserStore } from '../stores';
import { useT, tpl } from '../i18n';
import type { Translations } from '../i18n/en';
import { computeTotal } from '../utils/scoring';
import { formatDate } from '../utils/formatting';
import { useExerciseStats } from '../hooks/useExerciseStats';
import { contextApi, alertsApi, frailtyApi } from '../services/api';

function getTierBadge(tier: string, t: Translations): { label: string; className: string } {
  const map: Record<string, { label: string; className: string }> = {
    robust: { label: t.caregiver.tierRobust, className: 'low' },
    pre_frail: { label: t.caregiver.tierPreFrail, className: 'moderate' },
    frail: { label: t.caregiver.tierFrail, className: 'high' },
    severely_frail: { label: t.caregiver.tierSeverelyFrail, className: 'high' },
  };
  return map[tier] || { label: t.caregiver.tierUnknown, className: 'moderate' };
}

type AlertItem = {
  id: number;
  alert_type: string;
  severity: string;
  message: string;
  timestamp: string;
  source: string;
};

type FrailtyEntry = {
  timestamp: string;
  frailty_tier: string;
  sppb_total: number | null;
  cfs_score: number | null;
  katz_total: number | null;
};

export function CaregiverPage() {
  const { latestAssessment, history } = useAssessmentStore();
  const userId = useUserStore((s: { userId: string }) => s.userId);
  const navigate = useNavigate();
  const t = useT();
  const exerciseStats = useExerciseStats(7);

  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [frailtyHistory, setFrailtyHistory] = useState<FrailtyEntry[]>([]);
  const [ctx, setCtx] = useState<{
    current_tier: string | null;
    cfs_score: number | null;
    katz_total: number | null;
    sppb_total: number | null;
    sppb_direction: string;
    risk_explanation?: string;
    sleep_risk: string | null;
    mood_risk: string | null;
    cognitive_risk: string | null;
    social_isolation_risk: string | null;
    active_plans: Record<string, unknown>;
  } | null>(null);

  useEffect(() => {
    contextApi.get(userId).then(setCtx).catch(() => {});
    alertsApi.getAll(userId).then(setAlerts).catch(() => {});
    frailtyApi.getHistory(userId).then(setFrailtyHistory).catch(() => {});
  }, [userId]);

  const breakdown = latestAssessment?.sppb_breakdown;
  const totalScore = ctx?.sppb_total ?? (breakdown
    ? breakdown.balance_score + breakdown.gait_score + breakdown.chair_stand_score
    : latestAssessment ? latestAssessment.score : null);

  const tier = ctx?.current_tier;
  const tierBadge = tier ? getTierBadge(tier, t) : null;
  const trend = ctx?.sppb_direction || 'stable';

  const topRecommendations = latestAssessment?.recommendations?.slice(0, 3) || [
    t.caregiver.defaultRec1,
    t.caregiver.defaultRec2,
    t.caregiver.defaultRec3,
  ];

  const recentHistory = history.slice(0, 3);
  const urgentAlerts = alerts.filter(a => a.severity === 'urgent');
  const otherAlerts = alerts.filter(a => a.severity !== 'urgent').slice(0, 5);

  const handleShare = async () => {
    const scoreText = totalScore !== null ? `${totalScore}/12` : t.caregiver.noData;
    const tierText = tier ? getTierBadge(tier, t).label : t.caregiver.tierUnknown;
    const summary = [
      t.caregiver.shareSummaryTitle,
      '',
      tpl(t.caregiver.shareFrailtyTier, { tier: tierText }),
      tpl(t.caregiver.shareMobility, { score: scoreText }),
      ctx?.cfs_score != null ? tpl(t.caregiver.shareCfs, { score: ctx.cfs_score }) : '',
      ctx?.katz_total != null ? tpl(t.caregiver.shareKatz, { score: ctx.katz_total }) : '',
      tpl(t.caregiver.shareStreak, { count: exerciseStats.streak }),
      tpl(t.caregiver.shareWeekExercises, { count: exerciseStats.totalExercises }),
      '',
      t.caregiver.shareRecommendations,
      ...topRecommendations.map((r, i) => `${i + 1}. ${r}`),
    ].filter(Boolean).join('\n');

    if (navigator.share) {
      try { await navigator.share({ title: t.caregiver.shareSummaryTitle, text: summary }); } catch {}
    } else {
      await navigator.clipboard.writeText(summary);
    }
  };

  return (
    <div className="page">
      <AppHeader />

      <div className="page-title">
        <h1>{t.caregiver.title}</h1>
        <p className="subtitle">{t.caregiver.subtitle}</p>
      </div>

      <div className="stack">
        {/* Urgent Alerts */}
        {urgentAlerts.length > 0 && (
          <div className="caregiver-alerts">
            {urgentAlerts.map((alert) => (
              <div key={alert.id} className="caregiver-alert urgent">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <span>{alert.message}</span>
              </div>
            ))}
          </div>
        )}

        {/* Trend indicator */}
        {trend !== 'stable' && (
          <div className={`caregiver-trend ${trend === 'improving' ? 'improving' : 'declining'}`}>
            <svg width="16" height="16" viewBox="0 0 20 20">
              {trend === 'improving'
                ? <path d="M10 4l5 6h-3v6h-4v-6H5l5-6z" fill="currentColor" />
                : <path d="M10 16l-5-6h3V4h4v6h3l-5 6z" fill="currentColor" />
              }
            </svg>
            <span>{trend === 'improving' ? t.caregiver.trendImproving : t.caregiver.trendDeclining}</span>
          </div>
        )}

        {/* Frailty Tier + Scores */}
        <div className="card">
          <h2>{t.caregiver.latestCheck}</h2>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 }}>
            <div>
              <div className="metric-grid two" style={{ marginBottom: 12 }}>
                <div className="metric-card">
                  <strong>{totalScore !== null ? `${totalScore}/12` : '--'}</strong>
                  <span>SPPB</span>
                </div>
                <div className="metric-card">
                  <strong>{ctx?.cfs_score != null ? `${ctx.cfs_score}/9` : '--'}</strong>
                  <span>CFS</span>
                </div>
              </div>
              <div className="metric-grid two" style={{ marginBottom: 12 }}>
                <div className="metric-card">
                  <strong>{ctx?.katz_total != null ? `${ctx.katz_total}/6` : '--'}</strong>
                  <span>Katz ADL</span>
                </div>
                <div className="metric-card">
                  {tierBadge ? (
                    <span className={`risk-badge ${tierBadge.className}`}>
                      {tierBadge.label}
                    </span>
                  ) : (
                    <strong>--</strong>
                  )}
                  <span>{t.caregiver.frailtyTier}</span>
                </div>
              </div>
            </div>
            {totalScore !== null && (
              <ScoreRing score={totalScore} maxScore={12} size="sm" />
            )}
          </div>
        </div>

        {/* Risk Factors */}
        {ctx && ((ctx.sleep_risk ?? 'low') !== 'low' || (ctx.mood_risk ?? 'low') !== 'low' || (ctx.cognitive_risk ?? 'low') !== 'low' || (ctx.social_isolation_risk ?? 'low') !== 'low') && (
          <div className="card">
            <h2>{t.caregiver.riskFactors}</h2>
            <div className="agent-contributing" style={{ marginTop: 8 }}>
              {ctx.sleep_risk && ctx.sleep_risk !== 'low' && <span className={`agent-risk-chip risk-${ctx.sleep_risk}`}>{t.caregiver.riskSleep}: {ctx.sleep_risk}</span>}
              {ctx.mood_risk && ctx.mood_risk !== 'low' && <span className={`agent-risk-chip risk-${ctx.mood_risk}`}>{t.caregiver.riskMood}: {ctx.mood_risk}</span>}
              {ctx.cognitive_risk && ctx.cognitive_risk !== 'low' && <span className={`agent-risk-chip risk-${ctx.cognitive_risk}`}>{t.caregiver.riskCognitive}: {ctx.cognitive_risk}</span>}
              {ctx.social_isolation_risk && ctx.social_isolation_risk !== 'low' && <span className={`agent-risk-chip risk-${ctx.social_isolation_risk}`}>{t.caregiver.riskSocial}: {ctx.social_isolation_risk}</span>}
            </div>
          </div>
        )}

        {/* Frailty Tier History */}
        {frailtyHistory.length > 0 && (
          <div className="card">
            <h2>{t.caregiver.tierHistory}</h2>
            <div className="caregiver-history" style={{ marginTop: 8 }}>
              {frailtyHistory.slice(0, 5).map((entry, i) => {
                const badge = getTierBadge(entry.frailty_tier, t);
                return (
                  <div key={i} className="caregiver-history-item">
                    <span>{entry.timestamp ? new Date(entry.timestamp).toLocaleDateString() : '--'}</span>
                    <span className={`risk-badge ${badge.className}`} style={{ fontSize: '0.75rem', padding: '3px 10px' }}>
                      {badge.label}
                    </span>
                    {entry.sppb_total != null && <strong>{entry.sppb_total}/12</strong>}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Assessment History */}
        {recentHistory.length > 0 && (
          <div className="card">
            <h2>{t.caregiver.recentAssessments}</h2>
            <div className="caregiver-history" style={{ marginTop: 8 }}>
              {recentHistory.map((item, i) => {
                const score = computeTotal(item);
                return (
                  <div key={i} className="caregiver-history-item">
                    <span>{formatDate(item.timestamp)}</span>
                    <strong>{score}/12</strong>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Recommendations */}
        <div className="card">
          <h2>{t.caregiver.suggestedFocus}</h2>
          <ul style={{ paddingLeft: 18, margin: '8px 0 0' }}>
            {topRecommendations.map((item) => (
              <li key={item} style={{ marginBottom: 6, color: 'var(--muted)', fontSize: '0.95rem' }}>
                {item}
              </li>
            ))}
          </ul>
        </div>

        {/* Exercise Activity */}
        <div className="card">
          <h2>{t.caregiver.exerciseActivity}</h2>
          <div className="metric-grid two" style={{ marginTop: 8 }}>
            <div className="metric-card">
              <strong>{exerciseStats.streak}</strong>
              <span>{t.caregiver.dayStreak}</span>
            </div>
            <div className="metric-card">
              <strong>{exerciseStats.totalExercises}</strong>
              <span>{t.caregiver.thisWeek}</span>
            </div>
          </div>
          <div style={{ marginTop: 8, fontSize: '0.9rem', color: 'var(--muted)' }}>
            {t.caregiver.today}: {exerciseStats.todayCompleted.length > 0
              ? exerciseStats.todayCompleted.join(', ')
              : t.caregiver.noExercisesYet}
          </div>
        </div>

        {/* Other Alerts */}
        {otherAlerts.length > 0 && (
          <div className="card">
            <h2>{t.caregiver.alertHistory}</h2>
            <div className="caregiver-alerts">
              {otherAlerts.map((alert) => (
                <div key={alert.id} className={`caregiver-alert ${alert.severity}`}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                    <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
                  </svg>
                  <span>{alert.message}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Care Notes */}
        <div className="card">
          <h2>{t.caregiver.careNotes}</h2>
          <p>{t.caregiver.careNotesDesc}</p>
        </div>
      </div>

      <div className="progress-actions">
        <button className="btn-primary" onClick={handleShare}>
          {t.caregiver.shareSum}
        </button>
        <button onClick={() => navigate('/help')} className="btn-link">
          {t.caregiver.backHelp}
        </button>
      </div>
    </div>
  );
}
