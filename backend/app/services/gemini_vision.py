"""Gemini Vision service for SPPB gait/balance analysis."""

from google import genai
import asyncio
import json
import logging
import tempfile
import os

from ..core.config import get_settings
from ..models.assessment import AssessmentResult, GaitIssue, AssessmentTest
from ..utils.text import extract_json

logger = logging.getLogger(__name__)


class GeminiVisionService:
    """
    SPPB Mobility Analysis via Gemini Flash.
    Analyzes video for gait/balance assessment.
    """

    ISSUE_LIST = '"shuffling", "sway", "asymmetry", "slow_speed", "unsteady_turns", "reduced_arm_swing", "wide_base", "hesitation", "irregular_rhythm", "excessive_trunk_lean", "poor_sit_to_stand"'

    # Shared instruction appended to all prompts when pose metrics are available
    FUSION_INSTRUCTION = """
SCORING METHOD -SENSOR FUSION (pose metrics + video):
This assessment combines TWO data sources:
1. POSE ESTIMATION -quantitative metrics from MoveNet 2D body tracking (appended below if available). These provide a suggested SPPB score based on measured timing, cadence, sway, and joint angles.
2. VIDEO ANALYSIS -your visual assessment of the same video, providing context the pose model cannot capture.

HOW TO COMBINE:
- START from the pose-suggested score (it is based on measured data -timing, reps, cadence).
- Then CORRECT ±1 based on your video assessment. Your job is to catch what the pose model gets wrong:
  a) CAMERA ANGLE DISTORTION -all pose metrics are 2D projections. If the camera is angled (not perpendicular to movement), joint angles and distances will be distorted. A knee bend may read 120 deg when it's actually 90 deg due to perspective. Correct for this.
  b) OCCLUSION / TRACKING ERRORS -if limbs overlap or leave frame, metrics may be noisy or wrong. Trust the video over suspect numbers.
  c) CONTEXT THE MODEL MISSES -stepping, grabbing support, fear of falling, hand use, facial expression of effort -only visible in video.
  d) DISTANCE CALIBRATION -pixel-based metrics (sway velocity, step length) vary with camera distance. Closer camera = bigger numbers. Use visual context to judge.

If no pose metrics are provided, score purely from video.
If pose metrics are provided but look unreliable (very low frame count, extreme values), weight your video assessment more heavily."""

    GAIT_PROMPT = f"""You are scoring a 4-metre gait speed test from the SPPB (Short Physical Performance Battery).

The participant walks a short distance at their normal pace. Score 0-4 per SPPB gait speed protocol (Guralnik et al., 1994).

Watch the video and assess:
1. Overall walking speed -estimate whether they cross ~4 metres in <4.82s, 4.82-6.20s, 6.21-8.70s, or >8.70s
2. Gait quality: stride length, step symmetry, arm swing, trunk stability, rhythm
3. Compensatory patterns: shuffling, wide base, hesitation, reduced arm swing

SPPB Gait Speed Scoring (0-4):
- 4 = Gait speed >=0.83 m/s (<4.82s for 4m). Normal stride, symmetric, good arm swing.
- 3 = Gait speed 0.65-0.82 m/s (4.82-6.20s). Mostly normal, minor issues.
- 2 = Gait speed 0.46-0.64 m/s (6.21-8.70s). Short steps, wide base, or irregular rhythm.
- 1 = Gait speed <0.46 m/s (>8.70s). Shuffling, marked asymmetry, or near-inability.
- 0 = Unable to complete the walk.
{FUSION_INSTRUCTION}
Score ONLY 0-4. Return ONLY valid JSON (no markdown):
{{"score": <0-4>, "issues": [<from: {ISSUE_LIST}>], "confidence": <0.0-1.0>, "recommendations": [<3 brief actionable suggestions>]}}"""

    BALANCE_PROMPT = f"""You are scoring a standing balance test from the SPPB (Short Physical Performance Battery).

The participant stands with feet together and holds the position for 10 seconds. Score 0-4 per SPPB balance protocol (Guralnik et al., 1994).

Watch the video and assess:
1. Can they hold feet-together without stepping, grabbing support, or falling?
2. How long do they maintain the position?
3. Postural sway magnitude
4. Compensatory movements -arm waving, trunk lean, weight shifting

SPPB Balance Scoring (0-4):
- 4 = Holds full duration, minimal sway, no compensatory movements.
- 3 = Holds full duration but with noticeable sway or minor corrections. No stepping.
- 2 = Holds position with significant sway or frequent corrections. May nearly step.
- 1 = Unable to hold full duration. Steps, grabs support, or widens stance early.
- 0 = Unable to attempt or immediately loses balance.
{FUSION_INSTRUCTION}
Score ONLY 0-4. Return ONLY valid JSON (no markdown):
{{"score": <0-4>, "issues": [<from: {ISSUE_LIST}>], "confidence": <0.0-1.0>, "recommendations": [<3 brief actionable suggestions>]}}"""

    CHAIR_STAND_PROMPT = f"""You are scoring a repeated chair stand test from the SPPB (Short Physical Performance Battery).

The participant sits with arms crossed over their chest (standard SPPB protocol) and performs 5 sit-to-stand repetitions as fast as safely possible. Arms crossed is CORRECT -do NOT penalize.

Watch the video and assess:
1. Number of complete sit-to-stand reps (target: 5)
2. Total time for all reps
3. Whether arms stay crossed (uncrossing = difficulty)
4. Movement quality: smoothness, trunk lean, consistency

SPPB Chair Stand Scoring (0-4, based on time for 5 stands):
- 4 = 5 stands in <=11.19s. Smooth, arms crossed, consistent.
- 3 = 5 stands in 11.20-13.69s. Adequate speed, minor slowing.
- 2 = 5 stands in 13.70-16.69s. Slow, fatigue, or needs to uncross arms.
- 1 = 5 stands in >=16.70s, or <5 reps completed, or requires hands.
- 0 = Unable to stand without physical assistance.
{FUSION_INSTRUCTION}
Score ONLY 0-4. Return ONLY valid JSON (no markdown):
{{"score": <0-4>, "issues": [<from: {ISSUE_LIST}>], "confidence": <0.0-1.0>, "recommendations": [<3 brief actionable suggestions>]}}"""

    PROMPTS = {
        AssessmentTest.GAIT.value: GAIT_PROMPT,
        AssessmentTest.BALANCE.value: BALANCE_PROMPT,
        AssessmentTest.CHAIR_STAND.value: CHAIR_STAND_PROMPT,
    }

    def __init__(self):
        settings = get_settings()
        self.client = genai.Client(api_key=settings.gemini_api_key)
        self.model = "gemini-2.5-flash-lite"

    @staticmethod
    def _generate_clinical_flags(test_type: str, metrics: dict) -> list[str]:
        """Generate clinical warning flags when metrics exceed thresholds."""
        flags = []

        if test_type == AssessmentTest.BALANCE.value:
            if metrics.get("swayVelocity", 0) > 3.0:
                flags.append("HIGH SWAY VELOCITY (>3.0 px/frame) -indicates postural instability")
            if metrics.get("trunkLeanVariability", 0) > 4.0:
                flags.append("HIGH TRUNK LEAN VARIABILITY (>4.0 deg SD) -inconsistent postural control")
            trunk_max = metrics.get("trunkLean", {}).get("max", 0)
            if trunk_max > 15:
                flags.append(f"EXCESSIVE TRUNK LEAN ({trunk_max} deg max, threshold 15 deg)")

        elif test_type == AssessmentTest.GAIT.value:
            if metrics.get("stepSymmetryIndex", 0) > 20:
                flags.append(f"ASYMMETRIC GAIT (symmetry index {metrics.get('stepSymmetryIndex', 0)}%, threshold 20%)")
            if metrics.get("gaitRhythmVariability", 0) > 10:
                flags.append(f"IRREGULAR RHYTHM (CV {metrics.get('gaitRhythmVariability', 0)}%, threshold 10%)")
            cadence = metrics.get("cadence", 0)
            if 0 < cadence < 80:
                flags.append(f"LOW CADENCE ({cadence} steps/min, healthy elderly: 100-120)")
            if metrics.get("doubleSupportRatio", 0) > 0.4:
                flags.append(f"HIGH DOUBLE SUPPORT ({metrics.get('doubleSupportRatio', 0):.1%}, threshold 40%)")

        elif test_type == AssessmentTest.CHAIR_STAND.value:
            if metrics.get("peakTrunkLeanDuringRise", 0) > 25:
                flags.append(f"EXCESSIVE FORWARD LEAN DURING RISE ({metrics.get('peakTrunkLeanDuringRise', 0)} deg, threshold 25 deg)")
            if metrics.get("repConsistency", 0) > 25:
                flags.append(f"INCONSISTENT REP TIMING (CV {metrics.get('repConsistency', 0)}%, threshold 25%)")
            reps = metrics.get("refinedRepCount", 0)
            if 0 < reps < 5:
                flags.append(f"LOW REP COUNT ({reps} reps, target 5)")

        return flags

    @staticmethod
    def _fmt(val, unit="", na="N/A"):
        """Format a metric value, showing N/A for zero/missing (avoids misleading Gemini with 0-degree readings)."""
        if val is None or val == 0:
            return na
        return f"{val}{unit}"

    @staticmethod
    def _build_metrics_supplement(test_type: str, metrics: dict) -> str:
        """
        Build a supplementary prompt block from pose metrics,
        tailored to the specific test type with clinical reference ranges.
        """
        fc = metrics.get("frameCount", 0)
        dur = metrics.get("durationMs", 0)
        knee = metrics.get("kneeAngle", {})
        hip = metrics.get("hipAngle", {})
        trunk = metrics.get("trunkLean", {})
        shoulder = metrics.get("shoulderLevel", {})
        sway = metrics.get("sway", {})
        stance = metrics.get("stanceWidth", {})
        arm = metrics.get("armSwing", {})
        phases = metrics.get("movementPhases", 0)
        fmt = GeminiVisionService._fmt

        header = f"\n\n--- POSE ESTIMATION DATA ({fc} frames, {dur}ms duration) ---"

        flags = GeminiVisionService._generate_clinical_flags(test_type, metrics)
        flags_block = ""
        if flags:
            flags_block = "\n\nCLINICAL FLAGS:\n" + "\n".join(f"!! {f}" for f in flags)

        if test_type == AssessmentTest.BALANCE.value:
            sway_vel = metrics.get("swayVelocity", 0)
            sway_area = metrics.get("swayArea", 0)
            trunk_var = metrics.get("trunkLeanVariability", 0)
            sway_max = sway.get('maxDeviation', 0)
            total_disp = sway.get('totalDisplacement', 0)

            # Derive suggested SPPB balance score from pose metrics
            # Primary signal: did they maintain position? Proxy: sway magnitude + trunk variability
            # These thresholds are relative (pixel-based) so we use ranking, not absolutes
            instability_signals = 0
            if sway_vel > 4.0: instability_signals += 2      # large frame-to-frame sway
            elif sway_vel > 2.5: instability_signals += 1
            if trunk_var > 6.0: instability_signals += 2     # highly variable trunk
            elif trunk_var > 3.5: instability_signals += 1
            if sway_max > 30: instability_signals += 1       # large deviation from center
            if trunk.get('max', 0) > 15: instability_signals += 1  # peak trunk lean

            if instability_signals == 0: suggested = 4
            elif instability_signals <= 1: suggested = 3
            elif instability_signals <= 3: suggested = 2
            elif instability_signals <= 5: suggested = 1
            else: suggested = 0

            return header + f"""
BALANCE MEASURED DATA:
- Recording duration: {dur}ms
- Sway velocity: {fmt(sway_vel)} px/frame
- Sway area: {fmt(sway_area)} px2
- Total sway displacement: {fmt(total_disp)} px
- Max sway deviation from center: {fmt(sway_max)} px
- Trunk lean: avg {fmt(trunk.get('avg', 0), ' deg')}, max {fmt(trunk.get('max', 0), ' deg')}
- Trunk lean variability (SD): {fmt(trunk_var, ' deg')}
- Instability signal count: {instability_signals} (0=very stable, 6=very unstable)
- Suggested SPPB score from pose data: {suggested}
{flags_block}
Your role: Watch the video to verify. The pose data suggests score {suggested}. Confirm or adjust:
- Did they step, grab support, or widen stance? -> lower the score
- Did they hold steady for the full duration? -> keep or raise the score
- NOTE: Sway metrics are in pixel units and vary with camera distance (closer = larger numbers). If the camera is very close, sway values may look worse than reality. Use the video to judge actual stability.
Only override if the video clearly shows something the pose data missed (e.g., a step, hands grabbing support, or the camera being unusually close/far)."""

        elif test_type == AssessmentTest.GAIT.value:
            gait_speed = metrics.get("estimatedGaitSpeed", 0)
            step_count = metrics.get("stepCount", 0)
            cadence = metrics.get("cadence", 0)
            step_len = metrics.get("stepLengthEstimate", 0)
            symmetry = metrics.get("stepSymmetryIndex", 0)
            dsr = metrics.get("doubleSupportRatio", 0)
            rhythm_cv = metrics.get("gaitRhythmVariability", 0)

            # Derive suggested SPPB gait score from pose metrics
            # Cadence is the strongest proxy for gait speed from 2D pose data
            # Normal elderly: 100-120 steps/min ≈ 0.8-1.2 m/s
            # We combine cadence + gait quality signals
            quality_deductions = 0
            if symmetry > 20: quality_deductions += 1        # asymmetric gait
            if dsr > 0.4: quality_deductions += 1            # high double support
            if rhythm_cv > 12: quality_deductions += 1       # irregular rhythm
            if arm.get('symmetry', 1) < 0.5: quality_deductions += 1  # poor arm swing

            if cadence >= 100:
                suggested = 4
            elif cadence >= 85:
                suggested = 3
            elif cadence >= 65:
                suggested = 2
            elif cadence > 0:
                suggested = 1
            else:
                # No steps detected -rely entirely on video
                suggested = None

            # Quality deductions can lower the score by up to 1 point
            if suggested is not None and quality_deductions >= 3:
                suggested = max(1, suggested - 1)

            suggested_str = str(suggested) if suggested is not None else "UNABLE TO DETERMINE (no steps detected -score from video only)"

            return header + f"""
GAIT MEASURED DATA:
- Steps detected: {step_count}
- Cadence: {fmt(cadence)} steps/min (proxy for gait speed)
- Step symmetry: {fmt(symmetry, '%')}
- Double support ratio: {fmt(dsr)}
- Gait rhythm variability: {fmt(rhythm_cv, '%')}
- Arm swing symmetry: {fmt(arm.get('symmetry', 0))}
- Trunk lean: avg {fmt(trunk.get('avg', 0), ' deg')}
- Quality deductions: {quality_deductions} (asymmetry, double support, irregular rhythm, poor arm swing)
- Suggested SPPB score from pose data: {suggested_str}
{flags_block}
Your role: Watch the video to verify. The pose data suggests score {suggested_str}. Confirm or adjust:
- Does the walking speed match the cadence data, or does the video show faster/slower movement?
- Are there gait issues the pose data missed (e.g., shuffling, hesitation, fear of falling)?
- NOTE: Step detection works best when the person walks laterally (across the camera view). If they walk toward/away from the camera, step count and cadence may be unreliable -weight your visual assessment more.
Only override the suggested score if the video clearly contradicts the measured data."""

        elif test_type == AssessmentTest.CHAIR_STAND.value:
            rep_count = metrics.get("refinedRepCount", 0)
            avg_rep = metrics.get("avgRepTime", 0)
            peak_lean = metrics.get("peakTrunkLeanDuringRise", 0)
            rep_cv = metrics.get("repConsistency", 0)

            # Estimate actual rep duration (not raw recording time which includes idle)
            # avgRepTime is the mean interval between consecutive stand-ups
            # For N reps: estimated total = avgRepTime × N (includes first rep approximation)
            if rep_count > 0 and avg_rep > 0:
                est_rep_duration_ms = avg_rep * rep_count
            else:
                est_rep_duration_ms = dur  # fallback to full recording
            est_rep_s = est_rep_duration_ms / 1000

            # Derive SPPB score from estimated rep duration
            if rep_count >= 5:
                if est_rep_s <= 11.19: suggested = 4
                elif est_rep_s <= 13.69: suggested = 3
                elif est_rep_s <= 16.69: suggested = 2
                else: suggested = 1
            elif rep_count > 0:
                suggested = 1
            else:
                suggested = 0
            return header + f"""
CHAIR STAND MEASURED DATA:
- Repetitions detected: {rep_count} / 5
- Average time per rep: {avg_rep}ms
- Estimated total rep time: {est_rep_duration_ms}ms ({est_rep_s:.1f}s) (excludes idle time before/after reps)
- Raw recording duration: {dur}ms (includes idle -do NOT use for scoring)
- Suggested SPPB score: {suggested} (cutoffs: <=11.19s->4, <=13.69s->3, <=16.69s->2, else->1)
- Peak trunk lean during rise: {fmt(peak_lean, ' deg')}
- Rep consistency (CV): {fmt(rep_cv, '%')}
- Knee angle: min {fmt(knee.get('min', 0), ' deg')} (seated), max {fmt(knee.get('max', 0), ' deg')} (standing)
{flags_block}
The pose model detected {rep_count} reps in ~{est_rep_s:.1f}s -> score {suggested}.
TRUST the measured rep count ({rep_count}) and timing ({est_rep_s:.1f}s) - these come from real-time body tracking during the actual test. Do NOT re-count reps from the video.
Only adjust the score if the video shows:
- Arms uncrossed or hands used for support (lower the score)
- The person did not fully stand or fully sit between reps (lower the score)
- Obvious tracking error (e.g., the person clearly did more/fewer reps than {rep_count})"""

        return ""

    async def analyze_video(
        self,
        video_bytes: bytes,
        user_id: str,
        mime_type: str = "video/webm",
        test_type: str = AssessmentTest.GAIT.value,
        pose_metrics: str = "",
    ) -> AssessmentResult:
        """
        Analyze video for SPPB scoring using Gemini File API.
        Optionally enriched with pose metrics from the frontend.
        """
        temp_path = None
        uploaded_file = None

        # Parse pose metrics if provided
        parsed_metrics = None
        if pose_metrics:
            try:
                parsed_metrics = json.loads(pose_metrics)
                logger.info(f"Received pose metrics: {parsed_metrics.get('frameCount', 0)} frames")
            except json.JSONDecodeError:
                logger.warning("Failed to parse pose_metrics JSON, ignoring")

        try:
            logger.info(
                f"Analyzing video for user {user_id}, size: {len(video_bytes)} bytes, type: {mime_type}, test: {test_type}"
            )

            # Determine file extension from mime type
            ext_map = {
                "video/webm": ".webm",
                "video/mp4": ".mp4",
                "video/quicktime": ".mov",
            }
            ext = ext_map.get(mime_type, ".webm")

            # Save video to temp file
            with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as f:
                f.write(video_bytes)
                temp_path = f.name

            logger.info(f"Saved video to temp file: {temp_path}")

            # Upload to Gemini File API
            logger.info("Uploading video to Gemini...")
            uploaded_file = await asyncio.to_thread(self.client.files.upload, file=temp_path)
            logger.info(f"Uploaded file: {uploaded_file.name}, state: {uploaded_file.state.name}")

            # Wait for file to be processed
            max_wait = 60  # seconds
            waited = 0
            while uploaded_file.state.name == "PROCESSING" and waited < max_wait:
                logger.info(f"Waiting for video processing... ({waited}s)")
                await asyncio.sleep(2)
                waited += 2
                uploaded_file = await asyncio.to_thread(self.client.files.get, name=uploaded_file.name)

            if uploaded_file.state.name == "FAILED":
                raise Exception("Video processing failed")

            logger.info(f"Video ready, state: {uploaded_file.state.name}")

            # Build prompt -base + optional metrics supplement
            prompt = self.PROMPTS.get(test_type, self.GAIT_PROMPT)
            if parsed_metrics and parsed_metrics.get("frameCount", 0) > 0:
                supplement = self._build_metrics_supplement(test_type, parsed_metrics)
                prompt = prompt + supplement
                logger.info("Enriched prompt with pose metrics")

            # Generate response
            logger.info("Sending to Gemini for analysis...")
            response = await asyncio.to_thread(
                self.client.models.generate_content,
                model=self.model,
                contents=[uploaded_file, prompt],
            )

            # Parse response
            if not response.text:
                raise ValueError("Gemini returned empty response")
            raw_text = response.text.strip()
            logger.info(f"Gemini raw response ({len(raw_text)} chars): {raw_text[:300]}")

            result_data = extract_json(raw_text)

            # Validate and convert issues
            issues = []
            for issue in result_data.get("issues", []):
                try:
                    issues.append(GaitIssue(issue))
                except ValueError:
                    logger.warning(f"Unknown gait issue: {issue}")

            return AssessmentResult(
                user_id=user_id,
                score=min(4, max(0, int(result_data.get("score", 2)))),
                issues=issues,
                test_type=AssessmentTest(test_type) if test_type in self.PROMPTS else None,
                confidence=float(result_data.get("confidence", 0.7)),
                recommendations=result_data.get("recommendations", [
                    "Continue daily walking exercises",
                    "Practice balance near a wall for support",
                    "Consult a physiotherapist for personalized advice"
                ]),
                pose_metrics=parsed_metrics,
            )

        except ValueError as e:
            logger.error(f"Failed to parse Gemini response: {e}")
            raise ValueError(f"Video analysis failed - could not parse result. Please try again.")
        except Exception as e:
            logger.error(f"Gemini Vision analysis failed: {e}")
            raise
        finally:
            # Clean up temp file
            if temp_path and os.path.exists(temp_path):
                try:
                    os.unlink(temp_path)
                except Exception:
                    pass
            # Clean up uploaded file
            if uploaded_file:
                try:
                    await asyncio.to_thread(self.client.files.delete, name=uploaded_file.name)
                except Exception:
                    pass

    async def analyze_video_stream(
        self,
        video_bytes: bytes,
        user_id: str,
        mime_type: str = "video/webm",
        test_type: str = AssessmentTest.GAIT.value,
        pose_metrics: str = "",
    ):
        """
        Async generator that yields (stage, payload) tuples as analysis progresses.
        Stages: uploading, processing, analyzing, complete, error
        """
        temp_path = None
        uploaded_file = None

        parsed_metrics = None
        if pose_metrics:
            try:
                parsed_metrics = json.loads(pose_metrics)
            except json.JSONDecodeError:
                logger.warning("Failed to parse pose_metrics JSON, ignoring")

        try:
            yield ("uploading", {})

            ext_map = {
                "video/webm": ".webm",
                "video/mp4": ".mp4",
                "video/quicktime": ".mov",
            }
            ext = ext_map.get(mime_type, ".webm")

            with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as f:
                f.write(video_bytes)
                temp_path = f.name

            uploaded_file = await asyncio.to_thread(self.client.files.upload, file=temp_path)

            yield ("processing", {"waited": 0})

            max_wait = 60
            waited = 0
            while uploaded_file.state.name == "PROCESSING" and waited < max_wait:
                await asyncio.sleep(2)
                waited += 2
                uploaded_file = await asyncio.to_thread(self.client.files.get, name=uploaded_file.name)
                yield ("processing", {"waited": waited})

            if uploaded_file.state.name == "FAILED":
                yield ("error", {"detail": "Video processing failed"})
                return

            yield ("analyzing", {})

            prompt = self.PROMPTS.get(test_type, self.GAIT_PROMPT)
            if parsed_metrics and parsed_metrics.get("frameCount", 0) > 0:
                supplement = self._build_metrics_supplement(test_type, parsed_metrics)
                prompt = prompt + supplement

            response = await asyncio.to_thread(
                self.client.models.generate_content,
                model=self.model,
                contents=[uploaded_file, prompt],
            )

            if not response.text:
                raise ValueError("Gemini returned empty response")
            raw_text = response.text.strip()
            logger.info(f"Gemini stream raw response ({len(raw_text)} chars): {raw_text[:300]}")

            result_data = extract_json(raw_text)

            issues = []
            for issue in result_data.get("issues", []):
                try:
                    issues.append(GaitIssue(issue))
                except ValueError:
                    pass

            result = AssessmentResult(
                user_id=user_id,
                score=min(4, max(0, int(result_data.get("score", 2)))),
                issues=issues,
                test_type=AssessmentTest(test_type) if test_type in self.PROMPTS else None,
                confidence=float(result_data.get("confidence", 0.7)),
                recommendations=result_data.get("recommendations", [
                    "Continue daily walking exercises",
                    "Practice balance near a wall for support",
                    "Consult a physiotherapist for personalized advice"
                ]),
                pose_metrics=parsed_metrics,
            )

            yield ("complete", {"result": result.model_dump()})

        except ValueError as e:
            logger.error(f"Failed to extract JSON from Gemini response: {e}")
            yield ("error", {"detail": "Video analysis failed - could not interpret result. Please try again."})

        except Exception as e:
            logger.error(f"Streaming analysis failed: {e}")
            yield ("error", {"detail": str(e)})

        finally:
            if temp_path and os.path.exists(temp_path):
                try:
                    os.unlink(temp_path)
                except Exception:
                    pass
            if uploaded_file:
                try:
                    await asyncio.to_thread(self.client.files.delete, name=uploaded_file.name)
                except Exception:
                    pass

    async def health_check(self) -> bool:
        """Verify Gemini API connectivity."""
        try:
            response = await asyncio.to_thread(
                self.client.models.generate_content,
                model=self.model,
                contents="Say 'ok' if you can read this.",
            )
            return response.text is not None
        except Exception as e:
            logger.error(f"Gemini health check failed: {e}")
            return False
