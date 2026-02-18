"""Gemini Vision service for SPPB gait/balance analysis."""

from google import genai
import json
import logging
import tempfile
import os
import time

from ..core.config import get_settings
from ..models.assessment import AssessmentResult, GaitIssue, AssessmentTest

logger = logging.getLogger(__name__)


class GeminiVisionService:
    """
    SPPB Mobility Analysis via Gemini Flash.
    Analyzes video for gait/balance assessment.
    """

    GAIT_PROMPT = """You are analyzing a video of an elderly person walking for a mobility assessment (SPPB - Short Physical Performance Battery).

Watch the video carefully and evaluate:
1. Walking speed (normal, slow, very slow)
2. Balance and stability (steady, some sway, unsteady)
3. Gait pattern (normal stride, shuffling, asymmetric)
4. Arm swing (normal, reduced, absent)
5. Any signs of hesitation or fear of falling

Based on your analysis, provide a mobility score from 0-4:
- 4 = Excellent mobility, smooth confident walking
- 3 = Good mobility, minor issues
- 2 = Fair mobility, noticeable difficulties
- 1 = Poor mobility, significant issues
- 0 = Unable to complete or severe impairment

Return ONLY valid JSON in this exact format (no markdown, no code blocks):
{"score": <0-4>, "issues": [<list of issues from: "shuffling", "sway", "asymmetry", "slow_speed", "unsteady_turns", "reduced_arm_swing", "wide_base", "hesitation">], "confidence": <0.0-1.0>, "recommendations": [<3 brief actionable suggestions>]}"""

    BALANCE_PROMPT = """You are analyzing a video of an elderly person performing a balance test (SPPB - Short Physical Performance Battery).

Evaluate:
1. Ability to stand still without stepping
2. Sway or loss of balance
3. Need for support or arm movements
4. Foot placement stability

Provide a balance score from 0-4:
- 4 = Steady throughout, no sway
- 3 = Minor sway but maintains position
- 2 = Noticeable wobble, needs adjustment
- 1 = Unable to hold position, steps or grabs support
- 0 = Unable to attempt safely

Use the closest issues from the allowed list if relevant.
Return ONLY valid JSON in this exact format (no markdown, no code blocks):
{"score": <0-4>, "issues": [<list of issues from: "shuffling", "sway", "asymmetry", "slow_speed", "unsteady_turns", "reduced_arm_swing", "wide_base", "hesitation">], "confidence": <0.0-1.0>, "recommendations": [<3 brief actionable suggestions>]}"""

    CHAIR_STAND_PROMPT = """You are analyzing a video of an elderly person performing a chair stand test (SPPB - Short Physical Performance Battery).

Evaluate:
1. Ability to stand up and sit down safely
2. Speed and control of the movement
3. Use of hands or need for support
4. Signs of hesitation or instability

Provide a chair stand score from 0-4:
- 4 = Completes stands smoothly without hands
- 3 = Completes with minor slowness
- 2 = Slow or needs arms for support
- 1 = Incomplete or very slow, unstable
- 0 = Unable to stand without assistance

Use the closest issues from the allowed list if relevant.
Return ONLY valid JSON in this exact format (no markdown, no code blocks):
{"score": <0-4>, "issues": [<list of issues from: "shuffling", "sway", "asymmetry", "slow_speed", "unsteady_turns", "reduced_arm_swing", "wide_base", "hesitation">], "confidence": <0.0-1.0>, "recommendations": [<3 brief actionable suggestions>]}"""

    PROMPTS = {
        AssessmentTest.GAIT.value: GAIT_PROMPT,
        AssessmentTest.BALANCE.value: BALANCE_PROMPT,
        AssessmentTest.CHAIR_STAND.value: CHAIR_STAND_PROMPT,
    }

    def __init__(self):
        settings = get_settings()
        self.client = genai.Client(api_key=settings.gemini_api_key)
        self.model = "gemini-3-flash-preview"

    @staticmethod
    def _build_metrics_supplement(test_type: str, metrics: dict) -> str:
        """
        Build a supplementary prompt block from pose metrics,
        tailored to the specific test type.
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

        header = f"\n\nSupplementary sensor data from real-time pose estimation ({fc} frames over {dur}ms):"

        if test_type == AssessmentTest.BALANCE.value:
            return header + f"""
