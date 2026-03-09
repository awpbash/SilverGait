"""Assessment history and progress endpoints."""

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, func, desc
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.database import get_db
from ..models.db_models import Assessment

router = APIRouter(prefix="/users", tags=["History"])


@router.get("/{user_id}/assessments")
async def get_assessments(
    user_id: str,
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    test_type: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """Get assessment history for a user, newest first."""
    query = select(Assessment).where(Assessment.user_id == user_id)
    if test_type:
        query = query.where(Assessment.test_type == test_type)
    query = query.order_by(desc(Assessment.timestamp)).offset(offset).limit(limit)

    result = await db.execute(query)
    assessments = result.scalars().all()

    # Total count
    count_query = select(func.count(Assessment.id)).where(Assessment.user_id == user_id)
    if test_type:
        count_query = count_query.where(Assessment.test_type == test_type)
    total = (await db.execute(count_query)).scalar() or 0

    return {
        "assessments": [a.to_dict() for a in assessments],
        "total": total,
        "limit": limit,
        "offset": offset,
    }


@router.get("/{user_id}/progress")
async def get_progress(
    user_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Get score trend data for progress visualization.

    Returns the last 12 comprehensive assessments (or individual test scores)
    ordered chronologically for charting.
    """
    # Get comprehensive assessments (have total_score)
    query = (
        select(Assessment)
        .where(Assessment.user_id == user_id)
        .where(Assessment.total_score.isnot(None))
        .order_by(desc(Assessment.timestamp))
        .limit(12)
    )
    result = await db.execute(query)
    assessments = list(reversed(result.scalars().all()))

    # Per-test latest scores
    latest_by_test = {}
    for test_type in ["balance", "gait", "chair_stand"]:
        q = (
            select(Assessment)
            .where(Assessment.user_id == user_id)
            .where(Assessment.test_type == test_type)
            .order_by(desc(Assessment.timestamp))
            .limit(1)
        )
        r = await db.execute(q)
        row = r.scalar_one_or_none()
        if row:
            latest_by_test[test_type] = {
                "score": row.score,
                "timestamp": row.timestamp.isoformat(),
            }

    # Total assessments count
    total_count = (
        await db.execute(
            select(func.count(Assessment.id)).where(Assessment.user_id == user_id)
        )
    ).scalar() or 0

    return {
        "trend": [
            {
                "timestamp": a.timestamp.isoformat(),
                "total_score": a.total_score,
                "sppb_breakdown": a.sppb_breakdown,
            }
            for a in assessments
        ],
        "latest_by_test": latest_by_test,
        "total_assessments": total_count,
    }
