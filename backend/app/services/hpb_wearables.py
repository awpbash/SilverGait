"""HPB Healthy 365 - demo mode if no API key."""

import logging
from typing import Optional
from datetime import datetime
import random

from ..core.config import get_settings
from ..models.health import HealthMetrics

logger = logging.getLogger(__name__)


class HPBWearablesService:
    """
    HPB Healthy 365 API integration.
    Returns demo data if API key not configured.
    """

    def __init__(self):
        settings = get_settings()
        self.api_key = settings.hpb_api_key
        self.enabled = bool(self.api_key)

    async def get_daily_metrics(self, user_id: str, date: Optional[datetime] = None) -> HealthMetrics:
        """Return demo metrics (HPB not configured)."""
        # Generate realistic demo data
        return HealthMetrics(
            user_id=user_id,
            timestamp=date or datetime.now(),
            mvpa_minutes=random.randint(15, 45),
            steps=random.randint(2500, 5500),
            resting_heart_rate=random.randint(65, 85),
        )

    async def get_weekly_trend(self, user_id: str) -> dict:
        """Return demo weekly trend."""
        return {
            "this_week_avg": random.randint(25, 40),
            "last_week_avg": random.randint(20, 35),
            "change_percent": random.randint(-10, 15),
            "deconditioning_alert": False,
        }

    async def health_check(self) -> bool:
        return True  # Always OK in demo mode
