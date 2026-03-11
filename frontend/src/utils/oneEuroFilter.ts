/**
 * One-Euro Filter — adaptive low-pass filter for noisy pose keypoints.
 *
 * Key insight: when you're still, smooth aggressively (kill jitter).
 * When you move fast, smooth lightly (preserve responsiveness).
 *
 * Parameters:
 *   minCutoff: minimum cutoff frequency (Hz). Lower = more smoothing when still. Default 1.0
 *   beta: speed coefficient. Higher = less lag during fast movement. Default 0.007
 *   dCutoff: cutoff for derivative estimation. Default 1.0
 *
 * Reference: Casiez et al. "1€ Filter: A Simple Speed-based Low-pass Filter
 * for Noisy Input in Interactive Systems" (CHI 2012)
 */

class LowPassFilter {
  private y: number | null = null;
  private s: number | null = null;

  alpha(cutoff: number, dt: number): number {
    const tau = 1.0 / (2 * Math.PI * cutoff);
    return 1.0 / (1.0 + tau / dt);
  }

  filter(value: number, dt: number, cutoff: number): number {
    const a = this.alpha(cutoff, dt);
    if (this.y === null || this.s === null) {
      this.y = value;
      this.s = value;
    } else {
      this.s = a * value + (1 - a) * this.s;
      this.y = this.s;
    }
    return this.y;
  }

  reset() {
    this.y = null;
    this.s = null;
  }
}

export class OneEuroFilter {
  private minCutoff: number;
  private beta: number;
  private dCutoff: number;
  private xFilter = new LowPassFilter();
  private dxFilter = new LowPassFilter();
  private lastTime: number | null = null;
  private lastValue: number | null = null;

  constructor(minCutoff = 1.0, beta = 0.007, dCutoff = 1.0) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
  }

  filter(value: number, timestamp?: number): number {
    const now = timestamp ?? performance.now() / 1000;
    const dt = this.lastTime !== null ? Math.max(now - this.lastTime, 1e-6) : 1 / 15;
    this.lastTime = now;

    // Estimate speed (derivative)
    const dx = this.lastValue !== null ? (value - this.lastValue) / dt : 0;
    this.lastValue = value;

    // Smooth the derivative
    const edx = this.dxFilter.filter(dx, dt, this.dCutoff);

    // Adaptive cutoff: faster movement → higher cutoff → less smoothing
    const cutoff = this.minCutoff + this.beta * Math.abs(edx);

    return this.xFilter.filter(value, dt, cutoff);
  }

  reset() {
    this.xFilter.reset();
    this.dxFilter.reset();
    this.lastTime = null;
    this.lastValue = null;
  }
}

/**
 * Filter bank for all 17 MoveNet keypoints (x and y each).
 * Call filterKeypoints() every frame to get smoothed positions.
 */
export class KeypointFilterBank {
  private filters: { x: OneEuroFilter; y: OneEuroFilter }[];

  constructor(numKeypoints = 17, minCutoff = 1.7, beta = 0.01) {
    this.filters = Array.from({ length: numKeypoints }, () => ({
      x: new OneEuroFilter(minCutoff, beta),
      y: new OneEuroFilter(minCutoff, beta),
    }));
  }

  /**
   * Filter all keypoints. Low-confidence keypoints are passed through
   * without updating the filter state (avoids poisoning with bad data).
   */
  filterKeypoints<T extends { x: number; y: number; score?: number }>(
    keypoints: T[],
    minScore = 0.3,
    timestamp?: number,
  ): T[] {
    return keypoints.map((kp, i) => {
      if (i >= this.filters.length) return kp;
      if ((kp.score ?? 0) < minScore) return kp; // don't smooth bad data

      const f = this.filters[i];
      return {
        ...kp,
        x: f.x.filter(kp.x, timestamp),
        y: f.y.filter(kp.y, timestamp),
      };
    });
  }

  reset() {
    for (const f of this.filters) {
      f.x.reset();
      f.y.reset();
    }
  }
}
