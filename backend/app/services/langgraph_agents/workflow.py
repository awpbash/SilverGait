"""
LangGraph Workflow — Web-adapted SilverGait Agent Orchestration.

Graph flow:
  START
    → history_node          (infers CFS + Katz from SPPB + context)
    → physical_exam_node    (pass-through — SPPB already from Gemini)
    → contributing_node     (infers psychosocial risk from data)
    → frailty_detection     (deterministic classification + LLM narrative)
    → management_router     (LLM decides which agents to run)
    → [conditional] education, exercise, sleep, monitoring
  END
"""

import logging
import os
import time
from typing import TypedDict, Annotated, Optional
from dataclasses import dataclass

import operator
from langgraph.graph import StateGraph, END
from langchain_core.language_models import BaseChatModel

from .models import PatientContext, AgentAssessment, SPPBScore
from .agents import (
    run_history_agent,
    run_physical_exam_agent,
    run_contributing_conditions_agent,
    run_frailty_detection_agent,
    run_management_router_agent,
    run_physical_education_agent,
    run_exercise_agent,
    run_sleep_agent,
    run_monitoring_agent,
)

logger = logging.getLogger(__name__)


# --- Graph state ---

class AgentState(TypedDict):
    patient: PatientContext
    assessment: AgentAssessment
    llm: BaseChatModel
    chat_history: str
    past_assessments: list[AgentAssessment]
    completed_nodes: Annotated[list[str], operator.add]


# --- Node functions ---

def history_node(state: AgentState) -> AgentState:
    t = time.time()
    assessment = run_history_agent(
        patient=state["patient"],
        assessment=state["assessment"],
        llm=state["llm"],
        chat_history=state.get("chat_history", ""),
    )
    logger.info(f"History node completed in {time.time()-t:.1f}s")
    return {**state, "assessment": assessment, "completed_nodes": ["history"]}


def physical_exam_node(state: AgentState) -> AgentState:
    assessment = run_physical_exam_agent(
        patient=state["patient"],
        assessment=state["assessment"],
        llm=state["llm"],
    )
    return {**state, "assessment": assessment, "completed_nodes": ["physical_exam"]}


def contributing_node(state: AgentState) -> AgentState:
    t = time.time()
    assessment = run_contributing_conditions_agent(
        patient=state["patient"],
        assessment=state["assessment"],
        llm=state["llm"],
        chat_history=state.get("chat_history", ""),
    )
    logger.info(f"Contributing conditions node completed in {time.time()-t:.1f}s")
    return {**state, "assessment": assessment, "completed_nodes": ["contributing_conditions"]}


def frailty_detection_node(state: AgentState) -> AgentState:
    t = time.time()
    assessment = run_frailty_detection_agent(
        patient=state["patient"],
        assessment=state["assessment"],
        llm=state["llm"],
    )
    logger.info(f"Frailty detection node completed in {time.time()-t:.1f}s")
    return {**state, "assessment": assessment, "completed_nodes": ["frailty_detection"]}


def management_router_node(state: AgentState) -> AgentState:
    t = time.time()
    assessment = run_management_router_agent(
        patient=state["patient"],
        assessment=state["assessment"],
        llm=state["llm"],
    )
    logger.info(f"Management router node completed in {time.time()-t:.1f}s")
    return {**state, "assessment": assessment, "completed_nodes": ["management_router"]}


def education_node(state: AgentState) -> AgentState:
    t = time.time()
    assessment = run_physical_education_agent(
        patient=state["patient"],
        assessment=state["assessment"],
        llm=state["llm"],
    )
    logger.info(f"Education node completed in {time.time()-t:.1f}s")
    return {**state, "assessment": assessment, "completed_nodes": ["education"]}


def exercise_node(state: AgentState) -> AgentState:
    t = time.time()
    assessment = run_exercise_agent(
        patient=state["patient"],
        assessment=state["assessment"],
        llm=state["llm"],
    )
    logger.info(f"Exercise node completed in {time.time()-t:.1f}s")
    return {**state, "assessment": assessment, "completed_nodes": ["exercise"]}


def sleep_node(state: AgentState) -> AgentState:
    t = time.time()
    assessment = run_sleep_agent(
        patient=state["patient"],
        assessment=state["assessment"],
        llm=state["llm"],
    )
    logger.info(f"Sleep node completed in {time.time()-t:.1f}s")
    return {**state, "assessment": assessment, "completed_nodes": ["sleep"]}


def monitoring_node(state: AgentState) -> AgentState:
    t = time.time()
    assessment = run_monitoring_agent(
        patient=state["patient"],
        assessment=state["assessment"],
        all_assessments=state.get("past_assessments", []),
        llm=state["llm"],
    )
    logger.info(f"Monitoring node completed in {time.time()-t:.1f}s")
    return {**state, "assessment": assessment, "completed_nodes": ["monitoring"]}


# --- Conditional routing ---

def route_management(state: AgentState) -> list[str]:
    chosen = state["assessment"].management_routes or ["education", "exercise", "sleep", "monitoring"]
    agent_to_node = {
        "education": "education_node",
        "exercise": "exercise_node",
        "sleep": "sleep_node",
        "monitoring": "monitoring_node",
    }
    routes = [agent_to_node[a] for a in chosen if a in agent_to_node]
    if not routes:
        routes = list(agent_to_node.values())
    logger.info(f"Management routing: {[r.replace('_node', '') for r in routes]}")
    return routes


# --- Build graph ---

