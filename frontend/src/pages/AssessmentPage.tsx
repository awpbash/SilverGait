/**
 * Assessment Page - Multi-step SPPB checks
 * Design Constitution: Simple guidance, calm layout
 */

import { useRef, useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { AssessmentResult, GaitIssue } from '../types';
import { useAssessmentStore } from '../stores';
import { AppHeader, Loading, PoseOverlay } from '../components';
import { usePoseDetection } from '../hooks/usePoseDetection';
import { usePoseMetrics } from '../hooks/usePoseMetrics';
import { useVoiceCoach } from '../hooks/useVoiceCoach';
import { extractFrameMetrics } from '../utils/poseMetrics';

type AssessmentStep =
  | 'intro'
  | 'select'
  | 'setup'
  | 'countdown'
  | 'recording'
  | 'analyzing'
  | 'next'
  | 'result';

type AssessmentTestId = 'balance' | 'gait' | 'chair_stand';

const ASSESSMENT_TESTS: Array<{
  id: AssessmentTestId;
  title: string;
  subtitle: string;
  analysisLabel: string;
  recordingTime: number;
  steps: string[];
}> = [
  {
    id: 'balance',
    title: 'Balance Test',
    subtitle: 'Stand steady for a short time',
    analysisLabel: 'Checking your balance...',
    recordingTime: 12,
    steps: [
      'Stand with feet together and look forward.',
      'Hold still for about 10 seconds.',
      'Keep a chair nearby for support.',
    ],
  },
  {
    id: 'gait',
    title: 'Walking Test',
    subtitle: 'Walk at your normal pace',
    analysisLabel: 'Checking your walking...',
    recordingTime: 15,
    steps: [
      'Place phone against wall at waist height.',
      'Step back about 6 meters.',
      'Walk past the phone at normal pace.',
    ],
  },
  {
    id: 'chair_stand',
    title: 'Chair Stand',
    subtitle: 'Stand up and sit down 5 times',
    analysisLabel: 'Checking your chair stands...',
    recordingTime: 20,
    steps: [
      'Sit on a sturdy chair with feet flat.',
      'Cross arms over chest if possible.',
      'Stand up and sit down 5 times.',
    ],
  },
];

const ALL_TEST_IDS = ASSESSMENT_TESTS.map((test) => test.id);

const buildSummary = (
  results: Partial<Record<AssessmentTestId, AssessmentResult>>,
  userId: string,
  completedTests: AssessmentTestId[]
): AssessmentResult => {
  const balance = results.balance?.score ?? 0;
  const gait = results.gait?.score ?? 0;
  const chair = results.chair_stand?.score ?? 0;
  const totalScore = balance + gait + chair;

  const issues = new Set<GaitIssue>();
  const recommendations: string[] = [];
  let confidenceTotal = 0;
  let confidenceCount = 0;

  ASSESSMENT_TESTS.forEach((test) => {
    const result = results[test.id];
    if (!result) {
      return;
    }
    result.issues.forEach((issue) => issues.add(issue));
    result.recommendations.forEach((rec) => {
      if (!recommendations.includes(rec)) {
        recommendations.push(rec);
      }
    });
    if (typeof result.confidence === 'number') {
      confidenceTotal += result.confidence;
      confidenceCount += 1;
    }
  });

  if (recommendations.length === 0) {
    recommendations.push(
      'Continue daily movement at your own pace.',
      'Practice balance near a wall for support.',
      'Take short walks when you feel ready.'
    );
  }

  return {
    user_id: userId,
    timestamp: new Date().toISOString(),
    score: Math.round(totalScore / 3),
    issues: Array.from(issues),
    sppb_breakdown: {
      balance_score: balance,
      gait_score: gait,
      chair_stand_score: chair,
    },
    completed_tests: completedTests,
    confidence: confidenceCount ? confidenceTotal / confidenceCount : 0.7,
    recommendations: recommendations.slice(0, 3),
  };
};

export function AssessmentPage() {
  const { latestAssessment, setLatestAssessment, history } = useAssessmentStore();
  const [step, setStep] = useState<AssessmentStep>('intro');
  const [countdown, setCountdown] = useState(3);
  const [recordingTime, setRecordingTime] = useState(15);
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [testIndex, setTestIndex] = useState(0);
  const [testResults, setTestResults] = useState<Partial<Record<AssessmentTestId, AssessmentResult>>>({});
  const [lastCompletedTest, setLastCompletedTest] = useState<AssessmentTestId | null>(null);
  const [pendingStart, setPendingStart] = useState(false);
  const [selectedTests, setSelectedTests] = useState<AssessmentTestId[]>(ALL_TEST_IDS);
  const [testOrder, setTestOrder] = useState<AssessmentTestId[]>(ALL_TEST_IDS);
  const [searchParams] = useSearchParams();
  const autoStartHandledRef = useRef(false);

  const userIdRef = useRef<string>(`user_${Date.now()}`);
  const currentTestId = testOrder[testIndex] ?? ASSESSMENT_TESTS[0].id;
  const currentTest = ASSESSMENT_TESTS.find((test) => test.id === currentTestId) ?? ASSESSMENT_TESTS[0];
  const totalTests = testOrder.length || ASSESSMENT_TESTS.length;

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  // Pose detection hook - pass ref (not .current) so it reads the latest element
  const poseDetection = usePoseDetection(
    videoRef,
    step === 'recording'
  );

  // Collect biomechanical metrics from pose data during recording
  const { summaryRef: metricsRef } = usePoseMetrics(
    poseDetection.currentPose,
    step === 'recording'
  );

  // Voice coach
  const [voiceCoachEnabled, setVoiceCoachEnabled] = useState(false);
  const liveMetrics = useMemo(() => {
    if (step !== 'recording' || !poseDetection.currentPose) return null;
    return extractFrameMetrics(poseDetection.currentPose.keypoints);
  }, [step, poseDetection.currentPose]);

  const voiceCoach = useVoiceCoach({
    testType: currentTestId,
    isActive: voiceCoachEnabled && step === 'recording',
    kneeAngle: liveMetrics?.leftKneeAngle ?? liveMetrics?.rightKneeAngle ?? null,
    trunkLean: liveMetrics?.trunkLean ?? null,
    swayDeviation: null,
    movementPhases: 0,
  });

  const computeTotalScore = (assessment: AssessmentResult) => {
    if (assessment.sppb_breakdown) {
      return (
        assessment.sppb_breakdown.balance_score +
        assessment.sppb_breakdown.gait_score +
        assessment.sppb_breakdown.chair_stand_score
      );
    }
    return Math.round(assessment.score * 3);
  };

  // Cleanup stream on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  // Re-attach stream to video when step changes (video element may have re-mounted)
  useEffect(() => {
    if ((step === 'setup' || step === 'countdown' || step === 'recording') && streamRef.current && videoRef.current) {
      if (videoRef.current.srcObject !== streamRef.current) {
        videoRef.current.srcObject = streamRef.current;
        videoRef.current.play().catch(() => {});
      }
    }
  }, [step]);

  useEffect(() => {
    if (pendingStart) {
      startCamera();
      setPendingStart(false);
    }
  }, [pendingStart]);

  useEffect(() => {
    setCountdown(3);
    setRecordingTime(currentTest.recordingTime);
    setCameraReady(false);
  }, [testIndex, currentTest.recordingTime]);

  // Countdown timer
  useEffect(() => {
    if (step === 'countdown' && countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    } else if (step === 'countdown' && countdown === 0) {
      startRecording();
    }
  }, [step, countdown]);

  // Recording timer
  useEffect(() => {
    if (isRecording && recordingTime > 0) {
      const timer = setTimeout(() => setRecordingTime(recordingTime - 1), 1000);
      return () => clearTimeout(timer);
    } else if (isRecording && recordingTime === 0) {
      stopRecording();
    }
  }, [isRecording, recordingTime]);

  const startCamera = async () => {
    try {
      setError(null);
      setCameraReady(false);
      setStep('setup');

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });
      }

      streamRef.current = stream;

      // Wait for video element to be ready
      await new Promise((resolve) => setTimeout(resolve, 150));

      const video = videoRef.current;
      if (!video) {
        setError('Camera not available. Please try again.');
        return;
      }

      video.srcObject = stream;
      try {
        await video.play();
        setCameraReady(true);
      } catch {
        setCameraReady(true);
      }
    } catch {
      setError('Cannot access camera. Please allow camera permission.');
    }
  };

  const normalizeTests = (value: string | null): AssessmentTestId[] => {
    if (!value) return [];
    const items = value
      .split(',')
      .map((item) => item.trim().toLowerCase())
      .filter((item) => ALL_TEST_IDS.includes(item as AssessmentTestId));
    return items as AssessmentTestId[];
  };

  const startAssessment = (tests: AssessmentTestId[]) => {
    const nextOrder = tests.length > 0 ? tests : ALL_TEST_IDS;
    const ordered = ASSESSMENT_TESTS.map((test) => test.id).filter((id) => nextOrder.includes(id));
    setTestOrder(ordered.length ? ordered : ALL_TEST_IDS);
    setTestIndex(0);
    setTestResults({});
    setLastCompletedTest(null);
    setError(null);
    setStep('setup');
    userIdRef.current = `user_${Date.now()}`;
    setPendingStart(true);
  };

  useEffect(() => {
    if (autoStartHandledRef.current || step !== 'intro') return;
    const start = searchParams.get('start');
    if (!start) return;
    const mode = searchParams.get('mode');
    const testsParam = searchParams.get('tests');
    if (mode === 'individual') {
      const parsed = normalizeTests(testsParam);
      if (parsed.length > 0) {
        startAssessment(parsed);
      } else {
        setStep('select');
      }
    } else {
      startAssessment(ALL_TEST_IDS);
    }
    autoStartHandledRef.current = true;
  }, [searchParams, step]);

  const toggleTest = (id: AssessmentTestId) => {
    setSelectedTests((prev) => (
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    ));
  };

  const startComprehensive = () => {
    setError(null);
    startAssessment(ALL_TEST_IDS);
  };

  const startIndividual = () => {
    setError(null);
    setSelectedTests(ALL_TEST_IDS);
    setStep('select');
  };

  const startSelected = () => {
    if (selectedTests.length === 0) return;
    setError(null);
    startAssessment(selectedTests);
  };

  const showLastResult = () => {
    if (latestAssessment?.completed_tests?.length) {
      setTestOrder(latestAssessment.completed_tests);
    } else {
      setTestOrder(ALL_TEST_IDS);
    }
    setStep('result');
  };

  const beginCountdown = () => {
    setCountdown(3);
    setRecordingTime(currentTest.recordingTime);
    setStep('countdown');
  };

  const startRecording = () => {
    const stream = streamRef.current;
    if (!stream) return;

    setStep('recording');

    const mimeTypes = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'];
    let mimeType = '';
    for (const type of mimeTypes) {
      if (MediaRecorder.isTypeSupported(type)) {
        mimeType = type;
        break;
      }
    }

    try {
      const options = mimeType ? { mimeType } : undefined;
      const mediaRecorder = new MediaRecorder(stream, options);
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType || 'video/webm' });
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((track) => track.stop());
          streamRef.current = null;
        }
        analyzeVideo(blob);
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start(1000);
      setIsRecording(true);
    } catch {
      setError('Could not start recording. Please try again.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  };

  const analyzeVideo = async (blob: Blob) => {
    setStep('analyzing');
    setError(null);

    try {
      const formData = new FormData();
      formData.append('video', blob, 'check-video.webm');
      formData.append('user_id', userIdRef.current);
      formData.append('test_type', currentTest.id);
      if (metricsRef.current) {
        formData.append('pose_metrics', JSON.stringify(metricsRef.current));
      }

      const response = await fetch('/api/assessment/analyze', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || 'Check failed. Please try again.');
      }

      const result = await response.json();
      setTestResults((prev) => ({ ...prev, [currentTest.id]: result }));

      const hasNext = testIndex < testOrder.length - 1;
      if (hasNext) {
        setLastCompletedTest(currentTest.id);
        setStep('next');
      } else {
        const summary = buildSummary(
          { ...testResults, [currentTest.id]: result },
          userIdRef.current,
          testOrder
        );
        setLatestAssessment(summary);
        setStep('result');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Something went wrong. Please try again.';
      resetAssessment();
      setError(message);
    }
  };

  const startNextTest = () => {
    setTestIndex((prev) => prev + 1);
    setPendingStart(true);
  };

  const resetAssessment = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setStep('intro');
    setError(null);
    setCameraReady(false);
    setCountdown(3);
    setRecordingTime(currentTest.recordingTime);
    setIsRecording(false);
    setShowDetails(false);
    setTestIndex(0);
    setTestResults({});
    setLastCompletedTest(null);
    setSelectedTests(ALL_TEST_IDS);
    setTestOrder(ALL_TEST_IDS);
    userIdRef.current = `user_${Date.now()}`;
  };

  // Check if we should show camera view
  const showCamera = step === 'setup' || step === 'countdown' || step === 'recording';
  const progressLabel = `Step ${Math.min(testIndex + 1, totalTests)} of ${totalTests}`;

  // --- INTRO SCREEN ---
  if (step === 'intro') {
    return (
      <div className="page">
        <AppHeader />

        <div className="assessment-card">
          <h1>Physical Assessment</h1>
          <p>Choose a full check or just the tests you want to do today.</p>

          <div className="camera-placeholder">
            <div className="camera-icon">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M7 7h2l1-2h4l1 2h2a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2z"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                />
                <circle cx="12" cy="13" r="3.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
              </svg>
            </div>
          </div>

          {error && (
            <div className="alert error">
              <p>{error}</p>
            </div>
          )}

          <button onClick={startComprehensive} className="btn-primary">
            Comprehensive Check
          </button>
          <button onClick={startIndividual} className="btn-secondary">
            Do Individual Tests
          </button>

          {latestAssessment && (
            <button onClick={showLastResult} className="btn-link">
              View Last Result
            </button>
          )}
        </div>
      </div>
    );
  }

  // --- SELECT INDIVIDUAL TESTS ---
  if (step === 'select') {
    return (
      <div className="page">
        <AppHeader />

        <div className="assessment-card">
          <h1>Select Tests</h1>
          <p>Pick one or more checks to do right now.</p>

          <div className="selection-list">
            {ASSESSMENT_TESTS.map((test) => (
              <label key={test.id} className="selection-item">
                <input
                  type="checkbox"
                  checked={selectedTests.includes(test.id)}
                  onChange={() => toggleTest(test.id)}
                />
                <div>
                  <strong>{test.title}</strong>
                  <span>{test.subtitle}</span>
                </div>
              </label>
            ))}
          </div>

          {selectedTests.length === 0 && (
            <div className="alert error">
              <p>Select at least one test to continue.</p>
            </div>
          )}

          <div className="assessment-actions">
            <button onClick={startSelected} className="btn-primary" disabled={selectedTests.length === 0}>
              Start Selected Tests
            </button>
            <button onClick={() => setStep('intro')} className="btn-link">
              Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  // --- NEXT TEST SCREEN ---
  if (step === 'next') {
    const completed = ASSESSMENT_TESTS.find((test) => test.id === lastCompletedTest);
    const nextTestId = testOrder[testIndex + 1] ?? ASSESSMENT_TESTS[0].id;
    const nextTest = ASSESSMENT_TESTS.find((test) => test.id === nextTestId) ?? ASSESSMENT_TESTS[0];
    return (
      <div className="page">
        <AppHeader />

        <div className="assessment-card">
          <span className="assessment-progress">{progressLabel}</span>
          <h1>{completed ? `${completed.title} Complete` : 'Great job!'}</h1>
          <p>Next up: {nextTest.title}. {nextTest.subtitle}</p>

          <h2>Get ready</h2>
          <ol className="setup-list">
            {nextTest.steps.map((stepText) => (
              <li key={stepText}>{stepText}</li>
            ))}
          </ol>

          <div className="assessment-actions">
            <button onClick={startNextTest} className="btn-primary">
              Start Next Test
            </button>
            <button onClick={resetAssessment} className="btn-link">
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  // --- CAMERA SCREENS (setup, countdown, recording) ---
  if (showCamera) {
    return (
      <div className="page camera-page">
        <div className="camera-header">
          <span className="camera-progress-badge">{progressLabel}</span>
          <h2 className="camera-test-title">{currentTest.title}</h2>
          <button
            className={`voice-coach-toggle${voiceCoachEnabled ? ' active' : ''}`}
            onClick={() => setVoiceCoachEnabled((v) => !v)}
            aria-label="Toggle voice coach"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="23" />
            </svg>
            Coach
          </button>
          <button onClick={resetAssessment} className="camera-cancel-btn">
            Cancel
          </button>
        </div>

        {/* Camera viewport - fills available space */}
        <div className="camera-viewport">
          <video ref={videoRef} className="camera-video-fit" playsInline muted autoPlay />

          {/* Pose detection overlay */}
          <PoseOverlay
            videoRef={videoRef}
            pose={poseDetection.currentPose}
            confidence={poseDetection.confidence}
            isActive={step === 'recording' && poseDetection.isReady}
          />

          {/* Loading overlay */}
          {!cameraReady && step === 'setup' && (
            <div className="camera-overlay-fit">
              <Loading message="Starting camera..." />
            </div>
          )}

          {/* Countdown overlay */}
          {step === 'countdown' && (
            <div className="camera-overlay-fit">
              <span className="countdown-number">{countdown}</span>
              <p className="countdown-label">Get ready...</p>
            </div>
          )}

          {/* Recording indicator */}
          {step === 'recording' && (
            <div className="recording-pill">Recording - {recordingTime}s</div>
          )}

          {/* Voice coach cue */}
          {voiceCoach.currentCue && (
            <div className="voice-coach-cue">{voiceCoach.currentCue}</div>
          )}
        </div>

        {/* Instructions (setup only) */}
        {step === 'setup' && (
          <ul className="camera-tips">
            {currentTest.steps.map((stepText) => (
              <li key={stepText}>{stepText}</li>
            ))}
          </ul>
        )}

        {step === 'recording' && (
          <p className="camera-recording-hint">{currentTest.subtitle}</p>
        )}

        {/* Action buttons */}
        <div className="camera-actions">
          {step === 'setup' && (
            <button onClick={beginCountdown} disabled={!cameraReady} className="btn-primary">
              {cameraReady ? 'Start Recording' : 'Waiting for camera...'}
            </button>
          )}

          {step === 'countdown' && (
            <button className="btn-secondary" disabled>
              Starting in {countdown}
            </button>
          )}

          {step === 'recording' && (
            <button onClick={stopRecording} className="btn-danger">
              Stop Recording
            </button>
          )}
        </div>
      </div>
    );
  }

  // --- ANALYZING SCREEN ---
  if (step === 'analyzing') {
    return (
      <div className="page">
        <AppHeader />
        <div className="analysis-panel">
          <Loading message={currentTest.analysisLabel} />
          <p>Just a moment...</p>
        </div>
      </div>
    );
  }

  // --- RESULT SCREEN ---
  if (step === 'result' && latestAssessment) {
    const totalScore = computeTotalScore(latestAssessment);
    const breakdown = latestAssessment.sppb_breakdown;
    const balanceScore = breakdown?.balance_score ?? Math.round(latestAssessment.score);
    const gaitScore = breakdown?.gait_score ?? Math.round(latestAssessment.score);
    const chairScore = breakdown?.chair_stand_score ?? Math.round(latestAssessment.score);
    const completedTests = latestAssessment.completed_tests ?? ALL_TEST_IDS;
    const isPartial = completedTests.length < ALL_TEST_IDS.length;
    const showBalance = completedTests.includes('balance');
    const showGait = completedTests.includes('gait');
    const showChair = completedTests.includes('chair_stand');

    const previous = history?.[1];
    const previousTotal = previous ? computeTotalScore(previous) : null;
    const delta = previousTotal !== null ? totalScore - previousTotal : null;

    const scoreLabel = totalScore >= 9 ? 'GOOD' : totalScore >= 6 ? 'FAIR' : 'NEEDS PRACTICE';
    const deltaText = delta !== null ? `${delta >= 0 ? '+' : ''}${delta} from week` : '+1 from week';
    const encouragement =
      totalScore >= 9
        ? "You're doing great! Let's work on balance."
        : totalScore >= 6
        ? 'Good effort! A little more practice will help.'
        : "Let's take it slow and steady today.";

    const subLabel = (value: number) => {
      if (value >= 4) return 'Excellent!';
      if (value >= 3) return 'Great!';
      if (value >= 2) return 'Needs Practice';
      return 'Try Again';
    };

    return (
      <div className="page">
        <AppHeader />

        <div className="page-title">
          <h1>Assessment Complete!</h1>
          {isPartial && (
            <p className="subtitle">
              Partial check: {completedTests.length} of {ALL_TEST_IDS.length} tests completed
            </p>
          )}
        </div>

        <div className="score-card">
          <div>
            <p className="card-title">{isPartial ? 'Partial Score:' : 'Your SPPB Score:'}</p>
            <div className="score-ring large">
              <span className="score-value">{totalScore}/12</span>
              <span className="score-label">{scoreLabel}</span>
            </div>
          </div>
          <div className="trend-pill">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 5l-5 6h3v8h4v-8h3l-5-6z" fill="currentColor" />
            </svg>
            <span>{deltaText}</span>
          </div>
        </div>

        <p className="result-message">{encouragement}</p>

        <div className="metric-grid">
          {showBalance && (
            <div className="metric-card">
              <p>Balance Test:</p>
              <strong>{balanceScore}/4</strong>
              <span>{subLabel(balanceScore)}</span>
            </div>
          )}
          {showGait && (
            <div className="metric-card">
              <p>Gait Speed:</p>
              <strong>{gaitScore}/4</strong>
              <span>{subLabel(gaitScore)}</span>
            </div>
          )}
          {showChair && (
            <div className="metric-card">
              <p>Chair Stand:</p>
              <strong>{chairScore}/4</strong>
              <span>{subLabel(chairScore)}</span>
            </div>
          )}
        </div>

        <div className="result-actions">
          <button
            type="button"
            className="btn-primary"
            onClick={() => setShowDetails((prev) => !prev)}
          >
            {showDetails ? 'Hide Detailed Report' : 'View Detailed Report'}
          </button>
          <button type="button" className="btn-link" onClick={resetAssessment}>
            Start Another Check
          </button>
        </div>

        {showDetails && (
          <div className="detail-panel">
            <h3>Recommendations</h3>
            <ul>
              {latestAssessment.recommendations.slice(0, 3).map((rec) => (
                <li key={rec}>{rec}</li>
              ))}
            </ul>

            {latestAssessment.issues.length > 0 && (
              <div className="issue-tags">
                {latestAssessment.issues.map((issue) => (
                  <span key={issue}>{issue.replace(/_/g, ' ')}</span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  return null;
}
