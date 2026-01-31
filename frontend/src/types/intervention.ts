/**
 * Intervention interfaces - Agentic decision outputs
 */

export type ActionType =
  | 'suggest_walk'
  | 'suggest_balance_exercise'
  | 'suggest_strength_exercise'
  | 'suggest_stretching'
  | 'suggest_rest'
  | 'suggest_hydration'
  | 'alert_caregiver'
  | 'recommend_doctor'
  | 'emergency_alert'
  | 'encourage_activity'
  | 'celebrate_progress'
  | 'request_assessment'
  | 'continue_monitoring';

export interface InterventionAction {
  user_id: string;
  timestamp: string;
  action_type: ActionType;
  priority: number; // 1-5
  raw_message: string;
  localized_message?: string;
  trigger_reason: string;
  suggested_duration_minutes?: number;
  exercise_video_url?: string;
}
