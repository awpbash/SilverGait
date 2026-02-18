import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { useUiStore, useUserStore } from '../stores';

type VoiceAction = {
  type?: string;
  target?: string | null;
  exercise_id?: string | null;
  auto_start?: boolean | null;
};

interface VoiceAssistantProps {
  onAction?: (action: VoiceAction) => void;
}

const MAX_RECORD_MS = 6000;

const labelForLanguage = (value: string) => {
  switch (value) {
    case 'mandarin':
      return 'Mandarin';
    case 'malay':
      return 'Bahasa Melayu';
    case 'singlish':
      return 'Singlish';
    default:
      return 'English';
  }
};

type AppLanguage = 'en' | 'singlish' | 'hokkien' | 'cantonese' | 'mandarin' | 'malay';

const mapLanguageToDialect = (language: AppLanguage) => {
  if (language === 'mandarin') return 'mandarin';
  if (language === 'malay') return 'malay';
  if (language === 'singlish') return 'singlish';
  if (language === 'hokkien' || language === 'cantonese') return 'mandarin';
  return 'en';
};

export function VoiceAssistant({ onAction }: VoiceAssistantProps) {
  const { preferredLanguage } = useUserStore();
  const { viewMode } = useUiStore();
  const [isSupported, setIsSupported] = useState(true);
  const [isEnabled, setIsEnabled] = useState(true);
  const [isOpen, setIsOpen] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [dialect, setDialect] = useState<'en' | 'mandarin' | 'malay' | 'singlish'>('en');
  const [useDetectedLanguage, setUseDetectedLanguage] = useState(false);
  const [streamTts, setStreamTts] = useState(false);
  const [ttsFormat, setTtsFormat] = useState('mp3');
  const [transcript, setTranscript] = useState('');
  const [replyText, setReplyText] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [lastPrompt, setLastPrompt] = useState('');
  const [detectedLanguage, setDetectedLanguage] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const autoStopRef = useRef<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const dragState = useRef<{
    active: boolean;
    startX: number;
    startY: number;
    offsetX: number;
    offsetY: number;
  }>({ active: false, startX: 0, startY: 0, offsetX: 0, offsetY: 0 });
  const dragMoved = useRef(false);

  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const [hasDragged, setHasDragged] = useState(false);

  useEffect(() => {
    const mediaSupported = !!(navigator.mediaDevices && window.MediaRecorder);
    setIsSupported(mediaSupported);

    fetch('/api/voice/status')
      .then((res) => res.json())
      .then((data) => {
        const enabled = Boolean(data?.enabled);
        setIsEnabled(enabled);
        setStreamTts(Boolean(data?.stream_tts));
        if (data?.tts_format) {
          setTtsFormat(data.tts_format);
        }
        if (!enabled) {
          setStatusMessage('Voice is not configured.');
        }
      })
      .catch(() => {
        setIsEnabled(false);
        setStatusMessage('Voice is not available.');
      });

    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  useEffect(() => {
    setDialect(mapLanguageToDialect(preferredLanguage as AppLanguage));
  }, [preferredLanguage]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const FAB_SIZE = 52;
    const MARGIN = 16;
    const NAV_HEIGHT = 84;

    const clamp = (value: number, min: number, max: number) =>
      Math.min(max, Math.max(min, value));

    const computeBounds = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      const frameWidth = viewMode === 'desktop' ? 980 : 420;
      const frame = Math.min(frameWidth, width);
      const frameLeft = (width - frame) / 2;
      return {
        minX: frameLeft + MARGIN,
        maxX: frameLeft + frame - FAB_SIZE - MARGIN,
        minY: MARGIN,
        maxY: height - NAV_HEIGHT - FAB_SIZE - MARGIN,
      };
    };

    const updatePosition = () => {
      const bounds = computeBounds();
      setPosition((prev) => {
        if (!prev || !hasDragged) {
          return { x: bounds.maxX, y: bounds.maxY };
        }
        return {
          x: clamp(prev.x, bounds.minX, bounds.maxX),
          y: clamp(prev.y, bounds.minY, bounds.maxY),
        };
      });
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    return () => window.removeEventListener('resize', updatePosition);
  }, [viewMode, hasDragged]);

  const handleFabClick = () => {
    if (dragMoved.current) {
      dragMoved.current = false;
      return;
    }
    setIsOpen((prev) => !prev);
  };

  const handlePointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    if (isOpen || !position) return;
    dragState.current = {
      active: true,
      startX: event.clientX,
      startY: event.clientY,
      offsetX: event.clientX - position.x,
      offsetY: event.clientY - position.y,
    };
    dragMoved.current = false;
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    if (!dragState.current.active || !position) return;
    const dx = Math.abs(event.clientX - dragState.current.startX);
    const dy = Math.abs(event.clientY - dragState.current.startY);
    if (dx + dy > 4) {
      dragMoved.current = true;
      setHasDragged(true);
    }
    if (!dragMoved.current) return;

    const FAB_SIZE = 52;
    const MARGIN = 16;
    const NAV_HEIGHT = 84;
    const width = window.innerWidth;
    const height = window.innerHeight;
    const frameWidth = viewMode === 'desktop' ? 980 : 420;
    const frame = Math.min(frameWidth, width);
    const frameLeft = (width - frame) / 2;
    const minX = frameLeft + MARGIN;
    const maxX = frameLeft + frame - FAB_SIZE - MARGIN;
    const minY = MARGIN;
    const maxY = height - NAV_HEIGHT - FAB_SIZE - MARGIN;
    const nextX = event.clientX - dragState.current.offsetX;
    const nextY = event.clientY - dragState.current.offsetY;
    const clamp = (value: number, min: number, max: number) =>
      Math.min(max, Math.max(min, value));

    setPosition({
      x: clamp(nextX, minX, maxX),
      y: clamp(nextY, minY, maxY),
    });
  };

  const handlePointerUp = (event: PointerEvent<HTMLButtonElement>) => {
    if (!dragState.current.active) return;
    dragState.current.active = false;
    event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const stopRecording = () => {
    if (autoStopRef.current) {
      window.clearTimeout(autoStopRef.current);
      autoStopRef.current = null;
    }
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop();
    }
    setIsRecording(false);
  };

  const startRecording = async () => {
    if (!isSupported || !isEnabled || isBusy) {
      setStatusMessage('Voice is not available right now.');
      return;
    }

    try {
      setStatusMessage('Recording...');
      setTranscript('');
      setReplyText('');
      setDetectedLanguage(null);
      setIsRecording(true);

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        handleRecordingComplete();
      };

      recorderRef.current = recorder;
      recorder.start();

      autoStopRef.current = window.setTimeout(() => {
        stopRecording();
      }, MAX_RECORD_MS);
    } catch {
      setStatusMessage('Cannot access microphone. Please allow permission.');
      setIsRecording(false);
    }
  };

  const handleRecordingComplete = async () => {
    const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
    if (!blob.size) {
      setStatusMessage('No audio captured. Please try again.');
      return;
    }

    setIsBusy(true);
    setStatusMessage('Processing...');

    try {
      const formData = new FormData();
      formData.append('audio', blob, 'voice.webm');
      formData.append('dialect', dialect);
      formData.append('last_prompt', lastPrompt);
      formData.append('use_detected_language', String(useDetectedLanguage));

      const response = await fetch('/api/voice/turn', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || 'Voice request failed.');
      }

      const data = await response.json();
      const reply = data?.reply_text || '';

      setTranscript(data?.transcript || '');
      setReplyText(reply);
      setDetectedLanguage(data?.detected_language || null);
      if (reply) {
        setLastPrompt(reply);
      }

      if (data?.action && onAction) {
        onAction(data.action as VoiceAction);
      }

      if (streamTts && reply) {
        await playStreamingAudio(reply, ttsFormat);
      } else if (data?.reply_audio) {
        playAudio(data.reply_audio as string, data.audio_mime_type as string | undefined);
      }

      setStatusMessage('');
    } catch (err) {
      setStatusMessage(err instanceof Error ? err.message : 'Voice request failed.');
    } finally {
      setIsBusy(false);
    }
  };

  const playAudio = (audioBase64: string, mimeType = 'audio/mpeg') => {
    try {
      const byteChars = atob(audioBase64);
      const bytes = new Uint8Array(byteChars.length);
      for (let i = 0; i < byteChars.length; i += 1) {
        bytes[i] = byteChars.charCodeAt(i);
      }
      const blob = new Blob([bytes], { type: mimeType });
      const url = URL.createObjectURL(blob);
      if (!audioRef.current) {
        audioRef.current = new Audio();
      }
      audioRef.current.src = url;
      audioRef.current.onended = () => URL.revokeObjectURL(url);
      audioRef.current.play().catch(() => {
        setStatusMessage('Tap play to listen.');
      });
    } catch {
      setStatusMessage('Audio playback failed.');
    }
  };

  const playStreamingAudio = async (text: string, format: string) => {
    try {
      const formData = new FormData();
      formData.append('text', text);

      const response = await fetch('/api/voice/tts-stream', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok || !response.body) {
        throw new Error('Streaming audio failed.');
      }

      const mimeType = format === 'mp3' || format === 'mpeg' ? 'audio/mpeg' : `audio/${format}`;
      if (!('MediaSource' in window) || !MediaSource.isTypeSupported(mimeType)) {
        const blob = await response.blob();
        playBlob(blob);
        return;
      }

      const mediaSource = new MediaSource();
      const audio = audioRef.current ?? new Audio();
      audioRef.current = audio;
      audio.src = URL.createObjectURL(mediaSource);

      mediaSource.addEventListener('sourceopen', async () => {
        const sourceBuffer = mediaSource.addSourceBuffer(mimeType);
        const reader = response.body?.getReader();
        const queue: Uint8Array[] = [];
        let done = false;

        const appendNext = () => {
          if (sourceBuffer.updating) return;
          const chunk = queue.shift();
          if (chunk) {
            sourceBuffer.appendBuffer(chunk);
          } else if (done) {
            mediaSource.endOfStream();
          }
        };

        sourceBuffer.addEventListener('updateend', appendNext);

        while (reader) {
          const { value, done: streamDone } = await reader.read();
          if (streamDone) {
            done = true;
            appendNext();
            break;
          }
          if (value) {
            queue.push(value);
            appendNext();
          }
        }
      });

      audio.play().catch(() => {
        setStatusMessage('Tap play to listen.');
      });
    } catch (err) {
      setStatusMessage(err instanceof Error ? err.message : 'Streaming audio failed.');
    }
  };

  const playBlob = (blob: Blob) => {
    const url = URL.createObjectURL(blob);
    const audio = audioRef.current ?? new Audio();
    audioRef.current = audio;
    audio.src = url;
    audio.onended = () => URL.revokeObjectURL(url);
    audio.play().catch(() => {
      setStatusMessage('Tap play to listen.');
    });
  };

  if (!isSupported) {
    return null;
  }

  return (
    <div
      className="voice-assistant"
      style={position ? { left: `${position.x}px`, top: `${position.y}px` } : undefined}
    >
      <button
        type="button"
        className={`voice-fab ${isOpen ? 'open' : ''}`}
        onClick={handleFabClick}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        aria-expanded={isOpen}
        aria-label={isOpen ? 'Close voice assistant' : 'Open voice assistant'}
      >
        {isOpen ? (
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M6 6l12 12M18 6l-12 12"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M12 14a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3z"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
            />
            <path d="M19 11a7 7 0 0 1-14 0" fill="none" stroke="currentColor" strokeWidth="1.8" />
            <path d="M12 18v3" fill="none" stroke="currentColor" strokeWidth="1.8" />
          </svg>
        )}
      </button>

      <div className={`voice-drawer ${isOpen ? 'open' : ''}`}>
        <div className="voice-panel">
          <div className="voice-header">
            <span className="voice-title">Voice Assistant</span>
            <button
              type="button"
              className="voice-close"
              onClick={() => setIsOpen(false)}
            >
              X
            </button>
          </div>

          <div className="voice-language">
            <label htmlFor="voice-language" className="voice-label">
              Reply Language
            </label>
            <select
              id="voice-language"
              className="voice-select"
              value={dialect}
              onChange={(event) => setDialect(event.target.value as typeof dialect)}
            >
              <option value="en">English</option>
              <option value="mandarin">Mandarin</option>
              <option value="malay">Bahasa Melayu</option>
              <option value="singlish">Singlish</option>
            </select>
            <label className="voice-checkbox">
              <input
                type="checkbox"
                checked={useDetectedLanguage}
                onChange={(event) => setUseDetectedLanguage(event.target.checked)}
              />
              Use detected language
            </label>
            {detectedLanguage && useDetectedLanguage && (
              <div className="voice-detected">Detected: {labelForLanguage(detectedLanguage)}</div>
            )}
          </div>

          {statusMessage && <div className="voice-status">{statusMessage}</div>}

          {transcript && (
            <div className="voice-bubble voice-user">
              <span className="voice-label">You</span>
              <p>{transcript}</p>
            </div>
          )}

          {replyText && (
            <div className="voice-bubble voice-assistant-bubble">
              <span className="voice-label">SilverGait</span>
              <p>{replyText}</p>
            </div>
          )}

          <div className="voice-controls">
            <button
              type="button"
              className={`voice-button ${isRecording ? 'recording' : ''}`}
              onClick={() => (isRecording ? stopRecording() : startRecording())}
              disabled={!isEnabled || isBusy}
            >
              {isRecording ? 'Stop' : isBusy ? 'Processing...' : 'Press to Speak'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
