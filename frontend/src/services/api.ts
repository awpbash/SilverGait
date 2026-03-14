/**
 * API Service Layer
 * NO MOCKS - Real async data fetchers as per CLAUDE.md
 */

import axios, { AxiosError } from 'axios';
import type {
  HealthMetrics,
  WeeklyTrend,
  AssessmentResult,
  InterventionAction,
  UserRiskProfile,
} from '../types';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api';

const api = axios.create({
  baseURL: API_BASE,
  timeout: 30000,
});

// Attach session token to all requests
api.interceptors.request.use((config) => {
  const stored = localStorage.getItem('SilverGait-user');
  if (stored) {
    try {
      const { state } = JSON.parse(stored);
      if (state?.sessionToken) {
        config.headers.Authorization = `Bearer ${state.sessionToken}`;
      }
    } catch { /* ignore parse errors */ }
  }
  return config;
});

// On 401, clear session so app re-registers
api.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error?.response?.status === 401) {
      const stored = localStorage.getItem('SilverGait-user');
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          parsed.state = { ...parsed.state, userId: '', sessionToken: null, hasOnboarded: false, synced: false };
          localStorage.setItem('SilverGait-user', JSON.stringify(parsed));
        } catch { /* ignore */ }
      }
    }
    return Promise.reject(error);
  },
);

/** Helper: get session token from localStorage for raw fetch() calls. */
export const getSessionToken = (): string | null => {
  try {
    const stored = localStorage.getItem('SilverGait-user');
    if (!stored) return null;
    return JSON.parse(stored)?.state?.sessionToken ?? null;
  } catch { return null; }
};

/** Build auth headers for raw fetch() calls (FormData-compatible — no Content-Type). */
export const authHeaders = (): Record<string, string> => {
  const token = getSessionToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
};

// Error handler with graceful "Retrying..." as per CLAUDE.md
const handleApiError = (error: unknown): never => {
  if (error instanceof AxiosError) {
    if (error.response?.status === 401) {
      throw new Error('Authentication failed. Please check your connection.');
    }
    if (error.response?.status === 500) {
      throw new Error('Server error. Retrying...');
    }
    if (error.code === 'ECONNABORTED') {
      throw new Error('Request timed out. Check your internet connection.');
    }
  }
  throw new Error('Unable to connect. Check your internet.');
};

// Health Metrics API (HPB)
export const healthApi = {
  getDailyMetrics: async (userId: string, date?: string): Promise<HealthMetrics> => {
    try {
      const params = date ? { date } : {};
      const response = await api.get(`/health/metrics/${userId}`, { params });
      return response.data;
    } catch (error) {
      throw handleApiError(error);
    }
  },

  getWeeklyTrend: async (userId: string): Promise<WeeklyTrend> => {
    try {
      const response = await api.get(`/health/trend/${userId}`);
      return response.data;
    } catch (error) {
      throw handleApiError(error);
    }
  },

  checkStatus: async (): Promise<boolean> => {
    try {
      await api.get('/health/status');
      return true;
    } catch {
      return false;
    }
  },
};

// Assessment API (Gemini Vision)
export const assessmentApi = {
  analyzeVideo: async (
    videoBlob: Blob,
    userId: string,
    testType: 'gait' | 'balance' | 'chair_stand' = 'gait'
  ): Promise<AssessmentResult> => {
    try {
      const formData = new FormData();
      formData.append('video', videoBlob, 'sppb-recording.webm');
      formData.append('user_id', userId);
      formData.append('test_type', testType);

      const response = await api.post('/assessment/analyze', formData, {
        timeout: 120000, // 2 min for video processing
      });
      return response.data;
    } catch (error) {
      throw handleApiError(error);
    }
  },

  checkStatus: async (): Promise<boolean> => {
    try {
      await api.get('/assessment/status');
      return true;
    } catch {
      return false;
    }
  },
};

