"""User management endpoints — lightweight session auth."""

import logging
from datetime import datetime
from typing import Literal
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.database import get_db
from ..core.auth import create_session, get_current_user
from ..models.db_models import User, Session, HealthSnapshot, FrailtyEvaluation, CarePlan, Alert
from ..services.scoring import score_katz, score_cfs, CFS_LABELS
from ..services.context import build_user_context

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/users", tags=["Users"])


class UserCreate(BaseModel):
    display_name: str = ""
    language: str = "en"
    gender: str | None = None  # male | female | other


class UserResponse(BaseModel):
    id: str
    display_name: str
    language: str
    gender: str | None = None
    created_at: str
    onboarded: bool = False
    token: str | None = None


class UserUpdate(BaseModel):
    display_name: str | None = None
    language: str | None = None
    gender: str | None = None


class HealthSnapshotRequest(BaseModel):
    trigger: Literal["onboarding", "user_update", "biweekly_recheck"] = "onboarding"
    katz_bathing: bool | None = None
    katz_dressing: bool | None = None
    katz_toileting: bool | None = None
    katz_transferring: bool | None = None
    katz_continence: bool | None = None
    katz_feeding: bool | None = None
    cognitive_risk: str | None = None  # low | moderate | high
    mood_risk: str | None = None
    sleep_risk: str | None = None
    social_isolation_risk: str | None = None


@router.post("", response_model=UserResponse)
async def create_user(body: UserCreate, db: AsyncSession = Depends(get_db)):
    """Create a new user with server-generated UUID and session token."""
    user_id = uuid4().hex
    user = User(id=user_id, display_name=body.display_name, language=body.language, gender=body.gender)
    db.add(user)
    await db.flush()

    token = await create_session(db, user_id)
    await db.commit()

    return UserResponse(
        id=user.id,
        display_name=user.display_name,
        language=user.language,
        gender=user.gender,
        created_at=user.created_at.isoformat(),
        onboarded=user.onboarded_at is not None,
        token=token,
    )


class TokenValidateRequest(BaseModel):
    token: str


