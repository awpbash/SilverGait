import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AppHeader } from '../components';
import { useUserStore, useChatStore } from '../stores';
import type { ChatMessage } from '../stores';
import { userApi, chatApi } from '../services/api';
import { useT } from '../i18n';

const QUICK_PROMPT_ICONS = ['\u{1F972}', '\u{2753}', '\u{1F6E1}', '\u{1F9B5}'];
const MAX_RECORD_MS = 6000;

export function HomePage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { userId, displayName, preferredLanguage, synced, setSynced } = useUserStore();
  const { messages, loading, setMessages, setLoading, addMessage, updateMessage, appendToMessage } = useChatStore();
  const t = useT();

  const [isRecording, setIsRecording] = useState(false);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [showScrollBtn, setShowScrollBtn] = useState(false);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const streamMsgId = useRef<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const autoStopRef = useRef<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const lang = preferredLanguage || 'en';

  // Sync user with backend
  useEffect(() => {
    if (synced) return;
    userApi.ensureUser(userId, displayName).then(() => setSynced(true)).catch(() => {});
  }, [userId, displayName, synced, setSynced]);

  // Initial greeting — only when store is empty or language changes
  useEffect(() => {
    const name = displayName || '';
    const hour = new Date().getHours();
    const greeting = hour < 12 ? t.chat.greeting_morning : hour < 17 ? t.chat.greeting_afternoon : t.chat.greeting_evening;
    const nameStr = name ? `, ${name}` : '';

    // Only set welcome if no messages yet
    if (messages.length === 0) {
      setMessages([{
        id: 'welcome',
        role: 'assistant',
        text: `${greeting}${nameStr}! ${t.chat.welcome}`,
      }]);
    }
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
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
      if (autoStopRef.current) window.clearTimeout(autoStopRef.current);
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

  // --- Read Aloud (TTS) ---
  const readAloud = useCallback(async (msgId: string, text: string) => {
    if (speakingId === msgId) {
      audioRef.current?.pause();
      setSpeakingId(null);
      return;
    }

    setSpeakingId(msgId);

    try {
      const formData = new FormData();
      formData.append('text', text);

      const res = await fetch('/api/voice/tts-stream', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok || !res.body) {
        setSpeakingId(null);
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      if (!audioRef.current) audioRef.current = new Audio();
      audioRef.current.src = url;
      audioRef.current.onended = () => {
        URL.revokeObjectURL(url);
        setSpeakingId(null);
      };
      audioRef.current.play().catch(() => setSpeakingId(null));
    } catch {
      setSpeakingId(null);
    }
  }, [speakingId]);

  // --- Voice (STT) ---
  const mapDialect = (l: string) => {
    if (l === 'mandarin') return 'mandarin';
    if (l === 'malay') return 'malay';
    if (l === 'tamil') return 'tamil';
    return 'en';
  };

  const handleVoiceResult = useCallback(async (blob: Blob) => {
    if (!blob.size) return;

    const listenId = `v-${Date.now()}`;
    addMessage({ id: listenId, role: 'user', text: '...' });
    setLoading(true);

    try {
      const formData = new FormData();
      formData.append('audio', blob, 'voice.webm');
      formData.append('dialect', mapDialect(lang));
      formData.append('last_prompt', '');
      formData.append('use_detected_language', 'false');

      const response = await fetch('/api/voice/turn', { method: 'POST', body: formData });
      if (!response.ok) throw new Error('Voice request failed');

      const data = await response.json();
      const transcript = data?.transcript || '';

      updateMessage(listenId, { text: transcript || '(...)' });

      if (data?.reply_audio) {
        playBase64Audio(data.reply_audio, data.audio_mime_type);
      }

      if (transcript) {
        setLoading(false);
        await new Promise(r => setTimeout(r, 300));
        sendMessage(transcript);
      } else {
        setLoading(false);
      }

      if (data?.action?.type === 'navigate' && data.action.target) {
        const routeMap: Record<string, string> = {
          assessment: '/check', exercises: '/exercises', activity: '/progress', home: '/',
        };
        const route = routeMap[data.action.target];
        if (route) navigate(route);
      }
    } catch {
      updateMessage(listenId, { text: t.chat.couldNotHear });
      setLoading(false);
    }
  }, [lang, sendMessage, navigate, addMessage, updateMessage, setLoading]);

  const playBase64Audio = (base64: string, mimeType = 'audio/mpeg') => {
    try {
      const byteChars = atob(base64);
      const bytes = new Uint8Array(byteChars.length);
      for (let i = 0; i < byteChars.length; i++) bytes[i] = byteChars.charCodeAt(i);
      const blob = new Blob([bytes], { type: mimeType });
      const url = URL.createObjectURL(blob);
      if (!audioRef.current) audioRef.current = new Audio();
      audioRef.current.src = url;
      audioRef.current.onended = () => URL.revokeObjectURL(url);
      audioRef.current.play().catch(() => {});
    } catch { /* silent */ }
  };

  const stopRecording = useCallback(() => {
    if (autoStopRef.current) { window.clearTimeout(autoStopRef.current); autoStopRef.current = null; }
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') recorder.stop();
    setIsRecording(false);
  }, []);

  const startRecording = useCallback(async () => {
    if (isRecording || loading) return;
    try {
      setIsRecording(true);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        handleVoiceResult(new Blob(chunksRef.current, { type: 'audio/webm' }));
      };
      recorderRef.current = recorder;
      recorder.start();
      autoStopRef.current = window.setTimeout(stopRecording, MAX_RECORD_MS);
    } catch { setIsRecording(false); }
  }, [isRecording, loading, handleVoiceResult, stopRecording]);

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
                  {msg.text ? msg.text.split('\n').map((line, i) => (
                    <p key={i}>{line || '\u00A0'}</p>
                  )) : (
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
                    {msg.actions.map((action) => (
                      <button
                        key={action.route}
                        className="chat-action-btn"
                        onClick={() => navigate(action.route)}
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
