import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AppHeader, PoseOverlay } from '../components';
import { usePoseDetection } from '../hooks/usePoseDetection';
import { extractFrameMetrics } from '../utils/poseMetrics';
import { useExerciseFormFeedback, FORM_FEEDBACK_EXERCISES } from '../hooks/useExerciseFormFeedback';
import { useT, tpl } from '../i18n';
import type { Translations } from '../i18n/en';
import { exerciseApi } from '../services/api';
import { useUserStore } from '../stores';

interface Exercise {
  id: string;
  title: string;
  description: string;
  duration: string;
  durationSec: number;
  category: string;
  icon: string;
  steps: string[];
  safety: string;
}

function getExercises(t: Translations): Exercise[] {
  const ex = t.exercises;
  return [
    {
      id: 'chair-stand',
      title: ex.exChairStand,
      description: ex.exChairStandDesc,
      duration: ex.exChairStandDur,
      durationSec: 300,
      category: ex.catLegs,
      icon: '\u{1FA91}',
      steps: [ex.exChairStandS1, ex.exChairStandS2, ex.exChairStandS3, ex.exChairStandS4, ex.exChairStandS5],
      safety: ex.exChairStandSafety,
    },
    {
      id: 'wall-push',
      title: ex.exWallPushUp,
      description: ex.exWallPushUpDesc,
      duration: ex.exWallPushUpDur,
      durationSec: 180,
      category: ex.catArms,
      icon: '\u{1F4AA}',
      steps: [ex.exWallPushUpS1, ex.exWallPushUpS2, ex.exWallPushUpS3, ex.exWallPushUpS4, ex.exWallPushUpS5],
      safety: ex.exWallPushUpSafety,
    },
    {
      id: 'heel-raise',
      title: ex.exHeelRaise,
      description: ex.exHeelRaiseDesc,
      duration: ex.exHeelRaiseDur,
      durationSec: 180,
      category: ex.catBalance,
      icon: '\u{1F9B6}',
      steps: [ex.exHeelRaiseS1, ex.exHeelRaiseS2, ex.exHeelRaiseS3, ex.exHeelRaiseS4, ex.exHeelRaiseS5],
      safety: ex.exHeelRaiseSafety,
    },
    {
      id: 'marching',
      title: ex.exMarching,
      description: ex.exMarchingDesc,
      duration: ex.exMarchingDur,
      durationSec: 180,
      category: ex.catLegs,
      icon: '\u{1F6B6}',
      steps: [ex.exMarchingS1, ex.exMarchingS2, ex.exMarchingS3, ex.exMarchingS4, ex.exMarchingS5],
      safety: ex.exMarchingSafety,
    },
    {
      id: 'sit-to-stand-hold',
      title: ex.exSitToStand,
      description: ex.exSitToStandDesc,
      duration: ex.exSitToStandDur,
      durationSec: 300,
      category: ex.catLegs,
      icon: '\u{1FA91}',
      steps: [ex.exSitToStandS1, ex.exSitToStandS2, ex.exSitToStandS3, ex.exSitToStandS4, ex.exSitToStandS5, ex.exSitToStandS6],
      safety: ex.exSitToStandSafety,
    },
    {
      id: 'ankle-circles',
      title: ex.exAnkleCircles,
      description: ex.exAnkleCirclesDesc,
      duration: ex.exAnkleCirclesDur,
      durationSec: 180,
      category: ex.catBalance,
      icon: '\u{1F504}',
      steps: [ex.exAnkleCirclesS1, ex.exAnkleCirclesS2, ex.exAnkleCirclesS3, ex.exAnkleCirclesS4, ex.exAnkleCirclesS5],
      safety: ex.exAnkleCirclesSafety,
    },
    {
      id: 'leg-extensions',
      title: ex.exLegExtensions,
      description: ex.exLegExtensionsDesc,
      duration: ex.exLegExtensionsDur,
      durationSec: 240,
      category: ex.catLegs,
      icon: '\u{1F9B5}',
      steps: [ex.exLegExtensionsS1, ex.exLegExtensionsS2, ex.exLegExtensionsS3, ex.exLegExtensionsS4, ex.exLegExtensionsS5, ex.exLegExtensionsS6],
      safety: ex.exLegExtensionsSafety,
    },
    {
      id: 'shoulder-rolls',
      title: ex.exShoulderRolls,
      description: ex.exShoulderRollsDesc,
      duration: ex.exShoulderRollsDur,
      durationSec: 120,
      category: ex.catPosture,
      icon: '\u{1F9D8}',
      steps: [ex.exShoulderRollsS1, ex.exShoulderRollsS2, ex.exShoulderRollsS3, ex.exShoulderRollsS4, ex.exShoulderRollsS5],
      safety: ex.exShoulderRollsSafety,
    },
  ];
}

