import { useState, useEffect, useRef } from 'react';

type FormQuality = 'good' | 'fair' | 'poor';

export interface FormFeedback {
  quality: FormQuality;
  message: string;
  metric: string;
}

interface ExerciseFormConfig {
  exerciseId: string;
  isActive: boolean;
  kneeAngle: number | null;
  trunkLean: number | null;
  leftElbowAngle: number | null;
  rightElbowAngle: number | null;
  leftShoulderY?: number | null;
  rightShoulderY?: number | null;
}

type Evaluator = (c: ExerciseFormConfig) => FormFeedback[];

const EXERCISE_RULES: Record<string, Evaluator> = {
  'chair-stand': (c) => {
    const feedbacks: FormFeedback[] = [];
    if (c.kneeAngle !== null) {
      const quality: FormQuality = c.kneeAngle >= 160 ? 'good' : c.kneeAngle >= 130 ? 'fair' : 'poor';
      feedbacks.push({
        quality,
        message: quality === 'good' ? 'Full extension' : quality === 'fair' ? 'Extend more' : 'Stand up taller',
        metric: `Knee: ${Math.round(c.kneeAngle)}\u00B0`,
      });
    }
    if (c.trunkLean !== null) {
      const quality: FormQuality = c.trunkLean < 15 ? 'good' : c.trunkLean < 30 ? 'fair' : 'poor';
      feedbacks.push({
        quality,
        message: quality === 'good' ? 'Good posture' : 'Lean less forward',
        metric: `Lean: ${Math.round(c.trunkLean)}\u00B0`,
      });
    }
    return feedbacks;
  },

  'wall-push': (c) => {
    const feedbacks: FormFeedback[] = [];
    const elbowAngle = c.leftElbowAngle ?? c.rightElbowAngle;
    if (elbowAngle !== null) {
      const quality: FormQuality = elbowAngle < 100 ? 'good' : elbowAngle < 140 ? 'fair' : 'poor';
      feedbacks.push({
        quality,
        message: quality === 'good' ? 'Good depth' : quality === 'fair' ? 'Bend more' : 'Push closer to wall',
        metric: `Elbow: ${Math.round(elbowAngle)}\u00B0`,
      });
    }
    if (c.trunkLean !== null) {
      const quality: FormQuality = c.trunkLean < 20 ? 'good' : c.trunkLean < 35 ? 'fair' : 'poor';
      feedbacks.push({
        quality,
        message: quality === 'good' ? 'Back straight' : 'Keep back straighter',
        metric: `Lean: ${Math.round(c.trunkLean)}\u00B0`,
      });
    }
    return feedbacks;
  },

  'heel-raise': (c) => {
    const feedbacks: FormFeedback[] = [];
    if (c.kneeAngle !== null) {
      const quality: FormQuality = c.kneeAngle > 170 ? 'good' : c.kneeAngle > 150 ? 'fair' : 'poor';
      feedbacks.push({
        quality,
        message: quality === 'good' ? 'Legs straight' : 'Straighten legs more',
        metric: `Knee: ${Math.round(c.kneeAngle)}\u00B0`,
      });
    }
    return feedbacks;
  },

  'sit-to-stand-hold': (c) => {
    const feedbacks: FormFeedback[] = [];
    if (c.kneeAngle !== null) {
      const quality: FormQuality = c.kneeAngle >= 165 ? 'good' : c.kneeAngle >= 140 ? 'fair' : 'poor';
      feedbacks.push({
        quality,
        message: quality === 'good' ? 'Great hold!' : quality === 'fair' ? 'Extend more' : 'Try standing taller',
        metric: `Knee: ${Math.round(c.kneeAngle)}\u00B0`,
      });
    }
    return feedbacks;
  },

  'marching': (c) => {
    const feedbacks: FormFeedback[] = [];
    if (c.kneeAngle !== null) {
      const quality: FormQuality = c.kneeAngle <= 90 ? 'good' : c.kneeAngle <= 120 ? 'fair' : 'poor';
      feedbacks.push({
        quality,
        message: quality === 'good' ? 'Great knee lift!' : quality === 'fair' ? 'Lift a bit higher' : 'Try lifting your knee more',
        metric: `Knee: ${Math.round(c.kneeAngle)}\u00B0`,
      });
    }
    return feedbacks;
  },

  'leg-extensions': (c) => {
    const feedbacks: FormFeedback[] = [];
    if (c.kneeAngle !== null) {
      const quality: FormQuality = c.kneeAngle >= 160 ? 'good' : c.kneeAngle >= 140 ? 'fair' : 'poor';
      feedbacks.push({
        quality,
        message: quality === 'good' ? 'Nice extension!' : quality === 'fair' ? 'Straighten a bit more' : 'Extend your leg further',
        metric: `Knee: ${Math.round(c.kneeAngle)}\u00B0`,
      });
    }
    return feedbacks;
  },

  'shoulder-rolls': (c) => {
    const feedbacks: FormFeedback[] = [];
    const leftY = c.leftShoulderY ?? null;
    const rightY = c.rightShoulderY ?? null;
    if (leftY !== null && rightY !== null) {
      const amplitude = Math.abs(leftY - rightY);
      const quality: FormQuality = amplitude > 15 ? 'good' : amplitude > 8 ? 'fair' : 'poor';
      feedbacks.push({
        quality,
        message: quality === 'good' ? 'Good movement!' : quality === 'fair' ? 'Try bigger circles' : 'Make larger movements',
        metric: `Movement: ${Math.round(amplitude)}px`,
      });
    }
    return feedbacks;
  },
};

