import { useNavigate } from 'react-router-dom';
import { AppHeader, ScoreRing } from '../components';
import { useAssessmentStore } from '../stores';
import { useT } from '../i18n';
import { computeTotal } from '../utils/scoring';
import { formatDate } from '../utils/formatting';
import { useExerciseStats } from '../hooks/useExerciseStats';

function getRiskLevel(score: number): { label: string; className: string } {
  if (score >= 9) return { label: 'Low Risk', className: 'low' };
  if (score >= 6) return { label: 'Moderate Risk', className: 'moderate' };
  return { label: 'High Risk', className: 'high' };
}

export function CaregiverPage() {
  const { latestAssessment, history } = useAssessmentStore();
  const navigate = useNavigate();
  const t = useT();
  const exerciseStats = useExerciseStats(7);

  const breakdown = latestAssessment?.sppb_breakdown;
  const totalScore = breakdown
    ? breakdown.balance_score + breakdown.gait_score + breakdown.chair_stand_score
    : latestAssessment
    ? latestAssessment.score
    : null;

  const risk = totalScore !== null ? getRiskLevel(totalScore) : null;
  const confidenceText = latestAssessment ? `${Math.round(latestAssessment.confidence * 100)}%` : '--';
  const topRecommendations = latestAssessment?.recommendations?.slice(0, 3) || [
    t.caregiver.defaultRec1,
    t.caregiver.defaultRec2,
    t.caregiver.defaultRec3,
  ];

  const recentHistory = history.slice(0, 3);

  const handleShare = async () => {
    const scoreText = totalScore !== null ? `${totalScore}/12` : 'No data';
    const riskText = risk ? risk.label : 'Unknown';
    const summary = `SilverGait Caregiver Summary\n\nMobility Score: ${scoreText}\nRisk Level: ${riskText}\nConfidence: ${confidenceText}\nExercise Streak: ${exerciseStats.streak} days\nExercises This Week: ${exerciseStats.totalExercises}\n\nRecommendations:\n${topRecommendations.map((r, i) => `${i + 1}. ${r}`).join('\n')}`;

    if (navigator.share) {
      try {
        await navigator.share({ title: 'SilverGait Summary', text: summary });
      } catch { /* user cancelled */ }
    } else {
      await navigator.clipboard.writeText(summary);
      // Brief visual feedback would be nice but keeping it simple
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
        {/* Score + Risk */}
        <div className="card">
          <h2>{t.caregiver.latestCheck}</h2>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 }}>
            <div>
              <div className="metric-grid two" style={{ marginBottom: 12 }}>
                <div className="metric-card">
                  <strong>{totalScore !== null ? `${totalScore}/12` : '--'}</strong>
                  <span>{t.caregiver.mobilityScore}</span>
                </div>
                <div className="metric-card">
                  <strong>{confidenceText}</strong>
                  <span>{t.caregiver.confidence}</span>
                </div>
              </div>
              {risk && (
                <span className={`risk-badge ${risk.className}`}>
                  {risk.label}
                </span>
              )}
            </div>
            {totalScore !== null && (
              <ScoreRing score={totalScore} maxScore={12} size="sm" />
            )}
          </div>
        </div>

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
          <h2>Exercise Activity</h2>
          <div className="metric-grid two" style={{ marginTop: 8 }}>
            <div className="metric-card">
              <strong>{exerciseStats.streak}</strong>
              <span>Day Streak</span>
            </div>
            <div className="metric-card">
              <strong>{exerciseStats.totalExercises}</strong>
              <span>This Week</span>
            </div>
          </div>
          <div style={{ marginTop: 8, fontSize: '0.9rem', color: 'var(--muted)' }}>
            Today: {exerciseStats.todayCompleted.length > 0
              ? exerciseStats.todayCompleted.join(', ')
              : 'No exercises yet'}
          </div>
        </div>

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
