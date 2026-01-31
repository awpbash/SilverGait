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

export function AssessmentPage() {
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
        <header className="py-6 text-center">
          <h1 className="text-2xl font-bold text-[#1a202c]">Walking & Balance Check</h1>
          <p className="text-[#718096] mt-2">Let's see how you're moving today</p>
        </header>

        <div className="flex-1 flex flex-col items-center justify-center">
          <div className="w-48 h-48 mb-6">
            <svg viewBox="0 0 200 200" className="w-full h-full">
              <circle cx="100" cy="45" r="20" fill="#0d7377" opacity="0.7"/>
              <ellipse cx="100" cy="90" rx="25" ry="30" fill="#0d7377" opacity="0.6"/>
              <rect x="85" y="115" width="10" height="45" rx="5" fill="#0d7377" opacity="0.5" transform="rotate(-15 90 115)"/>
              <rect x="105" y="115" width="10" height="45" rx="5" fill="#0d7377" opacity="0.5" transform="rotate(15 110 115)"/>
              <rect x="65" y="80" width="20" height="8" rx="4" fill="#0d7377" opacity="0.4" transform="rotate(20 75 84)"/>
              <rect x="115" y="80" width="20" height="8" rx="4" fill="#0d7377" opacity="0.4" transform="rotate(-20 125 84)"/>
            </svg>
          </div>

          <div className="text-center px-6 mb-8">
            <p className="text-lg text-[#4a5568]">
              We'll record a short video of you standing up and walking.
            </p>
            <p className="text-[#718096] mt-2">
              This helps us give you better exercise suggestions.
            </p>
          </div>
        </div>

        {error && (
          <div className="mx-4 mb-4 p-4 bg-[#fef2f2] border border-[#fecaca] rounded-xl text-center">
            <p className="text-[#c53030]">{error}</p>
          </div>
        )}

        <div className="p-4 space-y-3">
          <button onClick={startCamera} className="btn-primary">
            Start Check
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
        <header className="py-4 text-center">
          {step === 'setup' && (
            <>
              <h1 className="text-xl font-bold text-[#1a202c]">Place phone here</h1>
              <p className="text-[#718096]">Stand inside the box</p>
            </>
          )}
          {step === 'countdown' && (
            <p className="text-xl font-semibold text-[#0d7377]">Get ready...</p>
          )}
          {step === 'recording' && (
            <div className="flex items-center justify-center gap-2 text-[#c53030]">
              <span className="w-3 h-3 bg-[#c53030] rounded-full animate-pulse"></span>
              <span className="font-semibold">Recording</span>
            </div>
          )}
        </header>

        {/* Camera view - persistent across all camera steps */}
        <div className="flex-1 relative mx-4 rounded-2xl overflow-hidden bg-[#1a202c]">
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
            <div className="absolute inset-0 flex items-center justify-center bg-black/40">
              <div className="text-center">
                <div className="w-32 h-32 rounded-full bg-[#0d7377] flex items-center justify-center mx-auto mb-4">
                  <span className="text-6xl font-bold text-white">{countdown}</span>
                </div>
                <p className="text-2xl font-semibold text-white">Stand Up & Sit Down</p>
                <p className="text-white/80 mt-2">Then walk towards the camera</p>
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
        <div className="p-4 space-y-4">
          {step === 'setup' && (
            <>
              <div className="card bg-[#e8f5ef] border-[#9ae6b4]">
                <p className="text-[#2d8a5f] text-center font-medium">
                  Put phone on a table pointing at you, or ask someone to hold it
                </p>
              </div>
              <button
                onClick={beginCountdown}
                disabled={!cameraReady}
                className="btn-primary"
              >
                {cameraReady ? "I'm Ready - Start" : 'Waiting for camera...'}
              </button>
              <button onClick={resetAssessment} className="btn-secondary">
                Cancel
              </button>
            </>
          )}

          {step === 'recording' && (
            <>
              <div className="card bg-[#e8f5ef] border-[#9ae6b4]">
                <p className="text-[#2d8a5f] text-lg font-medium text-center">
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
        <header className="py-6 text-center">
          <div className={`w-20 h-20 mx-auto rounded-full flex items-center justify-center ${isGood ? 'bg-[#2d8a5f]' : 'bg-[#c9a227]'}`}>
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

        <div className="flex-1 px-4">
          <div className={`card text-center py-8 mb-6 ${isGood ? 'bg-[#e8f5ef] border-[#9ae6b4]' : 'bg-[#fdf8e8] border-[#f6e05e]'}`}>
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
                  <span className="w-6 h-6 rounded-full bg-[#0d7377] text-white flex items-center justify-center text-sm font-semibold flex-shrink-0">
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
                  <div className="text-center p-3 bg-[#f7fafc] rounded-xl">
                    <p className="text-3xl font-bold text-[#0d7377]">{score}/4</p>
                    <p className="text-sm text-[#718096]">Overall Score</p>
                  </div>
                  <div className="text-center p-3 bg-[#f7fafc] rounded-xl">
                    <p className="text-3xl font-bold text-[#0d7377]">
                      {Math.round(latestAssessment.confidence * 100)}%
                    </p>
                    <p className="text-sm text-[#718096]">Confidence</p>
                  </div>
                </div>

                {latestAssessment.issues.length > 0 && (
                  <div>
                    <p className="text-sm font-medium text-[#4a5568] mb-2">Areas to improve:</p>
                    <div className="flex flex-wrap gap-2">
                      {latestAssessment.issues.map((issue, i) => (
                        <span key={i} className="px-3 py-1 bg-[#fdf8e8] text-[#c9a227] rounded-full text-sm">
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

        <div className="p-4 space-y-3">
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
