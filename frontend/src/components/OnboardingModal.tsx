import { useState, useCallback, useRef } from 'react';
import { useUserStore } from '../stores';
import { useT, tpl } from '../i18n';
import { userApi, healthSnapshotApi } from '../services/api';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api';

/* ── Language → BCP-47 mapping for browser Speech APIs ── */

const LANG_TO_BCP47: Record<string, string> = {
  en: 'en-SG',
  mandarin: 'zh-CN',
  malay: 'ms-MY',
  tamil: 'ta-IN',
};

/* ── TTS: Browser speechSynthesis first, Gemini API fallback ── */

function browserTTSAvailable(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

// Chrome loads voices async — warm them up early
if (browserTTSAvailable()) {
  window.speechSynthesis.getVoices();
  window.speechSynthesis.onvoiceschanged = () => { window.speechSynthesis.getVoices(); };
}

function playBrowserTTS(
  text: string,
  lang: string,
  onStart: () => void,
  onEnd: () => void,
): boolean {
  if (!browserTTSAvailable()) return false;

  // Cancel any in-progress speech
  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = LANG_TO_BCP47[lang] || 'en-SG';
  utterance.rate = 0.9; // slightly slower for elderly
  utterance.pitch = 1.0;

  // Try to pick a voice matching the language
  const voices = window.speechSynthesis.getVoices();
  const langPrefix = utterance.lang.split('-')[0];
  const match = voices.find((v) => v.lang.startsWith(langPrefix));
  if (match) utterance.voice = match;

  utterance.onstart = onStart;
  utterance.onend = onEnd;
  utterance.onerror = () => onEnd();

  window.speechSynthesis.speak(utterance);
  return true;
}

/** Play TTS: ElevenLabs (backend) → browser speechSynthesis → Gemini fallback. */
function playTTS(
  text: string,
  lang: string,
  audioRef: React.MutableRefObject<HTMLAudioElement | null>,
  onStart: () => void,
  onEnd: () => void,
  onError: (msg: string) => void,
  userId?: string,
  voiceId?: string | null,
): void {
  // Try ElevenLabs via backend first (high quality, user's voice)
  onStart();
  const fd = new FormData();
  fd.append('text', text);
  if (userId) fd.append('user_id', userId);
  if (voiceId) fd.append('voice_id', voiceId);
  fetch(`${API_BASE}/voice/tts-stream`, { method: 'POST', body: fd })
    .then(async (res) => {
      if (res.ok) {
        const blob = await res.blob();
        if (blob.size > 0) {
          const url = URL.createObjectURL(blob);
          if (!audioRef.current) audioRef.current = new Audio();
          audioRef.current.src = url;
          audioRef.current.onended = () => { URL.revokeObjectURL(url); onEnd(); };
          audioRef.current.onerror = () => { URL.revokeObjectURL(url); onEnd(); };
          audioRef.current.play().catch(() => { onEnd(); });
          return;
        }
      }
      // Backend failed — try browser TTS
      onEnd();
      const ok = playBrowserTTS(text, lang, onStart, onEnd);
      if (!ok) onError('Voice not available');
    })
    .catch(() => {
      // Network error — try browser TTS
      onEnd();
      const ok = playBrowserTTS(text, lang, onStart, onEnd);
      if (!ok) onError('Voice not available');
    });
}

/* ── STT: Browser SpeechRecognition first, Gemini API fallback ── */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const SpeechRecognitionAPI: any =
  typeof window !== 'undefined'
    ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    : null;

function useBrowserSTT(lang: string) {
  const [recording, setRecording] = useState(false);
  const recognitionRef = useRef<any>(null);

  const startRecording = useCallback((onError?: (msg: string) => void): Promise<string | null> => {
    return new Promise((resolve) => {
      if (!SpeechRecognitionAPI) {
        resolve(null); // not supported, caller will use fallback
        return;
      }

      const recognition = new SpeechRecognitionAPI();
      recognitionRef.current = recognition;
      recognition.lang = LANG_TO_BCP47[lang] || 'en-SG';
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;
      recognition.continuous = false;

      recognition.onstart = () => setRecording(true);

      recognition.onresult = (event: any) => {
        const transcript = event.results?.[0]?.[0]?.transcript || '';
        setRecording(false);
        resolve(transcript.trim() || null);
      };

      recognition.onerror = (event: any) => {
        setRecording(false);
        if (event.error === 'not-allowed') {
          onError?.('Microphone access denied');
        } else if (event.error === 'no-speech') {
          onError?.('No speech detected — try again');
        }
        resolve(null);
      };

      recognition.onend = () => {
        setRecording(false);
      };

      try {
        recognition.start();
      } catch {
        setRecording(false);
        resolve(null);
      }
    });
  }, [lang]);

  const stopRecording = useCallback(() => {
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch { /* ignore */ }
    }
  }, []);

  return { recording, processing: false, startRecording, stopRecording, supported: !!SpeechRecognitionAPI };
}

