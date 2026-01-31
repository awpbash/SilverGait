"""Health metrics models - HPB Wearable data."""

from enum import Enum
from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime


class RiskLevel(str, Enum):
    """User frailty risk classification."""
    ROBUST = "robust"
    PRE_FRAIL = "pre_frail"
    FRAIL = "frail"


class HealthMetrics(BaseModel):
    """
    Real-time wearable data from HPB Healthy 365.
    Strict TypeScript-equivalent interface.
    """
    user_id: str
    timestamp: datetime = Field(default_factory=datetime.now)

    # Core metrics from HPB
    mvpa_minutes: int = Field(..., ge=0, description="Daily Moderate-to-Vigorous activity minutes")
    steps: int = Field(..., ge=0, description="Daily step count")
    heart_rate_variability: Optional[float] = Field(None, description="HRV if available (frailty indicator)")
    resting_heart_rate: Optional[int] = Field(None, ge=30, le=200)

    # Weekly comparison for deconditioning detection
    mvpa_week_avg: Optional[float] = Field(None, description="7-day MVPA average")
    mvpa_change_percent: Optional[float] = Field(None, description="Week-over-week MVPA change")


class UserRiskProfile(BaseModel):
    """User's frailty risk profile for agentic decision-making."""
    user_id: str
    risk_level: RiskLevel
    sppb_score: Optional[int] = Field(None, ge=0, le=12, description="Latest SPPB total score")
    last_assessment_date: Optional[datetime] = None
    caregiver_contact: Optional[str] = None
    preferred_language: str = Field(default="en", description="en, hokkien, cantonese, mandarin")
