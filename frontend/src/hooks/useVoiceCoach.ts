import { useState, useEffect, useRef } from 'react';
import { useUserStore } from '../stores';

type AssessmentTestId = 'balance' | 'gait' | 'chair_stand';

interface VoiceCoachConfig {
  testType: AssessmentTestId;
  isActive: boolean;
  kneeAngle: number | null;
  trunkLean: number | null;
  swayDeviation: number | null;
  movementPhases: number;
}

interface CueRule {
  condition: (c: VoiceCoachConfig) => boolean;
  text: string;
  id: string;
}

const CUES: Record<AssessmentTestId, CueRule[]> = {
  chair_stand: [
    { id: 'stand-up', condition: (c) => c.kneeAngle !== null && c.kneeAngle > 150, text: 'Good, you are standing!' },
    { id: 'sit-down', condition: (c) => c.kneeAngle !== null && c.kneeAngle < 100, text: 'Sit down slowly.' },
    { id: 'trunk-lean', condition: (c) => c.trunkLean !== null && c.trunkLean > 30, text: 'Keep your back straighter.' },
    { id: 'phase-count', condition: (c) => c.movementPhases > 0 && c.movementPhases % 2 === 0, text: 'Great rep! Keep going.' },
  ],
  balance: [
    { id: 'steady', condition: (c) => c.swayDeviation !== null && c.swayDeviation < 10, text: 'Hold steady, doing great!' },
    { id: 'sway-warn', condition: (c) => c.swayDeviation !== null && c.swayDeviation > 25, text: 'Focus on a point ahead of you.' },
    { id: 'trunk-good', condition: (c) => c.trunkLean !== null && c.trunkLean < 5, text: 'Perfect posture!' },
  ],
  gait: [
    { id: 'moving', condition: (c) => c.movementPhases > 0, text: 'Good pace, keep walking.' },
    { id: 'trunk-walk', condition: (c) => c.trunkLean !== null && c.trunkLean > 20, text: 'Try to stand taller.' },
    { id: 'steady-walk', condition: (c) => c.kneeAngle !== null && c.kneeAngle > 140, text: 'Nice stride!' },
  ],
};

// Minimum seconds between cues
const MIN_CUE_INTERVAL_MS = 4000;

export function useVoiceCoach(config: VoiceCoachConfig): {
  currentCue: string | null;
  isCoaching: boolean;
} {
  const [currentCue, setCurrentCue] = useState<string | null>(null);
  const isPlayingRef = useRef(false);
  const lastCueTimeRef = useRef(0);
  const lastCueIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!config.isActive) {
      setCurrentCue(null);
      return;
    }

    const now = Date.now();
    if (now - lastCueTimeRef.current < MIN_CUE_INTERVAL_MS) return;
    if (isPlayingRef.current) return;

    const testCues = CUES[config.testType] || [];
    for (const cue of testCues) {
      // Don't repeat the same cue consecutively
      if (cue.id === lastCueIdRef.current) continue;

      if (cue.condition(config)) {
        lastCueTimeRef.current = now;
        lastCueIdRef.current = cue.id;
        isPlayingRef.current = true;
        setCurrentCue(cue.text);

        // Try TTS, fall back to just showing text
        const { userId, voiceId } = useUserStore.getState();
        const ttsBody = new FormData();
        ttsBody.append('text', cue.text);
        if (userId) ttsBody.append('user_id', userId);
        if (voiceId) ttsBody.append('voice_id', voiceId);
        fetch('/api/voice/tts-stream', {
          method: 'POST',
          body: ttsBody,
        })
          .then((res) => {
            if (!res.ok) throw new Error('TTS failed');
            return res.blob();
          })
          .then((blob) => {
            const url = URL.createObjectURL(blob);
            const audio = new Audio(url);
            audio.onended = () => {
              URL.revokeObjectURL(url);
              isPlayingRef.current = false;
              setCurrentCue(null);
            };
            audio.onerror = () => {
              URL.revokeObjectURL(url);
              isPlayingRef.current = false;
              setCurrentCue(null);
            };
            audio.play().catch(() => {
              isPlayingRef.current = false;
              setCurrentCue(null);
            });
          })
          .catch(() => {
            // No TTS — just show text briefly
            setTimeout(() => {
              isPlayingRef.current = false;
              setCurrentCue(null);
            }, 2500);
          });

        break;
      }
    }
  }, [config.isActive, config.testType, config.kneeAngle, config.trunkLean, config.swayDeviation, config.movementPhases]);

  // Reset on deactivation
  useEffect(() => {
    if (!config.isActive) {
      isPlayingRef.current = false;
      lastCueTimeRef.current = 0;
      lastCueIdRef.current = null;
    }
  }, [config.isActive]);

  return { currentCue, isCoaching: config.isActive };
}
