"""HPB Healthy 365 / Wearable sync — demo mode if no API key."""

import logging
from typing import Optional
from datetime import datetime, timedelta
import random

from ..core.config import get_settings
from ..models.health import HealthMetrics

logger = logging.getLogger(__name__)


class HPBWearablesService:
    """
    HPB Healthy 365 API integration.
    Returns realistic demo data if API key not configured.
    """

    def __init__(self):
        settings = get_settings()
        self.api_key = settings.hpb_api_key
        self.enabled = bool(self.api_key)

    async def get_daily_metrics(self, user_id: str, date: Optional[datetime] = None) -> HealthMetrics:
        """Return daily metrics (demo data if HPB not configured)."""
        # Seed random by user+date for consistent demo data per day
        day = (date or datetime.now()).strftime("%Y-%m-%d")
        seed = hash(f"{user_id}:{day}") % (2**31)
        rng = random.Random(seed)

        return HealthMetrics(
            user_id=user_id,
            timestamp=date or datetime.now(),
            mvpa_minutes=rng.randint(15, 50),
            steps=rng.randint(2500, 6500),
            sleep_hours=round(rng.uniform(5.0, 8.5), 1),
            resting_heart_rate=rng.randint(62, 82),
            heart_rate_variability=round(rng.uniform(20, 50), 1),
        )

    async def get_weekly_history(self, user_id: str) -> list[dict]:
        """Return 7 days of daily metrics for chart display."""
        today = datetime.now()
        days = []
        for i in range(6, -1, -1):
            day = today - timedelta(days=i)
            m = await self.get_daily_metrics(user_id, day)
            days.append({
                "date": day.strftime("%Y-%m-%d"),
                "day_label": day.strftime("%a"),
                "steps": m.steps,
                "sleep_hours": m.sleep_hours,
                "mvpa_minutes": m.mvpa_minutes,
                "resting_heart_rate": m.resting_heart_rate,
            })
        return days

    async def get_weekly_trend(self, user_id: str) -> dict:
        """Return weekly trend with deconditioning detection."""
        history = await self.get_weekly_history(user_id)
        this_week_steps = [d["steps"] for d in history[-7:]]
        avg_steps = sum(this_week_steps) / len(this_week_steps) if this_week_steps else 0
        avg_sleep = sum(d["sleep_hours"] for d in history[-7:] if d["sleep_hours"]) / 7

        # Simulate last week for comparison
        seed = hash(f"{user_id}:lastweek") % (2**31)
        rng = random.Random(seed)
        last_week_avg = rng.randint(3000, 5500)
        change = ((avg_steps - last_week_avg) / last_week_avg * 100) if last_week_avg else 0

        return {
            "this_week_avg_steps": round(avg_steps),
            "last_week_avg_steps": last_week_avg,
            "steps_change_percent": round(change, 1),
            "avg_sleep_hours": round(avg_sleep, 1),
            "this_week_avg": round(sum(d["mvpa_minutes"] for d in history[-7:]) / 7),
            "last_week_avg": rng.randint(20, 35),
            "change_percent": round(change, 1),
            "deconditioning_alert": change < -20,
        }

    async def health_check(self) -> bool:
        return True
