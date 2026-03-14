import { useState, useRef, useEffect, useCallback } from 'react';
import { startWavRecording, stopWavRecording, cancelWavRecording } from '../utils/wavRecorder';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AppHeader } from '../components';
import { Markdown } from '../components/Markdown';
import { useUserStore, useChatStore } from '../stores';
import type { ChatMessage } from '../stores';
import { userApi, chatApi, authHeaders } from '../services/api';
import { useT } from '../i18n';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api';


const QUICK_PROMPT_ICONS = ['\u{1F972}', '\u{2753}', '\u{1F6E1}', '\u{1F9B5}'];
const MAX_RECORD_MS = 30000;

export function HomePage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { userId, sessionToken, displayName, preferredLanguage, synced, setSynced } = useUserStore();
  const { messages, loading, setMessages, setLoading, addMessage, updateMessage, appendToMessage } = useChatStore();
  const t = useT();

  const [isRecording, setIsRecording] = useState(false);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [showScrollBtn, setShowScrollBtn] = useState(false);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const streamMsgId = useRef<string | null>(null);
  const autoStopRef = useRef<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const lang = preferredLanguage || 'en';

  // Validate session token with backend on first load
  useEffect(() => {
    if (synced || !sessionToken) return;
    userApi.validateToken(sessionToken).then(() => setSynced(true)).catch(() => {});
  }, [sessionToken, synced, setSynced]);

  // Reset chat when language changes — fresh conversation in new language
  useEffect(() => {
    const name = displayName || '';
    const hour = new Date().getHours();
    const greeting = hour < 12 ? t.chat.greeting_morning : hour < 17 ? t.chat.greeting_afternoon : t.chat.greeting_evening;
    const nameStr = name ? `, ${name}` : '';

    setMessages([{
      id: 'welcome',
      role: 'assistant',
      text: `${greeting}${nameStr}! ${t.chat.welcome}`,
    }]);
  }, [lang, displayName, t]);

  // Auto-record when arriving via voice FAB (?mic=1)
  useEffect(() => {
    if (searchParams.get('mic') === '1') {
      setSearchParams({}, { replace: true });
      // Small delay to let component mount
      const timer = setTimeout(() => startRecording(), 300);
      return () => clearTimeout(timer);
    }
  }, []);

  // Auto-scroll to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Track scroll position for "jump to bottom" button
  useEffect(() => {
    const el = chatScrollRef.current;
    if (!el) return;
    const onScroll = () => {
      const gap = el.scrollHeight - el.scrollTop - el.clientHeight;
      setShowScrollBtn(gap > 120);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cancelWavRecording();
      if (autoStopRef.current) window.clearTimeout(autoStopRef.current);
      if (recognitionRef.current) try { recognitionRef.current.abort(); } catch { /* ignore */ }
      window.speechSynthesis?.cancel();
      audioRef.current?.pause();
    };
  }, []);

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // --- Chat ---
  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || loading) return;

    const userMsg: ChatMessage = { id: `u-${Date.now()}`, role: 'user', text: text.trim() };
    const botId = `b-${Date.now()}`;
    streamMsgId.current = botId;

    addMessage(userMsg);
    addMessage({ id: botId, role: 'assistant', text: '' });
    setInput('');
    setLoading(true);

    try {
      const { actions } = await chatApi.sendStream(userId, text.trim(), (chunk) => {
        appendToMessage(botId, chunk);
      }, lang);

      updateMessage(botId, { actions });
    } catch {
      const fallbackActions = [
        { label: t.chat.checkStrength, route: '/check' },
        { label: t.chat.dailyExercises, route: '/exercises' },
        { label: t.chat.howAmIDoing, route: '/progress' },
      ];
      updateMessage(botId, { text: t.chat.cantConnect, actions: fallbackActions });
    } finally {
      setLoading(false);
      streamMsgId.current = null;
    }
  }, [userId, loading, lang, t, addMessage, appendToMessage, updateMessage, setLoading]);

  // --- Read Aloud (TTS) — ElevenLabs first (via backend), browser fallback ---
  const readAloud = useCallback(async (msgId: string, text: string) => {
    if (speakingId === msgId) {
      // Stop current playback
      window.speechSynthesis?.cancel();
      audioRef.current?.pause();
      setSpeakingId(null);
      return;
    }

    setSpeakingId(msgId);

    // Try ElevenLabs / backend TTS first (high quality, uses user's voice)
    try {
      const formData = new FormData();
      formData.append('text', text);
      formData.append('user_id', userId);
      const storeVoiceId = useUserStore.getState().voiceId;
      if (storeVoiceId) formData.append('voice_id', storeVoiceId);
      const res = await fetch(`${API_BASE}/voice/tts-stream`, { method: 'POST', body: formData, headers: authHeaders() });
      if (res.ok) {
        const blob = await res.blob();
        if (blob.size > 0) {
          const url = URL.createObjectURL(blob);
          if (!audioRef.current) audioRef.current = new Audio();
          audioRef.current.src = url;
          audioRef.current.onended = () => { URL.revokeObjectURL(url); setSpeakingId(null); };
          audioRef.current.onerror = () => { URL.revokeObjectURL(url); setSpeakingId(null); };
          audioRef.current.play().catch(() => setSpeakingId(null));
          return;
        }
      }
    } catch { /* fall through to browser TTS */ }

    // Browser TTS fallback (instant, no network)
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      const bcp47Map: Record<string, string> = { en: 'en-SG', mandarin: 'zh-CN', malay: 'ms-MY', tamil: 'ta-IN' };
      const bcp47 = bcp47Map[lang] || 'en-SG';
      utterance.lang = bcp47;
      utterance.rate = 0.9;
      const voices = window.speechSynthesis.getVoices();
      const match = voices.find((v) => v.lang.startsWith(bcp47.split('-')[0]));
      if (match) utterance.voice = match;
      utterance.onend = () => setSpeakingId(null);
      utterance.onerror = () => setSpeakingId(null);
      window.speechSynthesis.speak(utterance);
      return;
    }

    setSpeakingId(null);
  }, [speakingId, lang, userId]);

  // --- Voice (STT) — Browser SpeechRecognition, Gemini fallback ---
  // eslint-disable-next-line @typescript-eslint/no-explicit-any


  const recognitionRef = useRef<any>(null);

  // Backend STT via WAV recording (no ffmpeg needed)
  const startGeminiFallbackSTT = useCallback(async () => {
    try {
      setIsRecording(true);
      await startWavRecording();
      autoStopRef.current = window.setTimeout(stopGeminiRecording, MAX_RECORD_MS);
    } catch (err: any) {
      setIsRecording(false);
      if (err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError') {
        alert('Microphone access is required for voice input. Please allow microphone permission in your browser settings and try again.');
      }
    }
  }, []);

  const stopGeminiRecording = useCallback(async () => {
    if (autoStopRef.current) { window.clearTimeout(autoStopRef.current); autoStopRef.current = null; }
    setIsRecording(false);

    try {
      const blob = await stopWavRecording();
      if (!blob.size) return;

      // Show placeholder user bubble while transcribing
      const placeholderId = `u-${Date.now()}`;
      addMessage({ id: placeholderId, role: 'user', text: '...' });
      setLoading(true);

      try {
        const fd = new FormData();
        fd.append('audio', blob, 'voice.wav');
        const res = await fetch(`${API_BASE}/voice/transcribe`, { method: 'POST', body: fd, headers: authHeaders() });
        if (!res.ok) throw new Error('Transcription failed');
        const data = await res.json();
        const transcript = data?.transcript || '';
        if (transcript) {
          // Update placeholder with real transcript, then send to chat
          updateMessage(placeholderId, { text: transcript });
          const botId = `b-${Date.now()}`;
          streamMsgId.current = botId;
          addMessage({ id: botId, role: 'assistant', text: '' });
          try {
            const { actions } = await chatApi.sendStream(userId, transcript, (chunk) => {
              appendToMessage(botId, chunk);
            }, lang);
            updateMessage(botId, { actions });
          } catch {
            const fallbackActions = [
              { label: t.chat.checkStrength, route: '/check' },
              { label: t.chat.dailyExercises, route: '/exercises' },
              { label: t.chat.howAmIDoing, route: '/progress' },
            ];
            updateMessage(botId, { text: t.chat.cantConnect, actions: fallbackActions });
          } finally {
            streamMsgId.current = null;
          }
        } else {
          // No transcript — remove placeholder
          setMessages((prev: ChatMessage[]) => prev.filter(m => m.id !== placeholderId));
        }
      } catch {
        // Transcription failed — remove placeholder
        setMessages((prev: ChatMessage[]) => prev.filter(m => m.id !== placeholderId));
      }
      setLoading(false);
    } catch {
      // No recording in progress
    }
  }, [userId, lang, t, addMessage, updateMessage, appendToMessage, setMessages, setLoading]);

  const startRecording = useCallback(() => {
    if (isRecording || loading) return;
    // Always use backend STT (MERaLiON → Gemini fallback) for Singlish support
    // Browser SpeechRecognition only as last resort if backend is unavailable
    startGeminiFallbackSTT();
  }, [isRecording, loading, startGeminiFallbackSTT]);

  const stopRecording = useCallback(() => {
    // Stop browser STT
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch { /* ignore */ }
    }
    // Stop Gemini fallback
    stopGeminiRecording();
  }, [stopGeminiRecording]);

  const handleSubmit = (e: { preventDefault: () => void }) => {
    e.preventDefault();
    sendMessage(input);
  };

  const prompts = [
    { icon: QUICK_PROMPT_ICONS[0], text: t.chat.qpUnsteady },
    { icon: QUICK_PROMPT_ICONS[1], text: t.chat.qpWhatToDo },
    { icon: QUICK_PROMPT_ICONS[2], text: t.chat.qpFallRisk },
    { icon: QUICK_PROMPT_ICONS[3], text: t.chat.qpPain },
  ];

  return (
    <div className="page chat-page">
      <AppHeader />

      <div className="chat-container">
        <div className="chat-messages" ref={chatScrollRef}>
          {messages.map((msg) => (
            <div key={msg.id} className={`chat-bubble ${msg.role}`}>
              {msg.role === 'assistant' && (
                <div className="chat-avatar">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                    <path d="M12 4c-2.5 0-4 1.5-4 3.5 0 1.2.6 2.2 1.5 2.8C7.5 11.5 6 13.5 6 16c0 1 .5 2 2 2h8c1.5 0 2-1 2-2 0-2.5-1.5-4.5-3.5-5.7.9-.6 1.5-1.6 1.5-2.8C16 5.5 14.5 4 12 4z" fill="var(--olive-700)" />
                  </svg>
                </div>
              )}
              <div className="chat-content">
                <div className="chat-text">
                  {msg.text ? <Markdown text={msg.text} /> : (
                    loading && msg.id === streamMsgId.current && (
                      <div className="chat-typing-row">
                        <div className="chat-typing"><span /><span /><span /></div>
                        <span className="chat-typing-label">{t.chat.thinking}</span>
                      </div>
                    )
                  )}
                </div>

                {/* Read aloud button for assistant messages with text */}
                {msg.role === 'assistant' && msg.text && (
                  <button
                    className={`chat-read-btn ${speakingId === msg.id ? 'active' : ''}`}
                    onClick={() => readAloud(msg.id, msg.text)}
                    aria-label={speakingId === msg.id ? 'Stop reading' : 'Read aloud'}
                    type="button"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      {speakingId === msg.id ? (
                        <><rect x="6" y="4" width="4" height="16" rx="1" fill="currentColor" /><rect x="14" y="4" width="4" height="16" rx="1" fill="currentColor" /></>
                      ) : (
                        <><polygon points="5,3 19,12 5,21" fill="currentColor" stroke="none" /></>
                      )}
                    </svg>
                    <span>{speakingId === msg.id ? t.common.stop : t.chat.readAloud}</span>
                  </button>
                )}

                {msg.actions && msg.actions.length > 0 && (
                  <div className="chat-actions">
                    {msg.actions.map((action, i) => (
                      <button
                        key={action.route || action.prompt || i}
                        className="chat-action-btn"
                        onClick={() => action.prompt ? sendMessage(action.prompt) : action.route ? navigate(action.route) : null}
                      >
                        {action.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>

        {/* Jump to bottom */}
        {showScrollBtn && (
          <button className="chat-scroll-btn" onClick={scrollToBottom} aria-label="Scroll to bottom" type="button">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>
        )}

        {/* Quick prompts — only shown initially */}
        {messages.length <= 1 && !loading && (
          <div className="chat-quick-prompts">
            {prompts.map((p) => (
              <button key={p.text} className="chat-chip" onClick={() => sendMessage(p.text)}>
                <span className="chat-chip-icon">{p.icon}</span>
                {p.text}
              </button>
            ))}
          </div>
        )}

        {/* Input bar */}
        <form className="chat-input-bar" onSubmit={handleSubmit}>
          <button
            type="button"
            className={`chat-mic-btn ${isRecording ? 'recording' : ''}`}
            onClick={() => isRecording ? stopRecording() : startRecording()}
            disabled={loading && !isRecording}
            aria-label={isRecording ? 'Stop recording' : 'Voice input'}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3z" />
              <path d="M19 11a7 7 0 0 1-14 0" />
              <path d="M12 18v3" />
            </svg>
          </button>
          <input
            type="text"
            className="chat-input"
            placeholder={isRecording ? '...' : t.chat.typePlaceholder}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={loading || isRecording}
            autoComplete="off"
          />
          <button
            type="submit"
            className="chat-send-btn"
            disabled={!input.trim() || loading}
            aria-label="Send message"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
            </svg>
          </button>
        </form>
      </div>
    </div>
  );
}
