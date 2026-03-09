/**
 * Biomechanical metric extraction from MoveNet keypoints.
 *
 * MoveNet SINGLEPOSE_LIGHTNING produces 17 keypoints:
 *   0: nose, 1: left_eye, 2: right_eye, 3: left_ear, 4: right_ear
 *   5: left_shoulder, 6: right_shoulder, 7: left_elbow, 8: right_elbow
 *   9: left_wrist, 10: right_wrist, 11: left_hip, 12: right_hip
 *   13: left_knee, 14: right_knee, 15: left_ankle, 16: right_ankle
 */

interface Point {
  x: number;
  y: number;
  score?: number;
}

// Minimum confidence to consider a keypoint valid
const MIN_SCORE = 0.3;

function isValid(kp: Point | undefined): kp is Point {
  return kp !== undefined && (kp.score ?? 0) > MIN_SCORE;
}

/** Euclidean distance between two points. */
export function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Midpoint of two points. */
export function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/**
 * Angle at point B formed by rays BA and BC, in degrees.
 * Returns 0-180 (0 = fully flexed, 180 = fully extended).
 */
export function angleBetween(a: Point, b: Point, c: Point): number {
  const ba = { x: a.x - b.x, y: a.y - b.y };
  const bc = { x: c.x - b.x, y: c.y - b.y };
  const dot = ba.x * bc.x + ba.y * bc.y;
  const magBA = Math.hypot(ba.x, ba.y);
  const magBC = Math.hypot(bc.x, bc.y);
  if (magBA === 0 || magBC === 0) return 0;
  const cosAngle = Math.max(-1, Math.min(1, dot / (magBA * magBC)));
  return (Math.acos(cosAngle) * 180) / Math.PI;
}

/**
 * Angle of line segment from A to B relative to vertical (downward Y axis).
 * 0 = perfectly vertical, 90 = horizontal.
 */
function angleFromVertical(top: Point, bottom: Point): number {
  const dx = top.x - bottom.x;
  const dy = bottom.y - top.y; // positive Y is down in screen coords
  const angle = Math.atan2(Math.abs(dx), dy);
  return (angle * 180) / Math.PI;
}

/** Metrics extracted from a single frame. */
export interface FrameMetrics {
  timestamp: number;
  leftKneeAngle: number | null;
  rightKneeAngle: number | null;
  leftHipAngle: number | null;
  rightHipAngle: number | null;
  leftElbowAngle: number | null;
  rightElbowAngle: number | null;
  trunkLean: number | null;
  shoulderLevelDiff: number | null;
  hipCenter: Point | null;
  stanceWidth: number | null;
  leftWristY: number | null;
  rightWristY: number | null;
  leftShoulderY: number | null;
  rightShoulderY: number | null;
  // Velocity metrics (require previous frame)
  hipCenterVelocity: number | null;
  kneeAngleVelocity: number | null;
  // Raw ankle positions for step detection
  leftAnklePos: Point | null;
  rightAnklePos: Point | null;
  // Hip Y for sit-to-stand detection
  bodyVerticalPosition: number | null;
}

/**
 * Extract per-frame biomechanical metrics from a set of keypoints.
 * Accepts optional prevFrame to compute velocity-based metrics.
 */
