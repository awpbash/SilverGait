/**
 * Assessment Page - Multi-step SPPB with demo instructions before each test.
 * Flow: intro → [select] → demo → setup → countdown → recording → analyzing → [next → demo] → result
 * Score is proportional: 1 test = /4, 2 = /8, 3 = /12.
 */

import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppHeader, Loading, CameraRecordingView, AssessmentResultView } from '../components';
import { useAssessmentFlow, STAGE_ORDER } from '../hooks/useAssessmentFlow';
import { tpl } from '../i18n';
import type { Translations } from '../i18n/en';

// Demo durations per test
const DEMO_DURATIONS: Record<string, string> = {
  balance: '~12s',
  gait: '~15s',
  chair_stand: '~20s',
};

function getDemoTips(testId: string, t: Translations): string[] {
  const a = t.assessment;
  if (testId === 'balance') return [a.demoBalanceTip1, a.demoBalanceTip2, a.demoBalanceTip3];
  if (testId === 'gait') return [a.demoGaitTip1, a.demoGaitTip2, a.demoGaitTip3];
  return [a.demoChairTip1, a.demoChairTip2, a.demoChairTip3];
}

export function AssessmentPage() {
  const navigate = useNavigate();
  const flow = useAssessmentFlow();
  const {
    t,
    ASSESSMENT_TESTS,
    STAGE_MESSAGES,
    step,
    error,
    latestAssessment,
    history,
    selectedTests,
    lastCompletedTest,
    testOrder,
    testIndex,
    analysisStage,
    progressLabel,
    showCamera,
    testTimeSeries,
    showDetails,
    setShowDetails,
    testMetrics,
    // Camera props
    currentTest,
    cameraReady,
    countdown,
    recordingTime,
    showOverlay,
    encouragement,
    startButtonText,
    startButtonDisabled,
    poseConfidence,
    voiceCoachEnabled,
    videoRef,
    poseDetection,
    voiceCoach,
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
    setShowOverlay,
    setVoiceCoachEnabled,
    setStep,
    latestIntervention,
  } = flow;

  // Extra state: show demo before starting camera
  const [showDemo, setShowDemo] = useState(false);

  // Wrap startComprehensive/startSelected to show demo first
  const handleStartComprehensive = () => {
    startComprehensive();
    setShowDemo(true);
  };

  const handleStartSelected = () => {
    if (selectedTests.length === 0) return;
    startSelected();
    setShowDemo(true);
  };

  const handleStartNextTest = () => {
    startNextTest();
    setShowDemo(true);
  };

  // When demo is dismissed, proceed to camera setup
  const dismissDemo = () => {
    setShowDemo(false);
  };

  // --- INTRO SCREEN ---
  if (step === 'intro') {
    return (
      <div className="page">
        <AppHeader />
        <div className="assessment-card">
          <h1>{t.assessment.title}</h1>
          <p>{t.assessment.subtitle}</p>

          <div className="assessment-test-preview">
            <div className="assessment-test-item">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--olive-700)" strokeWidth="1.8">
                <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" />
                <path d="M12 6v6l4 2" />
              </svg>
              <span>{t.assessment.balance}</span>
            </div>
            <div className="assessment-test-item">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--olive-700)" strokeWidth="1.8">
                <path d="M13 4v16M7 4v16M17 4v16M4 8h16M4 16h16" />
              </svg>
              <span>{t.assessment.gait}</span>
            </div>
            <div className="assessment-test-item">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--olive-700)" strokeWidth="1.8">
                <path d="M4 18h16M4 18V6a2 2 0 012-2h12a2 2 0 012 2v12" />
                <path d="M8 18v-4M16 18v-4" />
              </svg>
              <span>{t.assessment.chairStand}</span>
            </div>
          </div>

          {error && <div className="alert error"><p>{error}</p></div>}

          <button onClick={handleStartComprehensive} className="btn-primary">
            {t.assessment.comprehensive}
          </button>
          <button onClick={startIndividual} className="btn-secondary">
            {t.assessment.individual}
          </button>

          {latestAssessment && (
            <button onClick={showLastResult} className="btn-link">
              {t.assessment.viewLastResult}
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
          <h1>{t.assessment.selectTests}</h1>
          <p>{t.assessment.selectTestsDesc}</p>

          <div className="selection-list">
            {ASSESSMENT_TESTS.map((test) => (
              <label key={test.id} className={`selection-item${selectedTests.includes(test.id) ? ' selected' : ''}`}>
                <span className="selection-check">
                  {selectedTests.includes(test.id) ? (
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--olive-700)" strokeWidth="2.5"><path d="M20 6L9 17l-5-5" /></svg>
                  ) : (
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--border)" strokeWidth="1.5"><circle cx="12" cy="12" r="10" /></svg>
                  )}
                </span>
                <input
                  type="checkbox"
                  checked={selectedTests.includes(test.id)}
                  onChange={() => toggleTest(test.id)}
                  style={{ display: 'none' }}
                />
                <div>
                  <strong>{test.title}</strong>
                  <span>{test.subtitle}</span>
                </div>
              </label>
            ))}
          </div>

          {selectedTests.length === 0 && (
            <div className="alert error"><p>{t.assessment.selectAtLeastOne}</p></div>
          )}

          <div className="assessment-actions">
            <button onClick={handleStartSelected} className="btn-primary" disabled={selectedTests.length === 0}>
              {t.assessment.startSelected}
            </button>
            <button onClick={() => setStep('intro')} className="btn-link">
              {t.common.back}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // --- DEMO SCREEN (before camera) ---
  if (showDemo && (step === 'setup' || step === 'countdown' || step === 'recording')) {
    const tips = getDemoTips(currentTest.id, t);
    const duration = DEMO_DURATIONS[currentTest.id] || '~15s';
    return (
      <div className="page">
        <AppHeader />
        <div className="assessment-card demo-card">
          <span className="assessment-progress">{progressLabel}</span>
          <h1>{currentTest.title}</h1>
          <p className="demo-subtitle">{currentTest.subtitle}</p>

          {/* Demo video placeholder */}
          <div className="demo-video-placeholder">
            <svg viewBox="0 0 48 48" width="48" height="48">
              <rect x="4" y="8" width="40" height="32" rx="4" fill="none" stroke="currentColor" strokeWidth="2" />
              <polygon points="20,16 34,24 20,32" fill="currentColor" opacity="0.5" />
            </svg>
            <span>{t.assessment.demoComingSoon}</span>
          </div>

          {/* Setup tips */}
          <div className="demo-tips">
            <h3>{t.assessment.getReadyFor}</h3>
            <ol>
              {tips.map((tip, i) => (
                <li key={i}>{tip}</li>
              ))}
            </ol>
            <span className="demo-duration">{tpl(t.assessment.demoDuration, { duration })}</span>
          </div>

          <div className="assessment-actions">
            <button onClick={dismissDemo} className="btn-primary">
              {t.assessment.demoReady}
            </button>
            <button onClick={resetAssessment} className="btn-link">
              {t.common.cancel}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // --- NEXT TEST SCREEN (between tests) ---
  if (step === 'next') {
    const completed = ASSESSMENT_TESTS.find((test) => test.id === lastCompletedTest);
    const nextTestId = testOrder[testIndex + 1] ?? ASSESSMENT_TESTS[0].id;
    const nextTest = ASSESSMENT_TESTS.find((test) => test.id === nextTestId) ?? ASSESSMENT_TESTS[0];
    const nextTips = getDemoTips(nextTestId, t);
    const nextDuration = DEMO_DURATIONS[nextTestId] || '~15s';
    return (
      <div className="page">
        <AppHeader />
        <div className="assessment-card demo-card">
          <span className="assessment-progress">{progressLabel}</span>
          <h1>{completed ? tpl(t.assessment.testComplete, { test: completed.title }) : t.assessment.greatJob}</h1>
          <p>{t.assessment.nextUp} {nextTest.title}</p>

          {/* Demo for next test */}
          <div className="demo-video-placeholder">
            <svg viewBox="0 0 48 48" width="48" height="48">
              <rect x="4" y="8" width="40" height="32" rx="4" fill="none" stroke="currentColor" strokeWidth="2" />
              <polygon points="20,16 34,24 20,32" fill="currentColor" opacity="0.5" />
            </svg>
            <span>{t.assessment.demoComingSoon}</span>
          </div>

          <div className="demo-tips">
            <h3>{t.assessment.getReadyFor}</h3>
            <ol>
              {nextTips.map((tip, i) => (
                <li key={i}>{tip}</li>
              ))}
            </ol>
            <span className="demo-duration">{tpl(t.assessment.demoDuration, { duration: nextDuration })}</span>
          </div>

          <div className="assessment-actions">
            <button onClick={handleStartNextTest} className="btn-primary">
              {t.assessment.startNextTest}
            </button>
            <button onClick={resetAssessment} className="btn-link">
              {t.common.cancel}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // --- CAMERA SCREENS (setup, countdown, recording) ---
  if (showCamera && !showDemo) {
    return (
      <CameraRecordingView
        t={t}
        step={step}
        currentTest={currentTest}
        progressLabel={progressLabel}
        cameraReady={cameraReady}
        countdown={countdown}
        recordingTime={recordingTime}
        showOverlay={showOverlay}
        encouragement={encouragement}
        startButtonText={startButtonText}
        startButtonDisabled={startButtonDisabled}
        poseConfidence={poseConfidence}
        voiceCoachEnabled={voiceCoachEnabled}
        voiceCoachCue={voiceCoach.currentCue}
        videoRef={videoRef}
        poseDetection={poseDetection}
        onSetShowOverlay={setShowOverlay}
        onSetVoiceCoachEnabled={setVoiceCoachEnabled}
        onBeginCountdown={beginCountdown}
        onStopRecording={stopRecording}
        onReset={resetAssessment}
      />
    );
  }

  // --- ANALYZING SCREEN ---
  if (step === 'analyzing') {
    const stageIndex = STAGE_ORDER.indexOf(analysisStage);
    return (
      <div className="page">
        <AppHeader />
        <div className="analysis-panel">
          <Loading message={STAGE_MESSAGES[analysisStage]} />
          <div className="analysis-stepper">
            {STAGE_ORDER.slice(0, 3).map((stage, i) => (
              <div
                key={stage}
                className={`analysis-step${i <= stageIndex ? ' active' : ''}${i < stageIndex ? ' done' : ''}`}
              >
                <div className="analysis-step-dot" />
              </div>
            ))}
          </div>
          <p className="analysis-reassurance">{t.assessment.analyzingNote}</p>
        </div>
      </div>
    );
  }

  // --- RESULT SCREEN ---
  if (step === 'result' && latestAssessment) {
    return (
      <AssessmentResultView
        t={t}
        assessment={latestAssessment}
        history={history}
        testTimeSeries={testTimeSeries}
        testMetrics={testMetrics}
        showDetails={showDetails}
        onSetShowDetails={setShowDetails}
        onReset={resetAssessment}
        onNavigateExercises={() => navigate('/exercises')}
      />
    );
  }

  return null;
}
