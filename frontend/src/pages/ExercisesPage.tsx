import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AppHeader, PoseOverlay } from '../components';
import { usePoseDetection } from '../hooks/usePoseDetection';
import { extractFrameMetrics } from '../utils/poseMetrics';
import { useExerciseFormFeedback, FORM_FEEDBACK_EXERCISES } from '../hooks/useExerciseFormFeedback';

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

const EXERCISES: Exercise[] = [
  {
    id: 'chair-stand',
    title: 'Chair Stand',
    description: 'Strengthen your legs for better balance',
    duration: '5 min',
    durationSec: 300,
    category: 'Legs',
    icon: '\u{1FA91}',
    steps: [
      'Sit in a sturdy chair with your feet flat on floor',
      'Cross your arms over your chest',
      'Stand up slowly without using your hands',
      'Sit back down slowly with control',
      'Repeat 5-10 times',
    ],
    safety: 'Use a chair with armrests if needed. Go slowly.',
  },
  {
    id: 'wall-push',
    title: 'Wall Push-Up',
    description: 'Build arm strength safely',
    duration: '3 min',
    durationSec: 180,
    category: 'Arms',
    icon: '\u{1F4AA}',
    steps: [
      'Stand facing a wall, about arm\'s length away',
      'Place your palms flat on the wall at shoulder height',
      'Slowly bend your elbows and lean towards the wall',
      'Push back to starting position',
      'Repeat 10 times',
    ],
    safety: 'Keep your back straight. Breathe normally.',
  },
  {
    id: 'heel-raise',
    title: 'Heel Raises',
    description: 'Improve balance and calf strength',
    duration: '3 min',
    durationSec: 180,
    category: 'Balance',
    icon: '\u{1F9B6}',
    steps: [
      'Stand behind a chair and hold the back for support',
      'Rise up on your toes slowly',
      'Hold for 2 seconds',
      'Lower your heels slowly',
      'Repeat 10-15 times',
    ],
    safety: 'Keep holding the chair if needed.',
  },
  {
    id: 'marching',
    title: 'Marching in Place',
    description: 'Good warm-up for daily movement',
    duration: '3 min',
    durationSec: 180,
    category: 'Legs',
    icon: '\u{1F6B6}',
    steps: [
      'Stand near a wall or chair for support if needed',
      'Lift your right knee up towards your chest',
      'Lower it and lift your left knee',
      'Continue alternating like marching',
      'Do for 1-2 minutes',
    ],
    safety: 'Start slowly. Stop if you feel dizzy.',
  },
  {
    id: 'sit-to-stand-hold',
    title: 'Sit-to-Stand Hold',
    description: 'Improves balance and leg strength',
    duration: '5 min',
    durationSec: 300,
    category: 'Legs',
    icon: '\u{1FA91}',
    steps: [
      'Sit in a sturdy chair with your feet flat on the floor',
      'Place your hands on your thighs',
      'Stand up slowly without using your hands',
      'Hold standing position for 5 seconds',
      'Sit back down slowly with control',
      'Repeat 5-10 times',
    ],
    safety: 'Use a sturdy chair. Have support nearby.',
  },
  {
    id: 'ankle-circles',
    title: 'Ankle Circles',
    description: 'Improves ankle mobility and circulation',
    duration: '3 min',
    durationSec: 180,
    category: 'Balance',
    icon: '\u{1F504}',
    steps: [
      'Sit in a chair with your back straight',
      'Lift one foot slightly off the ground',
      'Rotate your ankle clockwise 10 times',
      'Rotate counter-clockwise 10 times',
      'Switch to the other foot and repeat',
    ],
    safety: 'Keep back straight. Use chair arms for support.',
  },
  {
    id: 'leg-extensions',
    title: 'Leg Extensions',
    description: 'Strengthens quadriceps without standing',
    duration: '4 min',
    durationSec: 240,
    category: 'Legs',
    icon: '\u{1F9B5}',
    steps: [
      'Sit in a chair with your back straight',
      'Hold the sides of the chair for support',
      'Straighten one leg out in front of you',
      'Hold for 5 seconds, keeping knee slightly bent',
      'Lower your leg slowly back down',
      'Repeat 10 times, then switch legs',
    ],
    safety: 'Don\'t lock your knee. Move slowly.',
  },
  {
    id: 'shoulder-rolls',
    title: 'Shoulder Rolls',
    description: 'Reduces stiffness, improves posture',
    duration: '2 min',
    durationSec: 120,
    category: 'Posture',
    icon: '\u{1F9D8}',
    steps: [
      'Sit or stand with your arms relaxed',
      'Roll your shoulders backward 10 times',
      'Roll your shoulders forward 10 times',
      'Keep movements slow and controlled',
      'Breathe normally throughout',
    ],
    safety: 'Keep movements gentle. Stop if you feel pain.',
  },
];

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
  const [currentIndex, setCurrentIndex] = useState(0);
  const [completed, setCompleted] = useState<Set<string>>(loadCompleted);
  const [timerActive, setTimerActive] = useState(false);
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [showPainModal, setShowPainModal] = useState(false);
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [searchParams] = useSearchParams();
  const consumedRef = useRef(false);
  const exerciseVideoRef = useRef<HTMLVideoElement>(null);
  const exerciseStreamRef = useRef<MediaStream | null>(null);

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

  // Pose detection for form feedback
  const poseDetection = usePoseDetection(exerciseVideoRef, cameraEnabled && timerActive);
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
  }, [exercise.durationSec]);

  const markComplete = useCallback(() => {
    const next = new Set(completed);
    next.add(exercise.id);
    setCompleted(next);
    saveCompleted(next);
    setTimerActive(false);
    const nextIdx = EXERCISES.findIndex((e, i) => i > currentIndex && !next.has(e.id));
    if (nextIdx >= 0) setCurrentIndex(nextIdx);
  }, [completed, exercise.id, currentIndex]);

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
        <h1>Today&apos;s Routine</h1>
      </div>

      {/* Progress bar */}
      <div className="exercise-progress-bar">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <p className="card-title">Progress</p>
          <span className="progress-text">{completedCount} of {totalCount}</span>
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
            Completed
          </span>
        )}
      </div>

      {/* Form Feedback Camera */}
      {hasFormFeedback && (
        <div className="exercise-camera-section">
          <button className="btn-ghost" onClick={toggleCamera} style={{ marginBottom: 8 }}>
            {cameraEnabled ? 'Turn Off Camera' : 'Use Camera for Form Feedback'}
          </button>
          {cameraEnabled && (
            <div className="exercise-camera-preview">
              <video ref={exerciseVideoRef} playsInline muted autoPlay style={{ width: '100%', borderRadius: 'var(--radius-sm)' }} />
              <PoseOverlay
                videoRef={exerciseVideoRef}
                pose={poseDetection.currentPose}
                confidence={poseDetection.confidence}
                isActive={cameraEnabled && timerActive}
              />
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
              <span>Reps</span>
            </div>
          )}
        </div>
      )}

      {/* Timer */}
      {(timerActive || timerSeconds > 0) && (
        <div className="exercise-timer">
          <span className="timer-display">{formatTime(timerSeconds)}</span>
          <span className="timer-label">{timerActive ? 'In progress...' : 'Timer paused'}</span>
        </div>
      )}

      {/* Steps */}
      <div className="exercise-steps">
        <h3>How to do it</h3>
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
            Start Timer
          </button>
        )}

        {timerActive && (
          <button className="btn-secondary" onClick={() => setTimerActive(false)}>
            Pause Timer
          </button>
        )}

        {!timerActive && timerSeconds > 0 && (
          <button className="btn-secondary" onClick={() => setTimerActive(true)}>
            Resume Timer
          </button>
        )}

        <button
          className="btn-primary"
          onClick={markComplete}
          disabled={completed.has(exercise.id)}
        >
          {completed.has(exercise.id) ? 'Completed' : 'Mark Complete'}
        </button>

        <div className="exercise-btn-row">
          <button className="btn-ghost" onClick={goToPrev}>
            Previous
          </button>
          <button className="btn-ghost" onClick={skip}>
            Skip
          </button>
        </div>

        <button
          className="btn-outline-danger"
          onClick={() => setShowPainModal(true)}
        >
          I Feel Pain
        </button>
      </div>

      {/* Pain Modal */}
      {showPainModal && (
        <div className="pain-modal-overlay" onClick={() => setShowPainModal(false)}>
          <div className="pain-modal" onClick={(e) => e.stopPropagation()}>
            <h2>Take a Break</h2>
            <p>
              Please stop the exercise and rest. If pain continues, consider seeing
              a doctor or physiotherapist. Your safety comes first.
            </p>
            <button className="btn-primary" onClick={() => setShowPainModal(false)}>
              I Understand
            </button>
            <a href="tel:995" className="btn-outline-danger" style={{ textDecoration: 'none', textAlign: 'center' }}>
              Call 995 (Emergency)
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
