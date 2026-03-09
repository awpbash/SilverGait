/**
 * Assessment Page - Thin orchestrator for multi-step SPPB checks.
 * All state logic lives in useAssessmentFlow; UI pieces in CameraRecordingView & AssessmentResultView.
 */

import { useNavigate } from 'react-router-dom';
import { AppHeader, Loading, CameraRecordingView, AssessmentResultView } from '../components';
import { useAssessmentFlow, STAGE_ORDER } from '../hooks/useAssessmentFlow';
import { tpl } from '../i18n';

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
  } = flow;

  // --- INTRO SCREEN ---
  if (step === 'intro') {
    return (
      <div className="page">
        <AppHeader />
        <div className="assessment-card">
          <h1>{t.assessment.title}</h1>
          <p>{t.assessment.subtitle}</p>

          <div className="camera-placeholder">
            <div className="camera-icon">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M7 7h2l1-2h4l1 2h2a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2z"
                  fill="none" stroke="currentColor" strokeWidth="1.6"
                />
                <circle cx="12" cy="13" r="3.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
              </svg>
            </div>
          </div>

          {error && <div className="alert error"><p>{error}</p></div>}

          <button onClick={startComprehensive} className="btn-primary">
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
            <div className="alert error"><p>{t.assessment.selectAtLeastOne}</p></div>
          )}

          <div className="assessment-actions">
            <button onClick={startSelected} className="btn-primary" disabled={selectedTests.length === 0}>
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
          <h1>{completed ? tpl(t.assessment.testComplete, { test: completed.title }) : t.assessment.greatJob}</h1>
          <p>{t.assessment.nextUp} {nextTest.title}. {nextTest.subtitle}</p>

          <h2>{t.assessment.getReadyFor}</h2>
          <ol className="setup-list">
            {nextTest.steps.map((stepText) => (
              <li key={stepText}>{stepText}</li>
            ))}
          </ol>

          <div className="assessment-actions">
            <button onClick={startNextTest} className="btn-primary">
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
  if (showCamera) {
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
        showDetails={showDetails}
        onSetShowDetails={setShowDetails}
        onReset={resetAssessment}
        onNavigateExercises={() => navigate('/exercises')}
      />
    );
  }

  return null;
}
