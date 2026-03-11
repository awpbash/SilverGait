"""Health metrics API endpoints — wearable sync + HPB data."""

from fastapi import APIRouter, HTTPException, Depends
from datetime import datetime
from typing import Optional

from ..services.hpb_wearables import HPBWearablesService
from ..models.health import HealthMetrics

router = APIRouter(prefix="/health", tags=["Health Metrics"])


def get_hpb_service() -> HPBWearablesService:
    return HPBWearablesService()


@router.get("/metrics/{user_id}", response_model=HealthMetrics)
async def get_daily_metrics(
    user_id: str,
    date: Optional[str] = None,
    service: HPBWearablesService = Depends(get_hpb_service),
):
    """Fetch daily health metrics (steps, sleep, heart rate, MVPA)."""
    try:
        date_obj = datetime.fromisoformat(date) if date else None
        return await service.get_daily_metrics(user_id, date_obj)
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Unable to fetch health data: {e}")


@router.get("/weekly/{user_id}")
async def get_weekly_history(
    user_id: str,
    service: HPBWearablesService = Depends(get_hpb_service),
):
    """Get 7-day history of daily metrics for charts."""
    try:
        return await service.get_weekly_history(user_id)
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Unable to fetch weekly data: {e}")


@router.get("/trend/{user_id}")
async def get_weekly_trend(
    user_id: str,
    service: HPBWearablesService = Depends(get_hpb_service),
):
    """Week-over-week trend with deconditioning detection (>20% drop triggers alert)."""
    try:
        return await service.get_weekly_trend(user_id)
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Unable to calculate trend: {e}")


@router.get("/status")
async def health_check(service: HPBWearablesService = Depends(get_hpb_service)):
    """Check wearable API connectivity."""
    is_healthy = await service.health_check()
    if not is_healthy:
        raise HTTPException(status_code=503, detail="Health service unavailable")
    return {"status": "healthy", "service": "hpb_wearables"}
