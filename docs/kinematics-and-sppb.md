# SilverGait: Kinematics Pipeline & SPPB Assessment

How SilverGait approximates clinical SPPB scoring using smartphone-based 2D pose estimation, the design rationale behind each metric, and the research that validates it.

---

## 1. System Architecture

SilverGait uses two parallel analysis systems for each SPPB test:

| System | Role | Strengths | Weaknesses |
|--------|------|-----------|------------|
| **MoveNet** (frontend, real-time) | 17 body keypoints at ~15 FPS, computes biomechanical metrics | Quantitative, frame-level precision, reproducible | Pixel-space only, 2D projection, noisy |
| **Gemini Vision** (backend, post-hoc) | Watches the full video, scores holistically | Context-aware, detects qualitative issues, robust to angle | Non-deterministic, no frame-level data |

MoveNet metrics are appended to the Gemini prompt as a structured supplement with clinical reference ranges and auto-generated flags. Gemini cross-references its visual assessment with the quantitative data.

### Data Flow

```
Camera (15 FPS)
  -> MoveNet (17 keypoints per frame)
    -> Per-frame FrameMetrics (angles, positions, velocities)
      -> aggregateMetrics() on recording stop
        -> PoseMetricsSummary (~30 scalar values)
          -> Appended to Gemini prompt alongside video
            -> Gemini returns: score (0-4), issues, confidence, recommendations
```

### MoveNet Keypoint Map

```
 0: nose
 1: left_eye       2: right_eye
 3: left_ear        4: right_ear
 5: left_shoulder   6: right_shoulder
 7: left_elbow      8: right_elbow
 9: left_wrist     10: right_wrist
11: left_hip       12: right_hip
13: left_knee      14: right_knee
15: left_ankle     16: right_ankle
```

17 keypoints, 2D pixel-space, confidence 0-1 per keypoint. Threshold: 0.3.

---

## 2. Design Rationale

### Why Derived Metrics, Not Raw Coordinates

Storing all 17 keypoints (x, y, confidence) at 15 FPS over 20 seconds = 15,300 values. Instead, we compute ~16 clinically meaningful features per frame and discard coordinates immediately.

| Problem with raw coordinates | How derived metrics solve it |
|------------------------------|------------------------------|
| Camera distance changes pixel values | Joint angles are view-invariant in the sagittal plane |
| MoveNet jitters several pixels frame-to-frame | Temporal aggregation (mean, CV) filters noise |
| 15K values bloat the Gemini prompt | ~30 scalar summary leaves context for video analysis |

### Joint Angle Computation

All angles use the three-point dot-product formula:

```
angle_at_B = arccos( (BA . BC) / (|BA| * |BC|) )
```

Returns 0-180 degrees. View-invariant, numerically stable (cosine clamped to [-1, 1]), no reference frame needed.

| Angle | Keypoints | Clinical Relevance |
|-------|-----------|-------------------|
| Knee (hip-knee-ankle) | 11-13-15 / 12-14-16 | Sit-to-stand ability, gait phase, lower extremity function |
| Hip (shoulder-hip-knee) | 5-11-13 / 6-12-14 | Trunk-to-thigh flexion during sit-to-stand |
| Elbow (shoulder-elbow-wrist) | 5-7-9 / 6-8-10 | Exercise form assessment (e.g., wall push-ups) |

Left and right computed independently, then averaged. This handles partial occlusion and enables asymmetry detection.

### Hip Center as Body Proxy

The midpoint of left and right hip keypoints serves as center-of-mass proxy for:
- **Sway analysis**: Total displacement, max deviation, sway velocity, sway area
- **Vertical tracking**: Hip Y traces sit-to-stand rep pattern
- **Horizontal tracking**: Hip X tracks lateral movement during gait

Hip center is preferred over nose (affected by head turns) or shoulder midpoint (affected by arm movement).

### Trunk Lean

Angle between the shoulder-midpoint-to-hip-midpoint line and the vertical axis, via `atan2(|dx|, dy)`. Measures lean relative to gravity, not relative to thigh angle. Variability (SD over time) captures instability.