export function extractFrameMetrics(
  keypoints: Point[],
  prevFrame?: FrameMetrics | null
): FrameMetrics {
  const kp = keypoints;
  const metrics: FrameMetrics = {
    timestamp: Date.now(),
    leftKneeAngle: null,
    rightKneeAngle: null,
    leftHipAngle: null,
    rightHipAngle: null,
    leftElbowAngle: null,
    rightElbowAngle: null,
    trunkLean: null,
    shoulderLevelDiff: null,
    hipCenter: null,
    stanceWidth: null,
    leftWristY: null,
    rightWristY: null,
    leftShoulderY: null,
    rightShoulderY: null,
    hipCenterVelocity: null,
    kneeAngleVelocity: null,
    leftAnklePos: null,
    rightAnklePos: null,
    bodyVerticalPosition: null,
  };

  // Knee angles: hip → knee → ankle
  if (isValid(kp[11]) && isValid(kp[13]) && isValid(kp[15])) {
    metrics.leftKneeAngle = angleBetween(kp[11], kp[13], kp[15]);
  }
  if (isValid(kp[12]) && isValid(kp[14]) && isValid(kp[16])) {
    metrics.rightKneeAngle = angleBetween(kp[12], kp[14], kp[16]);
  }

  // Hip angles: shoulder → hip → knee
  if (isValid(kp[5]) && isValid(kp[11]) && isValid(kp[13])) {
    metrics.leftHipAngle = angleBetween(kp[5], kp[11], kp[13]);
  }
  if (isValid(kp[6]) && isValid(kp[12]) && isValid(kp[14])) {
    metrics.rightHipAngle = angleBetween(kp[6], kp[12], kp[14]);
  }

  // Elbow angles: shoulder → elbow → wrist
  if (isValid(kp[5]) && isValid(kp[7]) && isValid(kp[9])) {
    metrics.leftElbowAngle = angleBetween(kp[5], kp[7], kp[9]);
  }
  if (isValid(kp[6]) && isValid(kp[8]) && isValid(kp[10])) {
    metrics.rightElbowAngle = angleBetween(kp[6], kp[8], kp[10]);
  }

  // Trunk lean: angle of shoulder-midpoint → hip-midpoint vs vertical
  if (isValid(kp[5]) && isValid(kp[6]) && isValid(kp[11]) && isValid(kp[12])) {
    const shoulderMid = midpoint(kp[5], kp[6]);
    const hipMid = midpoint(kp[11], kp[12]);
    metrics.trunkLean = angleFromVertical(shoulderMid, hipMid);
  }

  // Shoulder levelness: absolute Y difference
  if (isValid(kp[5]) && isValid(kp[6])) {
    metrics.shoulderLevelDiff = Math.abs(kp[5].y - kp[6].y);
  }

  // Hip center
  if (isValid(kp[11]) && isValid(kp[12])) {
    metrics.hipCenter = midpoint(kp[11], kp[12]);
  }

  // Stance width: distance between ankles
  if (isValid(kp[15]) && isValid(kp[16])) {
    metrics.stanceWidth = distance(kp[15], kp[16]);
  }

  // Arm positions for swing calculation
  if (isValid(kp[9])) metrics.leftWristY = kp[9].y;
  if (isValid(kp[10])) metrics.rightWristY = kp[10].y;
  if (isValid(kp[5])) metrics.leftShoulderY = kp[5].y;
  if (isValid(kp[6])) metrics.rightShoulderY = kp[6].y;

  // Raw ankle positions for step detection
  if (isValid(kp[15])) metrics.leftAnklePos = { x: kp[15].x, y: kp[15].y };
  if (isValid(kp[16])) metrics.rightAnklePos = { x: kp[16].x, y: kp[16].y };

  // Body vertical position (hip center Y) for sit-to-stand detection
  if (metrics.hipCenter) {
    metrics.bodyVerticalPosition = metrics.hipCenter.y;
  }

  // Velocity metrics from previous frame
  if (prevFrame) {
    if (metrics.hipCenter && prevFrame.hipCenter) {
      metrics.hipCenterVelocity = distance(metrics.hipCenter, prevFrame.hipCenter);
    }
    const currentAvgKnee = avgOfNonNull([metrics.leftKneeAngle, metrics.rightKneeAngle]);
    const prevAvgKnee = avgOfNonNull([prevFrame.leftKneeAngle, prevFrame.rightKneeAngle]);
    if (currentAvgKnee !== null && prevAvgKnee !== null) {
      metrics.kneeAngleVelocity = Math.abs(currentAvgKnee - prevAvgKnee);
    }
  }

  return metrics;
}

/** Average of non-null values, returns null if all null. */
function avgOfNonNull(vals: (number | null)[]): number | null {
  const valid = vals.filter((v): v is number => v !== null);
  return valid.length > 0 ? valid.reduce((s, v) => s + v, 0) / valid.length : null;
}

/** Standard deviation of an array of numbers. */
function stdDev(arr: number[]): number {
  if (arr.length === 0) return 0;
  const mean = arr.reduce((s, v) => s + v, 0) / arr.length;
  return Math.sqrt(arr.reduce((s, v) => s + (v - mean) ** 2, 0) / arr.length);
}

/** Coefficient of variation as percentage. */
function coeffOfVariation(arr: number[]): number {
  if (arr.length === 0) return 0;
  const mean = arr.reduce((s, v) => s + v, 0) / arr.length;
  if (mean === 0) return 0;
  return (stdDev(arr) / mean) * 100;
}

