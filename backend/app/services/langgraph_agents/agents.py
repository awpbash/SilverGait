"""
All 9 LangGraph agents adapted for non-interactive web use.
Interactive CLI agents (history, physical_exam, contributing_conditions)
are replaced with LLM-inference versions that work from available data.
"""

import json
import logging
from typing import List

from langchain_core.language_models import BaseChatModel
from langchain_core.messages import HumanMessage
from pydantic import ValidationError

from .models import (
    PatientContext, AgentAssessment, ContributingConditionsScore,
    ManagementRoutingDecision,
)
from .scoring import score_cfs, score_katz, classify_frailty

logger = logging.getLogger(__name__)


# ============================================================
#  ASSESSMENT LAYER (adapted for non-interactive use)
# ============================================================

def run_history_agent(
    patient: PatientContext,
    assessment: AgentAssessment,
    llm: BaseChatModel,
    chat_history: str = "",
) -> AgentAssessment:
    """
    Non-interactive History Agent.
    Instead of CLI interview, infers CFS + Katz from SPPB data,
    detected issues, and any chat history.
    """
    sppb_info = "Not assessed"
    if assessment.sppb:
        sppb_info = (
            f"SPPB total: {assessment.sppb.total}/12 ({assessment.sppb.label}), "
            f"Balance: {assessment.sppb.balance_score}/4, "
            f"Gait: {assessment.sppb.gait_speed_score}/4, "
            f"Chair stand: {assessment.sppb.chair_stand_score}/4"
        )
        if assessment.sppb.notes:
            sppb_info += f"\nNotes from assessment: {assessment.sppb.notes}"

    chat_context = f"\nChat history with patient:\n{chat_history}" if chat_history else ""

    prompt = f"""You are a geriatric clinical assistant performing a functional history assessment.
You do NOT have direct interview access. Instead, infer the patient's functional status from the available data.

Patient: {patient.name}, Age: {patient.age}, Gender: {patient.gender}
Physical performance data: {sppb_info}
{chat_context}

Based on the available data, estimate:
1. A Clinical Frailty Scale (CFS) score from 1-9
2. Katz ADL independence for each of 6 activities

Use the SPPB scores as strong indicators:
- SPPB 10-12: likely CFS 1-3 (fit/well), full ADL independence
- SPPB 7-9: likely CFS 3-4 (managing well/vulnerable), mostly independent
- SPPB 4-6: likely CFS 4-5 (vulnerable/mildly frail), some ADL concerns
- SPPB 1-3: likely CFS 5-7 (frail), significant ADL impairment
- SPPB 0: likely CFS 7+ (severely frail)

Return ONLY valid JSON:
{{
  "history_summary": "2-3 sentence clinical summary",
  "cfs_score": <integer 1-9>,
  "cfs_notes": "brief justification",
  "bathing": true,
  "dressing": true,
  "toileting": true,
  "transferring": true,
  "continence": true,
  "feeding": true
}}"""

    response = llm.invoke([HumanMessage(content=prompt)])
    content = response.content.strip()

    # Extract JSON from response (handle markdown code blocks)
    if "```" in content:
        content = content.split("```")[1]
        if content.startswith("json"):
            content = content[4:]
        content = content.strip()

    try:
        data = json.loads(content)
        assessment.history_summary = data["history_summary"]
        assessment.cfs = score_cfs(
            score=int(data["cfs_score"]),
            notes=data.get("cfs_notes", ""),
        )
        assessment.katz = score_katz(
            bathing=data.get("bathing", True),
            dressing=data.get("dressing", True),
            toileting=data.get("toileting", True),
            transferring=data.get("transferring", True),
            continence=data.get("continence", True),
            feeding=data.get("feeding", True),
        )
        logger.info(f"History Agent: CFS={assessment.cfs.score}, Katz={assessment.katz.total}/6")
    except (json.JSONDecodeError, KeyError, ValueError) as e:
        logger.warning(f"History Agent extraction failed: {e}")
        # Fallback: estimate from SPPB
        sppb_total = assessment.sppb.total if assessment.sppb else 6
        cfs_est = max(1, min(9, 8 - sppb_total))
        assessment.history_summary = "History inferred from physical performance data."
        assessment.cfs = score_cfs(score=cfs_est, notes="Estimated from SPPB score")
        assessment.katz = score_katz(
            bathing=sppb_total >= 4, dressing=sppb_total >= 3,
            toileting=sppb_total >= 3, transferring=sppb_total >= 4,
            continence=True, feeding=True,
        )

    return assessment


