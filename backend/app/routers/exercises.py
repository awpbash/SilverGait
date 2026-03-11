"""Exercise completion endpoints - persist exercise logs to DB."""

from datetime import date, timedelta
from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select, func, desc
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.database import get_db
from ..models.db_models import ExerciseLog, Assessment, CarePlan

router = APIRouter(tags=["exercises"])


# Exercise catalog with metadata for personalization
EXERCISE_CATALOG = [
    {"id": "chair-stand", "category": "legs", "targets": ["chair_stand", "strength"], "intensity": {"robust": 5, "pre_frail": 4, "frail": 3, "severely_frail": 2}},
    {"id": "wall-push", "category": "arms", "targets": ["strength"], "intensity": {"robust": 3, "pre_frail": 3, "frail": 2, "severely_frail": 1}},
    {"id": "heel-raise", "category": "balance", "targets": ["balance", "sway"], "intensity": {"robust": 3, "pre_frail": 3, "frail": 2, "severely_frail": 2}},
    {"id": "marching", "category": "legs", "targets": ["gait", "slow_speed"], "intensity": {"robust": 3, "pre_frail": 3, "frail": 2, "severely_frail": 1}},
    {"id": "sit-to-stand-hold", "category": "legs", "targets": ["chair_stand", "strength"], "intensity": {"robust": 5, "pre_frail": 4, "frail": 3, "severely_frail": 2}},
    {"id": "ankle-circles", "category": "balance", "targets": ["balance"], "intensity": {"robust": 3, "pre_frail": 3, "frail": 3, "severely_frail": 3}},
    {"id": "leg-extensions", "category": "legs", "targets": ["strength"], "intensity": {"robust": 4, "pre_frail": 3, "frail": 2, "severely_frail": 1}},
    {"id": "shoulder-rolls", "category": "posture", "targets": ["posture", "reduced_arm_swing"], "intensity": {"robust": 2, "pre_frail": 2, "frail": 2, "severely_frail": 2}},
]

# Issue-to-exercise priority mapping
ISSUE_EXERCISE_MAP = {
    "sway": ["heel-raise", "ankle-circles"],
    "unsteady_turns": ["heel-raise", "marching"],
    "slow_speed": ["marching", "chair-stand"],
    "shuffling": ["marching", "leg-extensions"],
    "poor_sit_to_stand": ["chair-stand", "sit-to-stand-hold"],
    "excessive_trunk_lean": ["wall-push", "shoulder-rolls"],
    "reduced_arm_swing": ["shoulder-rolls", "marching"],
    "wide_base": ["heel-raise", "ankle-circles"],
}

TIER_DAILY_TARGET = {"robust": 6, "pre_frail": 4, "frail": 3, "severely_frail": 2}
TIER_FROM_SPPB = lambda s: "robust" if s >= 10 else "pre_frail" if s >= 6 else "frail" if s >= 4 else "severely_frail"


class ExerciseCompleteRequest(BaseModel):
    user_id: str
    exercise_id: str
    duration_secs: int | None = None


@router.post("/exercises/complete")
async def complete_exercise(req: ExerciseCompleteRequest, db: AsyncSession = Depends(get_db)):
    """Log an exercise completion."""
    today = date.today()

    # Check if already logged today
    existing = await db.execute(
        select(ExerciseLog).where(
            ExerciseLog.user_id == req.user_id,
            ExerciseLog.exercise_id == req.exercise_id,
            ExerciseLog.date == today,
        )
    )
    row = existing.scalar_one_or_none()
    if row:
        return {"status": "already_logged", "id": row.id}

    log = ExerciseLog(
        user_id=req.user_id,
        exercise_id=req.exercise_id,
        date=today,
        completed=True,
        duration_secs=req.duration_secs,
    )
    db.add(log)
    await db.commit()
    await db.refresh(log)
    return {"status": "logged", "id": log.id}


@router.get("/exercises/stats/{user_id}")
async def exercise_stats(user_id: str, days: int = 7, db: AsyncSession = Depends(get_db)):
    """Get exercise stats for a user over the last N days."""
    cutoff = date.today() - timedelta(days=days - 1)

    # Get all logs in range
    result = await db.execute(
        select(ExerciseLog).where(
            ExerciseLog.user_id == user_id,
            ExerciseLog.date >= cutoff,
            ExerciseLog.completed == True,
        ).order_by(ExerciseLog.date)
    )
    logs = result.scalars().all()

    # Today's completions
    today = date.today()
    today_ids = [l.exercise_id for l in logs if l.date == today]

    # Daily counts for chart
    daily: dict[str, int] = {}
    for l in logs:
        key = l.date.isoformat()
        daily[key] = daily.get(key, 0) + 1

    # Fill missing days with 0
    daily_list = []
    for i in range(days):
        d = cutoff + timedelta(days=i)
        key = d.isoformat()
        daily_list.append({"date": key, "count": daily.get(key, 0)})

    # Streak calculation
    streak = 0
    check = today
    while True:
        key = check.isoformat()
        if daily.get(key, 0) > 0:
            streak += 1
            check -= timedelta(days=1)
        else:
            break

    total = len(logs)

    return {
        "today_completed": today_ids,
        "daily": daily_list,
        "streak": streak,
        "total_exercises": total,
        "days": days,
    }


