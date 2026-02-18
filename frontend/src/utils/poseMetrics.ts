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
}

/**
 * Extract per-frame biomechanical metrics from a set of keypoints.
 */
export function extractFrameMetrics(keypoints: Point[]): FrameMetrics {
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

  return metrics;
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
}

function avg(arr: number[]): number {
  return arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;
}

/**
 * Aggregate an array of per-frame metrics into a summary.
 */
export function aggregateMetrics(frames: FrameMetrics[]): PoseMetricsSummary {
  if (frames.length === 0) {
    return {
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
    };
  }

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
  // A cycle = knee angle drops below threshold then rises above it
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
  };
}
