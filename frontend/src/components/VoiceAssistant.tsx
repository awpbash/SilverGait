import { useEffect, useRef, useState } from 'react';

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

export function VoiceAssistant({ onAction }: VoiceAssistantProps) {
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
      setStatusMessage('');
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
    setStatusMessage('Listening...');

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
    <div className="voice-assistant">
      <button
        type="button"
        className={`voice-fab ${isOpen ? 'open' : ''}`}
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
      >
        {isOpen ? 'Close Chat' : 'Voice Chat'}
      </button>

      <div className={`voice-drawer ${isOpen ? 'open' : ''}`}>
        <div className="voice-panel">
          <div className="voice-header">
            <span className="voice-title">Talk to SilverGait</span>
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
              Response Language
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
              Read back in detected language
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
              {isRecording ? 'Stop' : 'Press to Speak'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