def run_physical_exam_agent(
    patient: PatientContext,
    assessment: AgentAssessment,
    llm: BaseChatModel,
) -> AgentAssessment:
    """
    Physical Exam Agent — SPPB scores already provided by Gemini video analysis.
    This is a pass-through; the SPPB is already set before the graph runs.
    """
    if assessment.sppb:
        logger.info(f"Physical Exam: SPPB already set — {assessment.sppb.total}/12")
    else:
        logger.warning("Physical Exam: No SPPB data available")
    return assessment


def run_contributing_conditions_agent(
    patient: PatientContext,
    assessment: AgentAssessment,
    llm: BaseChatModel,
    chat_history: str = "",
) -> AgentAssessment:
    """
    Non-interactive Contributing Conditions Agent.
    Infers cognitive, mood, sleep, and social isolation risk from available data.
    """
    sppb_info = "Not assessed"
    if assessment.sppb:
        sppb_info = f"SPPB {assessment.sppb.total}/12 ({assessment.sppb.label})"

    cfs_info = "Not assessed"
    if assessment.cfs:
        cfs_info = f"CFS {assessment.cfs.score}/9 ({assessment.cfs.label})"

    history_info = assessment.history_summary or "No history available"
    chat_context = f"\nChat history:\n{chat_history}" if chat_history else ""

    prompt = f"""You are a geriatric care specialist screening for contributing conditions to frailty.
You do NOT have direct interview access. Infer risk levels from available clinical data.

Patient: {patient.name}, Age: {patient.age}
Physical performance: {sppb_info}
Clinical Frailty Scale: {cfs_info}
History summary: {history_info}
{chat_context}

Screen for each domain and assign risk levels based on correlations:
- Low physical performance often correlates with mood and social isolation risk
- Advanced age (>80) increases cognitive and sleep risk
- Poor SPPB balance scores may indicate fall-related anxiety

Return ONLY valid JSON:
{{
  "cognitive_risk": "low" | "moderate" | "high",
  "mood_risk": "low" | "moderate" | "high",
  "sleep_risk": "low" | "moderate" | "high",
  "social_isolation_risk": "low" | "moderate" | "high",
  "notes": "brief summary of reasoning"
}}"""

    response = llm.invoke([HumanMessage(content=prompt)])
    content = response.content.strip()

    if "```" in content:
        content = content.split("```")[1]
        if content.startswith("json"):
            content = content[4:]
        content = content.strip()

    try:
        data = json.loads(content)
        assessment.contributing = ContributingConditionsScore(
            cognitive_risk=data["cognitive_risk"],
            mood_risk=data["mood_risk"],
            sleep_risk=data["sleep_risk"],
            social_isolation_risk=data["social_isolation_risk"],
            notes=data.get("notes"),
        )
        logger.info(f"Contributing Conditions: {assessment.contributing.model_dump()}")
    except (json.JSONDecodeError, KeyError, ValidationError) as e:
        logger.warning(f"Contributing Conditions extraction failed: {e}")
        # Conservative defaults based on age
        risk = "moderate" if patient.age >= 75 else "low"
        assessment.contributing = ContributingConditionsScore(
            cognitive_risk=risk,
            mood_risk=risk,
            sleep_risk=risk,
            social_isolation_risk=risk,
            notes="Estimated from age and physical performance",
        )

    return assessment


# ============================================================
#  RISK STRATIFICATION ENGINE
# ============================================================

