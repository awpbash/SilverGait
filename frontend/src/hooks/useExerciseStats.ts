import { useEffect, useState } from 'react';
import { exerciseApi } from '../services/api';
import { useUserStore } from '../stores';

export interface ExerciseStats {
  todayCompleted: string[];
  daily: Array<{ date: string; count: number }>;
  streak: number;
  totalExercises: number;
  loading: boolean;
}

export function useExerciseStats(days: number = 7): ExerciseStats {
  const userId = useUserStore((s) => s.userId);
  const [stats, setStats] = useState<ExerciseStats>({
    todayCompleted: [],
    daily: [],
    streak: 0,
    totalExercises: 0,
    loading: true,
  });

  useEffect(() => {
    let cancelled = false;
    exerciseApi.getStats(userId, days).then((data) => {
      if (cancelled) return;
      setStats({
        todayCompleted: data.today_completed,
        daily: data.daily,
        streak: data.streak,
        totalExercises: data.total_exercises,
        loading: false,
      });
    }).catch(() => {
      if (!cancelled) setStats((s) => ({ ...s, loading: false }));
    });
    return () => { cancelled = true; };
  }, [userId, days]);

  return stats;
}
