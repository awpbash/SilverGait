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

const PLAN_LABELS: Record<string, keyof Translations['caregiver']> = {
  exercise: 'planExercise',
  sleep: 'planSleep',
  nutrition: 'planNutrition',
  falls_prevention: 'planFalls',
  social: 'planSocial',
};

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

function SppbSparkline({ data }: { data: number[] }) {
  if (data.length < 2) return null;
  const max = 12;
  const w = 120;
  const h = 36;
  const pad = 4;
  const points = data.map((v, i) => {
    const x = pad + (i / (data.length - 1)) * (w - pad * 2);
    const y = h - pad - ((v / max) * (h - pad * 2));
    return `${x},${y}`;
  }).join(' ');

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="sppb-sparkline">
      <polyline
        points={points}
        fill="none"
        stroke="var(--olive-600)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {data.map((v, i) => {
        const x = pad + (i / (data.length - 1)) * (w - pad * 2);
        const y = h - pad - ((v / max) * (h - pad * 2));
        return <circle key={i} cx={x} cy={y} r="3" fill={i === data.length - 1 ? 'var(--olive-700)' : 'var(--olive-400)'} />;
      })}
    </svg>
  );
}

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
    display_name?: string;
    days_since_last_assessment?: number | null;
    recheck_due?: boolean;
    balance_score?: number | null;
    gait_score?: number | null;
    chair_score?: number | null;
    sppb_trend?: number[];
    recent_issues?: string[];
  } | null>(null);

  useEffect(() => {
    contextApi.get(userId).then(setCtx).catch(() => { /* caregiver context unavailable */ });
    alertsApi.getAll(userId).then(setAlerts).catch(() => { /* alerts unavailable */ });
    frailtyApi.getHistory(userId).then(setFrailtyHistory).catch(() => { /* history unavailable */ });
  }, [userId]);

  const breakdown = latestAssessment?.sppb_breakdown;
  const totalScore = ctx?.sppb_total ?? (breakdown
    ? breakdown.balance_score + breakdown.gait_score + breakdown.chair_stand_score
    : latestAssessment ? latestAssessment.score : null);

  const tier = ctx?.current_tier;
  const tierBadge = tier ? getTierBadge(tier, t) : null;
  const trend = ctx?.sppb_direction || 'stable';

  const balanceScore = ctx?.balance_score ?? breakdown?.balance_score ?? null;
  const gaitScore = ctx?.gait_score ?? breakdown?.gait_score ?? null;
  const chairScore = ctx?.chair_score ?? breakdown?.chair_stand_score ?? null;
  const sppbTrend = ctx?.sppb_trend || [];
  const recentIssues = ctx?.recent_issues || [];
  const activePlans = ctx?.active_plans || {};
  const daysSince = ctx?.days_since_last_assessment;
  const recheckDue = ctx?.recheck_due || false;

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
      (balanceScore != null && gaitScore != null && chairScore != null)
        ? tpl(t.caregiver.shareSubScores, { balance: balanceScore, gait: gaitScore, chair: chairScore })
        : '',
      ctx?.cfs_score != null ? tpl(t.caregiver.shareCfs, { score: ctx.cfs_score }) : '',
      ctx?.katz_total != null ? tpl(t.caregiver.shareKatz, { score: ctx.katz_total }) : '',
      daysSince != null ? tpl(t.caregiver.shareDaysSince, { count: daysSince }) : '',
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
      <AppHeader showBack backTo="/more" />

      <div className="page-title">
        <h1>{t.caregiver.title}</h1>
        <p className="subtitle">{t.caregiver.subtitle}</p>
      </div>

      <div className="stack">
        {/* Patient name + recheck badge */}
        {ctx?.display_name && (
          <div className="caregiver-patient-header">
            <div className="caregiver-patient-name">
              <span className="label">{t.caregiver.patientLabel}</span>
              <span className="name">{ctx.display_name}</span>
            </div>
            <div className="caregiver-recheck-row">
              {daysSince != null && (
                <span className="caregiver-days-since">{tpl(t.caregiver.daysSince, { count: daysSince })}</span>
              )}
              {recheckDue && (
                <span className="caregiver-recheck-badge">{t.caregiver.recheckDue}</span>
              )}
            </div>
          </div>
        )}

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

        {/* SPPB Sub-score Breakdown */}
        {(balanceScore != null || gaitScore != null || chairScore != null) && (
          <div className="card">
            <h2>{t.caregiver.sppbBreakdown}</h2>
            <div className="sppb-subscores">
              <div className="subscore-row">
                <ScoreRing score={balanceScore ?? 0} maxScore={4} size="sm" label={t.caregiver.balanceLabel} />
                <ScoreRing score={gaitScore ?? 0} maxScore={4} size="sm" label={t.caregiver.walkingLabel} />
                <ScoreRing score={chairScore ?? 0} maxScore={4} size="sm" label={t.caregiver.gettingUpLabel} />
              </div>
            </div>
          </div>
        )}

        {/* SPPB Trend Sparkline */}
        {sppbTrend.length >= 2 && (
          <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h2>{t.caregiver.sppbTrend}</h2>
              <SppbSparkline data={sppbTrend} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: '0.8rem', color: 'var(--muted)' }}>
              <span>{sppbTrend[0]}/12</span>
              <span>{sppbTrend[sppbTrend.length - 1]}/12</span>
            </div>
          </div>
        )}

        {/* Recent Movement Issues */}
        {recentIssues.length > 0 && (
          <div className="card">
            <h2>{t.caregiver.movementIssues}</h2>
            <div className="agent-contributing" style={{ marginTop: 8 }}>
              {recentIssues.map((issue) => (
                <span key={issue} className="agent-risk-chip risk-moderate">{issue}</span>
              ))}
            </div>
          </div>
        )}

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

        {/* Active Care Plans */}
        {Object.keys(activePlans).length > 0 && (
          <div className="card">
            <h2>{t.caregiver.activePlans}</h2>
            <div className="agent-contributing" style={{ marginTop: 8 }}>
              {Object.keys(activePlans).map((planType) => {
                const labelKey = PLAN_LABELS[planType];
                const label = labelKey ? t.caregiver[labelKey] as string : planType;
                return (
                  <span key={planType} className="agent-risk-chip risk-low">{label}</span>
                );
              })}
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
