# SilverGait  - Clinical Evidence & Design Rationale

The scientific basis for SilverGait: why frailty screening matters, why SPPB is the right instrument, and why each metric and design decision we made is backed by peer-reviewed research.

For the algorithm implementations (formulas, keypoint maps, scoring tables), see [`kinematics-and-sppb.md`](kinematics-and-sppb.md).
For system architecture (LangGraph, DB schema, API flow), see [`ARCHITECTURE.md`](ARCHITECTURE.md).

---

## 1. The Problem: Frailty and Falls in Ageing Singapore

### Frailty Prevalence in Singapore

Among community-dwelling Singaporeans aged 65+, **6.2% are frail and 37% are pre-frail**  - most unaware of their status until a fall or hospitalisation occurs.

> Merchant RA, Chen MZ, Tan LWL, et al. "Singapore Healthy Older People Everyday (HOPE) Study: Prevalence of Frailty and Associated Factors in Older Adults." *J Am Med Dir Assoc.* 2017. [PMID 28623152](https://pubmed.ncbi.nlm.nih.gov/28623152/)

### What Frailty Predicts

Frailty  - defined by unintentional weight loss, exhaustion, weakness, slow walking speed, and low physical activity  - **independently predicts falls, disability, hospitalisation, and mortality** over 3 years. It operates independently from comorbidity.

> Fried LP, Tangen CM, Walston J, et al. "Frailty in Older Adults: Evidence for a Phenotype." *J Gerontol A Biol Sci Med Sci.* 2001;56(3):M146-56. [PMID 11253156](https://pubmed.ncbi.nlm.nih.gov/11253156/)

### Falls Burden

Globally, **684,000 fatal falls** occur annually, with adults over 60 at the highest risk. An additional 37.3 million falls require medical attention each year; 20-30% of older adults who fall suffer moderate to severe injuries including hip fractures and head trauma.

> World Health Organization. "Falls." WHO Fact Sheet, 2024. [Link](https://www.who.int/news-room/fact-sheets/detail/falls)

### The Screening Gap

Clinical frailty screening requires trained professionals and in-person visits, limiting frequency. Singapore's push for AI-driven healthcare  - including the [NUS-Synapxe-IMDA AI Innovation Challenge 2026](https://www.imda.gov.sg/resources/press-releases-factsheets-and-speeches/press-releases/2026/ai-solutions-combating-chronic-diseases)  - calls for solutions enabling continuous remote monitoring and empowering patients to manage health from home.

---

## 2. Why SPPB

The Short Physical Performance Battery (SPPB) assesses lower-extremity function through three timed tests: standing balance, gait speed, and repeated chair stands. Scored 0-12, it is the most widely validated geriatric mobility assessment.

We chose SPPB because:

| Reason | Evidence |
|--------|----------|
| **Predicts disability and mortality** | Guralnik et al. (1994)  - 5,000+ subjects, strong predictive validity. [PMID 8126356](https://pubmed.ncbi.nlm.nih.gov/8126356/) |
| **Predicts disability onset** | Guralnik et al. (1995)  - SPPB predicts disability over 4 years in persons 70+. [NEJM](https://www.nejm.org/doi/full/10.1056/NEJM199503023320902) |
| **Predicts falls** | Lauretani et al. (2019)  - SPPB ≤6 independently associated with falls; non-inferior to POMA. [PMID 30515724](https://pubmed.ncbi.nlm.nih.gov/30515724/) |
| **Quick and useful for stratification** | Treacy & Hassett (2020)  - Effective risk stratification over 1- and 4-year follow-up. [PMID 33191134](https://pubmed.ncbi.nlm.nih.gov/33191134/) |
| **All 3 sub-tests are observable via video** | Balance (sway), gait (cadence/symmetry), chair-stand (rep timing)  - all have quantifiable biomechanical markers extractable from 2D pose estimation |

---

## 3. Why Smartphone-Based Computer Vision Works

### Can 2D Pose Estimation Replace Motion Capture?

We use **MoveNet Lightning** for real-time 17-keypoint 2D pose estimation on the phone. Multiple studies validate that 2D markerless pose estimation produces clinically acceptable kinematics:

| Paper | Validation |
|-------|------------|
| **Ung et al. (2022)** *Gait Posture* | **MoveNet Thunder: 3.7 ± 1.3° mean hip angle error** vs Vicon motion capture. Directly validates MoveNet for gait. [PMID 35988434](https://pubmed.ncbi.nlm.nih.gov/35988434/) |
| **Stenum et al. (2021)** *PLoS Comput Biol* | OpenPose: 4.0° hip, 5.6° knee, 7.4° ankle error; 0.02s temporal error. [PMC8099131](https://pmc.ncbi.nlm.nih.gov/articles/PMC8099131/) |
| **Bosquet et al. (2023)** *Front Rehabil Sci* | 2D pose estimation comparable to marker-based systems **specifically for elderly gait**. [Link](https://www.frontiersin.org/journals/rehabilitation-sciences/articles/10.3389/fresc.2023.1238134/full) |
| **Ali et al. (2024)** *Evol Bioinform* | MediaPipe: Pearson's r=0.80 lower limb, 0.91 upper limb vs Qualisys. [Link](https://journals.sagepub.com/doi/10.1177/11779322241231108) |

### Can a Smartphone Do This?

| Paper | Validation |
|-------|------------|
| **Shin et al. (2021)** *Front Physiol* | **Smartphone at 30fps produces clinically usable gait analysis.** [Link](https://www.frontiersin.org/journals/physiology/articles/10.3389/fphys.2021.784865/full) |
| **Gong et al. (2025)** *Smart Health* | Validates smartphone-based joint angle analysis for sit-to-stand in elderly. [Link](https://www.sciencedirect.com/science/article/pii/S2950550X25000160) |
| **Roldan-Jimenez et al. (2025)** *Gait Posture* | Mobile phone pose estimation: **ICC >0.9** for sit-to-stand. [Link](https://www.sciencedirect.com/science/article/abs/pii/S0966636225000013) |
| **Patel et al. (2023)** *PLOS Digit Health* | Video-based pose estimation can detect clinically meaningful change over time. [Link](https://journals.plos.org/digitalhealth/article?id=10.1371/journal.pdig.0000467) |

### Systematic Reviews

| Paper | Finding |
|-------|---------|
| **Scott et al. (2023)** *J NeuroEng Rehabil* | Systematic review: markerless motion capture strong for postural control and gross movement. [Link](https://jneuroengrehab.biomedcentral.com/articles/10.1186/s12984-023-01186-9) |
| **Ripic et al. (2024)** *Sensors* | Markerless camera-based capture reliable and valid for hip/knee gait kinematics. [Link](https://www.mdpi.com/1424-8220/24/11/3686) |

---

## 4. Why We Chose Each Metric

Every biomechanical metric SilverGait extracts is grounded in clinical fall-risk research. Here's why we measure what we measure.

### Joint Angles (Three-Point Dot-Product Formula)

We compute knee, hip, and elbow angles using the three-point dot-product formula: `angle_at_B = arccos((BA · BC) / (|BA| × |BC|))`. This is **view-invariant in the sagittal plane**  - unlike raw pixel coordinates, joint angles don't change with camera distance or position.

- **Why knee angle**: Knee flexion/extension range is a key descriptor of sit-to-stand ability and gait phase. Roebroeck et al. (2007) identify knee extension velocity as a primary STS descriptor. [Link](https://biomedical-engineering-online.biomedcentral.com/articles/10.1186/1475-925X-6-26)
- **Why hip angle**: Trunk-to-thigh flexion during sit-to-stand is a compensatory movement indicator. Excessive forward lean signals lower-limb weakness.
- **Confidence threshold (0.3)**: Intentionally low because MoveNet Lightning prioritizes speed, and temporal aggregation smooths noisy readings. Consistent with Ung et al. (2022) and Ali et al. (2024).

### Sway Velocity and Area (Hip Center Displacement)

We track the midpoint of left/right hip keypoints as a center-of-mass proxy and compute frame-to-frame displacement (sway velocity) and bounding-box area (sway area).

- **Why this predicts falls**: Melzer et al. (2019)  - highest postural sway quintile: **75-90% increased fall risk**. Sway velocity is a validated clinical metric. [PMID 30981147](https://pubmed.ncbi.nlm.nih.gov/30981147/)
- **Why hip center, not nose or shoulders**: Nose is affected by head turns; shoulder midpoint is affected by arm movement. Hip center is the most stable CoM proxy from 2D keypoints.

### Trunk Lean Variability (SD of Trunk Angle)

We compute trunk lean as the angle between the shoulder-hip line and vertical, then track its standard deviation over time.

- **Why this matters**: Gill et al. (2001)  - elderly show significantly greater trunk sway during clinical balance tests. Trunk lean variability captures **postural instability** that mean values miss. [Link](https://academic.oup.com/biomedgerontology/article/56/7/M438/559181)

### Gait Rhythm Variability (CV of Inter-Step Intervals)

We detect steps via zero-crossings of smoothed ankle X separation, then compute the coefficient of variation of inter-step intervals.

- **Why this is the strongest gait predictor**: Hausdorff et al. (2001)  - stride time variability was **106ms in fallers vs 49ms in non-fallers**, the strongest gait-based fall predictor in a 1-year prospective study. [PMID 11494184](https://pubmed.ncbi.nlm.nih.gov/11494184/)

### Step Symmetry Index

We compute `abs(avgLeft - avgRight) / avgBoth × 100%` from inter-step intervals.

- **Why asymmetry matters**: Chen et al. (2024)  - gait asymmetry combined with cadence and double stance time predicts falls with **AUC 0.845**. [PMC11323353](https://pmc.ncbi.nlm.nih.gov/articles/PMC11323353/)

### Cadence and Normative Ranges

We compute cadence as `(stepCount / durationSec) × 60`.

- **Reference ranges**: Hollman et al. (2011)  - normative spatiotemporal gait parameters in older adults provide our healthy/at-risk thresholds. [PMC3104090](https://pmc.ncbi.nlm.nih.gov/articles/PMC3104090/)

### Chair-Stand Rep Time Consistency (CV of Rep Durations)

We detect reps via prominence-based valley detection in the hip Y signal, then compute the CV of rep-to-rep durations.

- **Why rep timing reliability matters**: Bohannon (2021)  - high ICC for 5xSTS timing validates that rep time consistency is a reliable, reproducible measure. [PMC8228261](https://pmc.ncbi.nlm.nih.gov/articles/PMC8228261/)
- **Why prominence-based detection**: Fixed Y-thresholds fail because camera distance, chair height, and user height change absolute values. Prominence detection is self-calibrating.

### Derived Metrics Over Raw Coordinates

We compute ~16 clinically meaningful features per frame and discard raw coordinates immediately. This is by design:

| Problem with raw keypoints | How derived metrics solve it |
|----------------------------|------------------------------|
| Camera distance changes pixel values | Joint angles are view-invariant in the sagittal plane |
| MoveNet jitters several pixels frame-to-frame | Temporal aggregation (mean, CV) filters noise |
| 15,300 values per 20s recording bloat the LLM prompt | ~30 scalar summary leaves context for Gemini's video analysis |

---

## 5. Why Sleep Intervention

SilverGait includes a Sleep Agent that generates personalized CBT-I (Cognitive Behavioral Therapy for Insomnia) and sleep hygiene plans based on each user's frailty tier, mood risk, exercise streak, and social isolation level.

### Sleep and Frailty Are Bidirectional

Poor sleep accelerates muscle loss and frailty progression, while frailty itself worsens sleep quality  - creating a vicious cycle.

| Paper | Key Finding |
|-------|-------------|
| **Ensrud et al. (2012)** *J Am Geriatr Soc.* [PMID 22283806](https://pubmed.ncbi.nlm.nih.gov/22283806/) | Poor sleep quality associated with increased frailty risk in 3,000+ older women over 7 years. |
| **Moreno-Tamayo et al. (2020)** *Sleep Med.* [PMID 32298918](https://pubmed.ncbi.nlm.nih.gov/32298918/) | Insomnia symptoms predict frailty incidence in community-dwelling elderly. Bidirectional relationship. |

### CBT-I Is the Gold Standard for Elderly Insomnia

Pharmacological sleep aids carry fall risks for elderly. CBT-I is recommended as first-line treatment.

| Paper | Key Finding |
|-------|-------------|
| **Irwin et al. (2006)** *J Am Geriatr Soc.* [PMID 16551307](https://pubmed.ncbi.nlm.nih.gov/16551307/) | CBT-I produces durable improvements in sleep quality in older adults, without medication risks. |
| **Sivertsen et al. (2006)** *JAMA.* [PMID 16790700](https://pubmed.ncbi.nlm.nih.gov/16790700/) | CBT-I superior to sleep medication (zopiclone) at 6-month follow-up in older adults. |

### Our Approach

The Sleep Agent personalizes advice based on contextual factors from the user's health profile: mood risk (anxiety worsens sleep), exercise streak (physical activity improves sleep quality), frailty tier (poor sleep accelerates muscle loss), and social isolation (loneliness linked to poor sleep in elderly). For moderate/high sleep risk users, CBT-I techniques (sleep restriction, stimulus control, progressive muscle relaxation) are included.

---

## 6. Why Exercise Tracking and Personalization

SilverGait provides tier-based exercise plans from a curated content library and tracks daily exercise completion, streaks, and weekly activity.

### Exercise Prevents and Reverses Frailty

| Paper | Key Finding |
|-------|-------------|
| **Cadore et al. (2013)** *Ageing Res Rev.* [PMID 23266332](https://pubmed.ncbi.nlm.nih.gov/23266332/) | Multicomponent exercise (strength + balance + gait) is the most effective intervention for frailty reversal in elderly. |
| **de Labra et al. (2015)** *BMC Geriatr.* [PMID 26126532](https://pubmed.ncbi.nlm.nih.gov/26126532/) | Exercise programs improve physical function, mobility, and balance in frail older adults. Systematic review of 19 RCTs. |

### Exercise Reduces Fall Risk

| Paper | Key Finding |
|-------|-------------|
| **Sherrington et al. (2019)** *Br J Sports Med.* [PMID 30464052](https://pubmed.ncbi.nlm.nih.gov/30464052/) | Exercise reduces fall rate by 23% overall. Programs including balance training reduce falls by 39%. Cochrane-level evidence from 108 RCTs. |
| **Gillespie et al. (2012)** *Cochrane Database Syst Rev.* [PMID 22972103](https://pubmed.ncbi.nlm.nih.gov/22972103/) | Multifactorial interventions including exercise reduce rate of falls in community-dwelling older adults. |

### Our Approach

Exercise plans are selected deterministically from a curated content library by frailty tier  - not LLM-generated  - ensuring safety-appropriate intensity:
- **Robust**: Moderate intensity maintenance (20-30 min daily)
- **Pre-frail**: Strengthening focus on balance and leg power (15-20 min)
- **Frail**: Gentle seated/supported exercises (10-15 min)
- **Severely frail**: Minimal caregiver-assisted movements (5-10 min)

The Exercise Agent (LLM) provides additional personalization based on specific SPPB deficits (low balance, slow gait, weak chair stand) and exercise streak.

---

## 7. Evidence Strength Summary

| Component | Evidence | Key Papers |
|-----------|----------|------------|
| SPPB as clinical tool | Very Strong | Guralnik 1994, 1995 |
| SPPB predicts falls | Strong | Lauretani 2019, Treacy 2020 |
| Frailty predicts adverse outcomes | Very Strong | Fried 2001 |
| Singapore frailty prevalence | Strong | Merchant 2017 (HOPE Study) |
| MoveNet for 2D kinematics | Strong | Ung 2022 |
| Smartphone-based gait analysis | Strong | Shin 2021 |
| Smartphone-based STS analysis | Strong | Gong 2025, Roldan-Jimenez 2025 |
| Gait variability as fall predictor | Very Strong | Hausdorff 2001 |
| Postural sway as fall predictor | Strong | Melzer 2019 |
| Trunk lean variability | Strong | Gill 2001 |
| Step symmetry as fall predictor | Moderate-Strong | Chen 2024 |
| STS rep time consistency | Strong | Bohannon 2021 |
| Markerless motion capture validity | Strong | Scott 2023, Ripic 2024 |
| Sleep-frailty bidirectional link | Strong | Ensrud 2012, Moreno-Tamayo 2020 |
| CBT-I for elderly insomnia | Very Strong | Irwin 2006, Sivertsen 2006 |
| Exercise reverses frailty | Very Strong | Cadore 2013, de Labra 2015 |
| Exercise reduces falls | Very Strong | Sherrington 2019 (108 RCTs) |
