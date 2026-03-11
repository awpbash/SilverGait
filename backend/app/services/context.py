"""
UserContext assembly — single function that builds the holistic view
used by Chat Agent, Caregiver Page, Home Page, and Assessment Graph.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, date, timedelta

from sqlalchemy import select, func, desc
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.db_models import (
    User, HealthSnapshot, FrailtyEvaluation, CarePlan,
    Assessment, ExerciseLog, Alert,
)


@dataclass
class UserContext:
    """Holistic view of a user's state, assembled from multiple DB tables."""

    # Identity
    user_id: str = ""
    display_name: str = ""
    gender: str | None = None  # male | female | other
    language: str = "en"
    voice_id: str | None = None  # ElevenLabs voice_id
    onboarded: bool = False

    # Current health snapshot
    current_health: dict | None = None  # latest HealthSnapshot as dict
    current_tier: str | None = None  # latest frailty tier
    current_eval: dict | None = None  # latest FrailtyEvaluation as dict

    # Active care plans {plan_type: plan_dict}
    active_plans: dict[str, dict] = field(default_factory=dict)

    # Scores
    cfs_score: int | None = None
    katz_total: int | None = None
    sppb_total: int | None = None

    # SPPB sub-scores (from latest assessment)
    balance_score: int | None = None
    gait_score: int | None = None
    chair_score: int | None = None

    # Trends
    sppb_trend: list[int] = field(default_factory=list)
    sppb_direction: str = "stable"  # improving|stable|declining
    katz_trend: list[int] = field(default_factory=list)
    tier_history: list[str] = field(default_factory=list)

    # Activity
    exercise_streak: int = 0
    exercises_this_week: int = 0
    exercises_today: list[str] = field(default_factory=list)

    # Timing
    days_since_last_assessment: int | None = None
    days_since_last_snapshot: int | None = None
    recheck_due: bool = False

    # Risks (from health snapshot)
    sleep_risk: str = "low"
    mood_risk: str = "low"
    cognitive_risk: str = "low"
    social_isolation_risk: str = "low"

    # Alerts
    unread_alerts: list[dict] = field(default_factory=list)

    # Recent issues from assessments
    recent_issues: list[str] = field(default_factory=list)

    def to_system_prompt_context(self) -> str:
        """Serialize into text for Chat Agent system prompt."""
        gender_str = f", {self.gender}" if self.gender else ""
        parts = [f"User: {self.display_name or 'User'}{gender_str} (language: {self.language})"]

        if self.current_tier:
            parts.append(f"Frailty Tier: {self.current_tier}")
        if self.cfs_score is not None:
            parts.append(f"CFS: {self.cfs_score}/9, Katz ADL: {self.katz_total}/6")
        if self.sppb_total is not None:
            parts.append(f"SPPB: {self.sppb_total}/12 (balance:{self.balance_score}, gait:{self.gait_score}, chair:{self.chair_score})")

        if self.sppb_trend:
            parts.append(f"SPPB Trend: {self.sppb_trend} ({self.sppb_direction})")

        parts.append(f"Exercise streak: {self.exercise_streak} days, this week: {self.exercises_this_week}")

        risks = []
        if self.sleep_risk != "low":
            risks.append(f"sleep:{self.sleep_risk}")
        if self.mood_risk != "low":
            risks.append(f"mood:{self.mood_risk}")
        if self.cognitive_risk != "low":
            risks.append(f"cognitive:{self.cognitive_risk}")
        if self.social_isolation_risk != "low":
            risks.append(f"social:{self.social_isolation_risk}")
        if risks:
            parts.append(f"Risk factors: {', '.join(risks)}")

        if self.recheck_due:
            parts.append("Health recheck is due (>14 days since last snapshot)")

        if self.recent_issues:
            parts.append(f"Recent movement issues: {', '.join(self.recent_issues)}")

        if self.active_plans:
            parts.append(f"Active care plans: {', '.join(self.active_plans.keys())}")

        if self.unread_alerts:
            parts.append(f"Unread alerts: {len(self.unread_alerts)}")

        return "\n".join(parts)