- Body sway: total displacement {sway.get('totalDisplacement', 0)}px, max deviation {sway.get('maxDeviation', 0)}px
- Trunk lean: average {trunk.get('avg', 0)}°, maximum {trunk.get('max', 0)}°
- Shoulder levelness: average deviation {shoulder.get('avg', 0)}px, max {shoulder.get('max', 0)}px
- Stance width: average {stance.get('avg', 0)}px
Use this data to cross-reference your visual assessment. Higher sway/trunk lean = poorer balance. Low sway with steady shoulders = good stability."""

        elif test_type == AssessmentTest.GAIT.value:
            return header + f"""
- Knee flexion: avg {knee.get('avg', 0)}°, range {knee.get('range', 0)}° (healthy walking typically shows 60-70° range)
- Hip angle: avg {hip.get('avg', 0)}°, range {hip.get('range', 0)}°
- Arm swing: left {arm.get('leftAmplitude', 0)}px, right {arm.get('rightAmplitude', 0)}px, symmetry {arm.get('symmetry', 0)} (1.0 = perfect symmetry)
- Trunk lean: average {trunk.get('avg', 0)}°
- Stance width: average {stance.get('avg', 0)}px
Use this data to cross-reference your visual assessment. Reduced knee range, arm swing asymmetry, and excessive trunk lean suggest mobility limitations."""

        elif test_type == AssessmentTest.CHAIR_STAND.value:
            return header + f"""
- Knee angle: min {knee.get('min', 0)}° (seated), max {knee.get('max', 0)}° (standing), range {knee.get('range', 0)}°
- Hip angle: min {hip.get('min', 0)}° (seated), max {hip.get('max', 0)}° (standing), range {hip.get('range', 0)}°
- Trunk lean: max forward lean {trunk.get('max', 0)}° (excessive lean indicates using momentum)
- Sit-to-stand cycles detected: {phases} (target: 5)
Use this data to cross-reference your visual assessment. Fewer cycles and excessive trunk lean suggest difficulty with the task."""

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
            uploaded_file = self.client.files.upload(file=temp_path)
            logger.info(f"Uploaded file: {uploaded_file.name}, state: {uploaded_file.state.name}")

            # Wait for file to be processed
            max_wait = 60  # seconds
            waited = 0
            while uploaded_file.state.name == "PROCESSING" and waited < max_wait:
                logger.info(f"Waiting for video processing... ({waited}s)")
                time.sleep(2)
                waited += 2
                uploaded_file = self.client.files.get(name=uploaded_file.name)

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
            response = self.client.models.generate_content(
                model=self.model,
                contents=[uploaded_file, prompt],
            )

            # Parse response
            result_text = response.text.strip()
            logger.info(f"Gemini response: {result_text}")

            # Clean up response (remove markdown code blocks if present)
            if result_text.startswith("```"):
                lines = result_text.split("\n")
                if lines[0].startswith("```"):
                    lines = lines[1:]
                if lines and lines[-1].strip() == "```":
                    lines = lines[:-1]
                result_text = "\n".join(lines).strip()

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
                confidence=0.5,
                recommendations=[
                    "Video analysis incomplete - please try again",
                    "Ensure good lighting and clear view",
                    "Walk at your normal pace"
                ],
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
                except:
                    pass
            # Clean up uploaded file
            if uploaded_file:
                try:
                    self.client.files.delete(name=uploaded_file.name)
                except:
                    pass

    async def health_check(self) -> bool:
        """Verify Gemini API connectivity."""
        try:
            response = self.client.models.generate_content(
                model=self.model,
                contents="Say 'ok' if you can read this."
            )
            return response.text is not None
        except Exception as e:
            logger.error(f"Gemini health check failed: {e}")
            return False
