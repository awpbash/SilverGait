import { useRef, useEffect, useCallback } from 'react';
import type { PoseLandmarks } from './usePoseDetection';
import {
  extractFrameMetrics,
  aggregateMetrics,
  type FrameMetrics,
  type PoseMetricsSummary,
} from '../utils/poseMetrics';

/** Lightweight time-series for graphing (no raw keypoints, just key signals). */
export interface MetricsTimeSeries {
  /** Relative time in seconds from recording start */
  time: number[];
  /** Hip center Y (body vertical position) — lower = standing */
  hipY: (number | null)[];
  /** Average knee angle per frame */
  kneeAngle: (number | null)[];
  /** Trunk lean per frame */
  trunkLean: (number | null)[];
  /** Hip center X — for sway / gait tracking */
  hipX: (number | null)[];
}

/**
 * Collects per-frame pose metrics during recording and produces
 * an aggregated summary + plottable time series when recording stops.
 */
export function usePoseMetrics(
  pose: PoseLandmarks | null,
  isRecording: boolean
): {
  summaryRef: React.RefObject<PoseMetricsSummary | null>;
  timeSeriesRef: React.RefObject<MetricsTimeSeries | null>;
  /** Force-build time series from collected frames (call before reading refs) */
  flush: () => void;
} {
  const framesRef = useRef<FrameMetrics[]>([]);
  const summaryRef = useRef<PoseMetricsSummary | null>(null);
  const timeSeriesRef = useRef<MetricsTimeSeries | null>(null);
  const wasRecordingRef = useRef(false);
  const startTimeRef = useRef<number>(0);

  /** Build summary + time series from collected frames */
  const buildFromFrames = useCallback(() => {
    if (framesRef.current.length === 0) return;
    // Don't rebuild if already built for the same data
    if (summaryRef.current && timeSeriesRef.current) return;

    summaryRef.current = aggregateMetrics(framesRef.current);

    const startTs = framesRef.current[0].timestamp;
    const ts: MetricsTimeSeries = {
      time: [],
      hipY: [],
      kneeAngle: [],
      trunkLean: [],
      hipX: [],
    };
    for (const f of framesRef.current) {
      ts.time.push(Math.round((f.timestamp - startTs) / 100) / 10);
      ts.hipY.push(f.bodyVerticalPosition);
      ts.kneeAngle.push(
        f.leftKneeAngle !== null && f.rightKneeAngle !== null
          ? Math.round(((f.leftKneeAngle + f.rightKneeAngle) / 2) * 10) / 10
          : f.leftKneeAngle ?? f.rightKneeAngle
      );
      ts.trunkLean.push(f.trunkLean);
      ts.hipX.push(f.hipCenter?.x ?? null);
    }
    timeSeriesRef.current = ts;

    console.log(
      `Pose metrics: ${framesRef.current.length} frames collected`,
      summaryRef.current
    );
  }, []);

  /** Imperatively flush: build time series from whatever frames we have */
  const flush = useCallback(() => {
    // Reset built state so buildFromFrames will run
    summaryRef.current = null;
    timeSeriesRef.current = null;
    buildFromFrames();
  }, [buildFromFrames]);

  // Collect frames while recording
  useEffect(() => {
    if (isRecording && pose && pose.keypoints.length > 0) {
      if (framesRef.current.length === 0) {
        startTimeRef.current = Date.now();
      }
      const prevFrame = framesRef.current.length > 0
        ? framesRef.current[framesRef.current.length - 1]
        : null;
      const metrics = extractFrameMetrics(pose.keypoints, prevFrame);
      framesRef.current.push(metrics);
    }
  }, [pose, isRecording]);

  // When recording stops, aggregate and build time series
  useEffect(() => {
    if (wasRecordingRef.current && !isRecording) {
      buildFromFrames();
      framesRef.current = [];
    }

    if (!wasRecordingRef.current && isRecording) {
      framesRef.current = [];
      summaryRef.current = null;
      timeSeriesRef.current = null;
    }

    wasRecordingRef.current = isRecording;
  }, [isRecording, buildFromFrames]);

  return { summaryRef, timeSeriesRef, flush };
}
