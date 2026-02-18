import { useEffect, useRef, useState, type RefObject } from 'react';
import * as tf from '@tensorflow/tfjs-core';
import '@tensorflow/tfjs-backend-webgl';
import * as poseDetection from '@tensorflow-models/pose-detection';

export interface PoseLandmarks {
  keypoints: poseDetection.Keypoint[];
}

export interface UsePoseDetectionReturn {
  isReady: boolean;
  isDetecting: boolean;
  currentPose: PoseLandmarks | null;
  confidence: number;
  error: string | null;
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

  const detectorRef = useRef<poseDetection.PoseDetector | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const isActiveRef = useRef(isActive);

  // Keep isActive ref in sync
  isActiveRef.current = isActive;

  // Initialize TensorFlow.js MoveNet (once on mount)
  useEffect(() => {
    let disposed = false;

    const initPose = async () => {
      try {
        console.log('🔄 Initializing TensorFlow.js backend...');
        await tf.setBackend('webgl');
        await tf.ready();
        console.log('✅ TensorFlow.js backend ready:', tf.getBackend());

        if (disposed) return;

        console.log('🔄 Loading MoveNet model...');
        const model = poseDetection.SupportedModels.MoveNet;
        const detector = await poseDetection.createDetector(model, {
          modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING,
        });

        if (disposed) {
          detector.dispose();
          return;
        }

        detectorRef.current = detector;
        setIsReady(true);
        setError(null);
        console.log('✅ TensorFlow.js MoveNet initialized successfully');
      } catch (err) {
        if (!disposed) {
          console.error('❌ Failed to initialize MoveNet:', err);
          setError('Failed to load pose detection.');
          setIsReady(false);
        }
      }
    };

    initPose();

    return () => {
      disposed = true;
      if (detectorRef.current) {
        detectorRef.current.dispose();
        detectorRef.current = null;
      }
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
      }
      return;
    }

    // Start detection
    console.log('🎥 Starting pose detection loop');
    setIsDetecting(true);

    let lastProcessTime = 0;

    const loop = async () => {
      // Check if still active
      if (!isActiveRef.current || !detectorRef.current) {
        console.log('⏹️ Pose detection stopped');
        setIsDetecting(false);
        return;
      }

      const video = videoRef.current;
      const now = Date.now();

      // Process at ~15 FPS and only if video is playing
      if (video && video.readyState >= 2 && now - lastProcessTime > 66) {
        try {
          const poses = await detectorRef.current.estimatePoses(video, {
            flipHorizontal: false,
          });

          if (poses && poses.length > 0) {
            const pose = poses[0];
            setCurrentPose({ keypoints: pose.keypoints || [] });

            const visibleKeypoints = pose.keypoints.filter(
              (kp) => kp.score && kp.score > 0.3
            );
            const avgConfidence =
              visibleKeypoints.length > 0
                ? visibleKeypoints.reduce((sum, kp) => sum + (kp.score || 0), 0) /
                  visibleKeypoints.length
                : 0;
            setConfidence(avgConfidence);
          } else {
            setCurrentPose(null);
            setConfidence(0);
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
    };
  }, [isActive, isReady]);

  return {
    isReady,
    isDetecting,
    currentPose,
    confidence,
    error,
  };
}