MANAGEMENT_TRIGGERS = {
    "robust": ["education"],
    "pre-frail": ["education", "exercise", "monitoring"],
    "frail": ["education", "exercise", "sleep", "monitoring"],
    "severely-frail": ["education", "exercise", "sleep", "monitoring"],
}


def run_frailty_detection_agent(
    patient: PatientContext,
    assessment: AgentAssessment,
    llm: BaseChatModel,
) -> AgentAssessment:
    """Frailty Detection — combines CFS + Katz + SPPB into tier classification."""

    if not assessment.cfs or not assessment.katz or not assessment.sppb:
        missing = [n for n, v in [("CFS", assessment.cfs), ("Katz", assessment.katz), ("SPPB", assessment.sppb)] if not v]
        logger.warning(f"Incomplete data — missing: {', '.join(missing)}. Defaulting to pre-frail.")
        assessment.frailty_tier = "pre-frail"
        assessment.risk_explanation = "Incomplete data — defaulting to pre-frail for safety."
        return assessment

    tier, explanation = classify_frailty(assessment.cfs, assessment.katz, assessment.sppb)

    # Adjust for contributing conditions
    if assessment.contributing:
        high_risks = [
            assessment.contributing.cognitive_risk == "high",
            assessment.contributing.mood_risk == "high",
            assessment.contributing.sleep_risk == "high",
            assessment.contributing.social_isolation_risk == "high",
        ]
        if sum(high_risks) >= 2 and tier == "robust":
            tier = "pre-frail"
            explanation += " Elevated psychosocial risk factors upgraded tier to pre-frail."
        elif sum(high_risks) >= 2 and tier == "pre-frail":
            tier = "frail"
            explanation += " Elevated psychosocial risk factors upgraded tier to frail."

    assessment.frailty_tier = tier
    assessment.risk_explanation = explanation

    # Generate patient-facing narrative
    prompt = f"""You are a geriatric specialist summarizing a frailty risk assessment.

Patient: {patient.name}, Age: {patient.age}
Frailty tier: {tier}
Scoring: {explanation}
CFS: {assessment.cfs.score} ({assessment.cfs.label})
Katz ADL: {assessment.katz.total}/6 ({assessment.katz.label})
SPPB: {assessment.sppb.total}/12 ({assessment.sppb.label})
Contributing: {assessment.contributing.model_dump() if assessment.contributing else "Not assessed"}

Write a 3-4 sentence clinical summary in plain language. Be empathetic and constructive.
Focus on what can be done, not just the risk."""

    narrative = llm.invoke([HumanMessage(content=prompt)])
    assessment.risk_explanation = explanation + "\n\n" + narrative.content

    logger.info(f"Frailty Detection: {tier.upper()}")
    return assessment


# ============================================================
#  MANAGEMENT ROUTER
# ============================================================

AGENT_DESCRIPTIONS = {
    "education": "Physical Education Agent — frailty education, fall prevention, mobility preservation.",
    "exercise": "Exercise Agent — 4-week exercise program tailored to physical performance.",
    "sleep": "Sleep Agent — sleep hygiene coaching and CBT-I interventions.",
    "monitoring": "Monitoring Agent — longitudinal trend tracking and reassessment scheduling.",
}


