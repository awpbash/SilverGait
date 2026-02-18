import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppHeader, ScoreRing } from '../components';
import { useAssessmentStore, useUserStore } from '../stores';

function getMonday(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

function formatWeekLabel(monday: Date): string {
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const fmt = (d: Date) => d.toLocaleDateString('en-SG', { day: 'numeric', month: 'short' });
  return `${fmt(monday)} \u2013 ${fmt(sunday)}`;
}

function computeTotal(assessment: { score: number; sppb_breakdown?: { balance_score: number; gait_score: number; chair_stand_score: number } }): number {
  const bd = assessment.sppb_breakdown;
  return bd ? bd.balance_score + bd.gait_score + bd.chair_stand_score : Math.round(assessment.score * 3);
}

function getExerciseLog(): Array<{ date: string; count: number }> {
  try {
    const data = JSON.parse(localStorage.getItem('silvergait-exercise-log') || '{}');
    return data.entries || [];
  } catch { return []; }
}

function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-SG', { weekday: 'short' });
}

export function ReportPage() {
  const navigate = useNavigate();
  const { history } = useAssessmentStore();
  const { todayMetrics, weeklyTrend } = useUserStore();

  const report = useMemo(() => {
    const monday = getMonday(new Date());
    const sundayEnd = new Date(monday);
    sundayEnd.setDate(monday.getDate() + 7);

    // Assessments this week
    const weekAssessments = history.filter((a) => {
      const d = new Date(a.timestamp);
      return d >= monday && d < sundayEnd;
    });

    const weekScores = weekAssessments.map(computeTotal);
    const avgScore = weekScores.length > 0
      ? Math.round(weekScores.reduce((s, v) => s + v, 0) / weekScores.length)
      : 0;

    // Previous week assessments
    const prevMonday = new Date(monday);
    prevMonday.setDate(prevMonday.getDate() - 7);
    const prevAssessments = history.filter((a) => {
      const d = new Date(a.timestamp);
      return d >= prevMonday && d < monday;
    });
    const prevScores = prevAssessments.map(computeTotal);
    const prevAvg = prevScores.length > 0
      ? Math.round(prevScores.reduce((s, v) => s + v, 0) / prevScores.length)
      : null;

    // Exercise adherence
    const exerciseLog = getExerciseLog();
    const weekExerciseDays = exerciseLog.filter((e) => {
      const d = new Date(e.date);
      return d >= monday && d < sundayEnd && e.count > 0;
    }).length;

    // Steps & MVPA
    const avgSteps = todayMetrics?.steps ?? 0;
    const avgMvpa = todayMetrics?.mvpa_minutes ?? 0;

    // Chart data (daily scores this week)
    const chartData = weekAssessments.slice(0, 5).map((a) => ({
      score: computeTotal(a),
      label: formatShortDate(a.timestamp),
    }));

    // Insights
    const insights: string[] = [];
    if (weekAssessments.length === 0) {
      insights.push('No assessments this week yet. Try doing one today!');
    } else {
      if (prevAvg !== null && avgScore > prevAvg) {
        insights.push('Your mobility score improved from last week!');
      }
      if (prevAvg !== null && avgScore < prevAvg) {
        insights.push('Your score dipped slightly. Extra practice can help.');
      }
      if (avgScore >= 9) {
        insights.push('Excellent mobility! Keep up the great work.');
      }
    }
    if (weekExerciseDays >= 5) {
      insights.push('Outstanding exercise consistency this week!');
    } else if (weekExerciseDays >= 3) {
      insights.push('Good exercise routine. Try for one more day!');
    } else {
      insights.push('Try to fit in exercises on more days this week.');
    }
    if (avgSteps >= 8000) {
      insights.push('Great step count! You\u2019re very active today.');
    }

    const delta = prevAvg !== null ? avgScore - prevAvg : null;

    return {
      weekLabel: formatWeekLabel(monday),
      avgScore,
      prevAvg,
      delta,
      weekAssessments: weekAssessments.length,
      exerciseDays: weekExerciseDays,
      avgSteps,
      avgMvpa,
      mvpaChange: weeklyTrend?.change_percent ?? null,
      chartData,
      insights: insights.slice(0, 3),
    };
  }, [history, todayMetrics, weeklyTrend]);

  const deltaText = report.delta !== null
    ? `${report.delta >= 0 ? '+' : ''}${report.delta} from last week`
    : 'First week';

  const handleShare = async () => {
    const text = `SilverGait Weekly Report (${report.weekLabel})\n\n` +
      `SPPB Score: ${report.avgScore}/12\n` +
      `Assessments: ${report.weekAssessments}\n` +
      `Exercise Days: ${report.exerciseDays}/7\n` +
      `Steps: ${report.avgSteps.toLocaleString()}\n` +
      `Active Minutes: ${report.avgMvpa}\n\n` +
      `Insights:\n${report.insights.map((ins, i) => `${i + 1}. ${ins}`).join('\n')}`;

    if (navigator.share) {
      try { await navigator.share({ title: 'SilverGait Weekly Report', text }); } catch { /* cancelled */ }
    } else {
      await navigator.clipboard.writeText(text);
    }
  };

  return (
    <div className="page">
      <AppHeader />

      <div className="page-title">
        <h1>Weekly Report</h1>
        <p className="subtitle">{report.weekLabel}</p>
      </div>

      {/* Hero score */}
      <div className="report-hero">
        <ScoreRing score={report.avgScore} maxScore={12} size="lg" label="Avg SPPB" />
        <span className={`activity-delta ${report.delta === null ? 'neutral' : report.delta > 0 ? 'positive' : report.delta < 0 ? 'negative' : 'neutral'}`}>
          {deltaText}
        </span>
      </div>

      {/* Stats grid */}
      <div className="report-stats">
        <div className="report-stat-card">
          <strong>{report.weekAssessments}</strong>
          <span>Assessments</span>
        </div>
        <div className="report-stat-card">
          <strong>{report.exerciseDays}/7</strong>
          <span>Exercise Days</span>
        </div>
        <div className="report-stat-card">
          <strong>{report.avgSteps > 0 ? report.avgSteps.toLocaleString() : '--'}</strong>
          <span>Steps Today</span>
        </div>
        <div className="report-stat-card">
          <strong>{report.avgMvpa > 0 ? `${report.avgMvpa}m` : '--'}</strong>
          <span>Active Min</span>
        </div>
      </div>

      {/* Chart */}
      {report.chartData.length > 0 && (
        <div className="history-chart">
          <p className="card-title">This Week&apos;s Scores</p>
          <div className="chart-bars">
            {report.chartData.map((item, i) => (
              <div key={i} className="chart-bar-wrapper">
                <div
                  className={`chart-bar${i === report.chartData.length - 1 ? ' latest' : ''}`}
                  style={{ height: `${(item.score / 12) * 100}%` }}
                />
                <span className="chart-bar-label">{item.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Insights */}
      <div className="card" style={{ marginTop: 16 }}>
        <h2>Insights</h2>
        <ul style={{ paddingLeft: 18, margin: '8px 0 0' }}>
          {report.insights.map((ins) => (
            <li key={ins} style={{ marginBottom: 6, color: 'var(--muted)', fontSize: '0.9rem' }}>{ins}</li>
          ))}
        </ul>
      </div>

      <div className="progress-actions">
        <button className="btn-primary" onClick={handleShare}>Share Report</button>
        <button className="btn-link" onClick={() => navigate('/progress')}>Back to Progress</button>
      </div>
    </div>
  );
}