// Exercises that support form feedback
export const FORM_FEEDBACK_EXERCISES = new Set([
  'chair-stand', 'wall-push', 'heel-raise', 'sit-to-stand-hold',
  'marching', 'leg-extensions', 'shoulder-rolls',
]);

// Exercises that use knee-based rep counting
const KNEE_REP_EXERCISES = new Set(['chair-stand', 'sit-to-stand-hold', 'heel-raise', 'leg-extensions']);

// Marching uses its own rep logic (knee drops below threshold then rises)
const MARCHING_EXERCISES = new Set(['marching']);

export function useExerciseFormFeedback(config: ExerciseFormConfig): {
  feedback: FormFeedback[];
  repCount: number;
} {
  const [repCount, setRepCount] = useState(0);
  const wasFlexedRef = useRef(false);
  const prevExerciseRef = useRef(config.exerciseId);

  // Reset rep count when exercise changes
  useEffect(() => {
    if (config.exerciseId !== prevExerciseRef.current) {
      setRepCount(0);
      wasFlexedRef.current = false;
      prevExerciseRef.current = config.exerciseId;
    }
  }, [config.exerciseId]);

  // Rep counting via knee flexion cycles (chair-stand style)
  useEffect(() => {
    if (!config.isActive || config.kneeAngle === null) return;
    if (!KNEE_REP_EXERCISES.has(config.exerciseId)) return;
    const threshold = 130;
    const isFlexed = config.kneeAngle < threshold;
    if (wasFlexedRef.current && !isFlexed) {
      setRepCount((prev) => prev + 1);
    }
    wasFlexedRef.current = isFlexed;
  }, [config.kneeAngle, config.isActive, config.exerciseId]);

  // Marching rep counting — knee angle drops below 120 then rises above 140
  useEffect(() => {
    if (!config.isActive || config.kneeAngle === null) return;
    if (!MARCHING_EXERCISES.has(config.exerciseId)) return;
    const isLifted = config.kneeAngle < 120;
    if (wasFlexedRef.current && !isLifted && config.kneeAngle > 140) {
      setRepCount((prev) => prev + 1);
    }
    wasFlexedRef.current = isLifted;
  }, [config.kneeAngle, config.isActive, config.exerciseId]);

  // Reset on deactivation
  useEffect(() => {
    if (!config.isActive) {
      setRepCount(0);
      wasFlexedRef.current = false;
    }
  }, [config.isActive]);

  const evaluator = EXERCISE_RULES[config.exerciseId];
  const feedback = config.isActive && evaluator ? evaluator(config) : [];

  return { feedback, repCount };
}
