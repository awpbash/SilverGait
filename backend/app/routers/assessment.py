"""SPPB Assessment API endpoints - Gemini Vision analysis."""

from fastapi import APIRouter, HTTPException, UploadFile, File, Form, Depends
import logging

from ..services.gemini_vision import GeminiVisionService
from ..models.assessment import AssessmentResult

router = APIRouter(prefix="/assessment", tags=["SPPB Assessment"])
logger = logging.getLogger(__name__)


def get_gemini_service() -> GeminiVisionService:
    return GeminiVisionService()


@router.post("/analyze", response_model=AssessmentResult)
async def analyze_video(
    video: UploadFile = File(..., description="Video file for SPPB analysis"),
    user_id: str = Form(..., description="User ID"),
    service: GeminiVisionService = Depends(get_gemini_service),
):
    """
    Analyze video for SPPB gait/balance scoring.
    Accepts video blob, returns structured assessment.
    """
    # Log received content type
    logger.info(f"Received video content type: {video.content_type}")

    # Normalize content type (strip codecs info for validation)
    content_type = video.content_type or ""
    base_type = content_type.split(";")[0].strip()

    # Allowed base types
    allowed_types = ["video/mp4", "video/webm", "video/quicktime"]

    if base_type not in allowed_types:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file type '{content_type}'. Allowed: {allowed_types}",
        )

    # Read video bytes
    try:
        video_bytes = await video.read()
        if len(video_bytes) > 50 * 1024 * 1024:  # 50MB limit
            raise HTTPException(status_code=400, detail="Video too large (max 50MB)")
        if len(video_bytes) == 0:
            raise HTTPException(status_code=400, detail="Video file is empty")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to read video: {str(e)}")

    # Analyze via Gemini
    try:
        result = await service.analyze_video(
            video_bytes=video_bytes,
            user_id=user_id,
            mime_type=base_type,  # Use base type without codecs
        )
        return result
    except Exception as e:
        logger.error(f"Video analysis failed: {e}")
        raise HTTPException(
            status_code=503,
            detail=f"Analysis failed: {str(e)}",
        )


@router.get("/status")
async def health_check(service: GeminiVisionService = Depends(get_gemini_service)):
    """Check Gemini Vision API connectivity."""
    is_healthy = await service.health_check()
    if not is_healthy:
        raise HTTPException(status_code=503, detail="Gemini service unavailable")
    return {"status": "healthy", "service": "gemini"}
