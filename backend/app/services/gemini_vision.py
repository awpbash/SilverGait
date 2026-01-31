"""Gemini Vision service for SPPB gait/balance analysis."""

from google import genai
import json
import logging
import tempfile
import os
import time

from ..core.config import get_settings
from ..models.assessment import AssessmentResult, GaitIssue

logger = logging.getLogger(__name__)


class GeminiVisionService:
    """
    SPPB Mobility Analysis via Gemini Flash.
    Analyzes video for gait/balance assessment.
    """

    ANALYSIS_PROMPT = """You are analyzing a video of an elderly person walking for a mobility assessment (SPPB - Short Physical Performance Battery).

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

    def __init__(self):
        settings = get_settings()
        self.client = genai.Client(api_key=settings.gemini_api_key)
        self.model = "gemini-3-flash-preview"

    async def analyze_video(
        self, video_bytes: bytes, user_id: str, mime_type: str = "video/webm"
    ) -> AssessmentResult:
        """
        Analyze video for SPPB scoring using Gemini File API.
        """
        temp_path = None
        uploaded_file = None

        try:
            logger.info(f"Analyzing video for user {user_id}, size: {len(video_bytes)} bytes, type: {mime_type}")

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

            # Generate response
            logger.info("Sending to Gemini for analysis...")
            response = self.client.models.generate_content(
                model=self.model,
                contents=[uploaded_file, self.ANALYSIS_PROMPT],
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
                confidence=float(result_data.get("confidence", 0.7)),
                recommendations=result_data.get("recommendations", [
                    "Continue daily walking exercises",
                    "Practice balance near a wall for support",
                    "Consult a physiotherapist for personalized advice"
                ]),
            )

        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse Gemini response: {e}")
            return AssessmentResult(
                user_id=user_id,
                score=2,
                issues=[],
                confidence=0.5,
                recommendations=[
                    "Video analysis incomplete - please try again",
                    "Ensure good lighting and clear view",
                    "Walk at your normal pace"
                ],
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
