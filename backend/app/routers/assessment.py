"""SPPB Assessment API endpoints - Gemini Vision analysis."""

from fastapi import APIRouter, HTTPException, UploadFile, File, Form, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
import json
import logging

from ..services.gemini_vision import GeminiVisionService
from ..models.assessment import AssessmentResult
from ..models.db_models import Assessment as AssessmentRow
from ..core.database import get_db

router = APIRouter(prefix="/assessment", tags=["SPPB Assessment"])
logger = logging.getLogger(__name__)


def get_gemini_service() -> GeminiVisionService:
    return GeminiVisionService()


@router.post("/analyze", response_model=AssessmentResult)
async def analyze_video(
    video: UploadFile = File(..., description="Video file for SPPB analysis"),
    user_id: str = Form(..., description="User ID"),
    test_type: str = Form("gait", description="SPPB test type (gait, balance, chair_stand)"),
    pose_metrics: str = Form("", description="JSON pose metrics from frontend (optional)"),
    service: GeminiVisionService = Depends(get_gemini_service),
    db: AsyncSession = Depends(get_db),
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

    # Validate test type
    allowed_tests = ["gait", "balance", "chair_stand"]
    if test_type not in allowed_tests:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid test type '{test_type}'. Allowed: {allowed_tests}",
        )

    # Analyze via Gemini
    try:
        result = await service.analyze_video(
            video_bytes=video_bytes,
            user_id=user_id,
            mime_type=base_type,  # Use base type without codecs
            test_type=test_type,
            pose_metrics=pose_metrics,
        )

        # Persist to database
        await _save_assessment(db, result, test_type, pose_metrics)

        return result
    except Exception as e:
        logger.error(f"Video analysis failed: {e}")
        raise HTTPException(
            status_code=503,
            detail=f"Analysis failed: {str(e)}",
        )


@router.post("/analyze-stream")
async def analyze_video_stream(
    video: UploadFile = File(..., description="Video file for SPPB analysis"),
    user_id: str = Form(..., description="User ID"),
    test_type: str = Form("gait", description="SPPB test type (gait, balance, chair_stand)"),
    pose_metrics: str = Form("", description="JSON pose metrics from frontend (optional)"),
    service: GeminiVisionService = Depends(get_gemini_service),
    db: AsyncSession = Depends(get_db),
):
    """
    Analyze video with SSE progress updates.
    Streams stage events: uploading, processing, analyzing, complete.
    """
    content_type = video.content_type or ""
    base_type = content_type.split(";")[0].strip()
    allowed_types = ["video/mp4", "video/webm", "video/quicktime"]

    if base_type not in allowed_types:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file type '{content_type}'. Allowed: {allowed_types}",
        )

    try:
        video_bytes = await video.read()
        if len(video_bytes) > 50 * 1024 * 1024:
            raise HTTPException(status_code=400, detail="Video too large (max 50MB)")
        if len(video_bytes) == 0:
            raise HTTPException(status_code=400, detail="Video file is empty")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to read video: {str(e)}")

    allowed_tests = ["gait", "balance", "chair_stand"]
    if test_type not in allowed_tests:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid test type '{test_type}'. Allowed: {allowed_tests}",
        )

    async def event_generator():
        async for stage, payload in service.analyze_video_stream(
            video_bytes=video_bytes,
            user_id=user_id,
            mime_type=base_type,
            test_type=test_type,
            pose_metrics=pose_metrics,
        ):
            # Persist result to DB when complete
            if stage == "complete" and "result" in payload:
                try:
                    await _save_assessment(db, payload["result"], test_type, pose_metrics)
                except Exception as e:
                    logger.warning(f"Failed to persist assessment: {e}")

            event_data = json.dumps({"stage": stage, **payload}, default=str)
            yield f"data: {event_data}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


async def _save_assessment(
    db: AsyncSession, result, test_type: str, pose_metrics_json: str = ""
):
    """Persist an assessment result to the database."""
    # Handle both Pydantic model and dict
    if hasattr(result, "model_dump"):
        data = result.model_dump()
    elif hasattr(result, "dict"):
        data = result.dict()
    elif isinstance(result, dict):
        data = result
    else:
        data = dict(result)

    sppb = data.get("sppb_breakdown")
    total = None
    if sppb:
        total = sppb.get("balance_score", 0) + sppb.get("gait_score", 0) + sppb.get("chair_stand_score", 0)

    row = AssessmentRow(
        user_id=data.get("user_id", "unknown"),
        test_type=test_type,
        score=data.get("score", 0),
        total_score=total,
        confidence=data.get("confidence", 0.0),
    )
    row.issues = data.get("issues", [])
    row.recommendations = data.get("recommendations", [])
    row.sppb_breakdown = sppb
    row.completed_tests = data.get("completed_tests")

    if pose_metrics_json:
        try:
            row.pose_metrics = json.loads(pose_metrics_json)
        except (json.JSONDecodeError, TypeError):
            pass

    db.add(row)
    await db.commit()
    logger.info(f"Assessment saved: user={row.user_id}, test={test_type}, score={row.score}")


@router.get("/status")
async def health_check(service: GeminiVisionService = Depends(get_gemini_service)):
    """Check Gemini Vision API connectivity."""
    is_healthy = await service.health_check()
    if not is_healthy:
        raise HTTPException(status_code=503, detail="Gemini service unavailable")
    return {"status": "healthy", "service": "gemini"}