const STORAGE_KEY = 'silvergait-exercises';

function getTodayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function loadCompleted(): Set<string> {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    if (data.date === getTodayKey()) {
      return new Set(data.completed || []);
    }
  } catch { /* ignore */ }
  return new Set();
}

function saveCompleted(completed: Set<string>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    date: getTodayKey(),
    completed: Array.from(completed),
  }));
  // Update streak
  try {
    const streakData = JSON.parse(localStorage.getItem('silvergait-streak') || '{}');
    const today = new Date().toDateString();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    if (streakData.date === today) {
      // Already logged today
    } else if (streakData.date === yesterday.toDateString()) {
      localStorage.setItem('silvergait-streak', JSON.stringify({
        date: today,
        count: (streakData.count || 0) + 1,
      }));
    } else {
      localStorage.setItem('silvergait-streak', JSON.stringify({
        date: today,
        count: 1,
      }));
    }
  } catch { /* ignore */ }

  // Update exercise log for weekly report
  try {
    const logKey = 'silvergait-exercise-log';
    const log = JSON.parse(localStorage.getItem(logKey) || '{}');
    const entries: Array<{ date: string; count: number }> = log.entries || [];
    const todayKey = getTodayKey();
    const existing = entries.find((e) => e.date === todayKey);
    if (existing) {
      existing.count = completed.size;
    } else {
      entries.push({ date: todayKey, count: completed.size });
    }
    // Keep last 30 days
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    const filtered = entries.filter((e) => new Date(e.date) >= cutoff);
    localStorage.setItem(logKey, JSON.stringify({ entries: filtered }));
  } catch { /* ignore */ }
}

