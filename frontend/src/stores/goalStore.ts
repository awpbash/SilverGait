import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface Goals {
  exerciseDaysTarget: number;
  stepsTarget: number;
  assessmentsTarget: number;
}

interface GoalState {
  goals: Goals;
  setGoals: (goals: Partial<Goals>) => void;
  resetGoals: () => void;
}

const DEFAULT_GOALS: Goals = {
  exerciseDaysTarget: 5,
  stepsTarget: 6000,
  assessmentsTarget: 1,
};

export const useGoalStore = create<GoalState>()(
  persist(
    (set) => ({
      goals: DEFAULT_GOALS,
      setGoals: (partial) =>
        set((state) => ({ goals: { ...state.goals, ...partial } })),
      resetGoals: () => set({ goals: DEFAULT_GOALS }),
    }),
    { name: 'silvergait-goals' }
  )
);