// Intervention API (Agentic decisions)
export const interventionApi = {
  getRecommendation: async (profile: UserRiskProfile): Promise<InterventionAction> => {
    try {
      const response = await api.post('/intervention/decide', profile);
      return response.data;
    } catch (error) {
      throw handleApiError(error);
    }
  },

  translateMessage: async (
    message: string,
    dialect: string = 'singlish'
  ): Promise<{ original: string; translated: string; dialect: string }> => {
    try {
      const response = await api.post('/intervention/translate', {
        message,
        dialect,
      });
      return response.data;
    } catch (error) {
      throw handleApiError(error);
    }
  },

  checkStatus: async (): Promise<boolean> => {
    try {
      await api.get('/intervention/status');
      return true;
    } catch {
      return false;
    }
  },

  getLatest: async (userId: string): Promise<InterventionAction | null> => {
    try {
      const response = await api.get(`/intervention/latest/${userId}`);
      return response.data;
    } catch {
      return null;
    }
  },

  getAlerts: async (userId: string): Promise<{
    alerts: Array<{
      type: string;
      severity: 'info' | 'warning' | 'urgent';
      message: string;
      priority: number;
    }>;
    trend: 'improving' | 'stable' | 'declining';
    total_assessments: number;
    active_days_this_week: number;
  }> => {
    try {
      const response = await api.get(`/intervention/alerts/${userId}`);
      return response.data;
    } catch {
      return { alerts: [], trend: 'stable', total_assessments: 0, active_days_this_week: 0 };
    }
  },
};

// User API
export const userApi = {
  ensureUser: async (
    displayName?: string,
    language?: string,
    gender?: string | null,
  ): Promise<{ id: string; display_name: string; language: string; gender: string | null; created_at: string; token: string }> => {
    try {
      const response = await api.post('/users', {
        display_name: displayName || '',
        language: language || 'en',
        gender: gender || null,
      });
      return response.data;
    } catch (error) {
      throw handleApiError(error);
    }
  },

  validateToken: async (
    token: string,
  ): Promise<{ id: string; display_name: string; language: string; gender: string | null; created_at: string; onboarded: boolean; token: string }> => {
    try {
      const response = await api.post('/users/validate-token', { token });
      return response.data;
    } catch (error) {
      throw handleApiError(error);
    }
  },

  updateUser: async (
    userId: string,
    updates: { display_name?: string; language?: string; gender?: string | null }
  ): Promise<{ id: string; display_name: string; language: string; gender: string | null; created_at: string }> => {
    try {
      const response = await api.patch(`/users/${userId}`, updates);
      return response.data;
    } catch (error) {
      throw handleApiError(error);
    }
  },
};

// History API
export const historyApi = {
  getAssessments: async (
    userId: string,
    options?: { limit?: number; offset?: number; test_type?: string }
  ): Promise<{
    assessments: AssessmentResult[];
    total: number;
    limit: number;
    offset: number;
  }> => {
    try {
      const response = await api.get(`/users/${userId}/assessments`, {
        params: options,
      });
      return response.data;
    } catch (error) {
      throw handleApiError(error);
    }
  },

  getProgress: async (
    userId: string
  ): Promise<{
    trend: Array<{ timestamp: string; total_score: number; sppb_breakdown: Record<string, number> | null }>;
    latest_by_test: Record<string, { score: number; timestamp: string }>;
    total_assessments: number;
  }> => {
    try {
      const response = await api.get(`/users/${userId}/progress`);
      return response.data;
    } catch (error) {
      throw handleApiError(error);
    }
  },
};

// Exercise API
export const exerciseApi = {
  complete: async (
    userId: string,
    exerciseId: string,
    durationSecs?: number
  ): Promise<{ status: string; id: number }> => {
    try {
      const response = await api.post('/exercises/complete', {
        user_id: userId,
        exercise_id: exerciseId,
        duration_secs: durationSecs ?? null,
      });
      return response.data;
    } catch (error) {
      throw handleApiError(error);
    }
  },

  getStats: async (
    userId: string,
    days: number = 7
  ): Promise<{
    today_completed: string[];
    daily: Array<{ date: string; count: number }>;
    streak: number;
    total_exercises: number;
    days: number;
  }> => {
    try {
      const response = await api.get(`/exercises/stats/${userId}`, {
        params: { days },
      });
      return response.data;
    } catch (error) {
      throw handleApiError(error);
    }
  },

  getPersonalized: async (
    userId: string
  ): Promise<{
    exercises: Array<{
      id: string;
      category: string;
      recommended: boolean;
      completed: boolean;
      intensity_minutes: number;
    }>;
    tier: string;
    sppb_total: number;
    focus_area: string | null;
    daily_target: number;
    issues: string[];
    completed_count: number;
  }> => {
    try {
      const response = await api.get(`/exercises/personalized/${userId}`);
      return response.data;
    } catch (error) {
      throw handleApiError(error);
    }
  },
};

