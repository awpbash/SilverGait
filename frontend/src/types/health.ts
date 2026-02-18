/**
 * Health metrics interfaces - HPB Wearable data
 * Strict TypeScript as per CLAUDE.md
 */

export type RiskLevel = 'robust' | 'pre_frail' | 'frail';

export interface HealthMetrics {
  user_id: string;
  timestamp: string;
  mvpa_minutes: number;
  steps: number;
  heart_rate_variability?: number;
  resting_heart_rate?: number;
  mvpa_week_avg?: number;
  mvpa_change_percent?: number;
}

export interface UserRiskProfile {
  user_id: string;
  risk_level: RiskLevel;
  sppb_score?: number;
  last_assessment_date?: string;
  caregiver_contact?: string;
  preferred_language: 'en' | 'hokkien' | 'cantonese' | 'mandarin' | 'singlish' | 'malay';
}

export interface WeeklyTrend {
  this_week_avg: number;
  last_week_avg: number;
  change_percent: number;
  deconditioning_alert: boolean;
}
