"""Assessment models - Gemini Vision SPPB analysis."""

from enum import Enum
from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime


class GaitIssue(str, Enum):
    """Detected gait/balance issues from vision analysis."""
    SHUFFLING = "shuffling"
    SWAY = "sway"
    ASYMMETRY = "asymmetry"
    SLOW_SPEED = "slow_speed"
    UNSTEADY_TURNS = "unsteady_turns"
    REDUCED_ARM_SWING = "reduced_arm_swing"
    WIDE_BASE = "wide_base"
    HESITATION = "hesitation"


class SPPBScore(BaseModel):
    """
    Short Physical Performance Battery component scores.
    Total score 0-12 (higher = better).
    """
    balance_score: int = Field(..., ge=0, le=4, description="Balance test score")
    gait_score: int = Field(..., ge=0, le=4, description="Gait speed score")
    chair_stand_score: int = Field(..., ge=0, le=4, description="Chair stand score")

    @property
    def total_score(self) -> int:
        return self.balance_score + self.gait_score + self.chair_stand_score


class AssessmentResult(BaseModel):
    """
    Gemini Vision analysis result for SPPB assessment.
    Strict interface as per CLAUDE.md.
    """
    user_id: str
    timestamp: datetime = Field(default_factory=datetime.now)

    # Core Gemini output
    score: int = Field(..., ge=0, le=4, description="Component score 0-4")
    issues: List[GaitIssue] = Field(default_factory=list, description="Detected gait/balance issues")

    # Extended analysis
    sppb_breakdown: Optional[SPPBScore] = None
    confidence: float = Field(default=0.0, ge=0.0, le=1.0, description="Model confidence")
    recommendations: List[str] = Field(default_factory=list)
    video_duration_seconds: Optional[float] = None
