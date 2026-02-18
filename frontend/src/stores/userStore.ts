/**
 * Zustand store for User & Health Data
 * Works without profile setup - uses sensible defaults
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { HealthMetrics, WeeklyTrend } from '../types';

interface UserState {
  // User ID (auto-generated)
  userId: string;

  // Preferences
  preferredLanguage: 'en' | 'singlish' | 'hokkien' | 'cantonese' | 'mandarin' | 'malay';
  setPreferredLanguage: (lang: UserState['preferredLanguage']) => void;

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

// Generate a simple user ID
const generateUserId = () => `user_${Date.now().toString(36)}`;

export const useUserStore = create<UserState>()(
  persist(
    (set) => ({
      // Default user - no setup required
      userId: generateUserId(),
      preferredLanguage: 'singlish',

      // Health data
      todayMetrics: null,
      weeklyTrend: null,
      isLoading: false,
      error: null,

      // Actions
      setPreferredLanguage: (preferredLanguage) => set({ preferredLanguage }),
      setTodayMetrics: (metrics) => set({ todayMetrics: metrics }),
      setWeeklyTrend: (trend) => set({ weeklyTrend: trend }),
      setLoading: (isLoading) => set({ isLoading }),
      setError: (error) => set({ error }),
    }),
    {
      name: 'SilverGait-user',
      partialize: (state) => ({
        userId: state.userId,
        preferredLanguage: state.preferredLanguage,
      }),
    }
  )
);
