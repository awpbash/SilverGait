"""
Assessment Graph — 6-node deterministic pipeline, 0 LLM calls.

Score → Classify → Tier Change? ─── YES → Update Plans → Notify → Persist
                                └── NO  → Persist
"""

from __future__ import annotations

import time
import logging
from dataclasses import dataclass, field
from datetime import datetime
from typing import TypedDict, Literal

from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from ..scoring import score_katz, score_cfs, score_sppb, classify_frailty, route_care, generate_narrative, CFS_LABELS
from ..content_library import build_care_plan_content

logger = logging.getLogger(__name__)


# ── State ───────────────────────────────────────────────────────────────

class AssessmentState(TypedDict, total=False):
    user_id: str
    trigger: str  # onboarding | assessment | profile_update | biweekly_recheck
    language: str  # user's preferred language (en, zh, ms, ta)

    # Raw inputs (populated by caller)
    katz_answers: dict | None
    contributing: dict | None  # {sleep_risk, mood_risk, cognitive_risk, social_isolation_risk}
    sppb_balance: int | None
    sppb_gait: int | None
    sppb_chair: int | None
    issues: list[str] | None  # detected movement issues from Gemini

    # Computed by Score Node
    katz_total: int | None
    cfs_score: int | None
    sppb_total: int | None

    # Computed by Classify Node
    frailty_tier: str | None
    risk_explanation: str | None
    previous_tier: str | None
    tier_changed: bool

    # Computed by Update Plans Node
    new_plans: list[dict]

    # Computed by Notify Node
    alerts: list[dict]

    # References for Persist Node
    health_snapshot_id: int | None
    assessment_id: int | None

    # DB session (injected)
    db: AsyncSession | None


# ── Nodes ───────────────────────────────────────────────────────────────

async def score_node(state: AssessmentState) -> dict:
    """Compute standardized scores from raw inputs."""
    db: AsyncSession = state["db"]
    user_id = state["user_id"]
    trigger = state["trigger"]
    updates: dict = {}

    # Score Katz if answers provided (onboarding, profile_update, recheck)
    if state.get("katz_answers"):
        katz_total = score_katz(state["katz_answers"])
        cfs = score_cfs(katz_total)
        updates["katz_total"] = katz_total
        updates["cfs_score"] = cfs
    else:
        # Fetch latest from health_snapshots
        from ...models.db_models import HealthSnapshot
        result = await db.execute(
            select(HealthSnapshot)
            .where(HealthSnapshot.user_id == user_id)
            .order_by(desc(HealthSnapshot.captured_at))
            .limit(1)
        )
        snap = result.scalar_one_or_none()
        if snap:
            updates["katz_total"] = snap.katz_total
            updates["cfs_score"] = snap.cfs_score
        else:
            logger.warning(f"ASSESSMENT GRAPH [score_node]: user={user_id} NO Katz/CFS data found — defaulting to independent (katz=6, cfs=2). This may be incorrect for frail users.")
            updates["katz_total"] = 6  # assume independent if no data
            updates["cfs_score"] = 2

    # Score SPPB if sub-scores provided (assessment trigger)
    if state.get("sppb_balance") is not None and state.get("sppb_gait") is not None and state.get("sppb_chair") is not None:
        updates["sppb_total"] = score_sppb(state["sppb_balance"], state["sppb_gait"], state["sppb_chair"])
    else:
        # Fetch latest SPPB from assessments
        from ...models.db_models import Assessment
        result = await db.execute(
            select(Assessment.total_score)
            .where(Assessment.user_id == user_id, Assessment.test_type == "comprehensive")
            .order_by(desc(Assessment.timestamp))
            .limit(1)
        )
        row = result.first()
        updates["sppb_total"] = row[0] if row else None

    logger.info(f"ASSESSMENT GRAPH [score_node]: user={user_id} katz={updates.get('katz_total')} cfs={updates.get('cfs_score')} sppb={updates.get('sppb_total')}")
    return updates


