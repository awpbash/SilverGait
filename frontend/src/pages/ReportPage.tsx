import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppHeader, ScoreRing } from '../components';
import { useAssessmentStore } from '../stores';
import { useT } from '../i18n';
import { computeTotal } from '../utils/scoring';
import { formatShortDate } from '../utils/formatting';
import { useExerciseStats } from '../hooks/useExerciseStats';

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

export function ReportPage() {
  const navigate = useNavigate();
  const { history } = useAssessmentStore();
  const t = useT();
  const exerciseStats = useExerciseStats(7);

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

    // Exercise adherence from DB
    const weekExerciseDays = exerciseStats.daily.filter((e) => e.count > 0).length;

    // Total exercises this week
    const totalWeekExercises = exerciseStats.totalExercises;

    // Chart data (daily scores this week)
    const chartData = weekAssessments.slice(0, 5).map((a) => ({
      score: computeTotal(a),
      label: formatShortDate(a.timestamp),
    }));

    // Insights
    const insights: string[] = [];
    if (weekAssessments.length === 0) {
      insights.push(t.report.noAssessments);
    } else {
      if (prevAvg !== null && avgScore > prevAvg) {
        insights.push(t.report.scoreImproved);
      }
      if (prevAvg !== null && avgScore < prevAvg) {
        insights.push(t.report.scoreDipped);
      }
      if (avgScore >= 9) {
        insights.push(t.report.scoreExcellent);
      }
    }
    if (weekExerciseDays >= 5) {
      insights.push(t.report.exerciseGreat);
    } else if (weekExerciseDays >= 3) {
      insights.push(t.report.exerciseGood);
    } else {
      insights.push(t.report.exerciseMore);
    }
    if (exerciseStats.streak >= 3) {
      insights.push(`${exerciseStats.streak}-day exercise streak! Keep it up.`);
    }

    const delta = prevAvg !== null ? avgScore - prevAvg : null;

    return {
      weekLabel: formatWeekLabel(monday),
      avgScore,
      prevAvg,
      delta,
      weekAssessments: weekAssessments.length,
      exerciseDays: weekExerciseDays,
      totalWeekExercises,
      streak: exerciseStats.streak,
      chartData,
      insights: insights.slice(0, 3),
    };
  }, [history, exerciseStats, t]);

  const deltaText = report.delta !== null
    ? `${report.delta >= 0 ? '+' : ''}${report.delta} from last week`
    : t.report.firstWeek;

  const handleShare = async () => {
    const text = `SilverGait Weekly Report (${report.weekLabel})\n\n` +
      `SPPB Score: ${report.avgScore}/12\n` +
      `Assessments: ${report.weekAssessments}\n` +
      `Exercise Days: ${report.exerciseDays}/7\n` +
      `Total Exercises: ${report.totalWeekExercises}\n` +
      `Streak: ${report.streak} days\n\n` +
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
        <h1>{t.report.title}</h1>
        <p className="subtitle">{report.weekLabel}</p>
      </div>

      {/* Hero score */}
      <div className="report-hero">
        <ScoreRing score={report.avgScore} maxScore={12} size="lg" label={t.report.avgSppb} />
        <span className={`activity-delta ${report.delta === null ? 'neutral' : report.delta > 0 ? 'positive' : report.delta < 0 ? 'negative' : 'neutral'}`}>
          {deltaText}
        </span>
      </div>

      {/* Stats grid */}
      <div className="report-stats">
        <div className="report-stat-card">
          <strong>{report.weekAssessments}</strong>
          <span>{t.report.assessments}</span>
        </div>
        <div className="report-stat-card">
          <strong>{report.exerciseDays}/7</strong>
          <span>{t.report.exerciseDays}</span>
        </div>
        <div className="report-stat-card">
          <strong>{report.totalWeekExercises}</strong>
          <span>Exercises</span>
        </div>
        <div className="report-stat-card">
          <strong>{report.streak}d</strong>
          <span>Streak</span>
        </div>
      </div>

      {/* Chart */}
      {report.chartData.length > 0 && (
        <div className="history-chart">
          <p className="card-title">{t.report.weekScores}</p>
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
        <h2>{t.report.insights}</h2>
        <ul style={{ paddingLeft: 18, margin: '8px 0 0' }}>
          {report.insights.map((ins) => (
            <li key={ins} style={{ marginBottom: 6, color: 'var(--muted)', fontSize: '0.9rem' }}>{ins}</li>
          ))}
        </ul>
      </div>

      <div className="progress-actions">
        <button className="btn-primary" onClick={handleShare}>{t.report.shareReport}</button>
        <button className="btn-link" onClick={() => navigate('/progress')}>{t.report.backProgress}</button>
      </div>
    </div>
  );
}