def run_management_router_agent(
    patient: PatientContext,
    assessment: AgentAssessment,
    llm: BaseChatModel,
) -> AgentAssessment:
    """LLM-driven routing to select management agents."""

    contributing_summary = "Not assessed"
    if assessment.contributing:
        c = assessment.contributing
        contributing_summary = (
            f"Cognitive: {c.cognitive_risk} | Mood: {c.mood_risk} | "
            f"Sleep: {c.sleep_risk} | Social isolation: {c.social_isolation_risk}"
        )

    sppb_detail = "Not assessed"
    if assessment.sppb:
        s = assessment.sppb
        sppb_detail = (
            f"Total {s.total}/12 ({s.label}) — "
            f"Balance: {s.balance_score}/4, Gait: {s.gait_speed_score}/4, "
            f"Chair stand: {s.chair_stand_score}/4"
        )

    agent_menu = "\n".join(f"- {name}: {desc}" for name, desc in AGENT_DESCRIPTIONS.items())

    prompt = f"""You are a geriatric care coordinator deciding which management agents to activate.

PATIENT: {patient.name}, Age: {patient.age}
FRAILTY TIER: {assessment.frailty_tier or "unknown"}
CFS: {f"{assessment.cfs.score}/9 — {assessment.cfs.label}" if assessment.cfs else "N/A"}
Katz: {f"{assessment.katz.total}/6 — {assessment.katz.label}" if assessment.katz else "N/A"}
SPPB: {sppb_detail}
Contributing: {contributing_summary}
History: {assessment.history_summary or "N/A"}

AVAILABLE AGENTS:
{agent_menu}

Select the agents this patient needs. Return JSON:
{{
  "agents_to_activate": ["education", "exercise", ...],
  "rationale": "2-4 sentence clinical rationale"
}}"""

    try:
        structured_llm = llm.with_structured_output(ManagementRoutingDecision)
        decision: ManagementRoutingDecision = structured_llm.invoke(
            [HumanMessage(content=prompt)]
        )
        valid = set(AGENT_DESCRIPTIONS.keys())
        chosen = [a for a in decision.agents_to_activate if a in valid]
        if not chosen:
            chosen = MANAGEMENT_TRIGGERS.get(assessment.frailty_tier or "pre-frail", list(valid))
        assessment.management_routes = chosen
        assessment.management_routing_rationale = decision.rationale
    except Exception as e:
        logger.warning(f"Management Router structured output failed: {e}, using fallback")
        # Fallback: use tier-based triggers
        assessment.management_routes = MANAGEMENT_TRIGGERS.get(
            assessment.frailty_tier or "pre-frail",
            ["education", "exercise", "monitoring"],
        )
        assessment.management_routing_rationale = f"Tier-based default routing for {assessment.frailty_tier}."

    logger.info(f"Management Router: {assessment.management_routes}")
    return assessment


# ============================================================
#  MANAGEMENT LAYER AGENTS
# ============================================================

INTENSITY_GUIDE = {
    "robust": "moderate intensity — focus on maintaining and building strength",
    "pre-frail": "light to moderate — emphasize balance and functional strength",
    "frail": "gentle, seated or supported exercises — prioritize safety",
    "severely-frail": "very gentle, primarily seated or bed-based — comfort and minimal exertion",
}


def run_physical_education_agent(
    patient: PatientContext,
    assessment: AgentAssessment,
    llm: BaseChatModel,
) -> AgentAssessment:
    """Generates personalized frailty education and fall prevention plan."""
    tier = assessment.frailty_tier or "pre-frail"
    sppb_label = assessment.sppb.label if assessment.sppb else "unknown"
    cfs_label = assessment.cfs.label if assessment.cfs else "unknown"

    prompt = f"""You are a geriatric health educator speaking to {patient.name}, age {patient.age}.

Frailty: {tier} | SPPB: {sppb_label} | CFS: {cfs_label}

Write a personalized education plan covering:
1. What frailty means and why it matters (briefly, reassuring)
2. Why staying active and maintaining muscle strength is important
3. 3 practical fall prevention tips specific to their level
4. An encouraging message about maintaining independence

Use warm, simple language for an elderly adult. 300-400 words. Clear section headers."""

    response = llm.invoke([HumanMessage(content=prompt)])
    assessment.education_plan = response.content
    return assessment