// LangGraph Agent API
export interface AgentRunResult {
  frailty_tier: string | null;
  risk_explanation: string | null;
  education_plan: string | null;
  exercise_plan: string | null;
  sleep_plan: string | null;
  monitoring_notes: string | null;
  management_routes: string[] | null;
  management_rationale: string | null;
  cfs_score: number | null;
  cfs_label: string | null;
  katz_total: number | null;
  sppb_total: number | null;
  contributing: Record<string, string> | null;
  completed_nodes: string[];
  elapsed_seconds: number;
}

export const agentApi = {
  runWorkflow: async (
    userId: string,
    opts?: {
      patientName?: string;
      patientAge?: number;
      sppbBalance?: number;
      sppbGait?: number;
      sppbChair?: number;
    }
  ): Promise<AgentRunResult> => {
    try {
      const response = await api.post('/agent/run', {
        user_id: userId,
        patient_name: opts?.patientName || userId,
        patient_age: opts?.patientAge || 70,
        sppb_balance: opts?.sppbBalance,
        sppb_gait: opts?.sppbGait,
        sppb_chair: opts?.sppbChair,
      });
      return response.data;
    } catch (error) {
      throw handleApiError(error);
    }
  },

  getLatest: async (userId: string): Promise<AgentRunResult | null> => {
    try {
      const response = await api.get(`/agent/latest/${userId}`);
      return response.data;
    } catch {
      return null;
    }
  },
};

// Health Snapshot API (onboarding + profile updates)
export const healthSnapshotApi = {
  create: async (
    userId: string,
    data: {
      trigger: string;
      katz_bathing?: boolean;
      katz_dressing?: boolean;
      katz_toileting?: boolean;
      katz_transferring?: boolean;
      katz_continence?: boolean;
      katz_feeding?: boolean;
      cognitive_risk?: string;
      mood_risk?: string;
      sleep_risk?: string;
      social_isolation_risk?: string;
    }
  ): Promise<{
    snapshot_id: number;
    katz_total: number | null;
    cfs_score: number | null;
    frailty_tier: string;
    risk_explanation: string;
    tier_changed: boolean;
    new_plans: Array<{ plan_type: string; content: string }>;
  }> => {
    try {
      const response = await api.post(`/users/${userId}/health-snapshot`, data);
      return response.data;
    } catch (error) {
      throw handleApiError(error);
    }
  },
};

// User Context API
export const contextApi = {
  get: async (userId: string): Promise<{
    user_id: string;
    display_name: string;
    language: string;
    voice_id: string | null;
    onboarded: boolean;
    current_tier: string | null;
    cfs_score: number | null;
    katz_total: number | null;
    sppb_total: number | null;
    balance_score: number | null;
    gait_score: number | null;
    chair_score: number | null;
    sppb_trend: number[];
    sppb_direction: string;
    katz_trend: number[];
    tier_history: string[];
    exercise_streak: number;
    exercises_this_week: number;
    exercises_today: string[];
    days_since_last_assessment: number | null;
    recheck_due: boolean;
    sleep_risk: string;
    mood_risk: string;
    cognitive_risk: string;
    social_isolation_risk: string;
    active_plans: Record<string, unknown>;
    unread_alerts: Array<unknown>;
    recent_issues: string[];
  }> => {
    try {
      const response = await api.get(`/users/${userId}/context`);
      return response.data;
    } catch (error) {
      throw handleApiError(error);
    }
  },
};

// Alerts API
export const alertsApi = {
  getAll: async (userId: string): Promise<Array<{
    id: number;
    user_id: string;
    timestamp: string;
    alert_type: string;
    severity: string;
    message: string;
    source: string;
    read: boolean;
  }>> => {
    try {
      const response = await api.get(`/users/${userId}/alerts`);
      return response.data;
    } catch {
      return [];
    }
  },
};

