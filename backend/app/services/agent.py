"""
Agentic Physiotherapist - The Decision-Making Core.
Implements: Observe -> Orient -> Decide -> Act loop.
"""

import logging
from typing import Optional
from datetime import datetime

from ..models.health import HealthMetrics, UserRiskProfile, RiskLevel
from ..models.assessment import AssessmentResult
from ..models.intervention import InterventionAction, ActionType
from .sealion import SeaLionService

logger = logging.getLogger(__name__)


class PhysioAgentService:
    """
    The "Agent" - NOT just a chatbot.
    Makes decisions based on wearable data + SPPB scores + risk profile.
    """

    # Decision thresholds
    MVPA_DROP_ALERT_PERCENT = -20  # Week-over-week drop triggers motivation
    SPPB_FRAIL_THRESHOLD = 6  # Score <= 6 indicates frailty concern
    SPPB_SEVERE_THRESHOLD = 3  # Score <= 3 requires doctor referral
    HR_HIGH_THRESHOLD = 120  # Resting HR above this suggests rest
    HR_LOW_THRESHOLD = 50  # Resting HR below this may need attention

    def __init__(self, sealion_service: SeaLionService):
        self.sealion = sealion_service

    async def decide_intervention(
        self,
        user_profile: UserRiskProfile,
        health_metrics: Optional[HealthMetrics] = None,
        assessment: Optional[AssessmentResult] = None,
        mvpa_change_percent: Optional[float] = None,
    ) -> InterventionAction:
        """
        Core decision logic.
        Compares inputs against UserRiskProfile to determine action.
        """
        # Priority order: Emergency > Doctor > Rest > Exercise > Monitoring

        # Check for emergency conditions first
        if health_metrics and health_metrics.resting_heart_rate:
            if health_metrics.resting_heart_rate > 150:
                return await self._create_intervention(
                    user_profile,
                    ActionType.EMERGENCY_ALERT,
                    "Your heart rate is very high. Please rest and seek help if needed.",
                    trigger="Resting HR > 150",
                    priority=5,
                )

        # Check SPPB score for doctor recommendation
        if assessment and assessment.score <= self.SPPB_SEVERE_THRESHOLD:
            return await self._create_intervention(
                user_profile,
                ActionType.RECOMMEND_DOCTOR,
                "Your mobility assessment shows some concerns. It would be good to discuss this with your doctor.",
                trigger=f"SPPB score {assessment.score} <= {self.SPPB_SEVERE_THRESHOLD}",
                priority=4,
            )

        # Check for deconditioning (MVPA drop)
        if mvpa_change_percent is not None and mvpa_change_percent < self.MVPA_DROP_ALERT_PERCENT:
            if user_profile.risk_level == RiskLevel.FRAIL:
                return await self._create_intervention(
                    user_profile,
                    ActionType.ALERT_CAREGIVER,
                    "Activity levels have dropped significantly this week. Family has been notified.",
                    trigger=f"MVPA drop {mvpa_change_percent:.1f}% (Frail user)",
                    priority=4,
                )
            else:
                return await self._create_intervention(
                    user_profile,
                    ActionType.ENCOURAGE_ACTIVITY,
                    "You've been less active this week. How about a short walk today?",
                    trigger=f"MVPA drop {mvpa_change_percent:.1f}%",
                    priority=2,
                )

        # Check heart rate for rest recommendation
        if health_metrics and health_metrics.resting_heart_rate:
            if health_metrics.resting_heart_rate > self.HR_HIGH_THRESHOLD:
                return await self._create_intervention(
                    user_profile,
                    ActionType.SUGGEST_REST,
                    "Your heart rate is a bit elevated. Take it easy and rest for now.",
                    trigger=f"Resting HR {health_metrics.resting_heart_rate} > {self.HR_HIGH_THRESHOLD}",
                    priority=3,
                )

        # Check assessment for specific exercise suggestions
        if assessment and assessment.issues:
            if "sway" in [str(i.value) for i in assessment.issues] or "unsteady_turns" in [str(i.value) for i in assessment.issues]:
                return await self._create_intervention(
                    user_profile,
                    ActionType.SUGGEST_BALANCE_EXERCISE,
                    "Let's work on your balance with some gentle exercises.",
                    trigger=f"Gait issues detected: {[i.value for i in assessment.issues]}",
                    priority=2,
                    duration=10,
                )
            if "slow_speed" in [str(i.value) for i in assessment.issues]:
                return await self._create_intervention(
                    user_profile,
                    ActionType.SUGGEST_WALK,
                    "A short walk would be great for building up your strength.",
                    trigger="Slow gait speed detected",
                    priority=2,
                    duration=15,
                )

        # Default: Positive reinforcement if doing well
        if health_metrics and health_metrics.mvpa_minutes >= 30:
            return await self._create_intervention(
                user_profile,
                ActionType.CELEBRATE_PROGRESS,
                "Great job staying active today! Keep it up!",
                trigger=f"MVPA {health_metrics.mvpa_minutes} >= 30 minutes",
                priority=1,
            )

        # Continue monitoring
        return await self._create_intervention(
            user_profile,
            ActionType.CONTINUE_MONITORING,
            "Everything looks good. Keep moving at your own pace.",
            trigger="No concerning indicators",
            priority=1,
        )

    async def _create_intervention(
        self,
        user_profile: UserRiskProfile,
        action_type: ActionType,
        raw_message: str,
        trigger: str,
        priority: int = 1,
        duration: Optional[int] = None,
    ) -> InterventionAction:
        """Create intervention with SeaLion translation."""
        # Translate via SeaLion
        try:
            localized = await self.sealion.translate_advice(
                raw_message,
                dialect=user_profile.preferred_language,
            )
        except Exception as e:
            logger.error(f"SeaLion translation failed: {e}")
            localized = raw_message  # Fallback to English

        return InterventionAction(
            user_id=user_profile.user_id,
            action_type=action_type,
            priority=priority,
            raw_message=raw_message,
            localized_message=localized,
            trigger_reason=trigger,
            suggested_duration_minutes=duration,
        )
