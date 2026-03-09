/**
 * Assessment interfaces - Gemini Vision SPPB analysis
 * Strict TypeScript as per CLAUDE.md
 */

export type GaitIssue =
  | 'shuffling'
  | 'sway'
  | 'asymmetry'
  | 'slow_speed'
  | 'unsteady_turns'
  | 'reduced_arm_swing'
  | 'wide_base'
  | 'hesitation'
  | 'irregular_rhythm'
  | 'excessive_trunk_lean'
  | 'poor_sit_to_stand';

export interface SPPBScore {
  balance_score: number;
  gait_score: number;
  chair_stand_score: number;
}

export interface AssessmentResult {
  user_id: string;
  timestamp: string;
  score: number; // 0-12 for comprehensive, 0-4 for individual
  issues: GaitIssue[];
  test_type?: 'gait' | 'balance' | 'chair_stand';
  completed_tests?: Array<'gait' | 'balance' | 'chair_stand'>;
  sppb_breakdown?: SPPBScore;
  confidence: number;
  recommendations: string[];
  video_duration_seconds?: number;
  low_confidence_warning?: string;
}