async def classify_node(state: AssessmentState) -> dict:
    """Determine frailty tier from CFS, Katz, and SPPB scores."""
    cfs = state.get("cfs_score", 2)
    katz = state.get("katz_total", 6)
    sppb = state.get("sppb_total")

    tier, explanation = classify_frailty(cfs, katz, sppb)

    # Enhanced narrative
    narrative = generate_narrative(
        tier, cfs, katz, sppb,
        balance=state.get("sppb_balance"),
        gait=state.get("sppb_gait"),
        chair=state.get("sppb_chair"),
    )
    if narrative:
        explanation = f"{explanation} {narrative}"

    # Look up previous tier
    db: AsyncSession = state["db"]
    from ...models.db_models import FrailtyEvaluation
    result = await db.execute(
        select(FrailtyEvaluation.frailty_tier)
        .where(FrailtyEvaluation.user_id == state["user_id"])
        .order_by(desc(FrailtyEvaluation.timestamp))
        .limit(1)
    )
    row = result.first()
    previous_tier = row[0] if row else None

    tier_changed = previous_tier is not None and previous_tier != tier
    # First evaluation is always "changed" to trigger plan creation
    if previous_tier is None:
        tier_changed = True

    logger.info(f"ASSESSMENT GRAPH [classify_node]: user={state['user_id']} tier={tier} prev={previous_tier} changed={tier_changed}")
    return {
        "frailty_tier": tier,
        "risk_explanation": explanation,
        "previous_tier": previous_tier,
        "tier_changed": tier_changed,
    }


def tier_change_router(state: AssessmentState) -> str:
    """Conditional edge: returns 'changed' or 'unchanged'."""
    decision = "changed" if state.get("tier_changed", False) else "unchanged"
    logger.info(f"ASSESSMENT GRAPH [tier_change_router]: user={state['user_id']} decision={decision}")
    return decision


async def update_plans_node(state: AssessmentState) -> dict:
    """Select appropriate care plans from content library based on new tier."""
    db: AsyncSession = state["db"]
    user_id = state["user_id"]
    tier = state["frailty_tier"]
    trigger = state["trigger"]

    risks = state.get("contributing") or {}
    # If no contributing data, fetch from latest snapshot
    if not risks:
        from ...models.db_models import HealthSnapshot
        result = await db.execute(
            select(HealthSnapshot)
            .where(HealthSnapshot.user_id == user_id)
            .order_by(desc(HealthSnapshot.captured_at))
            .limit(1)
        )
        snap = result.scalar_one_or_none()
        if snap:
            risks = {
                "sleep_risk": snap.sleep_risk or "low",
                "mood_risk": snap.mood_risk or "low",
                "cognitive_risk": snap.cognitive_risk or "low",
                "social_isolation_risk": snap.social_isolation_risk or "low",
            }

    # Determine deficits from SPPB sub-scores
    deficits = []
    if state.get("sppb_balance") is not None and state["sppb_balance"] <= 2:
        deficits.append("low_balance")
    if state.get("sppb_gait") is not None and state["sppb_gait"] <= 2:
        deficits.append("slow_gait")
    if state.get("sppb_chair") is not None and state["sppb_chair"] <= 2:
        deficits.append("weak_chair_stand")

    # Determine which pathways to activate
    pathways = route_care(tier, risks)

    # Supersede old active plans
    from ...models.db_models import CarePlan
    result = await db.execute(
        select(CarePlan)
        .where(CarePlan.user_id == user_id, CarePlan.status == "active")
    )
    old_plans = result.scalars().all()

    new_plans = []
    for plan_type in pathways:
        content = build_care_plan_content(
            plan_type, tier, risks, deficits,
            issues=state.get("issues"),
            language=state.get("language", "en"),
        )
        new_plan = CarePlan(
            user_id=user_id,
            plan_type=plan_type,
            content=content,
            status="active",
            trigger=trigger,
        )
        db.add(new_plan)
        new_plans.append({"plan_type": plan_type, "content": content})

    # Flush to get IDs
    await db.flush()

    # Now supersede old plans that have same types
    new_types = {p["plan_type"] for p in new_plans}
    for old in old_plans:
        if old.plan_type in new_types:
            old.status = "superseded"

    logger.info(f"ASSESSMENT GRAPH [update_plans_node]: user={user_id} pathways={pathways} deficits={deficits}")
    return {"new_plans": new_plans}


async def notify_node(state: AssessmentState) -> dict:
    """Create alerts for tier changes."""
    db: AsyncSession = state["db"]
    user_id = state["user_id"]
    previous = state.get("previous_tier")
    current = state["frailty_tier"]

    alerts = []
    if previous is None:
        # First evaluation — no alert needed
        return {"alerts": []}

    tier_order = ["robust", "pre_frail", "frail", "severely_frail"]
    prev_idx = tier_order.index(previous) if previous in tier_order else 0
    curr_idx = tier_order.index(current) if current in tier_order else 0

    from ...models.db_models import Alert

    if curr_idx > prev_idx:
        # Declined
        severity = "urgent" if current in ("frail", "severely_frail") else "warning"
        alert = Alert(
            user_id=user_id,
            alert_type="tier_decline",
            severity=severity,
            message=f"Frailty tier changed from {previous} to {current}. Care plan has been updated.",
            source="assessment_graph",
        )
        db.add(alert)
        alerts.append({"type": "tier_decline", "severity": severity})
    elif curr_idx < prev_idx:
        # Improved
        alert = Alert(
            user_id=user_id,
            alert_type="tier_improvement",
            severity="info",
            message=f"Great progress! Frailty tier improved from {previous} to {current}.",
            source="assessment_graph",
        )
        db.add(alert)
        alerts.append({"type": "tier_improvement", "severity": "info"})

    logger.info(f"ASSESSMENT GRAPH [notify_node]: user={user_id} prev={previous} curr={current} alerts={len(alerts)}")
    return {"alerts": alerts}