### Confidence Threshold (0.3)

Intentionally low because MoveNet Lightning is optimized for speed over accuracy, and temporal aggregation smooths noisy individual readings. Consistent with thresholds used by Ung et al. (2022) and Ali et al. (2024).

---

## 3. SPPB Test Algorithms

### Test 1: Balance (12 seconds)

**Goal**: Can the person stand still with feet together for ~10 seconds without excessive sway?

**Metrics extracted**:

| Metric | Computation | Reference Range |
|--------|-------------|-----------------|
| Sway velocity | Mean frame-to-frame hip center displacement | Healthy: <2.0 px/frame |
| Sway area | Bounding box of hip center path | Lower = better |
| Max sway deviation | Max distance from mean hip center | -- |
| Trunk lean avg/max | `angleFromVertical(shoulderMid, hipMid)` | Healthy: <5 avg, <10 max |
| Trunk lean variability | SD of trunk lean across all frames | Healthy: <3.0, At-risk: >4.0 |
| Stance width | `distance(leftAnkle, rightAnkle)` | Wider = less stable |

**Clinical flags**: High sway velocity (>3.0), high trunk lean variability (>4.0 SD), excessive trunk lean (>15 max).

**MoveNet detects**: Body sway magnitude/velocity, trunk lean consistency, shoulder tilt, stance width changes.
**Gemini fills in**: Stepping, grabbing support, arm recovery movements, fear/hesitation.

**Scoring**:

| Score | Criteria |
|-------|----------|
| 4 | Steady throughout, minimal sway, trunk lean <5 |
| 3 | Minor sway but maintains position, trunk lean variability <4 |
| 2 | Noticeable wobble, needs adjustment, trunk lean >10 at times |
| 1 | Unable to hold position, steps or grabs support |
| 0 | Unable to attempt safely |

---

### Test 2: Gait / Walking (15 seconds)

**Goal**: Can the person walk at a normal pace with a smooth, symmetric gait pattern?

**Step detection algorithm**:
1. Compute `relativeAnkleX = leftAnkle.x - rightAnkle.x` per frame
2. Smooth with 3-frame moving average
3. Detect zero-crossings around the mean (each crossing = one step)
4. Enforce minimum 4-frame gap between steps to prevent noise

**Metrics extracted**:

| Metric | Computation | Reference Range |
|--------|-------------|-----------------|
| Step count | Zero-crossings of smoothed ankle separation | -- |
| Cadence | `(stepCount / durationSec) * 60` | Healthy: 100-120 steps/min |
| Step symmetry index | `abs(avgLeft - avgRight) / avgBoth * 100%` | <20% = normal |
| Double support ratio | Fraction of frames where both ankles move <2px | Healthy: <0.3 |
| Gait rhythm variability | CV of inter-step intervals | Healthy: <8%, At-risk: >10% |
| Arm swing symmetry | Range of wrist Y positions, min/max ratio | Near 1.0 = normal |
| Knee angle range | max - min across all frames | Healthy: 60-70 range |

**Clinical flags**: Asymmetric gait (>20%), irregular rhythm (CV >10%), low cadence (<80), high double support (>40%).

**Key limitation**: Step detection requires lateral camera view. Person walking toward/away from camera produces near-zero ankle X separation.

**Scoring**:

| Score | Criteria |
|-------|----------|
| 4 | Smooth confident walking, 100-120 cadence |
| 3 | Minor issues (slight asymmetry or reduced arm swing) |
| 2 | Noticeable difficulties (irregular rhythm, wide base, <80 cadence) |
| 1 | Significant issues (shuffling, high double support, very slow) |
| 0 | Unable to complete or severe impairment |

---

### Test 3: Chair Stand (20 seconds)

**Goal**: Can the person stand up and sit down 5 times without hands, and how consistent are they?

**Rep detection algorithm**:
1. Record `hipCenter.y` per frame (screen coords: lower Y = standing)
2. Smooth with 3-frame moving average
3. Compute prominence threshold = 15% of Y range
4. Find valleys (standing positions) with sufficient prominence
5. Rep count = number of valleys - 1