@router.post("/validate-token", response_model=UserResponse)
async def validate_token(body: TokenValidateRequest, db: AsyncSession = Depends(get_db)):
    """Validate an existing token and return user info. Used on app reload."""
    result = await db.execute(select(Session).where(Session.token == body.token))
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=401, detail="Invalid token")
    if session.expires_at < datetime.utcnow():
        raise HTTPException(status_code=401, detail="Token expired")

    user = await db.get(User, session.user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    return UserResponse(
        id=user.id,
        display_name=user.display_name,
        language=user.language,
        gender=user.gender,
        created_at=user.created_at.isoformat(),
        onboarded=user.onboarded_at is not None,
        token=body.token,
    )


@router.patch("/{user_id}", response_model=UserResponse, dependencies=[Depends(get_current_user)])
async def update_user(user_id: str, body: UserUpdate, db: AsyncSession = Depends(get_db)):
    """Update user display name or language."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if not user:
        user = User(id=user_id)
        db.add(user)

    if body.display_name is not None:
        user.display_name = body.display_name
    if body.language is not None:
        user.language = body.language
    if body.gender is not None:
        user.gender = body.gender

    await db.commit()
    await db.refresh(user)

    return UserResponse(
        id=user.id,
        display_name=user.display_name,
        language=user.language,
        gender=user.gender,
        created_at=user.created_at.isoformat(),
        onboarded=user.onboarded_at is not None,
    )


@router.post("/{user_id}/health-snapshot", dependencies=[Depends(get_current_user)])
async def create_health_snapshot(
    user_id: str,
    body: HealthSnapshotRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Save health answers (Katz ADL + Contributing Conditions) and trigger Assessment Graph.
    This is the main data ingestion endpoint for onboarding, profile updates, and rechecks.
    """
    logger.info(f"POST /users/{user_id}/health-snapshot called: trigger={body.trigger}")
    # Ensure user exists
    user = await db.get(User, user_id)
    if not user:
        user = User(id=user_id)
        db.add(user)
        await db.flush()

    # Build Katz answers dict
    katz_answers = {}
    if body.katz_bathing is not None:
        katz_answers["bathing"] = body.katz_bathing
    if body.katz_dressing is not None:
        katz_answers["dressing"] = body.katz_dressing
    if body.katz_toileting is not None:
        katz_answers["toileting"] = body.katz_toileting
    if body.katz_transferring is not None:
        katz_answers["transferring"] = body.katz_transferring
    if body.katz_continence is not None:
        katz_answers["continence"] = body.katz_continence
    if body.katz_feeding is not None:
        katz_answers["feeding"] = body.katz_feeding

    # Compute scores
    katz_total = score_katz(katz_answers) if katz_answers else None
    cfs = score_cfs(katz_total) if katz_total is not None else None

    # Create health snapshot (append-only)
    snapshot = HealthSnapshot(
        user_id=user_id,
        trigger=body.trigger,
        katz_bathing=body.katz_bathing,
        katz_dressing=body.katz_dressing,
        katz_toileting=body.katz_toileting,
        katz_transferring=body.katz_transferring,
        katz_continence=body.katz_continence,
        katz_feeding=body.katz_feeding,
        katz_total=katz_total,
        cognitive_risk=body.cognitive_risk,
        mood_risk=body.mood_risk,
        sleep_risk=body.sleep_risk,
        social_isolation_risk=body.social_isolation_risk,
        cfs_score=cfs,
        cfs_label=CFS_LABELS.get(cfs) if cfs else None,
    )
    db.add(snapshot)
    await db.flush()

    # Mark user as onboarded if this is onboarding trigger
    if body.trigger == "onboarding" and not user.onboarded_at:
        user.onboarded_at = datetime.utcnow()

    # Run Assessment Graph
    from ..services.langgraph_agents.assessment_graph import run_assessment_pipeline

    contributing = {}
    if body.cognitive_risk:
        contributing["cognitive_risk"] = body.cognitive_risk
    if body.mood_risk:
        contributing["mood_risk"] = body.mood_risk
    if body.sleep_risk:
        contributing["sleep_risk"] = body.sleep_risk
    if body.social_isolation_risk:
        contributing["social_isolation_risk"] = body.social_isolation_risk

    pipeline_result = await run_assessment_pipeline(
        db=db,
        user_id=user_id,
        trigger=body.trigger,
        katz_answers=katz_answers if katz_answers else None,
        contributing=contributing if contributing else None,
        health_snapshot_id=snapshot.id,
        language=user.language or "en",
    )

    logger.info(f"Health snapshot created for {user_id}: trigger={body.trigger}, tier={pipeline_result.get('frailty_tier')}, tier_changed={pipeline_result.get('tier_changed')}, plans={len(pipeline_result.get('new_plans', []))}")

    return {
        "snapshot_id": snapshot.id,
        "katz_total": katz_total,
        "cfs_score": cfs,
        "frailty_tier": pipeline_result.get("frailty_tier"),
        "risk_explanation": pipeline_result.get("risk_explanation"),
        "tier_changed": pipeline_result.get("tier_changed"),
        "new_plans": pipeline_result.get("new_plans", []),
    }


@router.get("/{user_id}/context", dependencies=[Depends(get_current_user)])
async def get_user_context(user_id: str, db: AsyncSession = Depends(get_db)):
    """Get full UserContext for frontend rendering."""
    ctx = await build_user_context(db, user_id)
    return {
        "user_id": ctx.user_id,
        "display_name": ctx.display_name,
        "gender": ctx.gender,
        "language": ctx.language,
        "voice_id": ctx.voice_id,
        "onboarded": ctx.onboarded,
        "current_tier": ctx.current_tier,
        "cfs_score": ctx.cfs_score,
        "katz_total": ctx.katz_total,
        "sppb_total": ctx.sppb_total,
        "balance_score": ctx.balance_score,
        "gait_score": ctx.gait_score,
        "chair_score": ctx.chair_score,
        "sppb_trend": ctx.sppb_trend,
        "sppb_direction": ctx.sppb_direction,
        "katz_trend": ctx.katz_trend,
        "tier_history": ctx.tier_history,
        "exercise_streak": ctx.exercise_streak,
        "exercises_this_week": ctx.exercises_this_week,
        "exercises_today": ctx.exercises_today,
        "days_since_last_assessment": ctx.days_since_last_assessment,
        "recheck_due": ctx.recheck_due,
        "sleep_risk": ctx.sleep_risk,
        "mood_risk": ctx.mood_risk,
        "cognitive_risk": ctx.cognitive_risk,
        "social_isolation_risk": ctx.social_isolation_risk,
        "active_plans": ctx.active_plans,
        "unread_alerts": ctx.unread_alerts,
        "recent_issues": ctx.recent_issues,
    }


@router.get("/{user_id}/alerts", dependencies=[Depends(get_current_user)])
async def get_user_alerts(user_id: str, db: AsyncSession = Depends(get_db)):
    """Get all alerts for a user."""
    result = await db.execute(
        select(Alert)
        .where(Alert.user_id == user_id)
        .order_by(desc(Alert.timestamp))
        .limit(50)
    )
    alerts = result.scalars().all()
    return [a.to_dict() for a in alerts]


@router.get("/{user_id}/frailty-history", dependencies=[Depends(get_current_user)])
async def get_frailty_history(user_id: str, db: AsyncSession = Depends(get_db)):
    """Get frailty evaluation history."""
    result = await db.execute(
        select(FrailtyEvaluation)
        .where(FrailtyEvaluation.user_id == user_id)
        .order_by(desc(FrailtyEvaluation.timestamp))
        .limit(20)
    )
    evals = result.scalars().all()
    return [e.to_dict() for e in evals]


@router.get("/{user_id}/care-plans", dependencies=[Depends(get_current_user)])
async def get_care_plans(user_id: str, status: str = "active", db: AsyncSession = Depends(get_db)):
    """Get care plans for a user."""
    query = select(CarePlan).where(CarePlan.user_id == user_id)
    if status != "all":
        query = query.where(CarePlan.status == status)
    query = query.order_by(desc(CarePlan.created_at))

    result = await db.execute(query)
    plans = result.scalars().all()
    return [p.to_dict() for p in plans]
