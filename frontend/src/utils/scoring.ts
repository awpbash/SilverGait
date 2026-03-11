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

/** Compute total SPPB score, summing only completed tests. */
export function computeTotal(assessment: Scoreable): number {
  const bd = assessment.sppb_breakdown;
  const tests = assessment.completed_tests;
  if (bd && tests && tests.length > 0) {
    let total = 0;
    if (tests.includes('balance')) total += bd.balance_score;
    if (tests.includes('gait')) total += bd.gait_score;
    if (tests.includes('chair_stand')) total += bd.chair_stand_score;
    return total;
  }
  if (bd) return bd.balance_score + bd.gait_score + bd.chair_stand_score;
  // Legacy: scores 0-4 without completed_tests are old format
  return assessment.score <= 4 && !assessment.completed_tests
    ? Math.round(assessment.score * 3)
    : assessment.score;
}

/** Max possible score for the completed tests (4 per test). */
export function computeMaxScore(assessment: Scoreable): number {
  const tests = assessment.completed_tests;
  if (tests && tests.length > 0) return tests.length * 4;
  return 12;
}
