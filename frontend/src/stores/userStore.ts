/**
 * Zustand store for User & Health Data
 * Auto-syncs with backend on first load
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { HealthMetrics, WeeklyTrend } from '../types';

interface UserState {
  // User identity
  userId: string;
  setUserId: (id: string) => void;
  sessionToken: string | null;
  setSessionToken: (token: string | null) => void;
  displayName: string;
  gender: string | null;
  setDisplayName: (name: string) => void;
  setGender: (gender: string | null) => void;

  // Preferences
  preferredLanguage: 'en' | 'mandarin' | 'malay' | 'tamil';
  setPreferredLanguage: (lang: UserState['preferredLanguage']) => void;
  voiceId: string | null;
  setVoiceId: (id: string | null) => void;

  // Onboarding
  hasOnboarded: boolean;
  setHasOnboarded: (v: boolean) => void;

  // Synced with backend
  synced: boolean;
  setSynced: (synced: boolean) => void;

  // Health metrics
  todayMetrics: HealthMetrics | null;
  weeklyTrend: WeeklyTrend | null;
  setTodayMetrics: (metrics: HealthMetrics) => void;
  setWeeklyTrend: (trend: WeeklyTrend) => void;

  // Loading states
  isLoading: boolean;
  setLoading: (loading: boolean) => void;

  // Error state
  error: string | null;
  setError: (error: string | null) => void;
}

export const useUserStore = create<UserState>()(
  persist(
    (set) => ({
      userId: '',
      sessionToken: null,
      displayName: '',
      gender: null,
      preferredLanguage: 'en',
      voiceId: null,
      hasOnboarded: false,
      synced: false,

      todayMetrics: null,
      weeklyTrend: null,
      isLoading: false,
      error: null,

      setUserId: (userId) => set({ userId }),
      setSessionToken: (sessionToken) => set({ sessionToken }),
      setDisplayName: (displayName) => set({ displayName }),
      setGender: (gender) => set({ gender }),
      setPreferredLanguage: (preferredLanguage) => set({ preferredLanguage }),
      setVoiceId: (voiceId) => set({ voiceId }),
      setHasOnboarded: (hasOnboarded) => set({ hasOnboarded }),
      setSynced: (synced) => set({ synced }),
      setTodayMetrics: (metrics) => set({ todayMetrics: metrics }),
      setWeeklyTrend: (trend) => set({ weeklyTrend: trend }),
      setLoading: (isLoading) => set({ isLoading }),
      setError: (error) => set({ error }),
    }),
    {
      name: 'SilverGait-user',
      version: 2,
      partialize: (state) => ({
        userId: state.userId,
        sessionToken: state.sessionToken,
        displayName: state.displayName,
        gender: state.gender,
        preferredLanguage: state.preferredLanguage,
        voiceId: state.voiceId,
        hasOnboarded: state.hasOnboarded,
        synced: state.synced,
      }),
      migrate: (persisted: unknown, version: number): UserState => {
        const state = persisted as Record<string, unknown>;
        // v1→v2: server-generated IDs + session tokens. Clear old client-generated state.
        if (version < 2) {
          state.userId = '';
          state.sessionToken = null;
          state.hasOnboarded = false;
          state.synced = false;
        }
        const validLangs = ['en', 'mandarin', 'malay', 'tamil'];
        if (state && typeof state.preferredLanguage === 'string' && !validLangs.includes(state.preferredLanguage)) {
          state.preferredLanguage = 'en';
        }
        return state as unknown as UserState;
      },
    }
  )
);
