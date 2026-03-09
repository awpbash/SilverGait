/**
 * Zustand store for SPPB Assessment data
 * Persisted to localStorage + synced with backend DB
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AssessmentResult } from '../types';

interface AssessmentState {
  // Latest assessment
  latestAssessment: AssessmentResult | null;
  setLatestAssessment: (assessment: AssessmentResult) => void;

  // Assessment history
  history: AssessmentResult[];
  addToHistory: (assessment: AssessmentResult) => void;
  setHistory: (history: AssessmentResult[]) => void;

  // Video recording state
  isRecording: boolean;
  setRecording: (recording: boolean) => void;

  // Analysis state
  isAnalyzing: boolean;
  setAnalyzing: (analyzing: boolean) => void;

  // Error
  error: string | null;
  setError: (error: string | null) => void;
}

export const useAssessmentStore = create<AssessmentState>()(
  persist(
    (set) => ({
      latestAssessment: null,
      history: [],
      isRecording: false,
      isAnalyzing: false,
      error: null,

      setLatestAssessment: (assessment) =>
        set((state) => ({
          latestAssessment: assessment,
          history: [assessment, ...state.history.slice(0, 19)], // Keep last 20
        })),

      addToHistory: (assessment) =>
        set((state) => ({
          history: [assessment, ...state.history.slice(0, 19)],
        })),

      setHistory: (history) => set({ history }),

      setRecording: (isRecording) => set({ isRecording }),
      setAnalyzing: (isAnalyzing) => set({ isAnalyzing }),
      setError: (error) => set({ error }),
    }),
    {
      name: 'silvergait-assessments',
      partialize: (state) => ({
        latestAssessment: state.latestAssessment,
        history: state.history,
      }),
    }
  )
);
