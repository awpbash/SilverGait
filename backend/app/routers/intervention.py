"""Intervention API endpoints - Agentic decision outputs."""

from fastapi import APIRouter, HTTPException, Depends, Body
from typing import Optional
import logging

from ..services.agent import PhysioAgentService
from ..services.sealion import SeaLionService
from ..services.hpb_wearables import HPBWearablesService
from ..services.gemini_vision import GeminiVisionService
from ..models.health import UserRiskProfile, RiskLevel
from ..models.intervention import InterventionAction

router = APIRouter(prefix="/intervention", tags=["Intervention"])
logger = logging.getLogger(__name__)


def get_sealion_service() -> SeaLionService:
    return SeaLionService()


def get_agent_service(sealion: SeaLionService = Depends(get_sealion_service)) -> PhysioAgentService:
    return PhysioAgentService(sealion)


def get_hpb_service() -> HPBWearablesService:
    return HPBWearablesService()


@router.post("/decide", response_model=InterventionAction)
async def get_intervention(
    user_profile: UserRiskProfile = Body(...),
    agent: PhysioAgentService = Depends(get_agent_service),
    hpb: HPBWearablesService = Depends(get_hpb_service),
):
    """
    Get personalized intervention recommendation.
    The core agentic decision endpoint.
    """
    try:
        # Fetch latest metrics
        health_metrics = None
        mvpa_change = None

        try:
            health_metrics = await hpb.get_daily_metrics(user_profile.user_id)
            trend = await hpb.get_weekly_trend(user_profile.user_id)
            mvpa_change = trend.get("change_percent")
        except Exception as e:
            logger.warning(f"Could not fetch HPB data: {e}")

        # Make decision
        intervention = await agent.decide_intervention(
            user_profile=user_profile,
            health_metrics=health_metrics,
            mvpa_change_percent=mvpa_change,
        )

        return intervention

    except Exception as e:
        logger.error(f"Intervention decision failed: {e}")
        raise HTTPException(
            status_code=503,
            detail=f"Unable to generate recommendation. Retrying... Error: {str(e)}",
        )


@router.post("/translate")
async def translate_message(
    message: str = Body(..., embed=True),
    dialect: str = Body("singlish", embed=True),
    sealion: SeaLionService = Depends(get_sealion_service),
):
    """
    Translate a message to Singlish/dialect.
    Utility endpoint for custom messages.
    """
    try:
        translated = await sealion.translate_advice(message, dialect)
        return {"original": message, "translated": translated, "dialect": dialect}
    except Exception as e:
        raise HTTPException(
            status_code=503,
            detail=f"Translation failed. Retrying... Error: {str(e)}",
        )


@router.get("/status")
async def health_check(sealion: SeaLionService = Depends(get_sealion_service)):
    """Check SeaLion API connectivity."""
    is_healthy = await sealion.health_check()
    if not is_healthy:
        raise HTTPException(status_code=503, detail="SeaLion service unavailable")
    return {"status": "healthy", "service": "sealion"}
