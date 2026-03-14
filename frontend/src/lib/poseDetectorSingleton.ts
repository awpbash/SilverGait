/**
 * Singleton MoveNet detector — starts loading on first import.
 * By the time the user navigates to Assessment/Exercises, the model
 * is already warm (shaders compiled, weights on GPU).
 */
import * as tf from '@tensorflow/tfjs-core';
import '@tensorflow/tfjs-backend-webgl';
import * as poseDetection from '@tensorflow-models/pose-detection';

let detectorPromise: Promise<poseDetection.PoseDetector> | null = null;

function initDetector(): Promise<poseDetection.PoseDetector> {
  return (async () => {
    console.log('\u{1F504} [singleton] Initializing TensorFlow.js backend...');
    await tf.setBackend('webgl');
    await tf.ready();
    console.log('\u{2705} [singleton] TensorFlow.js backend ready:', tf.getBackend());

    console.log('\u{1F504} [singleton] Loading MoveNet model...');
    const detector = await poseDetection.createDetector(
      poseDetection.SupportedModels.MoveNet,
      { modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING },
    );

    // Warm-up inference — compiles WebGL shaders so first real frame is fast
    console.log('\u{1F504} [singleton] Running warm-up inference...');
    const dummy = document.createElement('canvas');
    dummy.width = 1;
    dummy.height = 1;
    await detector.estimatePoses(dummy);
    console.log('\u{2705} [singleton] MoveNet ready and warm');

    return detector;
  })();
}

/**
 * Returns a promise that resolves to the shared detector.
 * The first call triggers init; subsequent calls return the same promise.
 */
export function getDetector(): Promise<poseDetection.PoseDetector> {
  if (!detectorPromise) {
    detectorPromise = initDetector();
  }
  return detectorPromise;
}

// Start loading immediately on import
getDetector();
