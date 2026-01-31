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
  analyzeVideo: async (videoBlob: Blob, userId: string): Promise<AssessmentResult> => {
    try {
      const formData = new FormData();
      formData.append('video', videoBlob, 'sppb-recording.webm');
      formData.append('user_id', userId);

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

export default api;