/** Smooth a time series with a moving average of given window size. */
function movingAverage(arr: number[], windowSize: number): number[] {
  const result: number[] = [];
  const half = Math.floor(windowSize / 2);
  for (let i = 0; i < arr.length; i++) {
    const start = Math.max(0, i - half);
    const end = Math.min(arr.length, i + half + 1);
    let sum = 0;
    for (let j = start; j < end; j++) sum += arr[j];
    result.push(sum / (end - start));
  }
  return result;
}

/** Aggregated summary of metrics over an entire recording. */
export interface PoseMetricsSummary {
  frameCount: number;
  durationMs: number;
  kneeAngle: { avg: number; min: number; max: number; range: number };
  hipAngle: { avg: number; min: number; max: number; range: number };
  trunkLean: { avg: number; max: number };
  shoulderLevel: { avg: number; max: number };
  sway: { totalDisplacement: number; maxDeviation: number };
  stanceWidth: { avg: number; min: number; max: number };
  armSwing: { leftAmplitude: number; rightAmplitude: number; symmetry: number };
  movementPhases: number;

  // Balance-specific
  swayVelocity: number;
  swayArea: number;
  trunkLeanVariability: number;

  // Gait-specific
  estimatedGaitSpeed: number;
  stepCount: number;
  cadence: number;
  stepLengthEstimate: number;
  stepSymmetryIndex: number;
  doubleSupportRatio: number;
  gaitRhythmVariability: number;

  // Chair-stand-specific
  refinedRepCount: number;
  avgRepTime: number;
  peakTrunkLeanDuringRise: number;
  transitionSpeed: number;
  repConsistency: number;
}

function avg(arr: number[]): number {
  return arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;
}

/**
 * Aggregate an array of per-frame metrics into a summary.
 */
