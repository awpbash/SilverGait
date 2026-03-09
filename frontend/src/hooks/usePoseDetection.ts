import { useEffect, useRef, useState, type RefObject } from 'react';
import * as poseDetection from '@tensorflow-models/pose-detection';
import { getDetector } from '../lib/poseDetectorSingleton';

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

/** Map confidence value to a tier: 0 = low, 1 = medium, 2 = high */
function confidenceTier(value: number): number {
  if (value >= 0.7) return 2;
  if (value >= 0.4) return 1;
  return 0;
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
      }
      return;
    }

    // Start detection
    console.log('\u{1F3A5} Starting pose detection loop');
    setIsDetecting(true);

    let lastProcessTime = 0;
    let lastStateUpdateTime = 0;
    let lastConfidenceTier = -1;
    let throttleGap = 150; // adaptive: starts at 150ms (reduce React re-renders)

    const loop = async () => {
      // Check if still active
      if (!isActiveRef.current || !detectorRef.current) {
        console.log('\u{23F9}\u{FE0F} Pose detection stopped');
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
            const poseData: PoseLandmarks = { keypoints: pose.keypoints || [] };

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

            // Only update confidence state when tier changes
            const tier = confidenceTier(avgConfidence);
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

            const tier = confidenceTier(0);
            if (tier !== lastConfidenceTier) {
              setConfidence(0);
              lastConfidenceTier = tier;
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
