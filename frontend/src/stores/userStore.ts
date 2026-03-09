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
  displayName: string;
  setDisplayName: (name: string) => void;

  // Preferences
  preferredLanguage: 'en' | 'mandarin' | 'malay' | 'tamil';
  setPreferredLanguage: (lang: UserState['preferredLanguage']) => void;

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

// Generate a stable user ID
const generateUserId = () => `user_${Date.now().toString(36)}`;

export const useUserStore = create<UserState>()(
  persist(
    (set) => ({
      userId: generateUserId(),
      displayName: '',
      preferredLanguage: 'en',
      hasOnboarded: false,
      synced: false,

      todayMetrics: null,
      weeklyTrend: null,
      isLoading: false,
      error: null,

      setDisplayName: (displayName) => set({ displayName }),
      setPreferredLanguage: (preferredLanguage) => set({ preferredLanguage }),
      setHasOnboarded: (hasOnboarded) => set({ hasOnboarded }),
      setSynced: (synced) => set({ synced }),
      setTodayMetrics: (metrics) => set({ todayMetrics: metrics }),
      setWeeklyTrend: (trend) => set({ weeklyTrend: trend }),
      setLoading: (isLoading) => set({ isLoading }),
      setError: (error) => set({ error }),
    }),
    {
      name: 'SilverGait-user',
      version: 1,
      partialize: (state) => ({
        userId: state.userId,
        displayName: state.displayName,
        preferredLanguage: state.preferredLanguage,
        hasOnboarded: state.hasOnboarded,
        synced: state.synced,
      }),
      migrate: (persisted: unknown) => {
        const state = persisted as Record<string, unknown>;
        const validLangs = ['en', 'mandarin', 'malay', 'tamil'];
        if (state && typeof state.preferredLanguage === 'string' && !validLangs.includes(state.preferredLanguage)) {
          state.preferredLanguage = 'en';
        }
        return state as ReturnType<typeof useUserStore.getState>;
      },
    }
  )
);
