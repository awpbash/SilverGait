"""Health metrics API endpoints - HPB wearable data."""

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
    """
    Fetch daily health metrics from HPB Healthy 365.
    Returns MVPA, steps, and heart rate data.
    """
    try:
        date_obj = datetime.fromisoformat(date) if date else None
        return await service.get_daily_metrics(user_id, date_obj)
    except Exception as e:
        raise HTTPException(
            status_code=503,
            detail=f"Unable to fetch health data. Retrying... Error: {str(e)}",
        )


@router.get("/trend/{user_id}")
async def get_weekly_trend(
    user_id: str,
    service: HPBWearablesService = Depends(get_hpb_service),
):
    """
    Get week-over-week MVPA trend.
    Detects deconditioning (>20% drop triggers alert).
    """
    try:
        return await service.get_weekly_trend(user_id)
    except Exception as e:
        raise HTTPException(
            status_code=503,
            detail=f"Unable to calculate trend. Retrying... Error: {str(e)}",
        )


@router.get("/status")
async def health_check(service: HPBWearablesService = Depends(get_hpb_service)):
    """Check HPB API connectivity."""
    is_healthy = await service.health_check()
    if not is_healthy:
        raise HTTPException(status_code=503, detail="HPB service unavailable")
    return {"status": "healthy", "service": "hpb"}