async def persist_node(state: AssessmentState) -> dict:
    """Save all computed results to database."""
    db: AsyncSession = state["db"]
    user_id = state["user_id"]

    from ...models.db_models import FrailtyEvaluation, AgentRun

    # Insert frailty evaluation
    eval_record = FrailtyEvaluation(
        user_id=user_id,
        trigger=state["trigger"],
        health_snapshot_id=state.get("health_snapshot_id"),
        assessment_id=state.get("assessment_id"),
        cfs_score=state.get("cfs_score"),
        katz_total=state.get("katz_total"),
        sppb_total=state.get("sppb_total"),
        frailty_tier=state.get("frailty_tier", "robust"),
        risk_explanation=state.get("risk_explanation"),
        tier_changed=state.get("tier_changed", False),
        previous_tier=state.get("previous_tier"),
    )
    db.add(eval_record)

    # Build nodes executed string
    nodes = ["score", "classify"]
    if state.get("tier_changed"):
        nodes.extend(["update_plans", "notify"])
    nodes.append("persist")

    # Audit trail
    agent_run = AgentRun(
        user_id=user_id,
        frailty_tier=state.get("frailty_tier"),
        risk_explanation=state.get("risk_explanation"),
        cfs_score=state.get("cfs_score"),
        katz_total=state.get("katz_total"),
        sppb_total=state.get("sppb_total"),
        completed_nodes=",".join(nodes),
    )
    db.add(agent_run)

    await db.commit()
    logger.info(f"ASSESSMENT GRAPH [persist_node]: user={user_id} tier={state.get('frailty_tier')} nodes={nodes}")
    return {}


# ── Graph Runner ────────────────────────────────────────────────────────

async def run_assessment_pipeline(
    db: AsyncSession,
    user_id: str,
    trigger: str,
    katz_answers: dict | None = None,
    contributing: dict | None = None,
    sppb_balance: int | None = None,
    sppb_gait: int | None = None,
    sppb_chair: int | None = None,
    issues: list[str] | None = None,
    health_snapshot_id: int | None = None,
    assessment_id: int | None = None,
    language: str = "en",
) -> dict:
    """
    Run the full assessment pipeline.
    Returns the final state with tier, plans, alerts.
    """
    logger.info(f"ASSESSMENT GRAPH START user={user_id} trigger={trigger}")
    start = time.time()

    state: AssessmentState = {
        "user_id": user_id,
        "trigger": trigger,
        "language": language,
        "katz_answers": katz_answers,
        "contributing": contributing,
        "sppb_balance": sppb_balance,
        "sppb_gait": sppb_gait,
        "sppb_chair": sppb_chair,
        "issues": issues,
        "health_snapshot_id": health_snapshot_id,
        "assessment_id": assessment_id,
        "db": db,
        "tier_changed": False,
        "new_plans": [],
        "alerts": [],
    }

    # Score
    updates = await score_node(state)
    state.update(updates)

    # Classify
    updates = await classify_node(state)
    state.update(updates)

    # Tier Change Router
    path = tier_change_router(state)

    if path == "changed":
        # Update Plans
        updates = await update_plans_node(state)
        state.update(updates)

        # Notify
        updates = await notify_node(state)
        state.update(updates)

    # Persist (always)
    await persist_node(state)

    elapsed = time.time() - start
    logger.info(f"ASSESSMENT GRAPH DONE user={user_id} trigger={trigger} tier={state.get('frailty_tier')} path={path} elapsed={elapsed:.2f}s")

    # Return clean result (no db session)
    return {
        "user_id": user_id,
        "trigger": trigger,
        "frailty_tier": state.get("frailty_tier"),
        "risk_explanation": state.get("risk_explanation"),
        "previous_tier": state.get("previous_tier"),
        "tier_changed": state.get("tier_changed", False),
        "cfs_score": state.get("cfs_score"),
        "katz_total": state.get("katz_total"),
        "sppb_total": state.get("sppb_total"),
        "new_plans": state.get("new_plans", []),
        "alerts": state.get("alerts", []),
        "elapsed_seconds": elapsed,
    }
