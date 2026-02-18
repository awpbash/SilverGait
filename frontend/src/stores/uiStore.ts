import { create } from 'zustand';

export type ViewMode = 'mobile' | 'desktop';

interface UiState {
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  toggleViewMode: () => void;
}

export const useUiStore = create<UiState>((set) => ({
  viewMode: 'mobile',
  setViewMode: (viewMode) => set({ viewMode }),
  toggleViewMode: () =>
    set((state) => ({
      viewMode: state.viewMode === 'mobile' ? 'desktop' : 'mobile',
    })),
}));
