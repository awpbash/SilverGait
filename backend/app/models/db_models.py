"""SQLAlchemy ORM models for persistent storage."""

import json
from datetime import datetime, date
from sqlalchemy import String, Integer, Float, Boolean, DateTime, Date, Text
from sqlalchemy.orm import Mapped, mapped_column

from ..core.database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    display_name: Mapped[str] = mapped_column(String(100), default="")
    date_of_birth: Mapped[date | None] = mapped_column(Date, nullable=True)
    gender: Mapped[str | None] = mapped_column(String(10), nullable=True)
    language: Mapped[str] = mapped_column(String(20), default="en")
    voice_id: Mapped[str | None] = mapped_column(String(100), nullable=True)  # ElevenLabs voice_id
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    onboarded_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class Assessment(Base):
    __tablename__ = "assessments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String(64), index=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    test_type: Mapped[str] = mapped_column(String(20))  # balance, gait, chair_stand, comprehensive
    score: Mapped[int] = mapped_column(Integer)  # 0-4 per component
    total_score: Mapped[int] = mapped_column(Integer, nullable=True)  # 0-12 for comprehensive
    confidence: Mapped[float] = mapped_column(Float, default=0.0)

    # JSON fields stored as text
    _issues: Mapped[str] = mapped_column("issues", Text, default="[]")
    _recommendations: Mapped[str] = mapped_column("recommendations", Text, default="[]")
    _sppb_breakdown: Mapped[str | None] = mapped_column("sppb_breakdown", Text, nullable=True)
    _completed_tests: Mapped[str | None] = mapped_column("completed_tests", Text, nullable=True)
    _pose_metrics: Mapped[str | None] = mapped_column("pose_metrics", Text, nullable=True)
    _time_series: Mapped[str | None] = mapped_column("time_series", Text, nullable=True)

    @property
    def issues(self) -> list:
        return json.loads(self._issues) if self._issues else []

    @issues.setter
    def issues(self, value: list):
        self._issues = json.dumps(value)

    @property
    def recommendations(self) -> list:
        return json.loads(self._recommendations) if self._recommendations else []

    @recommendations.setter
    def recommendations(self, value: list):
        self._recommendations = json.dumps(value)

    @property
    def sppb_breakdown(self) -> dict | None:
        return json.loads(self._sppb_breakdown) if self._sppb_breakdown else None

    @sppb_breakdown.setter
    def sppb_breakdown(self, value: dict | None):
        self._sppb_breakdown = json.dumps(value) if value else None

    @property
    def completed_tests(self) -> list | None:
        return json.loads(self._completed_tests) if self._completed_tests else None

    @completed_tests.setter
    def completed_tests(self, value: list | None):
        self._completed_tests = json.dumps(value) if value else None

    @property
    def pose_metrics(self) -> dict | None:
        return json.loads(self._pose_metrics) if self._pose_metrics else None

    @pose_metrics.setter
    def pose_metrics(self, value: dict | None):
        self._pose_metrics = json.dumps(value) if value else None

    @property
    def time_series(self) -> dict | None:
        return json.loads(self._time_series) if self._time_series else None

    @time_series.setter
    def time_series(self, value: dict | None):
        self._time_series = json.dumps(value) if value else None

    def to_dict(self) -> dict:
        """Convert to API response format."""
        result = {
            "id": self.id,
            "user_id": self.user_id,
            "timestamp": self.timestamp.isoformat(),
            "test_type": self.test_type,
            "score": self.score,
            "total_score": self.total_score,
            "confidence": self.confidence,
            "issues": self.issues,
            "recommendations": self.recommendations,
            "sppb_breakdown": self.sppb_breakdown,
            "completed_tests": self.completed_tests,
        }
        if self.pose_metrics:
            result["pose_metrics"] = self.pose_metrics
        if self.time_series:
            result["time_series"] = self.time_series
        return result


class Intervention(Base):
    __tablename__ = "interventions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String(64), index=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    action_type: Mapped[str] = mapped_column(String(50))
    priority: Mapped[int] = mapped_column(Integer, default=1)
    raw_message: Mapped[str] = mapped_column(Text)
    localized_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    trigger_reason: Mapped[str] = mapped_column(Text)
    suggested_duration_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    assessment_id: Mapped[int | None] = mapped_column(Integer, nullable=True)


class AgentRun(Base):
    """Persists LangGraph agent workflow results."""
    __tablename__ = "agent_runs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String(64), index=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    frailty_tier: Mapped[str | None] = mapped_column(String(20), nullable=True)
    risk_explanation: Mapped[str | None] = mapped_column(Text, nullable=True)
    education_plan: Mapped[str | None] = mapped_column(Text, nullable=True)
    exercise_plan: Mapped[str | None] = mapped_column(Text, nullable=True)
    sleep_plan: Mapped[str | None] = mapped_column(Text, nullable=True)
    monitoring_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    management_routes: Mapped[str | None] = mapped_column(String(200), nullable=True)
    cfs_score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    katz_total: Mapped[int | None] = mapped_column(Integer, nullable=True)
    sppb_total: Mapped[int | None] = mapped_column(Integer, nullable=True)
    completed_nodes: Mapped[str | None] = mapped_column(String(500), nullable=True)
    elapsed_seconds: Mapped[float | None] = mapped_column(Float, nullable=True)


class ExerciseLog(Base):
    __tablename__ = "exercise_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String(64), index=True)
    date: Mapped[date] = mapped_column(Date, default=date.today)
    exercise_id: Mapped[str] = mapped_column(String(50))
    completed: Mapped[bool] = mapped_column(Boolean, default=True)
    duration_secs: Mapped[int | None] = mapped_column(Integer, nullable=True)
    reps: Mapped[int | None] = mapped_column(Integer, nullable=True)
    form_score: Mapped[float | None] = mapped_column(Float, nullable=True)


