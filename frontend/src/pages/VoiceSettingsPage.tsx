import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppHeader } from '../components';
import { useUserStore } from '../stores';
import { useT, tpl } from '../i18n';
import { voiceApi, authHeaders } from '../services/api';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api';

type VoiceInfo = {
  voice_id: string;
  name: string;
  category: string;
  preview_url: string | null;
  labels: Record<string, string>;
};

export function VoiceSettingsPage() {
  const { userId, voiceId, setVoiceId } = useUserStore();
  const navigate = useNavigate();
  const t = useT();

  const [voices, setVoices] = useState<VoiceInfo[]>([]);
  const [defaultVoiceId, setDefaultVoiceId] = useState('');
  const [selectedVoice, setSelectedVoice] = useState<string | null>(voiceId);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [previewingId, setPreviewingId] = useState<string | null>(null);

  // Clone state
  const [cloneName, setCloneName] = useState('');
  const [cloneFile, setCloneFile] = useState<File | null>(null);
  const [cloneLoading, setCloneLoading] = useState(false);
  const [showClone, setShowClone] = useState(false);

  // Recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSecs, setRecordingSecs] = useState(0);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  // Test TTS
  const [testingVoice, setTestingVoice] = useState(false);

  const [toast, setToast] = useState('');
  const cloneInputRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2500);
  }, []);

  useEffect(() => {
    loadVoices();
  }, []);

  const loadVoices = async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const data = await voiceApi.listVoices();
      setVoices(data.voices);
      setDefaultVoiceId(data.default_voice_id);
      // If default_voice_id is empty, the API likely returned a fallback (503 caught)
      if (!data.default_voice_id && data.voices.length === 0) {
        setLoadError(true);
      }
    } catch {
      setLoadError(true);
    }
    setLoading(false);
  };

  const handleSelect = async (vid: string) => {
    const prev = selectedVoice;
    setSelectedVoice(vid);
    setVoiceId(vid);
    const ok = await voiceApi.selectVoice(userId, vid);
    if (ok) {
      showToast(t.voiceSettings.voiceUpdated);
    } else {
      // Revert on failure
      setSelectedVoice(prev);
      setVoiceId(prev);
      showToast(t.voiceSettings.saveFailed);
    }
  };

  const handlePreview = async (voice: VoiceInfo) => {
    if (previewingId === voice.voice_id) {
      audioRef.current?.pause();
      setPreviewingId(null);
      return;
    }
    setPreviewingId(voice.voice_id);
    try {
      if (voice.preview_url) {
        if (!audioRef.current) audioRef.current = new Audio();
        audioRef.current.src = voice.preview_url;
        audioRef.current.onended = () => setPreviewingId(null);
        audioRef.current.onerror = () => setPreviewingId(null);
        await audioRef.current.play();
      }
    } catch {
      setPreviewingId(null);
    }
  };

  const handleTestVoice = async () => {
    setTestingVoice(true);
    try {
      const fd = new FormData();
      fd.append('text', 'Hello! This is how I will sound when reading messages to you.');
      fd.append('user_id', userId);
      if (selectedVoice) fd.append('voice_id', selectedVoice);
      const res = await fetch(`${API_BASE}/voice/tts-stream`, { method: 'POST', body: fd, headers: authHeaders() });
      if (res.ok) {
        const blob = await res.blob();
        if (blob.size > 0) {
          const url = URL.createObjectURL(blob);
          if (!audioRef.current) audioRef.current = new Audio();
          audioRef.current.src = url;
          audioRef.current.onended = () => { URL.revokeObjectURL(url); setTestingVoice(false); };
          audioRef.current.onerror = () => { URL.revokeObjectURL(url); setTestingVoice(false); };
          await audioRef.current.play();
          return;
        }
      }
      showToast(t.voiceSettings.testFailed);
    } catch {
      showToast(t.voiceSettings.voiceNotAvailable);
    }
    setTestingVoice(false);
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunksRef.current = [];
      const mr = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4' });
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(chunksRef.current, { type: mr.mimeType });
        setRecordedBlob(blob);
        // Also set as cloneFile so handleClone can use it
        const ext = mr.mimeType.includes('webm') ? 'webm' : 'm4a';
        setCloneFile(new File([blob], `recording.${ext}`, { type: mr.mimeType }));
      };
      mediaRecorderRef.current = mr;
      mr.start();
      setIsRecording(true);
      setRecordingSecs(0);
      setRecordedBlob(null);
      recordingTimerRef.current = setInterval(() => {
        setRecordingSecs(s => s + 1);
      }, 1000);
    } catch {
      showToast(t.voiceSettings.micFailed);
    }
  };

  const stopRecording = () => {
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    // stop() triggers onstop async — onstop sets recordedBlob + cloneFile
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
  };

  const playbackRecording = () => {
    if (!recordedBlob) return;
    const url = URL.createObjectURL(recordedBlob);
    if (!audioRef.current) audioRef.current = new Audio();
    audioRef.current.src = url;
    audioRef.current.onended = () => URL.revokeObjectURL(url);
    audioRef.current.play();
  };

  const clearRecording = () => {
    setRecordedBlob(null);
    setCloneFile(null);
    setRecordingSecs(0);
  };

  const handleClone = async () => {
    // Use cloneFile if set, otherwise build from recordedBlob
    const file = cloneFile ?? (recordedBlob ? new File([recordedBlob], 'recording.webm', { type: recordedBlob.type }) : null);
    if (!cloneName.trim() || !file) return;
    setCloneLoading(true);
    const result = await voiceApi.cloneVoice(cloneName.trim(), file);
    setCloneLoading(false);
    if (result) {
      showToast(tpl(t.voiceSettings.cloneSuccess, { name: result.name }));
      setCloneName('');
      setCloneFile(null);
      setShowClone(false);
      if (cloneInputRef.current) cloneInputRef.current.value = '';
      await loadVoices();
      handleSelect(result.voice_id);
    } else {
      showToast(t.voiceSettings.cloneFailed);
    }
  };

  const handleDelete = async (vid: string, name: string) => {
    const ok = await voiceApi.deleteVoice(vid);
    if (ok) {
      showToast(tpl(t.voiceSettings.deleteSuccess, { name }));
      if (selectedVoice === vid) {
        setSelectedVoice(defaultVoiceId);
        await voiceApi.selectVoice(userId, defaultVoiceId);
        setVoiceId(defaultVoiceId);
      }
      await loadVoices();
    } else {
      showToast(t.voiceSettings.deleteFailed);
    }
  };

  const clonedVoices = voices.filter(v => v.category === 'cloned');
  const libraryVoices = voices.filter(v => v.category !== 'cloned');

  return (
    <div className="page voice-settings-page">
      <AppHeader />

      <div className="page-title">
        <h1>{t.voiceSettings.title}</h1>
        <p className="subtitle">{t.voiceSettings.subtitle}</p>
      </div>

      {/* Toast */}
      {toast && <div className="voice-toast">{toast}</div>}

      <div className="stack">
        {/* Test current voice */}
        <button
          className="voice-test-btn"
          onClick={handleTestVoice}
          disabled={testingVoice}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            {testingVoice ? (
              <><rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" /></>
            ) : (
              <polygon points="5,3 19,12 5,21" />
            )}
          </svg>
          {testingVoice ? t.voiceSettings.playing : t.voiceSettings.testCurrent}
        </button>

        {loading ? (
          <div className="voice-loading">
            <div className="loading-spinner" />
            <span>{t.voiceSettings.loadingVoices}</span>
          </div>
        ) : loadError ? (
          <div className="card voice-empty-card">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="1.5">
              <path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3z" />
              <path d="M19 11a7 7 0 0 1-14 0" /><path d="M12 18v3" />
            </svg>
            <p>{t.voiceSettings.couldNotLoad}</p>
            <span>{t.voiceSettings.backendHint}</span>
            <button className="btn-primary" style={{ marginTop: 12 }} onClick={loadVoices}>
              {t.voiceSettings.retry}
            </button>
          </div>
        ) : (
          <>
            {/* Cloned voices section */}
            {clonedVoices.length > 0 && (
              <div className="voice-section">
                <h2 className="voice-section-title">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78z" />
                  </svg>
                  {t.voiceSettings.familiarVoices}
                </h2>
                <div className="voice-list">
                  {clonedVoices.map((v) => (
                    <VoiceCard
                      key={v.voice_id}
                      voice={v}
                      isSelected={selectedVoice === v.voice_id}
                      isPreviewing={previewingId === v.voice_id}
                      onSelect={() => handleSelect(v.voice_id)}
                      onPreview={() => handlePreview(v)}
                      onDelete={() => handleDelete(v.voice_id, v.name)}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Library voices section */}
            <div className="voice-section">
              <h2 className="voice-section-title">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 9v6h4l5 5V4L7 9H3z" />
                  <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z" />
                </svg>
                {t.voiceSettings.voiceLibrary}
              </h2>
              <div className="voice-list">
                {libraryVoices.map((v) => (
                  <VoiceCard
                    key={v.voice_id}
                    voice={v}
                    isSelected={selectedVoice === v.voice_id}
                    isPreviewing={previewingId === v.voice_id}
                    onSelect={() => handleSelect(v.voice_id)}
                    onPreview={() => handlePreview(v)}
                  />
                ))}
              </div>
            </div>

            {/* Clone voice section */}
            <div className="voice-section">
              {!showClone ? (
                <button className="voice-clone-trigger" onClick={() => setShowClone(true)}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M12 8v8M8 12h8" />
                  </svg>
                  {t.voiceSettings.cloneTitle}
                </button>
              ) : (
                <div className="voice-clone-form">
                  <h2 className="voice-section-title">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3z" />
                      <path d="M19 11a7 7 0 0 1-14 0" /><path d="M12 18v3" />
                    </svg>
                    {t.voiceSettings.cloneTitle}
                  </h2>
                  <p className="voice-clone-hint">
                    {t.voiceSettings.cloneHint}
                  </p>
                  <div className="voice-clone-sample">
                    <strong>{t.voiceSettings.readAloud}</strong>
                    <blockquote>
                      {t.voiceSettings.sampleText}
                    </blockquote>
                  </div>

                  <div className={`voice-clone-name-group ${(recordedBlob || cloneFile) && !cloneName.trim() ? 'highlight' : ''}`}>
                    <label className="voice-clone-label" htmlFor="clone-name">{t.voiceSettings.step1Name}</label>
                    <input
                      id="clone-name"
                      type="text"
                      className="voice-clone-name"
                      placeholder={t.voiceSettings.namePlaceholder}
                      value={cloneName}
                      onChange={(e) => setCloneName(e.target.value)}
                    />
                  </div>

                  {/* Record button */}
                  <label className="voice-clone-label">{t.voiceSettings.step2Record}</label>
                  <div className="voice-record-area">
                    {!recordedBlob ? (
                      <button
                        className={`voice-record-btn ${isRecording ? 'recording' : ''}`}
                        onClick={isRecording ? stopRecording : startRecording}
                        type="button"
                      >
                        <div className="voice-record-dot" />
                        {isRecording ? (
                          <span>{tpl(t.voiceSettings.stopRecording, { secs: recordingSecs })}</span>
                        ) : (
                          <span>{t.voiceSettings.tapToRecord}</span>
                        )}
                      </button>
                    ) : (
                      <div className="voice-recorded">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--olive-700)" strokeWidth="2">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                        <span>{tpl(t.voiceSettings.recorded, { secs: recordingSecs })}</span>
                        <button className="voice-card-btn preview" onClick={playbackRecording} type="button">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                            <polygon points="5,3 19,12 5,21" />
                          </svg>
                        </button>
                        <button className="voice-card-btn delete" onClick={clearRecording} type="button">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M18.3 5.7a1 1 0 0 0-1.4 0L12 10.6 7.1 5.7a1 1 0 0 0-1.4 1.4L10.6 12l-4.9 4.9a1 1 0 1 0 1.4 1.4L12 13.4l4.9 4.9a1 1 0 0 0 1.4-1.4L13.4 12l4.9-4.9a1 1 0 0 0 0-1.4z" />
                          </svg>
                        </button>
                      </div>
                    )}
                    {isRecording && (
                      <div className="voice-record-hint">{t.voiceSettings.recordHint}</div>
                    )}
                  </div>

                  {/* Or upload file */}
                  {!recordedBlob && !isRecording && (
                    <label className="voice-clone-upload">
                      <input
                        type="file"
                        accept="audio/*"
                        ref={cloneInputRef}
                        onChange={(e) => setCloneFile(e.target.files?.[0] || null)}
                      />
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="17 8 12 3 7 8" />
                        <line x1="12" y1="3" x2="12" y2="15" />
                      </svg>
                      {cloneFile ? cloneFile.name : t.voiceSettings.orUpload}
                    </label>
                  )}

                  <div className="voice-clone-actions">
                    <button
                      className="btn-primary"
                      onClick={handleClone}
                      disabled={!cloneName.trim() || (!cloneFile && !recordedBlob) || cloneLoading}
                    >
                      {cloneLoading ? (
                        <>
                          <div className="loading-spinner" style={{ width: 16, height: 16 }} />
                          {t.voiceSettings.cloning}
                        </>
                      ) : (
                        t.voiceSettings.cloneBtn
                      )}
                    </button>
                    <button className="btn-link" onClick={() => { setShowClone(false); setCloneName(''); setCloneFile(null); setRecordedBlob(null); }}>
                      {t.common.cancel}
                    </button>
                  </div>
                  {(recordedBlob || cloneFile) && !cloneName.trim() && (
                    <p className="voice-clone-missing">{t.voiceSettings.nameRequired}</p>
                  )}
                </div>
              )}
            </div>
          </>
        )}

        <button className="btn-link" onClick={() => navigate('/more')} style={{ marginTop: 8 }}>
          {t.common.back}
        </button>
      </div>
    </div>
  );
}

/* ── Voice Card Component ── */

function VoiceCard({
  voice,
  isSelected,
  isPreviewing,
  onSelect,
  onPreview,
  onDelete,
}: {
  voice: VoiceInfo;
  isSelected: boolean;
  isPreviewing: boolean;
  onSelect: () => void;
  onPreview: () => void;
  onDelete?: () => void;
}) {
  return (
    <div
      className={`voice-card ${isSelected ? 'selected' : ''}`}
      onClick={onSelect}
    >
      <div className="voice-card-radio">
        <div className="voice-card-radio-inner" />
      </div>
      <div className="voice-card-info">
        <strong>{voice.name}</strong>
        {voice.category === 'cloned' && <span className="voice-card-badge">cloned</span>}
      </div>
      <div className="voice-card-actions">
        {voice.preview_url && (
          <button
            className={`voice-card-btn preview ${isPreviewing ? 'active' : ''}`}
            onClick={(e) => { e.stopPropagation(); onPreview(); }}
            aria-label="Preview"
            type="button"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              {isPreviewing ? (
                <><rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" /></>
              ) : (
                <polygon points="5,3 19,12 5,21" />
              )}
            </svg>
          </button>
        )}
        {onDelete && (
          <button
            className="voice-card-btn delete"
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            aria-label="Delete"
            type="button"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