def build_graph() -> StateGraph:
    graph = StateGraph(AgentState)

    # Assessment layer
    graph.add_node("history_node", history_node)
    graph.add_node("physical_exam_node", physical_exam_node)
    graph.add_node("contributing_node", contributing_node)
    graph.add_node("frailty_detection_node", frailty_detection_node)

    # Management router
    graph.add_node("management_router_node", management_router_node)

    # Management layer
    graph.add_node("education_node", education_node)
    graph.add_node("exercise_node", exercise_node)
    graph.add_node("sleep_node", sleep_node)
    graph.add_node("monitoring_node", monitoring_node)

    # Sequential assessment edges
    graph.set_entry_point("history_node")
    graph.add_edge("history_node", "physical_exam_node")
    graph.add_edge("physical_exam_node", "contributing_node")
    graph.add_edge("contributing_node", "frailty_detection_node")
    graph.add_edge("frailty_detection_node", "management_router_node")

    # Conditional management edges
    graph.add_conditional_edges(
        "management_router_node",
        route_management,
        {
            "education_node": "education_node",
            "exercise_node": "exercise_node",
            "sleep_node": "sleep_node",
            "monitoring_node": "monitoring_node",
        },
    )

    graph.add_edge("education_node", END)
    graph.add_edge("exercise_node", END)
    graph.add_edge("sleep_node", END)
    graph.add_edge("monitoring_node", END)

    return graph


# --- LLM factory ---

def _get_llm() -> BaseChatModel:
    """Get LLM using Gemini (same API key as the main app)."""
    api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
    if api_key:
        from langchain_google_genai import ChatGoogleGenerativeAI
        return ChatGoogleGenerativeAI(
            model=os.getenv("LANGGRAPH_MODEL", "gemini-2.0-flash"),
            temperature=0.3,
            google_api_key=api_key,
            max_output_tokens=4096,
        )

    # Fallback: try Anthropic
    anthropic_key = os.getenv("ANTHROPIC_API_KEY")
    if anthropic_key:
        from langchain_anthropic import ChatAnthropic
        return ChatAnthropic(
            model=os.getenv("LANGGRAPH_MODEL", "claude-sonnet-4-6"),
            temperature=0.3,
            anthropic_api_key=anthropic_key,
            max_tokens=4096,
        )

    raise EnvironmentError("No LLM API key found. Set GEMINI_API_KEY or ANTHROPIC_API_KEY.")


# --- Public API ---

@dataclass
class AgentResult:
    """Result from the LangGraph workflow."""
    frailty_tier: Optional[str]
    risk_explanation: Optional[str]
    education_plan: Optional[str]
    exercise_plan: Optional[str]
    sleep_plan: Optional[str]
    monitoring_notes: Optional[str]
    management_routes: Optional[list[str]]
    management_rationale: Optional[str]
    cfs_score: Optional[int]
    cfs_label: Optional[str]
    katz_total: Optional[int]
    sppb_total: Optional[int]
    contributing: Optional[dict]
    completed_nodes: list[str]
    elapsed_seconds: float


def run_post_assessment_graph(
    sppb_balance: int,
    sppb_gait: int,
    sppb_chair: int,
    sppb_notes: str = "",
    patient_name: str = "User",
    patient_age: int = 70,
    patient_gender: str = "unknown",
    chat_history: str = "",
    past_assessments: Optional[list[AgentAssessment]] = None,
) -> AgentResult:
    """
    Run the full 9-agent LangGraph workflow after a Gemini video assessment.

    Takes SPPB sub-scores (from Gemini) and runs:
    History → Physical Exam → Contributing Conditions → Frailty Detection
    → Management Router → [Education, Exercise, Sleep, Monitoring]
    """
    from .scoring import score_sppb

    llm = _get_llm()
    patient = PatientContext(name=patient_name, age=patient_age, gender=patient_gender)
    sppb = score_sppb(sppb_balance, sppb_gait, sppb_chair, sppb_notes)
    assessment = AgentAssessment(sppb=sppb)

    logger.info(f"Starting LangGraph workflow: SPPB={sppb.total}/12, patient={patient_name}")

    graph = build_graph()
    app = graph.compile()

    initial_state: AgentState = {
        "patient": patient,
        "assessment": assessment,
        "llm": llm,
        "chat_history": chat_history,
        "past_assessments": past_assessments or [],
        "completed_nodes": [],
    }

    start = time.time()
    final_state = app.invoke(initial_state)
    elapsed = time.time() - start

    final_assessment: AgentAssessment = final_state["assessment"]
    completed = final_state.get("completed_nodes", [])

    logger.info(
        f"LangGraph workflow complete in {elapsed:.1f}s — "
        f"tier={final_assessment.frailty_tier}, nodes={completed}"
    )

    return AgentResult(
        frailty_tier=final_assessment.frailty_tier,
        risk_explanation=final_assessment.risk_explanation,
        education_plan=final_assessment.education_plan,
        exercise_plan=final_assessment.exercise_plan,
        sleep_plan=final_assessment.sleep_plan,
        monitoring_notes=final_assessment.monitoring_notes,
        management_routes=final_assessment.management_routes,
        management_rationale=final_assessment.management_routing_rationale,
        cfs_score=final_assessment.cfs.score if final_assessment.cfs else None,
        cfs_label=final_assessment.cfs.label if final_assessment.cfs else None,
        katz_total=final_assessment.katz.total if final_assessment.katz else None,
        sppb_total=final_assessment.sppb.total if final_assessment.sppb else None,
        contributing=final_assessment.contributing.model_dump() if final_assessment.contributing else None,
        completed_nodes=completed,
        elapsed_seconds=elapsed,
    )