# ── New tables (CLAUDE.md two-graph architecture) ──────────────────────


class HealthSnapshot(Base):
    """Versioned health profile — APPEND-ONLY, never update."""
    __tablename__ = "health_snapshots"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String(64), index=True)
    captured_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    trigger: Mapped[str] = mapped_column(String(30))  # onboarding | user_update | biweekly_recheck

    # Katz ADL (6 booleans: can do independently?)
    katz_bathing: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    katz_dressing: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    katz_toileting: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    katz_transferring: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    katz_continence: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    katz_feeding: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    katz_total: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Contributing conditions
    cognitive_risk: Mapped[str | None] = mapped_column(String(10), nullable=True)  # low|moderate|high
    mood_risk: Mapped[str | None] = mapped_column(String(10), nullable=True)
    sleep_risk: Mapped[str | None] = mapped_column(String(10), nullable=True)
    social_isolation_risk: Mapped[str | None] = mapped_column(String(10), nullable=True)

    # Derived scores (computed on write)
    cfs_score: Mapped[int | None] = mapped_column(Integer, nullable=True)  # 1-9
    cfs_label: Mapped[str | None] = mapped_column(String(30), nullable=True)

    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "user_id": self.user_id,
            "captured_at": self.captured_at.isoformat() if self.captured_at else None,
            "trigger": self.trigger,
            "katz_bathing": self.katz_bathing,
            "katz_dressing": self.katz_dressing,
            "katz_toileting": self.katz_toileting,
            "katz_transferring": self.katz_transferring,
            "katz_continence": self.katz_continence,
            "katz_feeding": self.katz_feeding,
            "katz_total": self.katz_total,
            "cognitive_risk": self.cognitive_risk,
            "mood_risk": self.mood_risk,
            "sleep_risk": self.sleep_risk,
            "social_isolation_risk": self.social_isolation_risk,
            "cfs_score": self.cfs_score,
            "cfs_label": self.cfs_label,
        }


class FrailtyEvaluation(Base):
    """Point-in-time frailty classification — APPEND-ONLY."""
    __tablename__ = "frailty_evaluations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String(64), index=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    trigger: Mapped[str] = mapped_column(String(30))

    # Traceability links
    health_snapshot_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    assessment_id: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Scores at time of evaluation
    cfs_score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    katz_total: Mapped[int | None] = mapped_column(Integer, nullable=True)
    sppb_total: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Classification result
    frailty_tier: Mapped[str] = mapped_column(String(20))  # robust|pre_frail|frail|severely_frail
    risk_explanation: Mapped[str | None] = mapped_column(Text, nullable=True)
    tier_changed: Mapped[bool] = mapped_column(Boolean, default=False)
    previous_tier: Mapped[str | None] = mapped_column(String(20), nullable=True)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "user_id": self.user_id,
            "timestamp": self.timestamp.isoformat() if self.timestamp else None,
            "trigger": self.trigger,
            "health_snapshot_id": self.health_snapshot_id,
            "assessment_id": self.assessment_id,
            "cfs_score": self.cfs_score,
            "katz_total": self.katz_total,
            "sppb_total": self.sppb_total,
            "frailty_tier": self.frailty_tier,
            "risk_explanation": self.risk_explanation,
            "tier_changed": self.tier_changed,
            "previous_tier": self.previous_tier,
        }


class CarePlan(Base):
    """Active care plans — lifecycle managed (active → superseded)."""
    __tablename__ = "care_plans"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String(64), index=True)
    plan_type: Mapped[str] = mapped_column(String(20))  # exercise|sleep|education|monitoring
    content: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    status: Mapped[str] = mapped_column(String(20), default="active")  # active|superseded|expired
    superseded_by_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    trigger: Mapped[str | None] = mapped_column(String(30), nullable=True)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "user_id": self.user_id,
            "plan_type": self.plan_type,
            "content": self.content,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "status": self.status,
            "trigger": self.trigger,
        }


class ChatMessage(Base):
    """Conversation history for chat context."""
    __tablename__ = "chat_messages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String(64), index=True)
    role: Mapped[str] = mapped_column(String(10))  # user|assistant
    content: Mapped[str | None] = mapped_column(Text, nullable=True)
    _tool_calls: Mapped[str | None] = mapped_column("tool_calls", Text, nullable=True)
    language: Mapped[str | None] = mapped_column(String(20), nullable=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    @property
    def tool_calls(self) -> list | None:
        return json.loads(self._tool_calls) if self._tool_calls else None

    @tool_calls.setter
    def tool_calls(self, value: list | None):
        self._tool_calls = json.dumps(value) if value else None


class Alert(Base):
    """System-generated alerts from graphs and safety gate."""
    __tablename__ = "alerts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String(64), index=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    alert_type: Mapped[str] = mapped_column(String(30))  # tier_decline|tier_improvement|fall_reported|missed_exercises|recheck_due|emergency
    severity: Mapped[str] = mapped_column(String(10))  # info|warning|urgent
    message: Mapped[str | None] = mapped_column(Text, nullable=True)
    source: Mapped[str | None] = mapped_column(String(30), nullable=True)  # assessment_graph|chat_safety_gate|system
    read: Mapped[bool] = mapped_column(Boolean, default=False)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "user_id": self.user_id,
            "timestamp": self.timestamp.isoformat() if self.timestamp else None,
            "alert_type": self.alert_type,
            "severity": self.severity,
            "message": self.message,
            "source": self.source,
            "read": self.read,
        }
