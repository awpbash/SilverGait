"""Exercise completion endpoints - persist exercise logs to DB."""

from datetime import date, timedelta

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.database import get_db
from ..models.db_models import ExerciseLog

router = APIRouter(tags=["exercises"])


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
