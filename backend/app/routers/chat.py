"""Chat router — powered by the Chat Graph (context assembly → Gemini agent → safety gate → persist)."""

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession
import json
import logging

from ..core.config import get_settings
from ..core.database import get_db
from ..core.auth import get_current_user
from ..core.rate_limit import chat_limiter
from ..services.langgraph_agents.chat_graph import run_chat_pipeline_stream

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/chat", tags=["chat"])


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=5000)
    user_id: str
    language: str = "en"


@router.post("/stream")
async def chat_stream(
    req: ChatRequest,
    db: AsyncSession = Depends(get_db),
    auth_user_id: str = Depends(get_current_user),
):
    """Stream chat response via SSE using the Chat Graph pipeline."""
    # Validate user_id in body matches authenticated session
    from fastapi import HTTPException
    if req.user_id != auth_user_id:
        raise HTTPException(status_code=403, detail="Access denied: user mismatch")
    await chat_limiter.check(req.user_id)
    logger.info(f"POST /chat/stream called: user_id={req.user_id} message={req.message[:100]!r}")
    settings = get_settings()

    async def generate():
        try:
            async for chunk_json in run_chat_pipeline_stream(
                db=db,
                user_id=req.user_id,
                message=req.message,
                language=req.language,
                api_key=settings.gemini_api_key,
            ):
                yield f"data: {chunk_json}\n\n"
        except Exception as e:
            logger.error(f"Chat stream error: {e}")
            yield f"data: {json.dumps({'type': 'chunk', 'text': 'Sorry, I had a little trouble. Try again!'})}\n\n"
            yield f"data: {json.dumps({'type': 'done', 'actions': []})}\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/history/{user_id}")
async def chat_history(
    user_id: str,
    limit: int = Query(default=50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
):
    """Return recent chat messages for a user (newest first, reversed to chronological)."""
    from ..models.db_models import ChatMessage
    result = await db.execute(
        select(ChatMessage)
        .where(ChatMessage.user_id == user_id)
        .order_by(desc(ChatMessage.timestamp))
        .limit(limit)
    )
    rows = list(reversed(result.scalars().all()))
    return [
        {
            "id": str(msg.id),
            "role": msg.role,
            "text": msg.content or "",
            "timestamp": msg.timestamp.isoformat() if msg.timestamp else None,
        }
        for msg in rows
    ]
