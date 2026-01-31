"""Intervention models - Agentic decision outputs."""

from enum import Enum
from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime


class ActionType(str, Enum):
    """
    The "Agent" decision outputs.
    Based on Observe-Orient-Decide-Act loop.
    """
    # Exercise suggestions
    SUGGEST_WALK = "suggest_walk"
    SUGGEST_BALANCE_EXERCISE = "suggest_balance_exercise"
    SUGGEST_STRENGTH_EXERCISE = "suggest_strength_exercise"
    SUGGEST_STRETCHING = "suggest_stretching"

    # Rest/Recovery
    SUGGEST_REST = "suggest_rest"
    SUGGEST_HYDRATION = "suggest_hydration"

    # Alerts
    ALERT_CAREGIVER = "alert_caregiver"
    RECOMMEND_DOCTOR = "recommend_doctor"
    EMERGENCY_ALERT = "emergency_alert"

    # Motivation
    ENCOURAGE_ACTIVITY = "encourage_activity"
    CELEBRATE_PROGRESS = "celebrate_progress"

    # Monitoring
    REQUEST_ASSESSMENT = "request_assessment"
    CONTINUE_MONITORING = "continue_monitoring"


class InterventionAction(BaseModel):
    """
    Output from the agentic decision system.
    Will be translated via SeaLion for user-facing display.
    """
    user_id: str
    timestamp: datetime = Field(default_factory=datetime.now)

    action_type: ActionType
    priority: int = Field(default=1, ge=1, le=5, description="1=low, 5=urgent")

    # Raw message (to be translated by SeaLion)
    raw_message: str = Field(..., description="Generic advice before SeaLion translation")

    # Translated message (after SeaLion processing)
    localized_message: Optional[str] = Field(None, description="Singlish/Dialect translated message")

    # Context
    trigger_reason: str = Field(..., description="Why this action was triggered")
    suggested_duration_minutes: Optional[int] = None
    exercise_video_url: Optional[str] = None
