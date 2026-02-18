import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppHeader } from '../components';
import { useAssessmentStore, useUserStore } from '../stores';
import type { Challenge } from '../types';

const CHALLENGE_POOL: Challenge[] = [
  { id: 'walk-5k', title: 'Daily Walker', description: 'Walk 5,000 steps today', icon: '\u{1F6B6}', targetType: 'steps', targetValue: 5000, unit: 'steps', participants: 248 },
  { id: 'walk-8k', title: 'Step Champion', description: 'Reach 8,000 steps today', icon: '\u{1F3C3}', targetType: 'steps', targetValue: 8000, unit: 'steps', participants: 156 },
  { id: 'exercise-3', title: 'Active Ager', description: 'Complete 3 exercises today', icon: '\u{1F4AA}', targetType: 'exercises', targetValue: 3, unit: 'exercises', participants: 312 },
  { id: 'exercise-5', title: 'Fitness Hero', description: 'Complete 5 exercises today', icon: '\u{1F3C6}', targetType: 'exercises', targetValue: 5, unit: 'exercises', participants: 189 },
  { id: 'assess-1', title: 'Health Check', description: 'Complete a mobility assessment', icon: '\u{1F4CB}', targetType: 'assessments', targetValue: 1, unit: 'assessment', participants: 423 },
  { id: 'chair-5', title: 'Chair Master', description: 'Do 5 chair stand reps', icon: '\u{1FA91}', targetType: 'chair_stands', targetValue: 5, unit: 'reps', participants: 276 },
  { id: 'walk-3k', title: 'Easy Stroller', description: 'Walk 3,000 steps today', icon: '\u{2728}', targetType: 'steps', targetValue: 3000, unit: 'steps', participants: 534 },
  { id: 'exercise-all', title: 'Full Routine', description: 'Complete all 8 exercises', icon: '\u{1F31F}', targetType: 'exercises', targetValue: 8, unit: 'exercises', participants: 98 },
];

function getWeekNumber(): number {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 1);
  return Math.floor((now.getTime() - start.getTime()) / (7 * 24 * 60 * 60 * 1000));
}

function getWeekLabel(): string {
  const now = new Date();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const fmt = (d: Date) => d.toLocaleDateString('en-SG', { day: 'numeric', month: 'short' });
  return `${fmt(monday)} \u2013 ${fmt(sunday)}`;
}

function pickChallenges(weekNum: number, count: number): Challenge[] {
  const shuffled = [...CHALLENGE_POOL];
  // Deterministic shuffle based on week number
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = ((weekNum * 7 + i * 13) % (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, count);
}

function getExerciseCompletedCount(): number {
  try {
    const data = JSON.parse(localStorage.getItem('silvergait-exercises') || '{}');
    const today = new Date().toISOString().slice(0, 10);
    if (data.date === today) {
      return (data.completed || []).length;
    }
  } catch { /* ignore */ }
  return 0;
}

export function CommunityPage() {
  const navigate = useNavigate();
  const { todayMetrics } = useUserStore();
  const { history } = useAssessmentStore();

  const weekNum = getWeekNumber();
  const weekLabel = getWeekLabel();
  const challenges = useMemo(() => pickChallenges(weekNum, 3), [weekNum]);

  const getProgress = (challenge: Challenge): number => {
    switch (challenge.targetType) {
      case 'steps':
        return todayMetrics?.steps ?? 0;
      case 'exercises':
        return getExerciseCompletedCount();
      case 'assessments': {
        const today = new Date().toISOString().slice(0, 10);
        return history.filter((a) => a.timestamp.startsWith(today)).length;
      }
      case 'chair_stands':
        return getExerciseCompletedCount() > 0 ? 5 : 0; // simplified
      default:
        return 0;
    }
  };

  return (
    <div className="page">
      <AppHeader />

      <div className="page-title">
        <h1>Community Challenges</h1>
        <p className="subtitle">{weekLabel}</p>
      </div>

      <div className="challenge-list">
        {challenges.map((challenge) => {
          const progress = getProgress(challenge);
          const pct = Math.min(100, Math.round((progress / challenge.targetValue) * 100));
          const isComplete = progress >= challenge.targetValue;

          return (
            <div key={challenge.id} className={`challenge-card${isComplete ? ' completed' : ''}`}>
              <div className="challenge-header">
                <span className="challenge-icon">{challenge.icon}</span>
                <div className="challenge-info">
                  <strong>{challenge.title}</strong>
                  <span>{challenge.description}</span>
                </div>
                {isComplete && <span className="challenge-badge">Done!</span>}
              </div>

              <div className="challenge-progress">
                <div className="challenge-progress-track">
                  <div
                    className="challenge-progress-fill"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="challenge-progress-text">
                  {Math.min(progress, challenge.targetValue)} / {challenge.targetValue} {challenge.unit}
                </span>
              </div>

              <div className="challenge-participants">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
                <span>{challenge.participants} participating</span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="progress-actions">
        <button className="btn-primary" onClick={() => navigate('/exercises')}>
          Start Exercises
        </button>
        <button className="btn-link" onClick={() => navigate('/')}>
          Back to Home
        </button>
      </div>
    </div>
  );
}
