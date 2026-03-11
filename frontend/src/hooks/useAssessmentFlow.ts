/**
 * useAssessmentFlow — State machine and logic for the multi-step SPPB assessment.
 * Extracted from AssessmentPage to reduce component size.
 */

import { useRef, useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { AssessmentResult, GaitIssue, InterventionAction } from '../types';
import { useAssessmentStore } from '../stores';
import { usePoseDetection } from './usePoseDetection';
import { usePoseMetrics, type MetricsTimeSeries } from './usePoseMetrics';
import type { PoseMetricsSummary } from '../utils/poseMetrics';
import { useVoiceCoach } from './useVoiceCoach';
import { extractFrameMetrics } from '../utils/poseMetrics';
import { computeTotal as computeTotalScore, computeMaxScore } from '../utils/scoring';
import { useT, tpl } from '../i18n';
import type { Translations } from '../i18n/en';

// --- Types ---
export type AssessmentStep =
  | 'intro'
  | 'select'
  | 'setup'
  | 'countdown'
  | 'recording'
  | 'analyzing'
  | 'next'
  | 'result';

export type AssessmentTestId = 'balance' | 'gait' | 'chair_stand';

export type AnalysisStage = 'uploading' | 'processing' | 'analyzing' | 'complete' | 'error';

export type AssessmentTestConfig = {
  id: AssessmentTestId;
  title: string;
  subtitle: string;
  analysisLabel: string;
  recordingTime: number;
  steps: string[];
};

// --- Constants ---
export const ALL_TEST_IDS: AssessmentTestId[] = ['balance', 'gait', 'chair_stand'];
export const STAGE_ORDER: AnalysisStage[] = ['uploading', 'processing', 'analyzing', 'complete'];

// --- Helpers ---
export function getStageMessages(t: Translations): Record<AnalysisStage, string> {
  return {
    uploading: t.assessment.stageSending,
    processing: t.assessment.stageReady,
    analyzing: t.assessment.stageAnalyzing,
    complete: t.assessment.stageDone,
    error: t.assessment.stageError,
  };
}

export function getAssessmentTests(t: Translations): AssessmentTestConfig[] {
  return [
    {
      id: 'balance',
      title: t.assessment.balance,
      subtitle: t.assessment.balanceDesc,
      analysisLabel: t.assessment.balanceAnalyzing,
      recordingTime: 12,
      steps: [
        'Stand with feet together and look forward.',
        'Try not to hold onto anything.',
        'Stay as still as you can for the full time.',
      ],
    },
    {
      id: 'gait',
      title: t.assessment.gait,
      subtitle: t.assessment.gaitDesc,
      analysisLabel: t.assessment.gaitAnalyzing,
      recordingTime: 15,
      steps: [
        'Walk past the phone at your normal pace.',
        'Walk naturally — no need to rush.',
        'Look ahead, not at the phone.',
      ],
    },
    {
      id: 'chair_stand',
      title: t.assessment.chairStand,
      subtitle: t.assessment.chairStandDesc,
      analysisLabel: t.assessment.chairStandAnalyzing,
      recordingTime: 20,
      steps: [
        'Sit in a sturdy chair with your arms crossed.',
        'Stand up fully, then sit back down. Repeat 5 times.',
        'Go at your own pace — safety first.',
      ],
    },
  ];
}

export function getEncouragement(
  testId: AssessmentTestId,
  trunkLean: number | null,
  repCount: number,
  t: Translations,
): string {
  if (testId === 'balance') {
    if (trunkLean !== null && trunkLean < 5) return t.assessment.posePerfect;
    if (trunkLean !== null && trunkLean > 15) return t.assessment.poseStraighter;
    return t.assessment.poseHoldSteady;
  }
  if (testId === 'chair_stand') {
    if (repCount >= 5) return tpl(t.assessment.poseRepsGreat, { count: repCount });
    if (repCount > 0) return tpl(t.assessment.poseRepsKeepGoing, { count: repCount });
    return t.assessment.poseChairEncourage;
  }
  return t.assessment.poseWalkEncourage;
}

export const buildSummary = (
  results: Partial<Record<AssessmentTestId, AssessmentResult>>,
  userId: string,
  completedTests: AssessmentTestId[],
  assessmentTests: AssessmentTestConfig[],
  t: Translations,
): AssessmentResult => {
  const balance = results.balance?.score ?? 0;
  const gait = results.gait?.score ?? 0;
  const chair = results.chair_stand?.score ?? 0;
  const totalScore = balance + gait + chair;

  const issues = new Set<GaitIssue>();
  const recommendations: string[] = [];
  let confidenceTotal = 0;
  let confidenceCount = 0;

  assessmentTests.forEach((test) => {
    const result = results[test.id];
    if (!result) return;
    result.issues.forEach((issue) => issues.add(issue));
    result.recommendations.forEach((rec) => {
      if (!recommendations.includes(rec)) recommendations.push(rec);
    });
    if (typeof result.confidence === 'number') {
      confidenceTotal += result.confidence;
      confidenceCount += 1;
    }
  });

  if (recommendations.length === 0) {
    recommendations.push(t.assessment.defaultRec1, t.assessment.defaultRec2, t.assessment.defaultRec3);
  }

  return {
    user_id: userId,
    timestamp: new Date().toISOString(),
    score: totalScore,
    issues: Array.from(issues),
    sppb_breakdown: { balance_score: balance, gait_score: gait, chair_stand_score: chair },
    completed_tests: completedTests,
    confidence: confidenceCount ? confidenceTotal / confidenceCount : 0.7,
    recommendations: recommendations.slice(0, 3),
  };
};

export { computeTotalScore, computeMaxScore };

// --- Hook ---
export function useAssessmentFlow() {
  const t = useT();
  const ASSESSMENT_TESTS = useMemo(() => getAssessmentTests(t), [t]);
  const STAGE_MESSAGES = useMemo(() => getStageMessages(t), [t]);
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
  const [analysisStage, setAnalysisStage] = useState<AnalysisStage>('uploading');
  const [showOverlay, setShowOverlay] = useState(true);
  const [latestIntervention, setLatestIntervention] = useState<InterventionAction | null>(null);

  // Chair stand rep counter
  const chairRepRef = useRef(0);
  const chairWasFlexedRef = useRef(false);
  const [chairReps, setChairReps] = useState(0);

  const userIdRef = useRef<string>(`user_${Date.now()}`);
  const currentTestId = testOrder[testIndex] ?? ASSESSMENT_TESTS[0].id;
  const currentTest = ASSESSMENT_TESTS.find((test) => test.id === currentTestId) ?? ASSESSMENT_TESTS[0];
  const totalTests = testOrder.length || ASSESSMENT_TESTS.length;

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  // Pose detection
  const poseDetection = usePoseDetection(
    videoRef,
    step === 'setup' || step === 'countdown' || step === 'recording',
  );

  // Metrics collection
  const { summaryRef: metricsRef, timeSeriesRef, flush: flushMetrics } = usePoseMetrics(
    poseDetection.currentPose,
    step === 'recording',
  );

  const [testTimeSeries, setTestTimeSeries] = useState<Partial<Record<AssessmentTestId, MetricsTimeSeries>>>({});
  const [testMetrics, setTestMetrics] = useState<Partial<Record<AssessmentTestId, PoseMetricsSummary>>>({});

  // Voice coach
  const [voiceCoachEnabled, setVoiceCoachEnabled] = useState(false);
  const liveMetrics = useMemo(() => {
    if ((step !== 'recording' && step !== 'setup' && step !== 'countdown') || !poseDetection.currentPose) return null;
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

  // Chair stand rep counting
  useEffect(() => {
    if (step !== 'recording' || currentTestId !== 'chair_stand') return;
    const bodyY = liveMetrics?.bodyVerticalPosition ?? null;
    if (bodyY === null) return;
    const threshold = 0.5;
    const isDown = bodyY > threshold;
    if (chairWasFlexedRef.current && !isDown) {
      chairRepRef.current += 1;
      setChairReps(chairRepRef.current);
    }
    chairWasFlexedRef.current = isDown;
  }, [liveMetrics?.bodyVerticalPosition, step, currentTestId]);

  useEffect(() => {
    if (step === 'recording' && currentTestId === 'chair_stand') {
      chairRepRef.current = 0;
      chairWasFlexedRef.current = false;
      setChairReps(0);
    }
  }, [step, currentTestId]);

  // Encouragement
  const encouragement = useMemo(() => {
    if (step !== 'recording') return '';
    return getEncouragement(currentTestId, liveMetrics?.trunkLean ?? null, currentTestId === 'chair_stand' ? chairReps : 0, t);
  }, [step, currentTestId, liveMetrics?.trunkLean, chairReps, t]);

  // Start button
  const poseConfidence = poseDetection.confidence;
  const startButtonText = useMemo(() => {
    if (!cameraReady) return t.assessment.waitingCamera;
    if (poseConfidence >= 0.7) return t.assessment.readyStart;
    if (poseConfidence >= 0.4) return t.assessment.startRecording;
    return t.assessment.stepIntoView;
  }, [cameraReady, poseConfidence, t]);

  const startButtonDisabled = !cameraReady || poseConfidence < 0.4;

  // Cleanup
  useEffect(() => {
    return () => {
      if (streamRef.current) streamRef.current.getTracks().forEach((track) => track.stop());
    };
  }, []);

  useEffect(() => {
    if ((step === 'setup' || step === 'countdown' || step === 'recording') && streamRef.current && videoRef.current) {
      if (videoRef.current.srcObject !== streamRef.current) {
        videoRef.current.srcObject = streamRef.current;
        videoRef.current.play().catch(() => {});
      }
    }
  }, [step]);

  useEffect(() => {
    if (pendingStart) { startCamera(); setPendingStart(false); }
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

  // Auto-start from URL params
  useEffect(() => {
    if (autoStartHandledRef.current || step !== 'intro') return;
    const start = searchParams.get('start');
    if (!start) return;
    const mode = searchParams.get('mode');
    const testsParam = searchParams.get('tests');
    if (mode === 'individual') {
      const parsed = normalizeTests(testsParam);
      if (parsed.length > 0) startAssessment(parsed);
      else setStep('select');
    } else {
      startAssessment(ALL_TEST_IDS);
    }
    autoStartHandledRef.current = true;
  }, [searchParams, step]);

  // --- Actions ---
  const startCamera = async () => {
    try {
      setError(null);
      setCameraReady(false);
      setStep('setup');

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      }

      streamRef.current = stream;
      await new Promise((resolve) => setTimeout(resolve, 150));
      const video = videoRef.current;
      if (!video) { setError(t.assessment.cameraNotAvailable); return; }
      video.srcObject = stream;
      try { await video.play(); setCameraReady(true); } catch { setCameraReady(true); }
    } catch {
      setError(t.assessment.cameraPermission);
    }
  };

  const normalizeTests = (value: string | null): AssessmentTestId[] => {
    if (!value) return [];
    return value.split(',').map((s) => s.trim().toLowerCase()).filter((s) => ALL_TEST_IDS.includes(s as AssessmentTestId)) as AssessmentTestId[];
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

  const toggleTest = (id: AssessmentTestId) => {
    setSelectedTests((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  };

  const startComprehensive = () => { setError(null); startAssessment(ALL_TEST_IDS); };
  const startIndividual = () => { setError(null); setSelectedTests(ALL_TEST_IDS); setStep('select'); };
  const startSelected = () => { if (selectedTests.length === 0) return; setError(null); startAssessment(selectedTests); };

  const showLastResult = () => {
    if (latestAssessment?.completed_tests?.length) setTestOrder(latestAssessment.completed_tests);
    else setTestOrder(ALL_TEST_IDS);
    setStep('result');
  };

  const beginCountdown = () => { setCountdown(3); setRecordingTime(currentTest.recordingTime); setStep('countdown'); };

  const startRecording = () => {
    const stream = streamRef.current;
    if (!stream) return;
    setStep('recording');

    const mimeTypes = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'];
    let mimeType = '';
    for (const type of mimeTypes) {
      if (MediaRecorder.isTypeSupported(type)) { mimeType = type; break; }
    }

    try {
      const options = mimeType ? { mimeType } : undefined;
      const mediaRecorder = new MediaRecorder(stream, options);
      chunksRef.current = [];
      mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType || 'video/webm' });
        if (streamRef.current) { streamRef.current.getTracks().forEach((track) => track.stop()); streamRef.current = null; }
        analyzeVideo(blob);
      };
      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start(1000);
      setIsRecording(true);
    } catch {
      setError(t.assessment.recordingFailed);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') mediaRecorderRef.current.stop();
    setIsRecording(false);
  };

  const analyzeVideo = async (blob: Blob) => {
    flushMetrics();
    if (timeSeriesRef.current) {
      setTestTimeSeries((prev) => ({ ...prev, [currentTest.id]: timeSeriesRef.current! }));
    }
    if (metricsRef.current) {
      setTestMetrics((prev) => ({ ...prev, [currentTest.id]: metricsRef.current! }));
    }

    setStep('analyzing');
    setAnalysisStage('uploading');
    setError(null);

    try {
      const formData = new FormData();
      formData.append('video', blob, 'check-video.webm');
      formData.append('user_id', userIdRef.current);
      formData.append('test_type', currentTest.id);
      if (metricsRef.current) formData.append('pose_metrics', JSON.stringify(metricsRef.current));

      const response = await fetch('/api/assessment/analyze-stream', { method: 'POST', body: formData });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || t.assessment.checkFailed);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('Streaming not supported');

      const decoder = new TextDecoder();
      let buffer = '';
      let finalResult: AssessmentResult | null = null;
      let intervention: InterventionAction | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const event = JSON.parse(line.slice(6));
              const stage = event.stage as AnalysisStage;
              if (stage && STAGE_ORDER.includes(stage)) setAnalysisStage(stage);
              if (stage === 'complete' && event.result) finalResult = event.result;
              if (stage === 'complete' && event.intervention) intervention = event.intervention;
              if (stage === 'error') throw new Error(event.detail || 'Analysis failed');
            } catch (e) {
              if (e instanceof Error && e.message !== 'Analysis failed') { /* skip */ } else throw e;
            }
          }
        }
      }

      if (intervention) setLatestIntervention(intervention);

      if (!finalResult) throw new Error(t.assessment.noResult);

      const result = finalResult;
      setTestResults((prev) => ({ ...prev, [currentTest.id]: result }));

      const hasNext = testIndex < testOrder.length - 1;
      if (hasNext) {
        setLastCompletedTest(currentTest.id);
        setStep('next');
      } else {
        const summary = buildSummary(
          { ...testResults, [currentTest.id]: result },
          userIdRef.current,
          testOrder,
          ASSESSMENT_TESTS,
          t,
        );
        setLatestAssessment(summary);
        setStep('result');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : t.assessment.somethingWrong;
      resetAssessment();
      setError(message);
    }
  };

  const startNextTest = () => { setTestIndex((prev) => prev + 1); setPendingStart(true); };

  const resetAssessment = useCallback(() => {
    if (streamRef.current) { streamRef.current.getTracks().forEach((track) => track.stop()); streamRef.current = null; }
    setStep('intro');
    setError(null);
    setCameraReady(false);
    setCountdown(3);
    setRecordingTime(15);
    setIsRecording(false);
    setShowDetails(false);
    setTestIndex(0);
    setTestResults({});
    setTestTimeSeries({});
    setTestMetrics({});
    setLastCompletedTest(null);
    setSelectedTests(ALL_TEST_IDS);
    setTestOrder(ALL_TEST_IDS);
    userIdRef.current = `user_${Date.now()}`;
  }, []);

  const showCamera = step === 'setup' || step === 'countdown' || step === 'recording';
  const progressLabel = tpl(t.assessment.testsOf, { completed: Math.min(testIndex + 1, totalTests), total: totalTests });

  return {
    // Translation & config
    t,
    ASSESSMENT_TESTS,
    STAGE_MESSAGES,
    STAGE_ORDER,

    // State
    step,
    countdown,
    recordingTime,
    isRecording,
    error,
    cameraReady,
    showDetails,
    setShowDetails,
    testIndex,
    testResults,
    lastCompletedTest,
    selectedTests,
    testOrder,
    analysisStage,
    showOverlay,
    setShowOverlay,
    chairReps,
    showCamera,
    progressLabel,

    // Assessment data
    latestAssessment,
    latestIntervention,
    history,
    currentTest,
    currentTestId,
    totalTests,
    testTimeSeries,
    testMetrics,

    // Pose / metrics
    videoRef,
    poseDetection,
    liveMetrics,
    voiceCoach,
    voiceCoachEnabled,
    setVoiceCoachEnabled,
    encouragement,
    startButtonText,
    startButtonDisabled,
    poseConfidence,

    // Actions
    startComprehensive,
    startIndividual,
    startSelected,
    showLastResult,
    toggleTest,
    beginCountdown,
    stopRecording,
    startNextTest,
    resetAssessment,
    computeTotalScore,
    setStep,
  };
}
