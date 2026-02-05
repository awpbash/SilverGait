/**
 * Assessment Page - Walking & Balance Check
 * Design Constitution: Safe camera UX, no jargon, "I Need Help" button
 * Caregiver mode hides complexity
 */

import { useRef, useState, useEffect } from 'react';
import { useAssessmentStore } from '../stores';
import { Loading } from '../components';

type AssessmentStep =
  | 'intro'
  | 'setup'
  | 'countdown'
  | 'recording'
  | 'analyzing'
  | 'result';

interface AssessmentPageProps {
  autoStart?: boolean;
  onAutoStartConsumed?: () => void;
}

export function AssessmentPage({ autoStart, onAutoStartConsumed }: AssessmentPageProps) {
  const { latestAssessment, setLatestAssessment } = useAssessmentStore();
  const [step, setStep] = useState<AssessmentStep>('intro');
  const [countdown, setCountdown] = useState(3);
  const [recordingTime, setRecordingTime] = useState(15);
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [showCaregiverMode, setShowCaregiverMode] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  // Cleanup stream on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
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
      await new Promise(resolve => setTimeout(resolve, 150));

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

  useEffect(() => {
    if (autoStart && step === 'intro') {
      startCamera();
      onAutoStartConsumed?.();
    }
  }, [autoStart, step]);

  const beginCountdown = () => {
    setCountdown(3);
    setRecordingTime(15);
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
          streamRef.current.getTracks().forEach(track => track.stop());
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
      formData.append('user_id', 'user_' + Date.now());

      const response = await fetch('/api/assessment/analyze', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || 'Check failed. Please try again.');
      }

      const result = await response.json();
      setLatestAssessment(result);
      setStep('result');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
      setStep('intro');
    }
  };

  const resetAssessment = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setStep('intro');
    setError(null);
    setCameraReady(false);
    setCountdown(3);
    setRecordingTime(15);
    setIsRecording(false);
  };

  const handleNeedHelp = () => {
    resetAssessment();
    alert('No worries! You can ask a family member or caregiver to help you, or try again later.');
  };

  // Check if we should show camera view
  const showCamera = step === 'setup' || step === 'countdown' || step === 'recording';

  // --- INTRO SCREEN ---
  if (step === 'intro') {
    return (
      <div className="min-h-[80vh] flex flex-col">
        <header className="px-5 pt-6 pb-4 text-center">
          <p className="subtle-text">Assessment Step Screen</p>
          <h1 className="screen-title mt-1">Stand Up & Sit Down</h1>
          <p className="subtle-text mt-2">Stand inside the box</p>
        </header>

        <div className="flex-1 flex flex-col items-center justify-center px-5">
          <div className="card w-full max-w-sm text-center">
            <p className="subtle-text">We will record a short video. It is processed securely.</p>
          </div>
        </div>

        {error && (
          <div className="mx-4 mb-4 p-4 bg-[#fef2f2] border border-[#fecaca] rounded-xl text-center">
            <p className="text-[#c53030]">{error}</p>
          </div>
        )}

        <div className="p-5 space-y-3">
          <button onClick={startCamera} className="btn-primary">
            Start
          </button>

          {latestAssessment && (
            <button onClick={() => setStep('result')} className="btn-secondary">
              View Last Result
            </button>
          )}
        </div>
      </div>
    );
  }

  // --- CAMERA SCREENS (setup, countdown, recording) ---
  if (showCamera) {
    return (
      <div className="min-h-[80vh] flex flex-col">
        {/* I Need Help button - always visible */}
        <div className="absolute top-4 right-4 z-20">
          <button onClick={handleNeedHelp} className="btn-help">
            I Need Help
          </button>
        </div>

        {/* Header - changes based on step */}
        <header className="px-5 pt-6 pb-4 text-center">
          {step === 'setup' && (
            <>
              <p className="subtle-text">Camera Setup Screen</p>
              <h1 className="screen-title mt-1">Place phone here</h1>
              <p className="subtle-text mt-1">Stand inside the box</p>
            </>
          )}
          {step === 'countdown' && (
            <>
              <p className="subtle-text">Countdown Screen</p>
              <h1 className="screen-title mt-1">Stand Up & Sit Down</h1>
            </>
          )}
          {step === 'recording' && (
            <div className="flex items-center justify-center gap-2 text-[#c53030]">
              <span className="w-3 h-3 bg-[#c53030] rounded-full animate-pulse"></span>
              <span className="font-semibold">Recording</span>
            </div>
          )}
        </header>

        {/* Camera view - persistent across all camera steps */}
        <div className="flex-1 relative mx-5 rounded-2xl overflow-hidden bg-[#1a202c]">
          <video
            ref={videoRef}
            className="w-full h-full object-cover"
            playsInline
            muted
            autoPlay
          />

          {/* Setup overlay - silhouette guide */}
          {step === 'setup' && (
            <>
              <div className="camera-guide">
                <div className="camera-guide-box">
                  <svg viewBox="0 0 100 180" className="w-24 h-40 opacity-50">
                    <ellipse cx="50" cy="25" rx="18" ry="20" fill="white"/>
                    <ellipse cx="50" cy="75" rx="22" ry="35" fill="white"/>
                    <rect x="35" y="105" width="12" height="50" rx="6" fill="white"/>
                    <rect x="53" y="105" width="12" height="50" rx="6" fill="white"/>
                  </svg>
                  <div className="camera-guide-text mt-4">
                    Stand inside the box
                  </div>
                </div>
              </div>
              <div className="footprint-guide">
                <div className="footprint"></div>
                <div className="footprint"></div>
              </div>
            </>
          )}

          {/* Countdown overlay */}
          {step === 'countdown' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/35">
              <div className="line-illustration bg-white/90 w-56 text-center">
                <p className="font-semibold text-[#2a2a2a]">Stand Up & Sit Down</p>
                <div className="flex items-center justify-center gap-3 text-2xl font-bold mt-3">
                  {[3, 2, 1].map((num) => (
                    <span
                      key={num}
                      className={countdown === num ? 'text-[#5e8e3e]' : 'text-[#8a8a8a]'}
                    >
                      {num}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Recording indicator */}
          {step === 'recording' && (
            <div className="absolute top-4 left-4 bg-[#c53030] text-white px-3 py-1 rounded-full flex items-center gap-2">
              <span className="w-2 h-2 bg-white rounded-full animate-pulse"></span>
              <span className="font-medium">{recordingTime}s</span>
            </div>
          )}

          {/* Loading state */}
          {!cameraReady && step === 'setup' && (
            <div className="absolute inset-0 flex items-center justify-center bg-[#1a202c]/80">
              <Loading message="Starting camera..." />
            </div>
          )}
        </div>

        {/* Bottom controls - changes based on step */}
        <div className="p-5 space-y-4">
          {step === 'setup' && (
            <>
              <div className="panel text-center">
                <p className="text-[#4a4a4a] font-medium">
                  Place phone on a table pointing at you.
                </p>
                <p className="subtle-text mt-1">Ask someone to help if needed.</p>
              </div>
              <button
                onClick={beginCountdown}
                disabled={!cameraReady}
                className="btn-primary"
              >
                {cameraReady ? 'Start' : 'Waiting for camera...'}
              </button>
              <button onClick={resetAssessment} className="btn-secondary">
                Cancel
              </button>
            </>
          )}

          {step === 'recording' && (
            <>
              <div className="panel text-center">
                <p className="text-[#4a4a4a] text-lg font-medium text-center">
                  1. Stand up from your chair<br/>
                  2. Walk towards the camera
                </p>
              </div>
              <button onClick={stopRecording} className="btn-secondary">
                Stop Early
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  // --- ANALYZING SCREEN ---
  if (step === 'analyzing') {
    return (
      <div className="min-h-[80vh] flex flex-col items-center justify-center p-4">
        <Loading message="Checking your movement..." />
        <p className="text-[#718096] mt-4 text-center">
          Just a moment...
        </p>
      </div>
    );
  }

  // --- RESULT SCREEN ---
  if (step === 'result' && latestAssessment) {
    const score = latestAssessment.score;
    const isGood = score >= 3;

    const getMessage = () => {
      if (score >= 4) return { icon: 'check', text: 'Your movement looks steady today!', subtext: 'Great job! Keep up your daily walks.' };
      if (score >= 3) return { icon: 'check', text: 'Your movement looks good!', subtext: "Let's keep your legs strong with some exercises." };
      if (score >= 2) return { icon: 'info', text: "Let's work on your strength", subtext: 'Some gentle exercises can help you feel steadier.' };
      return { icon: 'info', text: 'We want to help you feel steadier', subtext: 'Please talk to your doctor or family about this.' };
    };

    const message = getMessage();

    return (
        <div className="min-h-[80vh] flex flex-col">
        <header className="px-5 pt-6 pb-4 text-center">
          <div className={`w-20 h-20 mx-auto rounded-full flex items-center justify-center ${isGood ? 'bg-[#5e8e3e]' : 'bg-[#b3872e]'}`}>
            {message.icon === 'check' ? (
              <svg className="w-10 h-10 text-white" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
            ) : (
              <svg className="w-10 h-10 text-white" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
            )}
          </div>
        </header>

        <div className="flex-1 px-5">
          <div className={`panel text-center py-8 mb-6 ${isGood ? 'bg-[#edf4e6] border-[#b8d7a3]' : 'bg-[#faf2e2] border-[#e3c57b]'}`}>
            <h1 className="text-2xl font-bold text-[#1a202c] mb-2">
              {message.text}
            </h1>
            <p className="text-lg text-[#4a5568]">
              {message.subtext}
            </p>
          </div>

          <div className="card mb-6">
            <h2 className="text-lg font-semibold text-[#1a202c] mb-4">What you can do:</h2>
            <ul className="space-y-3">
              {latestAssessment.recommendations.slice(0, 3).map((rec, i) => (
                <li key={i} className="flex items-start gap-3">
                  <span className="w-6 h-6 rounded-full bg-[#5e8e3e] text-white flex items-center justify-center text-sm font-semibold flex-shrink-0">
                    {i + 1}
                  </span>
                  <span className="text-[#4a5568]">{rec}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="card mb-6">
            <div className="caregiver-toggle">
              <span>Show detailed results (for caregiver)</span>
              <button
                onClick={() => setShowCaregiverMode(!showCaregiverMode)}
                className={`toggle-switch ${showCaregiverMode ? 'active' : ''}`}
                aria-pressed={showCaregiverMode}
              />
            </div>

            {showCaregiverMode && (
              <div className="mt-4 pt-4 border-t border-[#e2e8f0]">
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div className="text-center p-3 bg-[#f6f5f0] rounded-xl">
                    <p className="text-3xl font-bold text-[#5e8e3e]">{score}/4</p>
                    <p className="text-sm text-[#6a6a6a]">Overall Score</p>
                  </div>
                  <div className="text-center p-3 bg-[#f6f5f0] rounded-xl">
                    <p className="text-3xl font-bold text-[#5e8e3e]">
                      {Math.round(latestAssessment.confidence * 100)}%
                    </p>
                    <p className="text-sm text-[#6a6a6a]">Confidence</p>
                  </div>
                </div>

                {latestAssessment.issues.length > 0 && (
                  <div>
                    <p className="text-sm font-medium text-[#4a5568] mb-2">Areas to improve:</p>
                    <div className="flex flex-wrap gap-2">
                      {latestAssessment.issues.map((issue, i) => (
                        <span key={i} className="px-3 py-1 bg-[#faf2e2] text-[#b3872e] rounded-full text-sm">
                          {issue.replace(/_/g, ' ')}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="p-5 space-y-3">
          <button onClick={resetAssessment} className="btn-success">
            Show Me Today's Exercise
          </button>
          <button onClick={resetAssessment} className="btn-secondary">
            Do Another Check
          </button>
        </div>
      </div>
    );
  }

  return null;
}
