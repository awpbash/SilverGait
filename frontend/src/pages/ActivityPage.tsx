import { useNavigate } from 'react-router-dom';
import { AppHeader, ScoreRing } from '../components';
import { useAssessmentStore, useUserStore } from '../stores';

function computeTotal(assessment: { score: number; sppb_breakdown?: { balance_score: number; gait_score: number; chair_stand_score: number } }): number {
  const bd = assessment.sppb_breakdown;
  return bd ? bd.balance_score + bd.gait_score + bd.chair_stand_score : Math.round(assessment.score * 3);
}

function formatShortDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-SG', { weekday: 'short' });
}

export function ActivityPage() {
  const { latestAssessment, history } = useAssessmentStore();
  const { todayMetrics } = useUserStore();
  const navigate = useNavigate();

  const breakdown = latestAssessment?.sppb_breakdown;
  const sppbScore = breakdown
    ? breakdown.balance_score + breakdown.gait_score + breakdown.chair_stand_score
    : Math.round((latestAssessment?.score ?? 0) * 3);

  const balanceScore = breakdown?.balance_score ?? 0;
  const gaitScore = breakdown?.gait_score ?? 0;
  const chairScore = breakdown?.chair_stand_score ?? 0;

  const previous = history?.[1];
  const previousTotal = previous ? computeTotal(previous) : null;
  const delta = previousTotal !== null ? sppbScore - previousTotal : null;

  const deltaClass = delta === null ? 'neutral' : delta > 0 ? 'positive' : delta < 0 ? 'negative' : 'neutral';
  const deltaText = delta === null
    ? 'No previous data'
    : delta === 0
    ? 'Same as last time'
    : `${delta > 0 ? '+' : ''}${delta} from last check`;

  const chartData = history.slice(0, 5).reverse().map((item) => ({
    score: computeTotal(item),
    label: formatShortDate(item.timestamp),
  }));

  const steps = todayMetrics?.steps ?? 0;
  const mvpa = todayMetrics?.mvpa_minutes ?? 0;

  return (
    <div className="page">
      <AppHeader />

      <div className="page-title">
        <h1>Your Progress</h1>
      </div>

      {/* Hero Score Ring */}
      <div className="activity-hero">
        <ScoreRing
          score={sppbScore}
          maxScore={12}
          size="lg"
          label="SPPB"
          sublabel={sppbScore >= 9 ? 'Good' : sppbScore >= 6 ? 'Fair' : 'Needs Work'}
        />
        <span className={`activity-delta ${deltaClass}`}>{deltaText}</span>
      </div>

      {/* 3-column breakdown */}
      <div className="activity-breakdown">
        <div className="breakdown-item">
          <ScoreRing score={balanceScore} maxScore={4} size="sm" />
          <span className="breakdown-label">Balance</span>
        </div>
        <div className="breakdown-item">
          <ScoreRing score={gaitScore} maxScore={4} size="sm" />
          <span className="breakdown-label">Gait</span>
        </div>
        <div className="breakdown-item">
          <ScoreRing score={chairScore} maxScore={4} size="sm" />
          <span className="breakdown-label">Chair</span>
        </div>
      </div>

      {/* Assessment History Chart */}
      {chartData.length > 0 && (
        <div className="history-chart">
          <p className="card-title">Assessment History</p>
          <div className="chart-bars">
            {chartData.map((item, i) => (
              <div key={i} className="chart-bar-wrapper">
                <div
                  className={`chart-bar${i === chartData.length - 1 ? ' latest' : ''}`}
                  style={{ height: `${(item.score / 12) * 100}%` }}
                />
                <span className="chart-bar-label">{item.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Today's Stats */}
      <div className="activity-stats">
        <p className="card-title">Today&apos;s Stats</p>
        <div className="stat-row">
          <span className="stat-icon" aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M12 22s-8-6-8-12a8 8 0 0 1 16 0c0 6-8 12-8 12z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
          </span>
          <strong>{steps > 0 ? steps.toLocaleString() : '--'} steps</strong>
          <span>{steps >= 8000 ? 'Great!' : steps > 0 ? 'Keep moving' : 'No data'}</span>
        </div>
        <div className="stat-row">
          <span className="stat-icon" aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 6v6l4 2" />
            </svg>
          </span>
          <strong>{mvpa > 0 ? `${mvpa} min` : '--'} active</strong>
          <span>{mvpa >= 30 ? 'On target' : mvpa > 0 ? 'Almost there' : 'No data'}</span>
        </div>
      </div>

      {/* Actions */}
      <div className="progress-actions">
        <button className="btn-primary" onClick={() => navigate('/check')}>
          Start Today&apos;s Check
        </button>
        <button className="btn-link" onClick={() => navigate('/exercises')}>
          View Exercises
        </button>
        <button className="btn-link" onClick={() => navigate('/report')}>
          Weekly Report
        </button>
      </div>
    </div>
  );
}
