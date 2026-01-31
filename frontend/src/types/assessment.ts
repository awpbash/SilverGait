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
  | 'hesitation';

export interface SPPBScore {
  balance_score: number;
  gait_score: number;
  chair_stand_score: number;
}

export interface AssessmentResult {
  user_id: string;
  timestamp: string;
  score: number; // 0-4
  issues: GaitIssue[];
  sppb_breakdown?: SPPBScore;
  confidence: number;
  recommendations: string[];
  video_duration_seconds?: number;
}
