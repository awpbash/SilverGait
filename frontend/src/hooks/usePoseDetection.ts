import { useEffect, useRef, useState, type RefObject } from 'react';
import * as poseDetection from '@tensorflow-models/pose-detection';
import { getDetector } from '../lib/poseDetectorSingleton';
import { KeypointFilterBank } from '../utils/oneEuroFilter';

export interface PoseLandmarks {
  keypoints: poseDetection.Keypoint[];
}

export interface UsePoseDetectionReturn {
  isReady: boolean;
  isDetecting: boolean;
  currentPose: PoseLandmarks | null;  // throttled state (for React consumers)
  confidence: number;                  // throttled state
  poseRef: RefObject<PoseLandmarks | null>;       // real-time ref
  confidenceRef: RefObject<number>;                // real-time ref
  error: string | null;
}

/**
 * Map confidence to tier with hysteresis to prevent jitter at boundaries.
 * Going UP requires passing the threshold + margin.
 * Going DOWN requires dropping below threshold - margin.
 */
const TIER_UP   = [0.45, 0.75]; // thresholds to promote: 0->1 needs 0.45, 1->2 needs 0.75
const TIER_DOWN = [0.35, 0.65]; // thresholds to demote:  1->0 needs <0.35, 2->1 needs <0.65

function confidenceTierWithHysteresis(value: number, currentTier: number): number {
  let tier = currentTier;
  // Check promotion
  if (tier < 2 && value >= TIER_UP[tier]) tier = tier + 1;
  // Check demotion (re-check in case we just promoted)
  if (tier > 0 && value < TIER_DOWN[tier - 1]) tier = tier - 1;
  return tier;
}

export function usePoseDetection(
  videoRef: RefObject<HTMLVideoElement | null>,
  isActive: boolean
): UsePoseDetectionReturn {
  const [isReady, setIsReady] = useState(false);
  const [isDetecting, setIsDetecting] = useState(false);
  const [currentPose, setCurrentPose] = useState<PoseLandmarks | null>(null);
  const [confidence, setConfidence] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Real-time refs — updated every frame, no re-renders
  const poseRef = useRef<PoseLandmarks | null>(null);
  const confidenceRef = useRef<number>(0);

  const detectorRef = useRef<poseDetection.PoseDetector | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const filterBankRef = useRef<KeypointFilterBank>(new KeypointFilterBank(17, 1.7, 0.01));
  const isActiveRef = useRef(isActive);

  // Keep isActive ref in sync
  isActiveRef.current = isActive;

  // Acquire the shared pre-initialized detector
  useEffect(() => {
    let disposed = false;

    getDetector()
      .then((detector) => {
        if (disposed) return;
        detectorRef.current = detector;
        setIsReady(true);
        setError(null);
      })
      .catch((err) => {
        if (!disposed) {
          console.error('\u{274C} Failed to get MoveNet detector:', err);
          setError('Failed to load pose detection.');
          setIsReady(false);
        }
      });

    return () => {
      disposed = true;
      // Don't dispose — singleton is shared across the app
      detectorRef.current = null;
    };
  }, []);

  // Detection loop - runs when isActive && isReady
  useEffect(() => {
    if (!isActive || !isReady) {
      // Stop if deactivated
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      if (isDetecting) {
        setIsDetecting(false);
        setCurrentPose(null);
        setConfidence(0);
        poseRef.current = null;
        confidenceRef.current = 0;
        filterBankRef.current.reset();
      }
      return;
    }

    // Start detection
    // Pose detection loop started
    setIsDetecting(true);

    let lastProcessTime = 0;
    let lastStateUpdateTime = 0;
    let lastConfidenceTier = -1;
    let throttleGap = 150; // adaptive: starts at 150ms (reduce React re-renders)

    const loop = async () => {
      // Check if still active
      if (!isActiveRef.current || !detectorRef.current) {
        // Pose detection stopped
        setIsDetecting(false);
        return;
      }

      const video = videoRef.current;
      const now = Date.now();

      // Process at ~15 FPS and only if video is playing
      if (video && video.readyState >= 2 && now - lastProcessTime > 66) {
        try {
          const t0 = performance.now();
          const poses = await detectorRef.current.estimatePoses(video, {
            flipHorizontal: false,
          });
          const elapsed = performance.now() - t0;

          // Adaptive throttle: slow device = less frequent state updates
          if (elapsed > 80) {
            throttleGap = 250;
          } else if (elapsed < 40) {
            throttleGap = 150;
          }

          if (poses && poses.length > 0) {
            const pose = poses[0];
            // Smooth keypoints with One-Euro Filter to kill jitter
            const smoothed = filterBankRef.current.filterKeypoints(
              pose.keypoints || [],
              0.3,
              performance.now() / 1000,
            );
            const poseData: PoseLandmarks = { keypoints: smoothed };

            const visibleKeypoints = pose.keypoints.filter(
              (kp) => kp.score && kp.score > 0.3
            );
            const avgConfidence =
              visibleKeypoints.length > 0
                ? visibleKeypoints.reduce((sum, kp) => sum + (kp.score || 0), 0) /
                  visibleKeypoints.length
                : 0;

            // Always update refs at full rate (for PoseOverlay rAF loop)
            poseRef.current = poseData;
            confidenceRef.current = avgConfidence;

            // Throttle React state updates
            if (now - lastStateUpdateTime > throttleGap) {
              setCurrentPose(poseData);
              lastStateUpdateTime = now;
            }

            // Only update confidence state when tier changes (with hysteresis)
            const tier = confidenceTierWithHysteresis(avgConfidence, lastConfidenceTier < 0 ? 0 : lastConfidenceTier);
            if (tier !== lastConfidenceTier) {
              setConfidence(avgConfidence);
              lastConfidenceTier = tier;
            }
          } else {
            poseRef.current = null;
            confidenceRef.current = 0;

            if (now - lastStateUpdateTime > throttleGap) {
              setCurrentPose(null);
              lastStateUpdateTime = now;
            }

            if (lastConfidenceTier !== 0) {
              setConfidence(0);
              lastConfidenceTier = 0;
            }
          }

          lastProcessTime = now;
        } catch (err) {
          console.error('Pose detection frame error:', err);
        }
      }

      animationFrameRef.current = requestAnimationFrame(loop);
    };

    // Start the loop
    animationFrameRef.current = requestAnimationFrame(loop);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      setIsDetecting(false);
      setCurrentPose(null);
      setConfidence(0);
      poseRef.current = null;
      confidenceRef.current = 0;
      filterBankRef.current.reset();
    };
  }, [isActive, isReady]);

  return {
    isReady,
    isDetecting,
    currentPose,
    confidence,
    poseRef,
    confidenceRef,
    error,
  };
}