**Why valleys = standing**: In screen coordinates, Y increases downward. Standing moves hip up on screen = lower Y = valley.

**Why prominence-based, not threshold-based**: Fixed thresholds fail because camera distance, chair height, and user height all change absolute Y values. Prominence detection is self-calibrating.

**Metrics extracted**:

| Metric | Computation | Reference Range |
|--------|-------------|-----------------|
| Rep count | Valley detection in hip Y signal | Target: 5 |
| Avg rep time | Mean valley-to-valley interval | SPPB: <2240ms=4, <2720ms=3 |
| Total duration | Last - first frame timestamp | SPPB: <11.2s=4, <13.7s=3, <16.7s=2 |
| Peak trunk lean during rise | Max trunk lean between valley and next peak | Healthy: <15, Compensatory: >25 |
| Rep consistency | CV of rep durations | Healthy: <15%, Fatiguing: >25% |
| Transition speed | Mean knee angle velocity during rising | Higher = stronger |

**Clinical flags**: Excessive forward lean (>25), inconsistent rep timing (CV >25%), low rep count (<5).

**Scoring**:

| Score | Time for 5 reps | Criteria |
|-------|-----------------|----------|
| 4 | <11.2s | Smooth, without hands, consistent |
| 3 | 11.2-13.6s | Minor slowness, low trunk lean |
| 2 | 13.7-16.6s | Needs arms, or inconsistent |
| 1 | >16.7s | Very slow, incomplete, excessive lean |
| 0 | -- | Unable to stand without assistance |

---

### Combined SPPB Score

| Total (0-12) | Category | Interpretation |
|-------------|----------|----------------|
| 10-12 | Robust | Good mobility, low fall risk |
| 7-9 | Pre-frail | Some decline, intervention beneficial |
| 0-6 | Frail | Significant impairment, high fall risk |

---

## 4. Aggregation Strategy

The final `PoseMetricsSummary` contains ~30 scalar values. We chose statistical summaries over full time series because:

1. **Gemini context efficiency**: Compact summary (~200 tokens) vs thousands of tokens for 300 frames of raw data
2. **Complementary, not redundant**: Gemini already sees the video; metrics provide quantified features hard to estimate visually (exact angles, variability coefficients, symmetry indices)
3. **Interpretability**: Clinicians understand "avg knee angle: 142, trunk lean CV: 8.3" better than a 300-element array

| Statistic | Used For | Rationale |
|-----------|----------|-----------|
| Mean | Angles, sway velocity, trunk lean | Central tendency |
| Min/Max | Angles, stance width | Range of motion |
| Range | Knee/hip angle | ROM in a single number |
| SD | Trunk lean variability | Instability measure |
| CV | Rep duration, gait rhythm | Consistency (normalized for speed) |
| Count | Steps, reps | Direct SPPB sub-score mapping |
| Total | Sway displacement | Cumulative postural excursion |

---

## 5. Known Limitations

| Scenario | MoveNet Impact | Gemini Impact |
|----------|---------------|---------------|
| Person walks toward camera | Step detection fails | Can still assess visually |
| Poor lighting | Low keypoint scores, mostly null metrics | May struggle |
| Loose clothing | Noisy keypoint positions | Unaffected |
| Multiple people | Tracks strongest person | May be confused |
| Camera shake | False sway added | Negligible |
| Very fast movement | 15 FPS may alias transitions | Video preserves full motion |

**Fundamental 2D limitations**: No real-world units (pixels only), no depth perception, no foot/toe keypoints, no hand/finger detail, single person only, 17 keypoints (no spine segments).

Despite these, the 2D pipeline provides clinically relevant relative metrics that, combined with Gemini's visual analysis, produce a useful SPPB approximation suitable for screening.

---

## 6. References

For the full clinical evidence, scientific rationale behind each metric choice, and peer-reviewed validation studies, see [`research.md`](research.md).
