export interface Challenge {
  id: string;
  title: string;
  description: string;
  icon: string;
  targetType: 'steps' | 'exercises' | 'assessments' | 'chair_stands';
  targetValue: number;
  unit: string;
  participants: number;
}
