/**
 * Zustand store for SPPB Assessment data
 */

import { create } from 'zustand';
import type { AssessmentResult } from '../types';

interface AssessmentState {
  // Latest assessment
  latestAssessment: AssessmentResult | null;
  setLatestAssessment: (assessment: AssessmentResult) => void;

  // Assessment history
  history: AssessmentResult[];
  addToHistory: (assessment: AssessmentResult) => void;

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

export const useAssessmentStore = create<AssessmentState>((set) => ({
  latestAssessment: null,
  history: [],
  isRecording: false,
  isAnalyzing: false,
  error: null,

  setLatestAssessment: (assessment) =>
    set((state) => ({
      latestAssessment: assessment,
      history: [assessment, ...state.history.slice(0, 9)], // Keep last 10
    })),

  addToHistory: (assessment) =>
    set((state) => ({
      history: [assessment, ...state.history.slice(0, 9)],
    })),

  setRecording: (isRecording) => set({ isRecording }),
  setAnalyzing: (isAnalyzing) => set({ isAnalyzing }),
  setError: (error) => set({ error }),
}));
