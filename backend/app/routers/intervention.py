"""Intervention API endpoints - Agentic decision outputs."""

from fastapi import APIRouter, HTTPException, Depends, Body
from typing import Optional
import logging

from datetime import date, timedelta

from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from ..services.agent import PhysioAgentService
from ..services.sealion import SeaLionService
from ..services.hpb_wearables import HPBWearablesService
from ..services.gemini_vision import GeminiVisionService
from ..models.health import UserRiskProfile, RiskLevel
from ..models.intervention import InterventionAction
from ..models.db_models import Intervention as InterventionRow, Assessment, ExerciseLog
from ..core.database import get_db

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


@router.get("/latest/{user_id}")
async def get_latest_intervention(
    user_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Get the most recent intervention for a user."""
    stmt = (
        select(InterventionRow)
        .where(InterventionRow.user_id == user_id)
        .order_by(InterventionRow.timestamp.desc())
        .limit(1)
    )
    result = await db.execute(stmt)
    row = result.scalar_one_or_none()
    if not row:
        return None
    return {
        "user_id": row.user_id,
        "timestamp": row.timestamp.isoformat(),
        "action_type": row.action_type,
        "priority": row.priority,
        "raw_message": row.raw_message,
        "localized_message": row.localized_message,
        "trigger_reason": row.trigger_reason,
        "suggested_duration_minutes": row.suggested_duration_minutes,
    }


@router.get("/alerts/{user_id}")
async def get_alerts(user_id: str, db: AsyncSession = Depends(get_db)):
    """
    Analyze user's assessment trend and exercise adherence to generate alerts.
    Used by CaregiverPage and ActivityPage.
    """
    alerts: list[dict] = []

    # Fetch last 5 assessments for trend detection
    result = await db.execute(
        select(Assessment)
        .where(Assessment.user_id == user_id)
        .order_by(desc(Assessment.timestamp))
        .limit(5)
    )
    assessments = result.scalars().all()

    if len(assessments) >= 2:
        def _sppb_total(a: Assessment) -> int:
            bd = a.sppb_breakdown or {}
            t = bd.get("balance_score", 0) + bd.get("gait_score", 0) + bd.get("chair_stand_score", 0)
            return t if t > 0 else (a.score or 0)

        latest_score = _sppb_total(assessments[0])
        prev_score = _sppb_total(assessments[1])
        delta = latest_score - prev_score

        # Score decline alert
        if delta < 0:
            severity = "urgent" if abs(delta) >= 3 or latest_score < 6 else "warning"
            alerts.append({
                "type": "score_decline",
                "severity": severity,
                "message": f"SPPB score dropped from {prev_score} to {latest_score} ({delta:+d})",
                "priority": 4 if severity == "urgent" else 3,
            })

        # Check for consistent decline (3+ assessments trending down)
        if len(assessments) >= 3:
            scores = [_sppb_total(a) for a in assessments[:3]]
            if scores[0] < scores[1] < scores[2]:
                alerts.append({
                    "type": "sustained_decline",
                    "severity": "urgent",
                    "message": f"Scores declining over 3 checks: {scores[2]} → {scores[1]} → {scores[0]}",
                    "priority": 5,
                })

        # Low score alert
        if latest_score < 6:
            alerts.append({
                "type": "high_risk",
                "severity": "urgent",
                "message": f"Current SPPB score ({latest_score}/12) indicates high fall risk",
                "priority": 4,
            })

    # Exercise inactivity alert
    today = date.today()
    week_ago = today - timedelta(days=6)
    ex_result = await db.execute(
        select(ExerciseLog).where(
            ExerciseLog.user_id == user_id,
            ExerciseLog.date >= week_ago,
            ExerciseLog.completed == True,
        )
    )
    ex_logs = ex_result.scalars().all()
    active_days = len(set(l.date for l in ex_logs))

    if active_days == 0:
        alerts.append({
            "type": "inactivity",
            "severity": "warning",
            "message": "No exercises completed in the past 7 days",
            "priority": 3,
        })
    elif active_days <= 2:
        alerts.append({
            "type": "low_activity",
            "severity": "info",
            "message": f"Only {active_days} active day{'s' if active_days > 1 else ''} this week",
            "priority": 2,
        })

    # Determine overall trend
    trend = "stable"
    if len(assessments) >= 2:
        latest = _sppb_total(assessments[0])
        prev = _sppb_total(assessments[1])
        if latest > prev:
            trend = "improving"
        elif latest < prev:
            trend = "declining"

    # Sort by priority descending
    alerts.sort(key=lambda a: a["priority"], reverse=True)

    return {
        "alerts": alerts,
        "trend": trend,
        "total_assessments": len(assessments),
        "active_days_this_week": active_days,
    }


@router.get("/status")
async def health_check(sealion: SeaLionService = Depends(get_sealion_service)):
    """Check SeaLion API connectivity."""
    is_healthy = await sealion.health_check()
    if not is_healthy:
        raise HTTPException(status_code=503, detail="SeaLion service unavailable")
    return {"status": "healthy", "service": "sealion"}