function useGeminiSTT() {
  const [recording, setRecording] = useState(false);
  const [processing, setProcessing] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const startRecording = useCallback(async (onError?: (msg: string) => void): Promise<string | null> => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';
      const mr = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mr;
      chunksRef.current = [];

      return new Promise<string | null>((resolve) => {
        mr.ondataavailable = (e) => {
          if (e.data.size > 0) chunksRef.current.push(e.data);
        };

        mr.onstop = async () => {
          stream.getTracks().forEach((t) => t.stop());
          setRecording(false);
          setProcessing(true);

          const blob = new Blob(chunksRef.current, { type: mimeType });
          if (!blob.size) { setProcessing(false); resolve(null); return; }

          try {
            const fd = new FormData();
            fd.append('audio', blob, 'voice.webm');
            const res = await fetch(`${API_BASE}/voice/transcribe`, { method: 'POST', body: fd });
            setProcessing(false);
            if (!res.ok) {
              onError?.(res.status === 503 ? 'Voice service not available' : 'Could not understand');
              resolve(null);
              return;
            }
            const data = await res.json();
            resolve(data?.transcript || null);
          } catch {
            setProcessing(false);
            onError?.('Cannot reach voice service');
            resolve(null);
          }
        };

        mr.onerror = () => {
          stream.getTracks().forEach((t) => t.stop());
          setRecording(false);
          setProcessing(false);
          resolve(null);
        };

        mr.start();
        setRecording(true);
      });
    } catch {
      setRecording(false);
      onError?.('Microphone access denied');
      return null;
    }
  }, []);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
  }, []);

  return { recording, processing, startRecording, stopRecording, supported: true };
}

/** Combined STT hook: browser SpeechRecognition first, Gemini fallback. */
function useSTT(lang: string) {
  const browser = useBrowserSTT(lang);
  const gemini = useGeminiSTT();

  // Use browser API if available (instant), otherwise Gemini (network)
  if (browser.supported) return browser;
  return gemini;
}

/* ── Transcript → answer parsers ── */

