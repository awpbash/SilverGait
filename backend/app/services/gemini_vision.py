"""Gemini Vision service for SPPB gait/balance analysis."""

from google import genai
import asyncio
import json
import logging
import tempfile
import os

from ..core.config import get_settings
from ..models.assessment import AssessmentResult, GaitIssue, AssessmentTest
from ..utils.text import strip_markdown_fences

logger = logging.getLogger(__name__)


class GeminiVisionService:
    """
    SPPB Mobility Analysis via Gemini Flash.
    Analyzes video for gait/balance assessment.
    """

    ISSUE_LIST = '"shuffling", "sway", "asymmetry", "slow_speed", "unsteady_turns", "reduced_arm_swing", "wide_base", "hesitation", "irregular_rhythm", "excessive_trunk_lean", "poor_sit_to_stand"'

    GAIT_PROMPT = f"""You are analyzing a video of an elderly person walking for a mobility assessment (SPPB - Short Physical Performance Battery).

Watch the video carefully and evaluate:
1. Walking speed (normal, slow, very slow)
2. Balance and stability (steady, some sway, unsteady)
3. Gait pattern (normal stride, shuffling, asymmetric)
4. Arm swing (normal, reduced, absent)
5. Step rhythm regularity
6. Any signs of hesitation or fear of falling

SPPB Gait Speed Scoring Guide:
- 4 = Excellent mobility, smooth confident walking, good cadence (100-120 steps/min)
- 3 = Good mobility, minor issues (slight asymmetry or reduced arm swing)
- 2 = Fair mobility, noticeable difficulties (irregular rhythm, wide base, slow cadence <80)
- 1 = Poor mobility, significant issues (shuffling, high double-support time, very slow)
- 0 = Unable to complete or severe impairment

Return ONLY valid JSON in this exact format (no markdown, no code blocks):
{{"score": <0-4>, "issues": [<list of issues from: {ISSUE_LIST}>], "confidence": <0.0-1.0>, "recommendations": [<3 brief actionable suggestions>]}}"""

    BALANCE_PROMPT = f"""You are analyzing a video of an elderly person performing a balance test (SPPB - Short Physical Performance Battery).

Evaluate:
1. Ability to stand still without stepping
2. Sway magnitude and velocity
3. Trunk lean and its variability
4. Need for support or arm movements
5. Foot placement stability

SPPB Balance Scoring Guide:
- 4 = Steady throughout, minimal sway velocity, trunk lean <5 degrees
- 3 = Minor sway but maintains position, trunk lean variability <4 degrees
- 2 = Noticeable wobble, needs adjustment, trunk lean >10 degrees at times
- 1 = Unable to hold position, steps or grabs support, large sway area
- 0 = Unable to attempt safely

Return ONLY valid JSON in this exact format (no markdown, no code blocks):
{{"score": <0-4>, "issues": [<list of issues from: {ISSUE_LIST}>], "confidence": <0.0-1.0>, "recommendations": [<3 brief actionable suggestions>]}}"""

    CHAIR_STAND_PROMPT = f"""You are analyzing a video of an elderly person performing a chair stand test (SPPB - Short Physical Performance Battery).

Evaluate:
1. Ability to stand up and sit down safely
2. Number of repetitions completed
3. Speed and control of each repetition
4. Trunk lean during rising (excessive lean suggests using momentum)
5. Consistency across repetitions
6. Use of hands or need for support

SPPB Chair Stand Scoring Guide:
- 4 = 5 stands in <11.2s, smooth without hands, consistent timing
- 3 = 5 stands in 11.2-13.6s, minor slowness, low trunk lean
- 2 = 5 stands in 13.7-16.6s, or needs arms, inconsistent reps
- 1 = 5 stands in >16.7s, or incomplete, excessive trunk lean (>25 deg)
- 0 = Unable to stand without assistance

Return ONLY valid JSON in this exact format (no markdown, no code blocks):
{{"score": <0-4>, "issues": [<list of issues from: {ISSUE_LIST}>], "confidence": <0.0-1.0>, "recommendations": [<3 brief actionable suggestions>]}}"""

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
                flags.append("HIGH SWAY VELOCITY (>3.0 px/frame) — indicates postural instability")
            if metrics.get("trunkLeanVariability", 0) > 4.0:
                flags.append("HIGH TRUNK LEAN VARIABILITY (>4.0° SD) — inconsistent postural control")
            trunk_max = metrics.get("trunkLean", {}).get("max", 0)
            if trunk_max > 15:
                flags.append(f"EXCESSIVE TRUNK LEAN ({trunk_max}° max, threshold 15°)")

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
                flags.append(f"EXCESSIVE FORWARD LEAN DURING RISE ({metrics.get('peakTrunkLeanDuringRise', 0)}°, threshold 25°)")
            if metrics.get("repConsistency", 0) > 25:
                flags.append(f"INCONSISTENT REP TIMING (CV {metrics.get('repConsistency', 0)}%, threshold 25%)")
            reps = metrics.get("refinedRepCount", 0)
            if 0 < reps < 5:
                flags.append(f"LOW REP COUNT ({reps} reps, target 5)")

        return flags

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

        header = f"\n\n--- POSE ESTIMATION DATA ({fc} frames, {dur}ms duration) ---"

        flags = GeminiVisionService._generate_clinical_flags(test_type, metrics)
        flags_block = ""
        if flags:
            flags_block = "\n\nCLINICAL FLAGS:\n" + "\n".join(f"⚠ {f}" for f in flags)

        if test_type == AssessmentTest.BALANCE.value:
            sway_vel = metrics.get("swayVelocity", 0)
            sway_area = metrics.get("swayArea", 0)
            trunk_var = metrics.get("trunkLeanVariability", 0)
            return header + f"""
BALANCE METRICS:
- Sway velocity: {sway_vel} px/frame (healthy elderly: <2.0, at-risk: >3.0)
- Sway area (bounding box): {sway_area} px² (lower = more stable)
- Total sway displacement: {sway.get('totalDisplacement', 0)} px
- Max sway deviation: {sway.get('maxDeviation', 0)} px
- Trunk lean: avg {trunk.get('avg', 0)}°, max {trunk.get('max', 0)}° (healthy: <5° avg, <10° max)
- Trunk lean variability (SD): {trunk_var}° (healthy: <3.0°, at-risk: >4.0°)
- Shoulder levelness: avg deviation {shoulder.get('avg', 0)}px, max {shoulder.get('max', 0)}px
- Stance width: {stance.get('avg', 0)} px
{flags_block}
Cross-reference these quantitative metrics with your visual assessment. Prioritize sway velocity and trunk lean variability as primary balance indicators."""

        elif test_type == AssessmentTest.GAIT.value:
            gait_speed = metrics.get("estimatedGaitSpeed", 0)
            step_count = metrics.get("stepCount", 0)
            cadence = metrics.get("cadence", 0)
            step_len = metrics.get("stepLengthEstimate", 0)
            symmetry = metrics.get("stepSymmetryIndex", 0)
            dsr = metrics.get("doubleSupportRatio", 0)
            rhythm_cv = metrics.get("gaitRhythmVariability", 0)
            return header + f"""
GAIT METRICS:
- Estimated gait speed: {gait_speed} px/s (relative; higher = faster)
- Steps detected: {step_count}
- Cadence: {cadence} steps/min (healthy elderly: 100-120, at-risk: <80)
- Step length estimate: {step_len} px (relative; consistent = good)
- Step symmetry index: {symmetry}% (0% = perfect, >20% = asymmetric gait)
- Double support ratio: {dsr} (healthy: <0.3, at-risk: >0.4)
- Gait rhythm variability (CV): {rhythm_cv}% (healthy: <8%, at-risk: >10%)
- Knee flexion: avg {knee.get('avg', 0)}°, range {knee.get('range', 0)}° (healthy walking: 60-70° range)
- Hip angle: avg {hip.get('avg', 0)}°, range {hip.get('range', 0)}°
- Arm swing: L={arm.get('leftAmplitude', 0)}px R={arm.get('rightAmplitude', 0)}px, symmetry {arm.get('symmetry', 0)} (1.0 = perfect)
- Trunk lean: avg {trunk.get('avg', 0)}°
- Stance width: avg {stance.get('avg', 0)} px
{flags_block}
Cross-reference these quantitative metrics with your visual assessment. Key indicators: cadence, step symmetry, rhythm variability, and double support ratio."""

        elif test_type == AssessmentTest.CHAIR_STAND.value:
            rep_count = metrics.get("refinedRepCount", 0)
            avg_rep = metrics.get("avgRepTime", 0)
            peak_lean = metrics.get("peakTrunkLeanDuringRise", 0)
            trans_speed = metrics.get("transitionSpeed", 0)
            rep_cv = metrics.get("repConsistency", 0)
            return header + f"""
CHAIR STAND METRICS:
- Repetitions detected: {rep_count} (target: 5; SPPB requires 5 stands)
- Average rep time: {avg_rep} ms (SPPB cutoffs: <2240ms=score 4, <2720ms=3, <3320ms=2, else=1)
- Total duration: {dur} ms (SPPB cutoffs: <11.2s=4, <13.7s=3, <16.7s=2, else=1)
- Peak trunk lean during rise: {peak_lean}° (healthy: <15°, compensatory: >25°)
- Transition speed (knee velocity): {trans_speed} deg/frame (higher = more explosive)
- Rep consistency (CV): {rep_cv}% (healthy: <15%, fatiguing: >25%)
- Knee angle: min {knee.get('min', 0)}° (seated) → max {knee.get('max', 0)}° (standing), range {knee.get('range', 0)}°
- Hip angle: min {hip.get('min', 0)}° → max {hip.get('max', 0)}°, range {hip.get('range', 0)}°
- Movement phases (knee oscillations): {phases}
{flags_block}
Cross-reference these quantitative metrics with your visual assessment. Key indicators: rep count, avg rep time, trunk lean during rise, and rep consistency."""

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

            # Build prompt — base + optional metrics supplement
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
            result_text = strip_markdown_fences(response.text.strip())
            logger.info(f"Gemini response: {result_text}")

            result_data = json.loads(result_text)

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

        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse Gemini response: {e}")
            return AssessmentResult(
                user_id=user_id,
                score=2,
                issues=[],
                test_type=AssessmentTest(test_type) if test_type in self.PROMPTS else None,
                confidence=0.3,
                recommendations=[
                    "Video analysis incomplete - please try again",
                    "Ensure good lighting and clear view",
                    "Walk at your normal pace"
                ],
                low_confidence_warning="This score is an estimate — the video could not be fully analyzed. Please try again for accurate results.",
                pose_metrics=parsed_metrics,
            )
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

            result_text = strip_markdown_fences(response.text.strip())

            result_data = json.loads(result_text)

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

        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse Gemini response: {e}")
            fallback = AssessmentResult(
                user_id=user_id,
                score=2,
                issues=[],
                test_type=AssessmentTest(test_type) if test_type in self.PROMPTS else None,
                confidence=0.3,
                recommendations=[
                    "Video analysis incomplete - please try again",
                    "Ensure good lighting and clear view",
                    "Walk at your normal pace"
                ],
                low_confidence_warning="This score is an estimate — the video could not be fully analyzed. Please try again for accurate results.",
                pose_metrics=parsed_metrics,
            )
            yield ("complete", {"result": fallback.model_dump()})

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
