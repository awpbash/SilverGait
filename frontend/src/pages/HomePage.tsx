import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppHeader, ScoreRing, GoalSettingModal } from '../components';
import { useAssessmentStore, useUserStore, useGoalStore } from '../stores';

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good Morning';
  if (hour < 17) return 'Good Afternoon';
  return 'Good Evening';
}

function getStreak(): number {
  try {
    const data = JSON.parse(localStorage.getItem('silvergait-streak') || '{}');
    const today = new Date().toDateString();
    if (data.date === today) return data.count || 0;
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    if (data.date === yesterday.toDateString()) return data.count || 0;
    return 0;
  } catch {
    return 0;
  }
}

function getExerciseDaysThisWeek(): number {
  try {
    const log = JSON.parse(localStorage.getItem('silvergait-exercise-log') || '{}');
    const entries: Array<{ date: string; count: number }> = log.entries || [];
    const now = new Date();
    const monday = new Date(now);
    monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    monday.setHours(0, 0, 0, 0);
    return entries.filter((e) => {
      const d = new Date(e.date);
      return d >= monday && e.count > 0;
    }).length;
  } catch {
    return 0;
  }
}

function formatRelativeDate(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  return date.toLocaleDateString('en-SG', { month: 'short', day: 'numeric' });
}

function getMotivation(exerciseRatio: number, stepsRatio: number, assessmentRatio: number): string {
  const avgRatio = (exerciseRatio + stepsRatio + assessmentRatio) / 3;
  if (avgRatio >= 1) return "Amazing week! You\u2019ve hit all your goals!";
  if (avgRatio >= 0.7) return 'Great progress! Almost there!';
  if (avgRatio >= 0.3) return 'Good start! Keep going.';
  return "Let\u2019s get moving today!";
}

