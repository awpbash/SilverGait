export interface SafetyQuestion {
  id: string;
  text: string;
  recommendation: string;
}

export interface SafetyRoom {
  id: string;
  name: string;
  icon: string;
  questions: SafetyQuestion[];
}
