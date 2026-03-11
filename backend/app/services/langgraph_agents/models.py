"""
Pydantic models for the LangGraph agent system.
Adapted from SilverGaitAgent/backend/models/.
"""

from pydantic import BaseModel, Field
from typing import Optional, Literal
from datetime import date, datetime


# --- Scoring models ---

class CFSScore(BaseModel):
    """Clinical Frailty Scale (1-9)"""
    score: int = Field(..., ge=1, le=9)
    label: str
    notes: Optional[str] = None


class KatzScore(BaseModel):
    """Katz Index of Independence in ADLs (0-6)"""
    bathing: bool
    dressing: bool
    toileting: bool
    transferring: bool
    continence: bool
    feeding: bool

    @property
    def total(self) -> int:
        return sum([
            self.bathing, self.dressing, self.toileting,
            self.transferring, self.continence, self.feeding
        ])

    @property
    def label(self) -> str:
        if self.total == 6:
            return "Full independence"
        elif self.total >= 4:
            return "Moderate dependence"
        else:
            return "Severe dependence"


class SPPBScore(BaseModel):
    """Short Physical Performance Battery (0-12)"""
    balance_score: int = Field(..., ge=0, le=4)
    gait_speed_score: int = Field(..., ge=0, le=4)
    chair_stand_score: int = Field(..., ge=0, le=4)
    notes: Optional[str] = None

    @property
    def total(self) -> int:
        return self.balance_score + self.gait_speed_score + self.chair_stand_score

    @property
    def label(self) -> str:
        if self.total >= 10:
            return "Normal"
        elif self.total >= 7:
            return "Mild limitation"
        elif self.total >= 4:
            return "Moderate limitation"
        else:
            return "Severe limitation"


class ContributingConditionsScore(BaseModel):
    """Risk scores from contributing conditions assessment"""
    cognitive_risk: Literal["low", "moderate", "high"]
    mood_risk: Literal["low", "moderate", "high"]
    sleep_risk: Literal["low", "moderate", "high"]
    social_isolation_risk: Literal["low", "moderate", "high"]
    notes: Optional[str] = None


FrailtyTier = Literal["robust", "pre-frail", "frail", "severely-frail"]


class PatientContext(BaseModel):
    """Minimal patient context for LangGraph agents (no DB dependency)."""
    name: str = "User"
    age: int = 70
    gender: str = "unknown"


class AgentAssessment(BaseModel):
    """Full assessment record flowing through the LangGraph pipeline."""
    patient_id: Optional[int] = None
    assessed_at: Optional[datetime] = None

    # Assessment layer outputs
    cfs: Optional[CFSScore] = None
    katz: Optional[KatzScore] = None
    sppb: Optional[SPPBScore] = None
    contributing: Optional[ContributingConditionsScore] = None

    history_summary: Optional[str] = None
    frailty_tier: Optional[FrailtyTier] = None
    risk_explanation: Optional[str] = None

    # Management routing
    management_routes: Optional[list[str]] = None
    management_routing_rationale: Optional[str] = None

    # Management layer outputs
    education_plan: Optional[str] = None
    exercise_plan: Optional[str] = None
    sleep_plan: Optional[str] = None
    monitoring_notes: Optional[str] = None


class ManagementRoutingDecision(BaseModel):
    """Structured output from the management router LLM call."""
    agents_to_activate: list[str] = Field(
        description="Valid values: 'education', 'exercise', 'sleep', 'monitoring'."
    )
    rationale: str = Field(
        description="Concise clinical rationale for the routing decision."
    )