// Frailty History API
export const frailtyApi = {
  getHistory: async (userId: string): Promise<Array<{
    id: number;
    timestamp: string;
    trigger: string;
    cfs_score: number | null;
    katz_total: number | null;
    sppb_total: number | null;
    frailty_tier: string;
    risk_explanation: string;
    tier_changed: boolean;
    previous_tier: string | null;
  }>> => {
    try {
      const response = await api.get(`/users/${userId}/frailty-history`);
      return response.data;
    } catch {
      return [];
    }
  },
};

// Care Plans API
export const carePlanApi = {
  getActive: async (userId: string): Promise<Array<{
    id: number;
    plan_type: string;
    content: string;
    created_at: string;
    status: string;
    trigger: string;
  }>> => {
    try {
      const response = await api.get(`/users/${userId}/care-plans`);
      return response.data;
    } catch {
      return [];
    }
  },
};

// Voice API (ElevenLabs TTS, voice management)
export const voiceApi = {
  /** Get TTS status and provider info */
  getStatus: async (): Promise<{
    enabled: boolean;
    tts_ready: boolean;
    tts_provider: string;
    tts_format: string;
    sealion_ready: boolean;
    stream_tts: boolean;
  }> => {
    try {
      const response = await api.get('/voice/status');
      return response.data;
    } catch {
      return { enabled: false, tts_ready: false, tts_provider: 'none', tts_format: 'wav', sealion_ready: false, stream_tts: false };
    }
  },

  /** List all available ElevenLabs voices */
  listVoices: async (): Promise<{
    voices: Array<{
      voice_id: string;
      name: string;
      category: string;
      preview_url: string | null;
      labels: Record<string, string>;
    }>;
    default_voice_id: string;
  }> => {
    try {
      const response = await api.get('/voice/voices');
      return response.data;
    } catch {
      return { voices: [], default_voice_id: '' };
    }
  },

  /** Clone a voice from an audio sample */
  cloneVoice: async (
    name: string,
    audioFile: File,
    description?: string,
  ): Promise<{ voice_id: string; name: string } | null> => {
    try {
      const fd = new FormData();
      fd.append('name', name);
      fd.append('audio', audioFile);
      if (description) fd.append('description', description);
      const response = await api.post('/voice/voices/clone', fd, {
        timeout: 60000,
      });
      return response.data;
    } catch {
      return null;
    }
  },

  /** Delete a cloned voice */
  deleteVoice: async (voiceId: string): Promise<boolean> => {
    try {
      await api.delete(`/voice/voices/${voiceId}`);
      return true;
    } catch {
      return false;
    }
  },

  /** Set a user's preferred voice */
  selectVoice: async (userId: string, voiceId: string): Promise<boolean> => {
    try {
      const fd = new FormData();
      fd.append('user_id', userId);
      fd.append('voice_id', voiceId);
      await api.patch('/voice/voices/select', fd);
      return true;
    } catch {
      return false;
    }
  },
};

// Chat API (streaming)
export const chatApi = {
  /**
   * Stream a chat response via SSE.
   * Calls onChunk for each text fragment, returns final actions when done.
   */
  sendStream: async (
    userId: string,
    message: string,
    onChunk: (text: string) => void,
    language: string = 'en',
  ): Promise<{ actions: Array<{ label: string; route?: string; prompt?: string }> }> => {
    const authHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
    const token = getSessionToken();
    if (token) authHeaders['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`${API_BASE}/chat/stream`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ user_id: userId, message, language }),
    });

    if (!res.ok) throw new Error('Chat request failed');

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let actions: Array<{ label: string; route?: string; prompt?: string }> = [];
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        try {
          const evt = JSON.parse(line.slice(6));
          if (evt.type === 'chunk' && evt.text) {
            onChunk(evt.text);
          } else if (evt.type === 'done') {
            actions = evt.actions || [];
          }
        } catch {
          // skip malformed lines
        }
      }
    }

    return { actions };
  },
};

export default api;
