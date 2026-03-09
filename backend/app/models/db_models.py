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
    language: Mapped[str] = mapped_column(String(20), default="en")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


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


class ExerciseLog(Base):
    __tablename__ = "exercise_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String(64), index=True)
    date: Mapped[date] = mapped_column(Date, default=date.today)
    exercise_id: Mapped[str] = mapped_column(String(50))
    completed: Mapped[bool] = mapped_column(Boolean, default=True)
    duration_secs: Mapped[int | None] = mapped_column(Integer, nullable=True)