def run_exercise_agent(
    patient: PatientContext,
    assessment: AgentAssessment,
    llm: BaseChatModel,
) -> AgentAssessment:
    """Generates a 4-week personalized exercise program."""
    tier = assessment.frailty_tier or "pre-frail"
    sppb_total = assessment.sppb.total if assessment.sppb else 6
    sppb_label = assessment.sppb.label if assessment.sppb else "unknown"
    intensity = INTENSITY_GUIDE.get(tier, "light")

    prompt = f"""You are a geriatric physiotherapist creating a personalized exercise program for {patient.name}, age {patient.age}.

Frailty tier: {tier}
SPPB score: {sppb_total}/12 ({sppb_label})
Recommended intensity: {intensity}

Design a 4-week exercise program:

**Week 1-2: Foundation Phase**
- 3 specific exercises (sets, reps, safety tips)
- 20-30 minutes per session, 3 days/week

**Week 3-4: Progressive Phase**
- 3 exercises building on Week 1-2
- 30 minutes, 3-4 days/week

For each exercise: name, how to do it safely, modification if too hard.
Include warm-up (5 min), cool-down (5 min), warning signs to stop.

Use simple, encouraging language. Format with clear headers."""

    response = llm.invoke([HumanMessage(content=prompt)])
    assessment.exercise_plan = response.content
    return assessment


def run_sleep_agent(
    patient: PatientContext,
    assessment: AgentAssessment,
    llm: BaseChatModel,
) -> AgentAssessment:
    """Generates sleep hygiene and CBT-I intervention plan."""
    sleep_risk = "unknown"
    if assessment.contributing:
        sleep_risk = assessment.contributing.sleep_risk

    prompt = f"""You are a geriatric sleep specialist helping {patient.name}, age {patient.age}.

Sleep risk level: {sleep_risk}

Create a personalized sleep improvement plan:

**Understanding Your Sleep** — why sleep changes with age, how it affects frailty
**Sleep Hygiene** (5-7 tips tailored to {sleep_risk} risk) + evening routine + morning light
**Behavioral Interventions** — if moderate/high: CBT-I basics, sleep restriction, relaxation
**When to Seek Help** — signs that warrant a doctor visit

Warm, practical language. 300-400 words. Clear headers."""

    response = llm.invoke([HumanMessage(content=prompt)])
    assessment.sleep_plan = response.content
    return assessment


TIER_SEVERITY = {
    "robust": 0,
    "pre-frail": 1,
    "frail": 2,
    "severely-frail": 3,
}


def run_monitoring_agent(
    patient: PatientContext,
    assessment: AgentAssessment,
    all_assessments: List[AgentAssessment],
    llm: BaseChatModel,
) -> AgentAssessment:
    """Longitudinal trend analysis and follow-up plan."""
    # Determine trend
    trend = "baseline"
    if len(all_assessments) >= 2:
        latest = TIER_SEVERITY.get(all_assessments[0].frailty_tier or "pre-frail", 1)
        previous = TIER_SEVERITY.get(all_assessments[1].frailty_tier or "pre-frail", 1)
        if latest < previous:
            trend = "improving"
        elif latest > previous:
            trend = "declining"
        else:
            trend = "stable"

    tier = assessment.frailty_tier or "unknown"
    n = len(all_assessments)

    history_lines = []
    for a in all_assessments[:5]:
        date_str = a.assessed_at.strftime("%Y-%m-%d") if a.assessed_at else "unknown date"
        cfs_str = f"CFS {a.cfs.score}" if a.cfs else "no CFS"
        sppb_str = f"SPPB {a.sppb.total}/12" if a.sppb else "no SPPB"
        history_lines.append(f"  {date_str}: {a.frailty_tier or 'unknown'} — {cfs_str}, {sppb_str}")

    history_summary = "\n".join(history_lines) if history_lines else "  No prior assessments."

    prompt = f"""You are a geriatric monitoring specialist reviewing longitudinal data for {patient.name}, age {patient.age}.

Current tier: {tier} | Trend: {trend} | Total assessments: {n}

History (most recent first):
{history_summary}

Write a monitoring summary:

**Trend Analysis** — trajectory + key changes
**Monitoring Recommendations** — reassessment schedule, metrics to watch, red flags
**Care Escalation** (if declining/severely frail) — referral recommendations

Clear, plain language. Be reassuring but honest."""

    response = llm.invoke([HumanMessage(content=prompt)])
    assessment.monitoring_notes = response.content
    return assessment
