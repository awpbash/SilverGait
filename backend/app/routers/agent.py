"""
LangGraph Agent API — runs the full 9-agent frailty assessment workflow.
Triggered after a Gemini video assessment or on-demand.
"""

import logging
from concurrent.futures import ThreadPoolExecutor
import asyncio

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.database import get_db
from ..models.db_models import Assessment as AssessmentRow

router = APIRouter(prefix="/agent", tags=["LangGraph Agents"])
logger = logging.getLogger(__name__)

_executor = ThreadPoolExecutor(max_workers=2)


class AgentRunRequest(BaseModel):
    user_id: str
    patient_name: str = "User"
    patient_age: int = 70
    patient_gender: str = "unknown"
    # If not provided, will use latest assessment from DB
    sppb_balance: Optional[int] = None
    sppb_gait: Optional[int] = None
    sppb_chair: Optional[int] = None
    sppb_notes: str = ""
    chat_history: str = ""


class AgentRunResponse(BaseModel):
    frailty_tier: Optional[str] = None
    risk_explanation: Optional[str] = None
    education_plan: Optional[str] = None
    exercise_plan: Optional[str] = None
    sleep_plan: Optional[str] = None
    monitoring_notes: Optional[str] = None
    management_routes: Optional[list[str]] = None
    management_rationale: Optional[str] = None
    cfs_score: Optional[int] = None
    cfs_label: Optional[str] = None
    katz_total: Optional[int] = None
    sppb_total: Optional[int] = None
    contributing: Optional[dict] = None
    completed_nodes: list[str] = Field(default_factory=list)
    elapsed_seconds: float = 0.0


@router.post("/run", response_model=AgentRunResponse)
async def run_agent_workflow(
    req: AgentRunRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Run the full LangGraph 9-agent workflow.
    If SPPB scores not provided, fetches from latest assessment in DB.
    """
    balance = req.sppb_balance
    gait = req.sppb_gait
    chair = req.sppb_chair
    notes = req.sppb_notes

    # If no SPPB provided, fetch from DB
    if balance is None or gait is None or chair is None:
        from sqlalchemy import select
        stmt = (
            select(AssessmentRow)
            .where(AssessmentRow.user_id == req.user_id)
            .order_by(AssessmentRow.timestamp.desc())
            .limit(1)
        )
        result = await db.execute(stmt)
        row = result.scalar_one_or_none()
        if row and row.sppb_breakdown:
            sppb = row.sppb_breakdown
            balance = balance if balance is not None else sppb.get("balance_score", 2)
            gait = gait if gait is not None else sppb.get("gait_score", 2)
            chair = chair if chair is not None else sppb.get("chair_stand_score", 2)
            notes = notes or sppb.get("notes", "")
        else:
            raise HTTPException(
                status_code=400,
                detail="No SPPB scores provided and no assessment found in database.",
            )

    # Run the LangGraph workflow in a thread pool (it's synchronous internally)
    from ..services.langgraph_agents import run_post_assessment_graph

    loop = asyncio.get_event_loop()
    try:
        agent_result = await loop.run_in_executor(
            _executor,
            lambda: run_post_assessment_graph(
                sppb_balance=balance,
                sppb_gait=gait,
                sppb_chair=chair,
                sppb_notes=notes,
                patient_name=req.patient_name,
                patient_age=req.patient_age,
                patient_gender=req.patient_gender,
                chat_history=req.chat_history,
            ),
        )
    except Exception as e:
        logger.error(f"LangGraph workflow failed: {e}")
        raise HTTPException(status_code=503, detail=f"Agent workflow failed: {str(e)}")

    # Persist agent results to a new table row
    try:
        from ..models.db_models import AgentRun
        run_row = AgentRun(
            user_id=req.user_id,
            frailty_tier=agent_result.frailty_tier,
            risk_explanation=agent_result.risk_explanation,
            education_plan=agent_result.education_plan,
            exercise_plan=agent_result.exercise_plan,
            sleep_plan=agent_result.sleep_plan,
            monitoring_notes=agent_result.monitoring_notes,
            management_routes=",".join(agent_result.management_routes or []),
            cfs_score=agent_result.cfs_score,
            katz_total=agent_result.katz_total,
            sppb_total=agent_result.sppb_total,
            completed_nodes=",".join(agent_result.completed_nodes),
            elapsed_seconds=agent_result.elapsed_seconds,
        )
        db.add(run_row)
        await db.commit()
    except Exception as e:
        logger.warning(f"Failed to persist agent run: {e}")

    return AgentRunResponse(
        frailty_tier=agent_result.frailty_tier,
        risk_explanation=agent_result.risk_explanation,
        education_plan=agent_result.education_plan,
        exercise_plan=agent_result.exercise_plan,
        sleep_plan=agent_result.sleep_plan,
        monitoring_notes=agent_result.monitoring_notes,
        management_routes=agent_result.management_routes,
        management_rationale=agent_result.management_rationale,
        cfs_score=agent_result.cfs_score,
        cfs_label=agent_result.cfs_label,
        katz_total=agent_result.katz_total,
        sppb_total=agent_result.sppb_total,
        contributing=agent_result.contributing,
        completed_nodes=agent_result.completed_nodes,
        elapsed_seconds=agent_result.elapsed_seconds,
    )


@router.get("/latest/{user_id}", response_model=AgentRunResponse)
async def get_latest_agent_run(
    user_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Get the most recent LangGraph agent run for a user."""
    from sqlalchemy import select
    from ..models.db_models import AgentRun

    stmt = (
        select(AgentRun)
        .where(AgentRun.user_id == user_id)
        .order_by(AgentRun.timestamp.desc())
        .limit(1)
    )
    result = await db.execute(stmt)
    row = result.scalar_one_or_none()

    if not row:
        raise HTTPException(status_code=404, detail="No agent run found for this user.")

    return AgentRunResponse(
        frailty_tier=row.frailty_tier,
        risk_explanation=row.risk_explanation,
        education_plan=row.education_plan,
        exercise_plan=row.exercise_plan,
        sleep_plan=row.sleep_plan,
        monitoring_notes=row.monitoring_notes,
        management_routes=row.management_routes.split(",") if row.management_routes else [],
        cfs_score=row.cfs_score,
        katz_total=row.katz_total,
        sppb_total=row.sppb_total,
        completed_nodes=row.completed_nodes.split(",") if row.completed_nodes else [],
        elapsed_seconds=row.elapsed_seconds or 0.0,
    )
