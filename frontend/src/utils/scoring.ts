/** Shared SPPB scoring helpers */

interface SppbBreakdown {
  balance_score: number;
  gait_score: number;
  chair_stand_score: number;
}

interface Scoreable {
  score: number;
  sppb_breakdown?: SppbBreakdown;
  completed_tests?: string[];
}

/** Compute total SPPB score (0-12) from an assessment result */
export function computeTotal(assessment: Scoreable): number {
  const bd = assessment.sppb_breakdown;
  if (bd) return bd.balance_score + bd.gait_score + bd.chair_stand_score;
  // Legacy: scores 0-4 without completed_tests are old format
  return assessment.score <= 4 && !assessment.completed_tests
    ? Math.round(assessment.score * 3)
    : assessment.score;
}