/** Parse a yes/no answer from transcript for Katz ADL. Returns null if ambiguous. */
function parseYesNo(transcript: string): boolean | null {
  const t = transcript.toLowerCase().trim();
  // Yes patterns (multi-language)
  if (/\b(yes|ya|yah|yeah|yep|can|ok|boleh|iya|shi|shi de|是|能|可以|aam|aamaa|ஆம்|ஆமா)\b/i.test(t)) return true;
  // No patterns (multi-language)
  if (/\b(no|nope|nah|cannot|can't|help|need help|tidak|tak boleh|bu|bu shi|不|不是|不能|illai|இல்லை)\b/i.test(t)) return false;
  return null;
}

/** Parse a low/moderate/high answer from transcript for contributing conditions. */
function parseContrib(
  transcript: string,
  opts: { value: string; label: string }[],
): string | null {
  const t = transcript.toLowerCase().trim();

  // Try to match option labels first (case-insensitive)
  for (const opt of opts) {
    if (t.includes(opt.label.toLowerCase())) return opt.value;
  }

  // Generic matching for common answer words
  // "Good" / first option
  if (/\b(good|bagus|hao|好|nalla|நல்ல)\b/i.test(t)) return opts[0]?.value ?? null;
  // "So-so" / middle option
  if (/\b(so.?so|ok|okay|sometimes|kadang|hai hao|还好|sila|சில)\b/i.test(t)) return opts[1]?.value ?? null;
  // "Poor" / "Often" / "Yes" / last option
  if (/\b(poor|bad|often|yes|teruk|selalu|cha|差|经常|mosam|மோசம்|அடிக்கடி)\b/i.test(t)) return opts[2]?.value ?? null;

  // Try positional: first/second/third or 1/2/3
  if (/\b(first|one|1|satu|yi|一|onru|ஒன்று)\b/i.test(t)) return opts[0]?.value ?? null;
  if (/\b(second|two|2|dua|er|二|irandu|இரண்டு)\b/i.test(t)) return opts[1]?.value ?? null;
  if (/\b(third|three|3|tiga|san|三|moondru|மூன்று)\b/i.test(t)) return opts[2]?.value ?? null;

  return null;
}

const LANGUAGES = [
  { value: 'en', label: 'English' },
  { value: 'mandarin', label: '中文 (Mandarin)' },
  { value: 'malay', label: 'Bahasa Melayu' },
  { value: 'tamil', label: 'தமிழ் (Tamil)' },
] as const;

type Step = 'welcome' | 'katz' | 'contributing';

interface KatzAnswers {
  bathing: boolean | null;
  dressing: boolean | null;
  toileting: boolean | null;
  transferring: boolean | null;
  continence: boolean | null;
  feeding: boolean | null;
}

interface ContributingAnswers {
  sleep_risk: string | null;
  mood_risk: string | null;
  social_isolation_risk: string | null;
  cognitive_risk: string | null;
}

export function OnboardingModal() {
  const { voiceId, setUserId, setSessionToken, setDisplayName, setGender, setPreferredLanguage, setHasOnboarded, setSynced } = useUserStore();
  const t = useT();
  const ob = t.onboarding;

  const [step, setStep] = useState<Step>('welcome');
  const [name, setName] = useState('');
  const [gender, setGenderLocal] = useState<string>('');
  const [lang, setLang] = useState<typeof LANGUAGES[number]['value']>('en');
  const [katzIdx, setKatzIdx] = useState(0);
  const [katz, setKatz] = useState<KatzAnswers>({
    bathing: null, dressing: null, toileting: null,
    transferring: null, continence: null, feeding: null,
  });
  const [contribIdx, setContribIdx] = useState(0);
  const [contrib, setContrib] = useState<ContributingAnswers>({
    sleep_risk: null, mood_risk: null,
    social_isolation_risk: null, cognitive_risk: null,
  });
  const [submitting, setSubmitting] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const voiceErrorTimerRef = useRef<number | null>(null);
  const { recording, processing, startRecording, stopRecording } = useSTT(lang);

  // Auto-clear voice error after 3 seconds
  const showVoiceError = useCallback((msg: string) => {
    setVoiceError(msg);
    if (voiceErrorTimerRef.current) window.clearTimeout(voiceErrorTimerRef.current);
    voiceErrorTimerRef.current = window.setTimeout(() => setVoiceError(null), 3000);
  }, []);

  const katzQuestions = [
    { key: 'bathing' as const, q: ob.katzBathing, yes: ob.yesICan, no: ob.iNeedHelp },
    { key: 'dressing' as const, q: ob.katzDressing, yes: ob.yesICan, no: ob.iNeedHelp },
    { key: 'toileting' as const, q: ob.katzToileting, yes: ob.yesICan, no: ob.iNeedHelp },
    { key: 'transferring' as const, q: ob.katzTransferring, yes: ob.yesICan, no: ob.iNeedHelp },
    { key: 'continence' as const, q: ob.katzContinence, yes: ob.yesFine, no: ob.sometimesNot },
    { key: 'feeding' as const, q: ob.katzFeeding, yes: ob.yesICan, no: ob.iNeedHelp },
  ];

  const contribQuestions = [
    { key: 'sleep_risk' as const, q: ob.sleepQ, opts: [
      { value: 'low', label: ob.good },
      { value: 'moderate', label: ob.soSo },
      { value: 'high', label: ob.poor },
    ]},
    { key: 'mood_risk' as const, q: ob.moodQ, opts: [
      { value: 'low', label: ob.rarely },
      { value: 'moderate', label: ob.sometimes },
      { value: 'high', label: ob.often },
    ]},
    { key: 'social_isolation_risk' as const, q: ob.socialQ, opts: [
      { value: 'low', label: ob.often },
      { value: 'moderate', label: ob.sometimes },
      { value: 'high', label: ob.rarely },
    ]},
    { key: 'cognitive_risk' as const, q: ob.cognitiveQ, opts: [
      { value: 'low', label: ob.noForget },
      { value: 'moderate', label: ob.aLittle },
      { value: 'high', label: ob.yesForget },
    ]},
  ];

  /* ── TTS: read question aloud ── */
  const handleSpeak = useCallback((text: string) => {
    playTTS(text, lang, audioRef, () => setSpeaking(true), () => setSpeaking(false), showVoiceError, undefined, voiceId);
  }, [lang, showVoiceError, voiceId]);

  const handleWelcomeNext = useCallback(() => {
    if (name.trim()) setDisplayName(name.trim());
    if (gender) setGender(gender);
    setPreferredLanguage(lang as 'en' | 'mandarin' | 'malay' | 'tamil');
    setStep('katz');
  }, [name, gender, lang, setDisplayName, setGender, setPreferredLanguage]);

  const handleKatzAnswer = useCallback((answer: boolean) => {
    const key = katzQuestions[katzIdx].key;
    setKatz(prev => ({ ...prev, [key]: answer }));
    if (katzIdx < katzQuestions.length - 1) {
      setKatzIdx(prev => prev + 1);
    } else {
      setStep('contributing');
    }
  }, [katzIdx, katzQuestions]);

  const handleContribAnswer = useCallback((value: string) => {
    const key = contribQuestions[contribIdx].key;
    setContrib(prev => ({ ...prev, [key]: value }));
    if (contribIdx < contribQuestions.length - 1) {
      setContribIdx(prev => prev + 1);
    } else {
      // All done — submit
      const finalContrib = { ...contrib, [key]: value };
      handleSubmit(finalContrib);
    }
  }, [contribIdx, contribQuestions, contrib]);

  /* ── STT for Katz (yes/no) ── */
  const handleKatzVoice = useCallback(async () => {
    if (recording) { stopRecording(); return; }
    const transcript = await startRecording(showVoiceError);
    if (!transcript) return;
    const answer = parseYesNo(transcript);
    if (answer !== null) {
      handleKatzAnswer(answer);
    } else {
      showVoiceError(t.onboarding.sttYesNo);
    }
  }, [recording, startRecording, stopRecording, handleKatzAnswer, showVoiceError]);

  /* ── STT for Contributing (option matching) ── */
  const handleContribVoice = useCallback(async () => {
    if (recording) { stopRecording(); return; }
    const transcript = await startRecording(showVoiceError);
    if (!transcript) return;
    const currentOpts = contribQuestions[contribIdx].opts;
    const answer = parseContrib(transcript, currentOpts);
    if (answer) {
      handleContribAnswer(answer);
    } else {
      showVoiceError(t.onboarding.sttTryAgain);
    }
  }, [recording, startRecording, stopRecording, contribIdx, contribQuestions, handleContribAnswer, showVoiceError]);

  const handleSubmit = async (finalContrib: ContributingAnswers) => {
    setSubmitting(true);
    try {
      // 1. Register user on backend (server generates UUID + session token)
      const userRes = await userApi.ensureUser(name.trim() || undefined, lang, gender || null);
      setUserId(userRes.id);
      setSessionToken(userRes.token);

      // 2. Create health snapshot + trigger Assessment Graph
      await healthSnapshotApi.create(userRes.id, {
        trigger: 'onboarding',
        katz_bathing: katz.bathing ?? true,
        katz_dressing: katz.dressing ?? true,
        katz_toileting: katz.toileting ?? true,
        katz_transferring: katz.transferring ?? true,
        katz_continence: katz.continence ?? true,
        katz_feeding: katz.feeding ?? true,
        cognitive_risk: finalContrib.cognitive_risk || 'low',
        mood_risk: finalContrib.mood_risk || 'low',
        sleep_risk: finalContrib.sleep_risk || 'low',
        social_isolation_risk: finalContrib.social_isolation_risk || 'low',
      });

      setSynced(true);
      setHasOnboarded(true);
    } catch (e) {
      console.error('Onboarding failed:', e);
      // Show error but let user retry — don't mark as onboarded
      alert(t.common.tryAgain);
    }
    setSubmitting(false);
  };

  const stepNumber = step === 'welcome' ? 1 : step === 'katz' ? 2 : 3;

  return (
    <div className="onboarding-overlay">
      <div className="onboarding-modal">
        {/* Progress indicator */}
        <div className="onboarding-progress">
          {[1, 2, 3].map(i => (
            <div
              key={i}
              className={`onboarding-progress-dot ${i <= stepNumber ? 'active' : ''} ${i === stepNumber ? 'current' : ''}`}
            />
          ))}
        </div>

        {step === 'welcome' && (
          <>
            <div className="onboarding-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none">
                <path d="M12 4c-2.5 0-4 1.5-4 3.5 0 1.2.6 2.2 1.5 2.8C7.5 11.5 6 13.5 6 16c0 1 .5 2 2 2h8c1.5 0 2-1 2-2 0-2.5-1.5-4.5-3.5-5.7.9-.6 1.5-1.6 1.5-2.8C16 5.5 14.5 4 12 4z" fill="var(--olive-700)" />
              </svg>
            </div>
            <h2 className="onboarding-title">{ob.welcome}</h2>
            <p className="onboarding-subtitle">{ob.subtitle}</p>
            <div className="onboarding-field">
              <label htmlFor="onboard-name">{ob.nameLabel}</label>
              <input
                id="onboard-name"
                type="text"
                placeholder={ob.namePlaceholder}
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="given-name"
              />
            </div>
            <div className="onboarding-field">
              <label htmlFor="onboard-gender">{ob.genderLabel}</label>
              <select
                id="onboard-gender"
                value={gender}
                onChange={(e) => setGenderLocal(e.target.value)}
              >
                <option value="">—</option>
                <option value="male">{ob.genderMale}</option>
                <option value="female">{ob.genderFemale}</option>
                <option value="other">{ob.genderOther}</option>
              </select>
            </div>
            <div className="onboarding-field">
              <label htmlFor="onboard-lang">{ob.langLabel}</label>
              <select
                id="onboard-lang"
                value={lang}
                onChange={(e) => setLang(e.target.value as typeof lang)}
              >
                {LANGUAGES.map((l) => (
                  <option key={l.value} value={l.value}>{l.label}</option>
                ))}
              </select>
            </div>
            <div className="onboarding-disclaimer">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="var(--muted)" style={{ flexShrink: 0, marginTop: 2 }}>
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
              </svg>
              <p>{ob.disclaimer}</p>
            </div>
            <button className="btn-primary onboarding-btn" onClick={handleWelcomeNext}>
              {ob.getStarted}
            </button>
          </>
        )}

        {step === 'katz' && (
          <>
            <h2 className="onboarding-title">{ob.katzTitle}</h2>
            <p className="onboarding-subtitle">{ob.katzSubtitle}</p>
            <div className="onboarding-question-counter">
              {tpl(ob.stepOf, { current: katzIdx + 1, total: katzQuestions.length })}
            </div>
            <div className="onboarding-question-card" key={`katz-${katzIdx}`}>
              <p className="onboarding-question-text">{katzQuestions[katzIdx].q}</p>
              <div className="onboarding-voice-row">
                <button
                  className={`onboarding-voice-btn tts${speaking ? ' active' : ''}`}
                  onClick={() => handleSpeak(katzQuestions[katzIdx].q)}
                  disabled={recording || processing}
                  aria-label="Read question aloud"
                  type="button"
                >
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
                  </svg>
                </button>
                <button
                  className={`onboarding-voice-btn stt${recording ? ' active' : ''}${processing ? ' processing' : ''}`}
                  onClick={handleKatzVoice}
                  disabled={speaking || processing}
                  aria-label={recording ? 'Tap to stop recording' : 'Answer with voice'}
                  type="button"
                >
                  {processing ? (
                    <div className="loading-spinner" style={{ width: 20, height: 20 }} />
                  ) : (
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm-1-9c0-.55.45-1 1-1s1 .45 1 1v6c0 .55-.45 1-1 1s-1-.45-1-1V5zm6 6c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
                    </svg>
                  )}
                </button>
              </div>
              {/* Voice status label */}
              {(recording || processing || voiceError) && (
                <p className={`onboarding-voice-status${voiceError ? ' error' : ''}`}>
                  {voiceError || (recording ? ob.listening : ob.processingVoice)}
                </p>
              )}
              <div className="onboarding-choice-grid">
                <button
                  className="onboarding-choice-btn yes"
                  onClick={() => handleKatzAnswer(true)}
                >
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/>
                  </svg>
                  {katzQuestions[katzIdx].yes}
                </button>
                <button
                  className="onboarding-choice-btn no"
                  onClick={() => handleKatzAnswer(false)}
                >
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                  </svg>
                  {katzQuestions[katzIdx].no}
                </button>
              </div>
            </div>
            {/* Progress bar */}
            <div className="onboarding-bar-track">
              <div className="onboarding-bar-fill" style={{ width: `${(katzIdx / katzQuestions.length) * 100}%` }} />
            </div>
          </>
        )}

        {step === 'contributing' && (
          <>
            <h2 className="onboarding-title">{ob.contributingTitle}</h2>
            <p className="onboarding-subtitle">{ob.contributingSubtitle}</p>
            <div className="onboarding-question-counter">
              {tpl(ob.stepOf, { current: contribIdx + 1, total: contribQuestions.length })}
            </div>
            <div className="onboarding-question-card" key={`contrib-${contribIdx}`}>
              <p className="onboarding-question-text">{contribQuestions[contribIdx].q}</p>
              <div className="onboarding-voice-row">
                <button
                  className={`onboarding-voice-btn tts${speaking ? ' active' : ''}`}
                  onClick={() => handleSpeak(contribQuestions[contribIdx].q)}
                  disabled={recording || processing}
                  aria-label="Read question aloud"
                  type="button"
                >
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
                  </svg>
                </button>
                <button
                  className={`onboarding-voice-btn stt${recording ? ' active' : ''}${processing ? ' processing' : ''}`}
                  onClick={handleContribVoice}
                  disabled={speaking || processing}
                  aria-label={recording ? 'Tap to stop recording' : 'Answer with voice'}
                  type="button"
                >
                  {processing ? (
                    <div className="loading-spinner" style={{ width: 20, height: 20 }} />
                  ) : (
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm-1-9c0-.55.45-1 1-1s1 .45 1 1v6c0 .55-.45 1-1 1s-1-.45-1-1V5zm6 6c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
                    </svg>
                  )}
                </button>
              </div>
              {/* Voice status label */}
              {(recording || processing || voiceError) && (
                <p className={`onboarding-voice-status${voiceError ? ' error' : ''}`}>
                  {voiceError || (recording ? ob.listening : ob.processingVoice)}
                </p>
              )}
              <div className="onboarding-choice-grid three">
                {contribQuestions[contribIdx].opts.map((opt) => (
                  <button
                    key={opt.value}
                    className="onboarding-choice-btn contrib"
                    onClick={() => handleContribAnswer(opt.value)}
                    disabled={submitting}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="onboarding-bar-track">
              <div className="onboarding-bar-fill" style={{ width: `${(contribIdx / contribQuestions.length) * 100}%` }} />
            </div>
            {submitting && (
              <div className="onboarding-loading">
                <div className="loading-spinner" />
                <span>{ob.settingUp}</span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