export function ExercisesPage() {
  const t = useT();
  const userId = useUserStore((s) => s.userId);
  const EXERCISES = useMemo(() => getExercises(t), [t]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [completed, setCompleted] = useState<Set<string>>(loadCompleted);
  const [timerActive, setTimerActive] = useState(false);
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [showPainModal, setShowPainModal] = useState(false);
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [showOverlay, setShowOverlay] = useState(true);
  const [searchParams] = useSearchParams();
  const consumedRef = useRef(false);
  const exerciseVideoRef = useRef<HTMLVideoElement>(null);
  const exerciseStreamRef = useRef<MediaStream | null>(null);
  const timerStartRef = useRef<number>(0);

  // Load today's completions from DB on mount
  useEffect(() => {
    exerciseApi.getStats(userId, 1).then((stats) => {
      if (stats.today_completed.length > 0) {
        setCompleted((prev) => {
          const next = new Set(prev);
          stats.today_completed.forEach((id) => next.add(id));
          saveCompleted(next);
          return next;
        });
      }
    }).catch(() => { /* offline fallback to localStorage */ });
  }, [userId]);

  useEffect(() => {
    if (consumedRef.current) return;
    const target = searchParams.get('exercise');
    if (!target) return;
    const matchIndex = EXERCISES.findIndex((e) => e.id === target);
    if (matchIndex >= 0) setCurrentIndex(matchIndex);
    consumedRef.current = true;
  }, [searchParams]);

  const exercise = EXERCISES[currentIndex];
  const hasFormFeedback = FORM_FEEDBACK_EXERCISES.has(exercise.id);

  // Pose detection for form feedback — active whenever camera is on so user sees glow while positioning
  const poseDetection = usePoseDetection(exerciseVideoRef, cameraEnabled);
  const liveMetrics = useMemo(() => {
    if (!poseDetection.currentPose) return null;
    return extractFrameMetrics(poseDetection.currentPose.keypoints);
  }, [poseDetection.currentPose]);

  const formFeedback = useExerciseFormFeedback({
    exerciseId: exercise.id,
    isActive: cameraEnabled && timerActive,
    kneeAngle: liveMetrics?.leftKneeAngle ?? liveMetrics?.rightKneeAngle ?? null,
    trunkLean: liveMetrics?.trunkLean ?? null,
    leftElbowAngle: liveMetrics?.leftElbowAngle ?? null,
    rightElbowAngle: liveMetrics?.rightElbowAngle ?? null,
    leftShoulderY: liveMetrics?.leftShoulderY ?? null,
    rightShoulderY: liveMetrics?.rightShoulderY ?? null,
  });

  // Camera management for form feedback
  const toggleCamera = useCallback(async () => {
    if (cameraEnabled) {
      if (exerciseStreamRef.current) {
        exerciseStreamRef.current.getTracks().forEach((t) => t.stop());
        exerciseStreamRef.current = null;
      }
      setCameraEnabled(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      exerciseStreamRef.current = stream;
      setCameraEnabled(true);
      await new Promise((r) => setTimeout(r, 100));
      if (exerciseVideoRef.current) {
        exerciseVideoRef.current.srcObject = stream;
        exerciseVideoRef.current.play().catch(() => {});
      }
    } catch {
      setCameraEnabled(false);
    }
  }, [cameraEnabled]);

  // Cleanup camera on unmount
  useEffect(() => {
    return () => {
      if (exerciseStreamRef.current) {
        exerciseStreamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  // Timer countdown
  useEffect(() => {
    if (!timerActive || timerSeconds <= 0) return;
    const timer = setTimeout(() => setTimerSeconds((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [timerActive, timerSeconds]);

  useEffect(() => {
    if (timerActive && timerSeconds === 0) {
      setTimerActive(false);
    }
  }, [timerActive, timerSeconds]);

  const startTimer = useCallback(() => {
    setTimerSeconds(exercise.durationSec);
    setTimerActive(true);
    timerStartRef.current = Date.now();
  }, [exercise.durationSec]);

  const markComplete = useCallback(() => {
    const next = new Set(completed);
    next.add(exercise.id);
    setCompleted(next);
    saveCompleted(next);
    setTimerActive(false);

    // Calculate duration
    const elapsed = timerStartRef.current
      ? Math.round((Date.now() - timerStartRef.current) / 1000)
      : undefined;
    timerStartRef.current = 0;

    // Persist to backend
    exerciseApi.complete(userId, exercise.id, elapsed).catch(() => { /* offline ok */ });

    const nextIdx = EXERCISES.findIndex((e, i) => i > currentIndex && !next.has(e.id));
    if (nextIdx >= 0) setCurrentIndex(nextIdx);
  }, [completed, exercise.id, currentIndex, userId]);

  const skip = useCallback(() => {
    setTimerActive(false);
    setCurrentIndex((prev) => (prev + 1) % EXERCISES.length);
  }, []);

  const goToPrev = useCallback(() => {
    setTimerActive(false);
    setCurrentIndex((prev) => (prev - 1 + EXERCISES.length) % EXERCISES.length);
  }, []);

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const completedCount = completed.size;
  const totalCount = EXERCISES.length;
  const progressPct = (completedCount / totalCount) * 100;

  return (
    <div className="page">
      <AppHeader />

      <div className="page-title">
        <h1>{t.exercises.title}</h1>
      </div>

      {/* Progress bar */}
      <div className="exercise-progress-bar">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <p className="card-title">{t.exercises.progress}</p>
          <span className="progress-text">{tpl(t.exercises.progressOf, { done: completedCount, total: totalCount })}</span>
        </div>
        <div className="progress-track">
          <div className="progress-fill" style={{ width: `${progressPct}%` }} />
        </div>
      </div>

      {/* Exercise dots */}
      <div className="exercise-dots">
        {EXERCISES.map((e, i) => (
          <button
            key={e.id}
            className={`exercise-dot${i === currentIndex ? ' active' : ''}${completed.has(e.id) ? ' completed' : ''}`}
            onClick={() => { setTimerActive(false); setCurrentIndex(i); }}
            aria-label={`${e.title}${completed.has(e.id) ? ' (completed)' : ''}`}
          />
        ))}
      </div>

      {/* Exercise card */}
      <div className="exercise-nav-card">
        <span className="exercise-emoji">{exercise.icon}</span>
        <h2>{exercise.title}</h2>
        <div className="exercise-meta">
          <span className="exercise-category">{exercise.category}</span>
          <span className="exercise-duration">{exercise.duration}</span>
        </div>
        {completed.has(exercise.id) && (
          <span className="exercise-category" style={{ background: '#e8f5e9', color: '#1b8a3e' }}>
            {t.exercises.completed}
          </span>
        )}
      </div>

      {/* Form Feedback Camera */}
      {hasFormFeedback && (
        <div className="exercise-camera-section">
          <button className="btn-ghost" onClick={toggleCamera} style={{ marginBottom: 8 }}>
            {cameraEnabled ? t.exercises.turnOffCamera : t.exercises.useCamera}
          </button>
          {cameraEnabled && (
            <div className="exercise-camera-preview">
              <video ref={exerciseVideoRef} playsInline muted autoPlay style={{ width: '100%', borderRadius: 'var(--radius-sm)' }} />
              <PoseOverlay
                videoRef={exerciseVideoRef}
                poseRef={poseDetection.poseRef}
                confidenceRef={poseDetection.confidenceRef}
                isActive={cameraEnabled && poseDetection.isReady}
                showOverlay={showOverlay}
              />
              {poseDetection.isReady && (
                <button
                  className={`overlay-toggle${showOverlay ? ' active' : ''}`}
                  onClick={() => setShowOverlay(v => !v)}
                  aria-label="Toggle body overlay"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <circle cx="12" cy="5" r="3" />
                    <line x1="12" y1="8" x2="12" y2="16" />
                    <line x1="8" y1="11" x2="16" y2="11" />
                    <line x1="10" y1="22" x2="12" y2="16" />
                    <line x1="14" y1="22" x2="12" y2="16" />
                  </svg>
                  {showOverlay ? 'Body On' : 'Body Off'}
                </button>
              )}
            </div>
          )}
          {cameraEnabled && formFeedback.feedback.length > 0 && (
            <div className="form-feedback-chips">
              {formFeedback.feedback.map((fb, i) => (
                <span key={i} className={`form-chip ${fb.quality}`}>
                  {fb.message} <small>{fb.metric}</small>
                </span>
              ))}
            </div>
          )}
          {cameraEnabled && formFeedback.repCount > 0 && (
            <div className="rep-counter">
              <strong>{formFeedback.repCount}</strong>
              <span>{t.exercises.reps}</span>
            </div>
          )}
        </div>
      )}

      {/* Timer */}
      {(timerActive || timerSeconds > 0) && (
        <div className="exercise-timer">
          <span className="timer-display">{formatTime(timerSeconds)}</span>
          <span className="timer-label">{timerActive ? t.exercises.inProgress : t.exercises.timerPaused}</span>
        </div>
      )}

      {/* Steps */}
      <div className="exercise-steps">
        <h3>{t.exercises.howToDo}</h3>
        <ol>
          {exercise.steps.map((step, idx) => (
            <li key={idx}>{step}</li>
          ))}
        </ol>
      </div>

      {/* Safety */}
      <div className="safety-notice">
        <span className="safety-icon" aria-hidden="true">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        </span>
        <p>{exercise.safety}</p>
      </div>

      {/* Action buttons */}
      <div className="exercise-actions">
        {!timerActive && timerSeconds === 0 && (
          <button className="btn-secondary" onClick={startTimer}>
            {t.exercises.startTimer}
          </button>
        )}

        {timerActive && (
          <button className="btn-secondary" onClick={() => setTimerActive(false)}>
            {t.exercises.pauseTimer}
          </button>
        )}

        {!timerActive && timerSeconds > 0 && (
          <button className="btn-secondary" onClick={() => setTimerActive(true)}>
            {t.exercises.resumeTimer}
          </button>
        )}

        <button
          className="btn-primary"
          onClick={markComplete}
          disabled={completed.has(exercise.id)}
        >
          {completed.has(exercise.id) ? t.exercises.completed : t.exercises.markComplete}
        </button>

        <div className="exercise-btn-row">
          <button className="btn-ghost" onClick={goToPrev}>
            {t.common.previous}
          </button>
          <button className="btn-ghost" onClick={skip}>
            {t.common.skip}
          </button>
        </div>

        <button
          className="btn-outline-danger"
          onClick={() => setShowPainModal(true)}
        >
          {t.exercises.iFeelPain}
        </button>
      </div>

      {/* Pain Modal */}
      {showPainModal && (
        <div className="pain-modal-overlay" onClick={() => setShowPainModal(false)}>
          <div className="pain-modal" onClick={(e) => e.stopPropagation()}>
            <h2>{t.exercises.painTitle}</h2>
            <p>
              {t.exercises.painDesc}
            </p>
            <button className="btn-primary" onClick={() => setShowPainModal(false)}>
              {t.exercises.painUnderstand}
            </button>
            <a href="tel:995" className="btn-outline-danger" style={{ textDecoration: 'none', textAlign: 'center' }}>
              {t.exercises.painEmergency}
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
