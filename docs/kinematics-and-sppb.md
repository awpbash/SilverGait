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

## 6. Research References

### 2D Pose Estimation Validation

| Paper | Key Finding |
|-------|-------------|
| **Stenum et al. (2021)** PLoS Computational Biology. "Two-dimensional video-based analysis of human gait using pose estimation." [PMC8099131](https://pmc.ncbi.nlm.nih.gov/articles/PMC8099131/) | OpenPose: 4.0 hip, 5.6 knee, 7.4 ankle angle error vs motion capture; 0.02s temporal error |
| **Ung et al. (2022)** Gait & Posture. "Comparing accuracy of open-source pose estimation methods for measuring gait kinematics." [PMID 35988434](https://pubmed.ncbi.nlm.nih.gov/35988434/) | MoveNet Thunder: 3.7+/-1.3 hip angle error. Directly validates MoveNet for gait |
| **Bosquet et al. (2023)** Frontiers in Rehabilitation Sciences. "Gait analysis comparison between manual marking, 2D pose estimation, and 3D marker-based system." [Link](https://www.frontiersin.org/journals/rehabilitation-sciences/articles/10.3389/fresc.2023.1238134/full) | Pose estimation comparable to marker-based for elderly gait |
| **Shin et al. (2021)** Frontiers in Physiology. "Robust human gait analysis using bottom-up pose estimation with a smartphone camera." [Link](https://www.frontiersin.org/journals/physiology/articles/10.3389/fphys.2021.784865/full) | Smartphone at 30fps produces clinically usable gait analysis |
| **Ali et al. (2024)** Evolutionary Bioinformatics. "Human pose estimation for clinical analysis of gait pathologies." [Link](https://journals.sagepub.com/doi/10.1177/11779322241231108) | MediaPipe: Pearson's r=0.80 lower limb, 0.91 upper limb vs Qualisys |

### SPPB Validation

| Paper | Key Finding |
|-------|-------------|
| **Guralnik et al. (1994)** J. Gerontology. "A short physical performance battery assessing lower extremity function." [PMID 8126356](https://pubmed.ncbi.nlm.nih.gov/8126356/) | Foundational SPPB paper. 5000+ subjects, strong predictive validity for disability and mortality |
| **Guralnik et al. (1995)** NEJM. "Lower-extremity function in persons over 70 as predictor of subsequent disability." [Link](https://www.nejm.org/doi/full/10.1056/NEJM199503023320902) | SPPB scores predict disability onset. Gold-standard geriatric assessment |
| **Veronese et al. (2019)** Aging Clin. Exp. Research. "SPPB score associated with falls in older outpatients." [PMID 30515724](https://pubmed.ncbi.nlm.nih.gov/30515724/) | Scores <=6 associated with higher fall rates |
| **Treacy & Hassett (2020)** JAMDA. "SPPB: quick and useful tool for fall risk stratification." [PMID 33191134](https://pubmed.ncbi.nlm.nih.gov/33191134/) | Clinical utility over 1- and 4-year follow-up |

### Sway & Fall Risk

| Paper | Key Finding |
|-------|-------------|
| **Melzer et al. (2019)** Human Movement Science. "Predicting incident falls: postural sway and limits of stability." [PMID 30981147](https://pubmed.ncbi.nlm.nih.gov/30981147/) | Highest sway quintile: 75-90% increased fall risk. Validates sway velocity metric |
| **Howcroft et al. (2020)** Frontiers in Medicine. "Postural assessment utilizing ML prospectively identifies high fall-risk elders." [Link](https://www.frontiersin.org/journals/medicine/articles/10.3389/fmed.2020.591517/full) | ML on video sway features identifies fall-risk elders |
| **Gill et al. (2001)** J. Gerontology Series A. "Trunk sway measures of postural stability during clinical balance tests." [Link](https://academic.oup.com/biomedgerontology/article/56/7/M438/559181) | Elderly show significantly greater trunk sway. Validates trunk lean variability |

### Gait Analysis

| Paper | Key Finding |
|-------|-------------|
| **Hausdorff et al. (2001)** Archives of Physical Medicine. "Gait variability and fall risk: 1-year prospective study." [PMID 11494184](https://pubmed.ncbi.nlm.nih.gov/11494184/) | Stride time variability 106ms in fallers vs 49ms in non-fallers. Strongest fall predictor |
| **Hollman et al. (2011)** Gait & Posture. "Normative spatiotemporal gait parameters in older adults." [PMC3104090](https://pmc.ncbi.nlm.nih.gov/articles/PMC3104090/) | Normative cadence, step length, gait speed for reference ranges |
| **Chen et al. (2024)** BMC Public Health. "Fall risk prediction model based on gait analysis." [PMC11323353](https://pmc.ncbi.nlm.nih.gov/articles/PMC11323353/) | Gait asymmetry + cadence + double stance time predict falls (AUC 0.845) |
| **Verghese et al. (2009)** J. Gerontology Series A. "Quantitative gait markers and incident fall risk." [PMC2709543](https://pmc.ncbi.nlm.nih.gov/articles/PMC2709543/) | Step length variability and cadence are key discriminating markers |

### Sit-to-Stand Analysis

| Paper | Key Finding |
|-------|-------------|
| **Gong et al. (2025)** Smart Health. "Smartphone-based joint angle analysis during sit-to-stand." [Link](https://www.sciencedirect.com/science/article/pii/S2950550X25000160) | Validates smartphone-based joint angle analysis for STS in elderly |
| **Roldan-Jimenez et al. (2025)** Gait & Posture. "Vision-based postural balance assessment of sit-to-stand transitions." [Link](https://www.sciencedirect.com/science/article/abs/pii/S0966636225000013) | Mobile phone pose estimation: ICC >0.9 for dynamic STS measurements |
| **Roebroeck et al. (2007)** BioMedical Engineering OnLine. "Kinematics and minimum peak joint moments of sit-to-stand." [Link](https://biomedical-engineering-online.biomedcentral.com/articles/10.1186/1475-925X-6-26) | Peak trunk flexion and knee extension velocity are key STS descriptors |
| **Bohannon (2021)** PMC. "Test-retest reliability of five times sit to stand test." [PMC8228261](https://pmc.ncbi.nlm.nih.gov/articles/PMC8228261/) | High ICC for 5xSTS timing. Validates rep time consistency metrics |

### Markerless Motion Capture Reviews

| Paper | Key Finding |
|-------|-------------|
| **Scott et al. (2023)** J. NeuroEngineering & Rehabilitation. "Systematic review of MMC for clinical measurement." [Link](https://jneuroengrehab.biomedcentral.com/articles/10.1186/s12984-023-01186-9) | MMC strong for postural control and gross movement analysis |
| **Ripic et al. (2024)** Sensors. "Accuracy of markerless camera-based 3D motion capture vs marker-based." [Link](https://www.mdpi.com/1424-8220/24/11/3686) | Markerless is reliable and valid for hip/knee gait kinematics |
| **Patel et al. (2023)** PLOS Digital Health. "Clinical gait analysis using video-based pose estimation." [Link](https://journals.plos.org/digitalhealth/article?id=10.1371/journal.pdig.0000467) | Can detect clinically meaningful change over time |

### Evidence Strength Summary

| Metric | Evidence | Key Paper |
|--------|----------|-----------|
| MoveNet for 2D kinematics | Strong | Ung et al. 2022 |
| SPPB scoring | Very Strong | Guralnik et al. 1994, 1995 |
| Hip sway / sway velocity | Strong | Melzer et al. 2019 |
| Trunk lean variability | Strong | Gill et al. 2001 |
| Cadence, step length | Strong | Hollman et al. 2011 |
| Step symmetry index | Moderate-Strong | Chen et al. 2024 |
| Gait rhythm CV | Very Strong | Hausdorff et al. 2001 |
| STS knee/hip angles | Strong | Gong et al. 2025, Roebroeck et al. 2007 |
| STS rep time CV | Strong | Bohannon et al. 2021 |
| Confidence threshold 0.3 | Acceptable | Ung et al. 2022, Ali et al. 2024 |