@router.get("/exercises/personalized/{user_id}")
async def personalized_exercises(user_id: str, db: AsyncSession = Depends(get_db)):
    """Return exercises reordered and annotated based on care plan + latest assessment."""
    import json as _json

    # First check for an active exercise care plan
    plan_result = await db.execute(
        select(CarePlan)
        .where(CarePlan.user_id == user_id, CarePlan.plan_type == "exercise", CarePlan.status == "active")
        .order_by(desc(CarePlan.created_at))
        .limit(1)
    )
    care_plan = plan_result.scalar_one_or_none()
    plan_exercises = None
    plan_focus = None
    if care_plan and care_plan.content:
        try:
            plan_data = _json.loads(care_plan.content)
            plan_exercises = plan_data.get("exercises", [])
            plan_focus = plan_data.get("focus_areas", [])
        except (_json.JSONDecodeError, TypeError):
            pass

    # Fetch latest assessment
    result = await db.execute(
        select(Assessment)
        .where(Assessment.user_id == user_id)
        .order_by(desc(Assessment.timestamp))
        .limit(1)
    )
    assessment = result.scalar_one_or_none()

    sppb_total = 12
    issues: list[str] = []
    if assessment:
        bd = assessment.sppb_breakdown or {}
        sppb_total = bd.get("balance_score", 0) + bd.get("gait_score", 0) + bd.get("chair_stand_score", 0)
        if sppb_total == 0 and assessment.score:
            sppb_total = assessment.score
        issues = assessment.issues or []

    tier = TIER_FROM_SPPB(sppb_total)
    daily_target = TIER_DAILY_TARGET[tier]

    # Fetch today's completions
    today_result = await db.execute(
        select(ExerciseLog.exercise_id).where(
            ExerciseLog.user_id == user_id,
            ExerciseLog.date == date.today(),
            ExerciseLog.completed == True,
        )
    )
    completed_today = set(row[0] for row in today_result.all())

    # If we have a care plan, use its exercise order; otherwise fall back to scoring
    if plan_exercises:
        # Care plan defines the order — just annotate with completion status
        exercises = []
        plan_set = set(plan_exercises)
        for ex_id in plan_exercises:
            catalog_entry = next((e for e in EXERCISE_CATALOG if e["id"] == ex_id), None)
            exercises.append({
                "id": ex_id,
                "category": catalog_entry["category"] if catalog_entry else "general",
                "recommended": ex_id not in completed_today,
                "completed": ex_id in completed_today,
                "intensity_minutes": catalog_entry["intensity"].get(tier, 3) if catalog_entry else 3,
            })
        # Add any catalog exercises not in the plan at the end
        for ex in EXERCISE_CATALOG:
            if ex["id"] not in plan_set:
                exercises.append({
                    "id": ex["id"],
                    "category": ex["category"],
                    "recommended": False,
                    "completed": ex["id"] in completed_today,
                    "intensity_minutes": ex["intensity"].get(tier, 3),
                })
    else:
        # Fall back to scoring-based prioritization
        exercise_scores: list[tuple[dict, float]] = []
        for ex in EXERCISE_CATALOG:
            score = 0.0
            for issue in issues:
                recommended = ISSUE_EXERCISE_MAP.get(issue, [])
                if ex["id"] in recommended:
                    score += 10.0
            if ex["id"] in completed_today:
                score -= 20.0
            ex_intensity = ex["intensity"].get(tier, 3)
            score += ex_intensity * 0.5
            exercise_scores.append((ex, score))

        exercise_scores.sort(key=lambda x: x[1], reverse=True)
        exercises = []
        for ex, score in exercise_scores:
            exercises.append({
                "id": ex["id"],
                "category": ex["category"],
                "recommended": score > 0 and ex["id"] not in completed_today,
                "completed": ex["id"] in completed_today,
                "intensity_minutes": ex["intensity"].get(tier, 3),
            })

    # Determine focus area
    focus_area = None
    if plan_focus:
        focus_area = plan_focus[0] if plan_focus else None
    elif any(i in issues for i in ["sway", "unsteady_turns", "wide_base"]):
        focus_area = "balance"
    elif any(i in issues for i in ["slow_speed", "shuffling"]):
        focus_area = "gait"
    elif any(i in issues for i in ["poor_sit_to_stand"]):
        focus_area = "strength"

    return {
        "exercises": exercises,
        "tier": tier,
        "sppb_total": sppb_total,
        "focus_area": focus_area,
        "daily_target": daily_target,
        "issues": issues,
        "completed_count": len(completed_today),
        "has_care_plan": care_plan is not None,
    }