async def build_user_context(db: AsyncSession, user_id: str) -> UserContext:
    """
    Single batch query that assembles the full user context.
    Used by: Chat Graph, Caregiver Page API, Home Page API, Assessment Graph.
    """
    ctx = UserContext(user_id=user_id)

    # 1. User
    user = await db.get(User, user_id)
    if not user:
        return ctx
    ctx.display_name = user.display_name or ""
    ctx.gender = user.gender
    ctx.language = user.language or "en"
    ctx.voice_id = user.voice_id
    ctx.onboarded = user.onboarded_at is not None

    # 2. Latest health snapshot
    result = await db.execute(
        select(HealthSnapshot)
        .where(HealthSnapshot.user_id == user_id)
        .order_by(desc(HealthSnapshot.captured_at))
        .limit(1)
    )
    snapshot = result.scalar_one_or_none()
    if snapshot:
        ctx.current_health = snapshot.to_dict()
        ctx.cfs_score = snapshot.cfs_score
        ctx.katz_total = snapshot.katz_total
        ctx.sleep_risk = snapshot.sleep_risk or "low"
        ctx.mood_risk = snapshot.mood_risk or "low"
        ctx.cognitive_risk = snapshot.cognitive_risk or "low"
        ctx.social_isolation_risk = snapshot.social_isolation_risk or "low"
        if snapshot.captured_at:
            delta = datetime.utcnow() - snapshot.captured_at
            ctx.days_since_last_snapshot = delta.days
            ctx.recheck_due = delta.days > 14

    # 3. Latest frailty evaluation
    result = await db.execute(
        select(FrailtyEvaluation)
        .where(FrailtyEvaluation.user_id == user_id)
        .order_by(desc(FrailtyEvaluation.timestamp))
        .limit(1)
    )
    frailty_eval = result.scalar_one_or_none()
    if frailty_eval:
        ctx.current_tier = frailty_eval.frailty_tier
        ctx.current_eval = frailty_eval.to_dict()
        ctx.sppb_total = frailty_eval.sppb_total

    # 4. Active care plans
    result = await db.execute(
        select(CarePlan)
        .where(CarePlan.user_id == user_id, CarePlan.status == "active")
    )
    for plan in result.scalars().all():
        ctx.active_plans[plan.plan_type] = plan.to_dict()

    # 5. Latest assessment (SPPB sub-scores)
    result = await db.execute(
        select(Assessment)
        .where(Assessment.user_id == user_id)
        .order_by(desc(Assessment.timestamp))
        .limit(1)
    )
    latest_assessment = result.scalar_one_or_none()
    if latest_assessment:
        if latest_assessment.timestamp:
            delta = datetime.utcnow() - latest_assessment.timestamp
            ctx.days_since_last_assessment = delta.days
        breakdown = latest_assessment.sppb_breakdown
        if breakdown:
            ctx.balance_score = breakdown.get("balance_score")
            ctx.gait_score = breakdown.get("gait_score")
            ctx.chair_score = breakdown.get("chair_stand_score")
        ctx.recent_issues = latest_assessment.issues or []

    # 6. SPPB trend (last 5 comprehensive assessments)
    result = await db.execute(
        select(Assessment.total_score)
        .where(Assessment.user_id == user_id, Assessment.test_type == "comprehensive")
        .order_by(desc(Assessment.timestamp))
        .limit(5)
    )
    scores = [r[0] for r in result.all() if r[0] is not None]
    ctx.sppb_trend = list(reversed(scores))
    if len(ctx.sppb_trend) >= 2:
        diff = ctx.sppb_trend[-1] - ctx.sppb_trend[0]
        if diff > 0:
            ctx.sppb_direction = "improving"
        elif diff < 0:
            ctx.sppb_direction = "declining"
        else:
            ctx.sppb_direction = "stable"

    # 7. Katz trend (last 3 health snapshots)
    result = await db.execute(
        select(HealthSnapshot.katz_total)
        .where(HealthSnapshot.user_id == user_id, HealthSnapshot.katz_total.isnot(None))
        .order_by(desc(HealthSnapshot.captured_at))
        .limit(3)
    )
    katz_scores = [r[0] for r in result.all()]
    ctx.katz_trend = list(reversed(katz_scores))

    # 8. Tier history (last 5 evaluations)
    result = await db.execute(
        select(FrailtyEvaluation.frailty_tier)
        .where(FrailtyEvaluation.user_id == user_id)
        .order_by(desc(FrailtyEvaluation.timestamp))
        .limit(5)
    )
    ctx.tier_history = list(reversed([r[0] for r in result.all()]))

    # 9. Exercise stats
    today = date.today()
    week_start = today - timedelta(days=today.weekday())

    # Today's exercises
    result = await db.execute(
        select(ExerciseLog.exercise_id)
        .where(ExerciseLog.user_id == user_id, ExerciseLog.date == today, ExerciseLog.completed == True)
    )
    ctx.exercises_today = [r[0] for r in result.all()]

    # This week
    result = await db.execute(
        select(func.count())
        .select_from(ExerciseLog)
        .where(
            ExerciseLog.user_id == user_id,
            ExerciseLog.date >= week_start,
            ExerciseLog.completed == True,
        )
    )
    ctx.exercises_this_week = result.scalar() or 0

    # Streak: count consecutive days with at least 1 exercise
    result = await db.execute(
        select(ExerciseLog.date)
        .where(ExerciseLog.user_id == user_id, ExerciseLog.completed == True)
        .group_by(ExerciseLog.date)
        .order_by(desc(ExerciseLog.date))
    )
    exercise_dates = [r[0] for r in result.all()]
    streak = 0
    check_date = today
    for d in exercise_dates:
        if d == check_date:
            streak += 1
            check_date -= timedelta(days=1)
        elif d == check_date - timedelta(days=1):
            # Allow checking yesterday if today hasn't been done yet
            check_date = d
            streak += 1
            check_date -= timedelta(days=1)
        else:
            break
    ctx.exercise_streak = streak

    # 10. Unread alerts
    result = await db.execute(
        select(Alert)
        .where(Alert.user_id == user_id, Alert.read == False)
        .order_by(desc(Alert.timestamp))
        .limit(10)
    )
    ctx.unread_alerts = [a.to_dict() for a in result.scalars().all()]

    return ctx