export function aggregateMetrics(frames: FrameMetrics[]): PoseMetricsSummary {
  const emptyResult: PoseMetricsSummary = {
    frameCount: 0,
    durationMs: 0,
    kneeAngle: { avg: 0, min: 0, max: 0, range: 0 },
    hipAngle: { avg: 0, min: 0, max: 0, range: 0 },
    trunkLean: { avg: 0, max: 0 },
    shoulderLevel: { avg: 0, max: 0 },
    sway: { totalDisplacement: 0, maxDeviation: 0 },
    stanceWidth: { avg: 0, min: 0, max: 0 },
    armSwing: { leftAmplitude: 0, rightAmplitude: 0, symmetry: 0 },
    movementPhases: 0,
    swayVelocity: 0,
    swayArea: 0,
    trunkLeanVariability: 0,
    estimatedGaitSpeed: 0,
    stepCount: 0,
    cadence: 0,
    stepLengthEstimate: 0,
    stepSymmetryIndex: 0,
    doubleSupportRatio: 0,
    gaitRhythmVariability: 0,
    refinedRepCount: 0,
    avgRepTime: 0,
    peakTrunkLeanDuringRise: 0,
    transitionSpeed: 0,
    repConsistency: 0,
  };

  if (frames.length === 0) return emptyResult;

  const durationMs = frames[frames.length - 1].timestamp - frames[0].timestamp;

  // Collect non-null values
  const kneeAngles: number[] = [];
  const hipAngles: number[] = [];
  const trunkLeans: number[] = [];
  const shoulderLevels: number[] = [];
  const stanceWidths: number[] = [];
  const hipCenters: Point[] = [];
  const leftWristYs: number[] = [];
  const rightWristYs: number[] = [];
  const hipVelocities: number[] = [];
  const kneeAngleVelocities: number[] = [];

  for (const f of frames) {
    if (f.leftKneeAngle !== null) kneeAngles.push(f.leftKneeAngle);
    if (f.rightKneeAngle !== null) kneeAngles.push(f.rightKneeAngle);
    if (f.leftHipAngle !== null) hipAngles.push(f.leftHipAngle);
    if (f.rightHipAngle !== null) hipAngles.push(f.rightHipAngle);
    if (f.trunkLean !== null) trunkLeans.push(f.trunkLean);
    if (f.shoulderLevelDiff !== null) shoulderLevels.push(f.shoulderLevelDiff);
    if (f.stanceWidth !== null) stanceWidths.push(f.stanceWidth);
    if (f.hipCenter !== null) hipCenters.push(f.hipCenter);
    if (f.leftWristY !== null) leftWristYs.push(f.leftWristY);
    if (f.rightWristY !== null) rightWristYs.push(f.rightWristY);
    if (f.hipCenterVelocity !== null) hipVelocities.push(f.hipCenterVelocity);
    if (f.kneeAngleVelocity !== null) kneeAngleVelocities.push(f.kneeAngleVelocity);
  }

  // Knee angle stats
  const kneeMin = kneeAngles.length > 0 ? Math.min(...kneeAngles) : 0;
  const kneeMax = kneeAngles.length > 0 ? Math.max(...kneeAngles) : 0;

  // Hip angle stats
  const hipMin = hipAngles.length > 0 ? Math.min(...hipAngles) : 0;
  const hipMax = hipAngles.length > 0 ? Math.max(...hipAngles) : 0;

  // Sway: total frame-to-frame displacement + max deviation from mean position
  let totalDisplacement = 0;
  let maxDeviation = 0;
  if (hipCenters.length > 1) {
    const meanX = avg(hipCenters.map((p) => p.x));
    const meanY = avg(hipCenters.map((p) => p.y));

    for (let i = 1; i < hipCenters.length; i++) {
      totalDisplacement += distance(hipCenters[i - 1], hipCenters[i]);
    }
    for (const p of hipCenters) {
      const dev = distance(p, { x: meanX, y: meanY });
      if (dev > maxDeviation) maxDeviation = dev;
    }
  }

  // Arm swing amplitude: range of wrist Y positions relative to shoulder
  const leftAmp =
    leftWristYs.length > 1 ? Math.max(...leftWristYs) - Math.min(...leftWristYs) : 0;
  const rightAmp =
    rightWristYs.length > 1 ? Math.max(...rightWristYs) - Math.min(...rightWristYs) : 0;
  const maxAmp = Math.max(leftAmp, rightAmp);
  const armSymmetry = maxAmp > 0 ? Math.min(leftAmp, rightAmp) / maxAmp : 1;

  // Movement phases: count knee-angle oscillations (flexion→extension cycles)
  let movementPhases = 0;
  if (kneeAngles.length > 4) {
    const threshold = (kneeMin + kneeMax) / 2;
    let wasBelow = kneeAngles[0] < threshold;
    for (let i = 1; i < kneeAngles.length; i++) {
      const isBelow = kneeAngles[i] < threshold;
      if (wasBelow && !isBelow) {
        movementPhases++;
      }
      wasBelow = isBelow;
    }
  }

  // ========== BALANCE-SPECIFIC METRICS ==========

  // Sway velocity: mean hip displacement per frame
  const swayVelocity = hipVelocities.length > 0 ? avg(hipVelocities) : 0;

  // Sway area: bounding box of hip center path
  let swayArea = 0;
  if (hipCenters.length > 1) {
    const xs = hipCenters.map((p) => p.x);
    const ys = hipCenters.map((p) => p.y);
    const width = Math.max(...xs) - Math.min(...xs);
    const height = Math.max(...ys) - Math.min(...ys);
    swayArea = width * height;
  }

  // Trunk lean variability: SD of trunk lean values
  const trunkLeanVariability = stdDev(trunkLeans);

  // ========== GAIT-SPECIFIC METRICS ==========

  // Estimated gait speed: horizontal hip displacement / duration
  let estimatedGaitSpeed = 0;
  if (hipCenters.length > 1 && durationMs > 0) {
    const totalHorizontalDisp = Math.abs(
      hipCenters[hipCenters.length - 1].x - hipCenters[0].x
    );
    estimatedGaitSpeed = totalHorizontalDisp / (durationMs / 1000);
  }

  // Step detection from ankle position oscillation
  const leftAnkleXs: number[] = [];
  const rightAnkleXs: number[] = [];
  const frameTimestamps: number[] = [];
  for (const f of frames) {
    if (f.leftAnklePos && f.rightAnklePos) {
      leftAnkleXs.push(f.leftAnklePos.x);
      rightAnkleXs.push(f.rightAnklePos.x);
      frameTimestamps.push(f.timestamp);
    }
  }

  let stepCount = 0;
  let cadence = 0;
  let stepLengthEstimate = 0;
  let stepSymmetryIndex = 0;
  let gaitRhythmVariability = 0;
  const stepTimestamps: number[] = [];
  const leftStepDistances: number[] = [];
  const rightStepDistances: number[] = [];

  if (leftAnkleXs.length > 6) {
    // Compute relative ankle X and smooth
    const relativeAnkleX = leftAnkleXs.map((lx, i) => lx - rightAnkleXs[i]);
    const smoothed = movingAverage(relativeAnkleX, 3);
    const meanVal = avg(smoothed);
    const MIN_STEP_GAP = 4; // minimum frames between steps

    // Detect zero crossings (around mean)
    let lastStepFrame = -MIN_STEP_GAP;
    let isLeft = true;
    for (let i = 1; i < smoothed.length; i++) {
      const prev = smoothed[i - 1] - meanVal;
      const curr = smoothed[i] - meanVal;
      if (prev * curr < 0 && i - lastStepFrame >= MIN_STEP_GAP) {
        stepCount++;
        stepTimestamps.push(frameTimestamps[i]);
        // Track per-side step distances
        const dist = Math.abs(leftAnkleXs[i] - rightAnkleXs[i]);
        if (isLeft) leftStepDistances.push(dist);
        else rightStepDistances.push(dist);
        isLeft = !isLeft;
        lastStepFrame = i;
      }
    }

    // Cadence: steps per minute
    if (stepCount > 0 && durationMs > 0) {
      cadence = (stepCount / (durationMs / 1000)) * 60;
    }

    // Step length estimate: average distance between alternating ankle positions
    const allStepDists = [...leftStepDistances, ...rightStepDistances];
    if (allStepDists.length > 0) {
      stepLengthEstimate = avg(allStepDists);
    }

    // Step symmetry: |L - R| / avg * 100
    const avgLeft = leftStepDistances.length > 0 ? avg(leftStepDistances) : 0;
    const avgRight = rightStepDistances.length > 0 ? avg(rightStepDistances) : 0;
    const avgBoth = (avgLeft + avgRight) / 2;
    if (avgBoth > 0) {
      stepSymmetryIndex = (Math.abs(avgLeft - avgRight) / avgBoth) * 100;
    }

    // Gait rhythm variability: CV of inter-step intervals
    if (stepTimestamps.length > 2) {
      const intervals: number[] = [];
      for (let i = 1; i < stepTimestamps.length; i++) {
        intervals.push(stepTimestamps[i] - stepTimestamps[i - 1]);
      }
      gaitRhythmVariability = coeffOfVariation(intervals);
    }
  }

  // Double support ratio: fraction of frames with both ankles ~stationary
  let doubleSupportRatio = 0;
  if (frames.length > 2) {
    let doubleSupportFrames = 0;
    for (let i = 1; i < frames.length; i++) {
      const curr = frames[i];
      const prev = frames[i - 1];
      if (
        curr.leftAnklePos && prev.leftAnklePos &&
        curr.rightAnklePos && prev.rightAnklePos
      ) {
        const leftVel = distance(curr.leftAnklePos, prev.leftAnklePos);
        const rightVel = distance(curr.rightAnklePos, prev.rightAnklePos);
        if (leftVel < 2 && rightVel < 2) {
          doubleSupportFrames++;
        }
      }
    }
    doubleSupportRatio = doubleSupportFrames / (frames.length - 1);
  }

  // ========== CHAIR-STAND-SPECIFIC METRICS ==========

  // Sit-to-stand rep detection from hip Y (bodyVerticalPosition)
  const hipYs: number[] = [];
  const hipYTimestamps: number[] = [];
  for (const f of frames) {
    if (f.bodyVerticalPosition !== null) {
      hipYs.push(f.bodyVerticalPosition);
      hipYTimestamps.push(f.timestamp);
    }
  }

  let refinedRepCount = 0;
  let avgRepTime = 0;
  let peakTrunkLeanDuringRise = 0;
  let transitionSpeed = 0;
  let repConsistency = 0;

  if (hipYs.length > 6) {
    const smoothedHipY = movingAverage(hipYs, 3);
    const yRange = Math.max(...smoothedHipY) - Math.min(...smoothedHipY);
    const minProminence = yRange * 0.15;

    // Find valleys (standing = low Y in screen coords) and peaks (sitting = high Y)
    const valleys: { idx: number; ts: number }[] = [];
    for (let i = 1; i < smoothedHipY.length - 1; i++) {
      if (
        smoothedHipY[i] < smoothedHipY[i - 1] &&
        smoothedHipY[i] < smoothedHipY[i + 1]
      ) {
        // Check prominence: nearest peaks on either side must be > minProminence higher
        let leftPeak = smoothedHipY[i];
        for (let j = i - 1; j >= 0; j--) {
          if (smoothedHipY[j] > leftPeak) leftPeak = smoothedHipY[j];
          else break;
        }
        let rightPeak = smoothedHipY[i];
        for (let j = i + 1; j < smoothedHipY.length; j++) {
          if (smoothedHipY[j] > rightPeak) rightPeak = smoothedHipY[j];
          else break;
        }
        const prominence = Math.min(leftPeak, rightPeak) - smoothedHipY[i];
        if (prominence >= minProminence) {
          valleys.push({ idx: i, ts: hipYTimestamps[i] });
        }
      }
    }

    // Count valley-to-valley cycles = repetitions
    refinedRepCount = Math.max(0, valleys.length - 1);

    // Per-rep durations for consistency
    if (valleys.length > 1) {
      const repDurations: number[] = [];
      for (let i = 1; i < valleys.length; i++) {
        repDurations.push(valleys[i].ts - valleys[i - 1].ts);
      }
      avgRepTime = avg(repDurations);
      repConsistency = coeffOfVariation(repDurations);
    } else if (refinedRepCount === 0 && durationMs > 0) {
      avgRepTime = 0;
    }

    // Peak trunk lean during rising phases (valley to next peak)
    const risingTrunkLeans: number[] = [];
    const risingKneeVelocities: number[] = [];
    for (const valley of valleys) {
      // Find frames during the rising phase after this valley
      for (let i = valley.idx + 1; i < smoothedHipY.length; i++) {
        if (smoothedHipY[i] > smoothedHipY[i - 1]) break; // past the rise
        if (i < frames.length && frames[i].trunkLean !== null) {
          risingTrunkLeans.push(frames[i].trunkLean!);
        }
        if (i < frames.length && frames[i].kneeAngleVelocity !== null) {
          risingKneeVelocities.push(frames[i].kneeAngleVelocity!);
        }
      }
    }
    peakTrunkLeanDuringRise =
      risingTrunkLeans.length > 0 ? Math.max(...risingTrunkLeans) : 0;
    transitionSpeed =
      risingKneeVelocities.length > 0 ? avg(risingKneeVelocities) : 0;
  }

  // Round all values to 1 decimal place
  const r = (v: number) => Math.round(v * 10) / 10;

  return {
    frameCount: frames.length,
    durationMs: Math.round(durationMs),
    kneeAngle: {
      avg: r(avg(kneeAngles)),
      min: r(kneeMin),
      max: r(kneeMax),
      range: r(kneeMax - kneeMin),
    },
    hipAngle: {
      avg: r(avg(hipAngles)),
      min: r(hipMin),
      max: r(hipMax),
      range: r(hipMax - hipMin),
    },
    trunkLean: {
      avg: r(avg(trunkLeans)),
      max: r(trunkLeans.length > 0 ? Math.max(...trunkLeans) : 0),
    },
    shoulderLevel: {
      avg: r(avg(shoulderLevels)),
      max: r(shoulderLevels.length > 0 ? Math.max(...shoulderLevels) : 0),
    },
    sway: {
      totalDisplacement: r(totalDisplacement),
      maxDeviation: r(maxDeviation),
    },
    stanceWidth: {
      avg: r(avg(stanceWidths)),
      min: r(stanceWidths.length > 0 ? Math.min(...stanceWidths) : 0),
      max: r(stanceWidths.length > 0 ? Math.max(...stanceWidths) : 0),
    },
    armSwing: {
      leftAmplitude: r(leftAmp),
      rightAmplitude: r(rightAmp),
      symmetry: r(armSymmetry),
    },
    movementPhases,
    // Balance-specific
    swayVelocity: r(swayVelocity),
    swayArea: r(swayArea),
    trunkLeanVariability: r(trunkLeanVariability),
    // Gait-specific
    estimatedGaitSpeed: r(estimatedGaitSpeed),
    stepCount,
    cadence: r(cadence),
    stepLengthEstimate: r(stepLengthEstimate),
    stepSymmetryIndex: r(stepSymmetryIndex),
    doubleSupportRatio: r(doubleSupportRatio),
    gaitRhythmVariability: r(gaitRhythmVariability),
    // Chair-stand-specific
    refinedRepCount,
    avgRepTime: r(avgRepTime),
    peakTrunkLeanDuringRise: r(peakTrunkLeanDuringRise),
    transitionSpeed: r(transitionSpeed),
    repConsistency: r(repConsistency),
  };
}
