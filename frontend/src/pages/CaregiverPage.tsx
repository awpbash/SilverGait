import { useNavigate } from 'react-router-dom';
import { AppHeader, ScoreRing } from '../components';
import { useAssessmentStore } from '../stores';

function computeTotal(assessment: { score: number; sppb_breakdown?: { balance_score: number; gait_score: number; chair_stand_score: number } }): number {
  const bd = assessment.sppb_breakdown;
  return bd ? bd.balance_score + bd.gait_score + bd.chair_stand_score : Math.round(assessment.score * 3);
}

function getRiskLevel(score: number): { label: string; className: string } {
  if (score >= 9) return { label: 'Low Risk', className: 'low' };
  if (score >= 6) return { label: 'Moderate Risk', className: 'moderate' };
  return { label: 'High Risk', className: 'high' };
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-SG', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function CaregiverPage() {
  const { latestAssessment, history } = useAssessmentStore();
  const navigate = useNavigate();

  const breakdown = latestAssessment?.sppb_breakdown;
  const totalScore = breakdown
    ? breakdown.balance_score + breakdown.gait_score + breakdown.chair_stand_score
    : latestAssessment
    ? Math.round(latestAssessment.score * 3)
    : null;

  const risk = totalScore !== null ? getRiskLevel(totalScore) : null;
  const confidenceText = latestAssessment ? `${Math.round(latestAssessment.confidence * 100)}%` : '--';
  const topRecommendations = latestAssessment?.recommendations?.slice(0, 3) || [
    'Encourage short daily walks',
    'Practice chair stands with support',
    'Stay hydrated throughout the day',
  ];

  const recentHistory = history.slice(0, 3);

  const handleShare = async () => {
    const scoreText = totalScore !== null ? `${totalScore}/12` : 'No data';
    const riskText = risk ? risk.label : 'Unknown';
    const summary = `SilverGait Caregiver Summary\n\nMobility Score: ${scoreText}\nRisk Level: ${riskText}\nConfidence: ${confidenceText}\n\nRecommendations:\n${topRecommendations.map((r, i) => `${i + 1}. ${r}`).join('\n')}`;

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
        <h1>Caregiver Summary</h1>
        <p className="subtitle">Simple snapshot for family members</p>
      </div>

      <div className="stack">
        {/* Score + Risk */}
        <div className="card">
          <h2>Latest Check</h2>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 }}>
            <div>
              <div className="metric-grid two" style={{ marginBottom: 12 }}>
                <div className="metric-card">
                  <strong>{totalScore !== null ? `${totalScore}/12` : '--'}</strong>
                  <span>Mobility Score</span>
                </div>
                <div className="metric-card">
                  <strong>{confidenceText}</strong>
                  <span>Confidence</span>
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
            <h2>Recent Assessments</h2>
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
          <h2>Suggested Focus</h2>
          <ul style={{ paddingLeft: 18, margin: '8px 0 0' }}>
            {topRecommendations.map((item) => (
              <li key={item} style={{ marginBottom: 6, color: 'var(--muted)', fontSize: '0.95rem' }}>
                {item}
              </li>
            ))}
          </ul>
        </div>

        {/* Care Notes */}
        <div className="card">
          <h2>Care Notes</h2>
          <p>Encourage hydration, clear walkways, and daily gentle movement.</p>
        </div>
      </div>

      <div className="progress-actions">
        <button className="btn-primary" onClick={handleShare}>
          Share Summary
        </button>
        <button onClick={() => navigate('/help')} className="btn-link">
          Back to Help
        </button>
      </div>
    </div>
  );
}
