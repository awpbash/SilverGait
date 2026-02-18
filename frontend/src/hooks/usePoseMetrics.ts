import { useRef, useEffect } from 'react';
import type { PoseLandmarks } from './usePoseDetection';
import {
  extractFrameMetrics,
  aggregateMetrics,
  type FrameMetrics,
  type PoseMetricsSummary,
} from '../utils/poseMetrics';

/**
 * Collects per-frame pose metrics during recording and produces
 * an aggregated summary when recording stops.
 */
export function usePoseMetrics(
  pose: PoseLandmarks | null,
  isRecording: boolean
): { summaryRef: React.RefObject<PoseMetricsSummary | null> } {
  const framesRef = useRef<FrameMetrics[]>([]);
  const summaryRef = useRef<PoseMetricsSummary | null>(null);
  const wasRecordingRef = useRef(false);

  // Collect frames while recording
  useEffect(() => {
    if (isRecording && pose && pose.keypoints.length > 0) {
      const metrics = extractFrameMetrics(pose.keypoints);
      framesRef.current.push(metrics);
    }
  }, [pose, isRecording]);

  // When recording stops, aggregate and store summary
  useEffect(() => {
    if (wasRecordingRef.current && !isRecording) {
      // Recording just stopped — aggregate collected frames
      if (framesRef.current.length > 0) {
        summaryRef.current = aggregateMetrics(framesRef.current);
        console.log(
          `📊 Pose metrics: ${framesRef.current.length} frames collected`,
          summaryRef.current
        );
      }
      framesRef.current = [];
    }

    if (!wasRecordingRef.current && isRecording) {
      // Recording just started — reset
      framesRef.current = [];
      summaryRef.current = null;
    }

    wasRecordingRef.current = isRecording;
  }, [isRecording]);

  return { summaryRef };
}
