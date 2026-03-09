/**
 * CameraRecordingView — Camera setup, countdown, and recording UI.
 * Extracted from AssessmentPage.
 */

import { type RefObject } from 'react';
import { Loading, PoseOverlay } from './index';
import { tpl } from '../i18n';
import type { Translations } from '../i18n/en';
import type { AssessmentTestConfig, AssessmentStep } from '../hooks/useAssessmentFlow';

interface CameraRecordingViewProps {
  t: Translations;
  step: AssessmentStep;
  currentTest: AssessmentTestConfig;
  progressLabel: string;
  cameraReady: boolean;
  countdown: number;
  recordingTime: number;
  showOverlay: boolean;
  encouragement: string;
  startButtonText: string;
  startButtonDisabled: boolean;
  poseConfidence: number;
  voiceCoachEnabled: boolean;
  voiceCoachCue: string | null;
  videoRef: RefObject<HTMLVideoElement | null>;
  poseDetection: {
    poseRef: RefObject<unknown>;
    confidenceRef: RefObject<number>;
    isReady: boolean;
  };
  onSetShowOverlay: (fn: (v: boolean) => boolean) => void;
  onSetVoiceCoachEnabled: (fn: (v: boolean) => boolean) => void;
  onBeginCountdown: () => void;
  onStopRecording: () => void;
  onReset: () => void;
}

export function CameraRecordingView({
  t,
  step,
  currentTest,
  progressLabel,
  cameraReady,
  countdown,
  recordingTime,
  showOverlay,
  encouragement,
  startButtonText,
  startButtonDisabled,
  poseConfidence,
  voiceCoachEnabled,
  voiceCoachCue,
  videoRef,
  poseDetection,
  onSetShowOverlay,
  onSetVoiceCoachEnabled,
  onBeginCountdown,
  onStopRecording,
  onReset,
}: CameraRecordingViewProps) {
  return (
    <div className="page camera-page">
      <div className="camera-header">
        <span className="camera-progress-badge">{progressLabel}</span>
        <h2 className="camera-test-title">{currentTest.title}</h2>
        <button
          className={`voice-coach-toggle${voiceCoachEnabled ? ' active' : ''}`}
          onClick={() => onSetVoiceCoachEnabled((v) => !v)}
          aria-label={t.assessment.toggleCoach}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <line x1="12" y1="19" x2="12" y2="23" />
          </svg>
          {t.assessment.coach}
        </button>
        <button onClick={onReset} className="camera-cancel-btn">
          {t.common.cancel}
        </button>
      </div>

      {/* Camera viewport */}
      <div className="camera-viewport">
        <video ref={videoRef} className="camera-video-fit" playsInline muted autoPlay />

        <PoseOverlay
          videoRef={videoRef}
          poseRef={poseDetection.poseRef as never}
          confidenceRef={poseDetection.confidenceRef}
          isActive={(step === 'setup' || step === 'countdown' || step === 'recording') && poseDetection.isReady}
          showOverlay={showOverlay}
        />

        {(step === 'setup' || step === 'recording') && poseDetection.isReady && (
          <button
            className={`overlay-toggle${showOverlay ? ' active' : ''}`}
            onClick={() => onSetShowOverlay((v) => !v)}
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

        {!cameraReady && step === 'setup' && (
          <div className="camera-overlay-fit">
            <Loading message={t.assessment.startingCamera} />
          </div>
        )}

        {step === 'countdown' && (
          <div className="camera-overlay-fit">
            <span className="countdown-number">{countdown}</span>
            <p className="countdown-label">{t.assessment.getReady}</p>
          </div>
        )}

        {step === 'recording' && (
          <div className="recording-pill">{tpl(t.assessment.recording, { time: recordingTime })}</div>
        )}

        {step === 'recording' && encouragement && (
          <div className="encouragement-pill">{encouragement}</div>
        )}

        {voiceCoachCue && (
          <div className="voice-coach-cue">{voiceCoachCue}</div>
        )}
      </div>

      {step === 'setup' && (
        <ul className="camera-tips">
          {currentTest.steps.map((stepText) => (
            <li key={stepText}>{stepText}</li>
          ))}
        </ul>
      )}

      {step === 'setup' && cameraReady && poseConfidence >= 0.4 && poseConfidence < 0.7 && (
        <p className="camera-hint-subtle">{t.assessment.stepBack}</p>
      )}

      {step === 'recording' && (
        <p className="camera-recording-hint">{currentTest.subtitle}</p>
      )}

      <div className="camera-actions">
        {step === 'setup' && (
          <button onClick={onBeginCountdown} disabled={startButtonDisabled} className="btn-primary">
            {startButtonText}
          </button>
        )}

        {step === 'countdown' && (
          <button className="btn-secondary" disabled>
            {tpl(t.assessment.startingIn, { count: countdown })}
          </button>
        )}

        {step === 'recording' && (
          <button onClick={onStopRecording} className="btn-danger">
            {t.assessment.stopRecording}
          </button>
        )}
      </div>
    </div>
  );
}