export function HomePage() {
  const navigate = useNavigate();
  const { latestAssessment, history } = useAssessmentStore();
  const { todayMetrics } = useUserStore();
  const { goals } = useGoalStore();
  const [showGoalModal, setShowGoalModal] = useState(false);
  const streak = getStreak();

  const breakdown = latestAssessment?.sppb_breakdown;
  const sppbScore = breakdown
    ? breakdown.balance_score + breakdown.gait_score + breakdown.chair_stand_score
    : latestAssessment
    ? Math.round(latestAssessment.score * 3)
    : null;

  const lastChecked = latestAssessment?.timestamp
    ? formatRelativeDate(latestAssessment.timestamp)
    : null;

  const recentActivities = history.slice(0, 3).map((item) => {
    const tests = item.completed_tests ?? ['gait'];
    const label = tests.length === 3
      ? 'Full SPPB check'
      : tests.map((t) => t === 'chair_stand' ? 'Chair stand' : t.charAt(0).toUpperCase() + t.slice(1)).join(', ') + ' check';
    const date = formatRelativeDate(item.timestamp);
    return { label, date };
  });

  // Goal progress
  const exerciseDays = getExerciseDaysThisWeek();
  const stepsProgress = todayMetrics?.steps ?? 0;
  const assessmentsThisWeek = useMemo(() => {
    const now = new Date();
    const monday = new Date(now);
    monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    monday.setHours(0, 0, 0, 0);
    return history.filter((a) => new Date(a.timestamp) >= monday).length;
  }, [history]);

  const exerciseRatio = goals.exerciseDaysTarget > 0 ? exerciseDays / goals.exerciseDaysTarget : 0;
  const stepsRatio = goals.stepsTarget > 0 ? stepsProgress / goals.stepsTarget : 0;
  const assessmentRatio = goals.assessmentsTarget > 0 ? assessmentsThisWeek / goals.assessmentsTarget : 0;

  return (
    <div className="page">
      <AppHeader />

      <div className="home-greeting">
        <h1>{getGreeting()}</h1>
        <p>Let&apos;s check in on your mobility today</p>
      </div>

      {/* Quick Actions */}
      <div className="quick-actions">
        <button className="quick-action-card" onClick={() => navigate('/check')}>
          <span className="quick-action-icon">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
              <path d="M7 7h2l1-2h4l1 2h2a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2z" />
              <circle cx="12" cy="13" r="3.5" />
            </svg>
          </span>
          <strong>Start Check</strong>
          <span>SPPB Assessment</span>
        </button>

        <button className="quick-action-card" onClick={() => navigate('/exercises')}>
          <span className="quick-action-icon">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
              <path d="M18 8a6 6 0 0 1-6 6M6 12a6 6 0 0 0 6 6" />
              <circle cx="12" cy="12" r="2" fill="currentColor" />
              <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
            </svg>
          </span>
          <strong>Exercises</strong>
          <span>Daily Routine</span>
        </button>
      </div>

      {/* Weekly Goals */}
      <div className="home-goals-section">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <p className="card-title">Weekly Goals</p>
          <button className="btn-ghost" style={{ fontSize: '0.8rem', padding: '4px 10px' }} onClick={() => setShowGoalModal(true)}>
            Edit
          </button>
        </div>
        <div className="goal-rings-row">
          <div className="goal-ring-item">
            <ScoreRing score={Math.min(exerciseDays, goals.exerciseDaysTarget)} maxScore={goals.exerciseDaysTarget} size="sm" />
            <span>Exercise</span>
          </div>
          <div className="goal-ring-item">
            <ScoreRing score={Math.min(stepsProgress, goals.stepsTarget)} maxScore={goals.stepsTarget} size="sm" />
            <span>Steps</span>
          </div>
          <div className="goal-ring-item">
            <ScoreRing score={Math.min(assessmentsThisWeek, goals.assessmentsTarget)} maxScore={goals.assessmentsTarget} size="sm" />
            <span>Checks</span>
          </div>
        </div>
        <p className="goal-motivation">{getMotivation(exerciseRatio, stepsRatio, assessmentRatio)}</p>
      </div>

      {/* SPPB Score Card */}
      <div className="home-score-card">
        <div className="home-score-info">
          <p className="card-title">SPPB Score</p>
          {sppbScore !== null ? (
            <p className="home-score-detail">
              {lastChecked ? `Last checked: ${lastChecked}` : 'Recently assessed'}
            </p>
          ) : (
            <p className="home-score-detail">No assessment yet</p>
          )}
        </div>
        <ScoreRing
          score={sppbScore ?? 0}
          maxScore={12}
          size="sm"
          label={sppbScore !== null ? (sppbScore >= 9 ? 'Good' : sppbScore >= 6 ? 'Fair' : 'Low') : '--'}
        />
      </div>

      {/* Feature Cards */}
      <div className="home-feature-cards">
        <button className="home-feature-card" onClick={() => navigate('/community')}>
          <span className="home-feature-icon">{'\u{1F3C6}'}</span>
          <strong>Challenges</strong>
          <span>Join this week&apos;s community goals</span>
        </button>
        <button className="home-feature-card" onClick={() => navigate('/safety')}>
          <span className="home-feature-icon">{'\u{1F3E0}'}</span>
          <strong>Safety Check</strong>
          <span>Home fall prevention guide</span>
        </button>
      </div>

      {/* Streak */}
      <div className="home-streak">
        <span className="streak-flame" aria-hidden="true">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
            <path d="M12 2C8 8 4 10 4 14a8 8 0 0 0 16 0c0-4-4-6-8-12z" fill="#ff9f0a" opacity="0.9"/>
            <path d="M12 10c-2 3-4 4-4 6a4 4 0 0 0 8 0c0-2-2-3-4-6z" fill="#ffcc02"/>
          </svg>
        </span>
        <div className="streak-info">
          <strong>{streak} Day Streak</strong>
          <span>{streak > 0 ? 'Keep it going!' : 'Start your streak today'}</span>
        </div>
      </div>

      {/* Recent Activity */}
      {recentActivities.length > 0 && (
        <div className="home-activity-list">
          <p className="card-title">Recent Activity</p>
          {recentActivities.map((item, i) => (
            <div key={i} className="activity-item">
              <div className="activity-dot" />
              <span>{item.label}</span>
              <small>{item.date}</small>
            </div>
          ))}
        </div>
      )}

      {/* Quick nav buttons */}
      <div className="progress-actions">
        <button className="btn-primary" onClick={() => navigate('/check?start=1')}>
          Quick Comprehensive Check
        </button>
        <button className="btn-link" onClick={() => navigate('/report')}>
          View Weekly Report
        </button>
      </div>

      {showGoalModal && <GoalSettingModal onClose={() => setShowGoalModal(false)} />}
    </div>
  );
}
