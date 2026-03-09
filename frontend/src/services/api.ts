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
  headers: {
    'Content-Type': 'application/json',
  },
});

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
        headers: { 'Content-Type': 'multipart/form-data' },
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
};

// User API
export const userApi = {
  ensureUser: async (
    userId: string,
    displayName?: string,
    language?: string
  ): Promise<{ id: string; display_name: string; language: string; created_at: string }> => {
    try {
      const response = await api.post('/users', {
        id: userId,
        display_name: displayName || '',
        language: language || 'en',
      });
      return response.data;
    } catch (error) {
      throw handleApiError(error);
    }
  },

  updateUser: async (
    userId: string,
    updates: { display_name?: string; language?: string }
  ): Promise<{ id: string; display_name: string; language: string; created_at: string }> => {
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
  ): Promise<{ actions: Array<{ label: string; route: string }> }> => {
    const res = await fetch(`${API_BASE}/chat/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId, message, language }),
    });

    if (!res.ok) throw new Error('Chat request failed');

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let actions: Array<{ label: string; route: string }> = [];
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
