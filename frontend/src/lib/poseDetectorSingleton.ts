/**
 * Singleton MoveNet detector — starts loading on first import.
 * By the time the user navigates to Assessment/Exercises, the model
 * is already warm (shaders compiled, weights on GPU).
 */
import * as tf from '@tensorflow/tfjs-core';
import '@tensorflow/tfjs-backend-webgl';
import * as poseDetection from '@tensorflow-models/pose-detection';

let detectorPromise: Promise<poseDetection.PoseDetector> | null = null;

async function initDetector(): Promise<poseDetection.PoseDetector> {
  await tf.setBackend('webgl');
  await tf.ready();

  const detector = await poseDetection.createDetector(
    poseDetection.SupportedModels.MoveNet,
    { modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING },
  );

  // Warm-up inference — compiles WebGL shaders so first real frame is fast
  const dummy = document.createElement('canvas');
  dummy.width = 1;
  dummy.height = 1;
  await detector.estimatePoses(dummy);

  return detector;
}

/**
 * Returns a promise that resolves to the shared detector.
 * The first call triggers init; subsequent calls return the same promise.
 * On failure, resets so the next call retries.
 */
export function getDetector(): Promise<poseDetection.PoseDetector> {
  if (!detectorPromise) {
    detectorPromise = initDetector().catch((err) => {
      // Reset so next call retries instead of returning a permanently rejected promise
      detectorPromise = null;
      throw err;
    });
  }
  return detectorPromise;
}

// Start loading immediately on import
getDetector();
