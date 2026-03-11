"""Chat router — powered by the Chat Graph (context assembly → Gemini agent → safety gate → persist)."""

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
import json
import logging

from ..core.config import get_settings
from ..core.database import get_db
from ..services.langgraph_agents.chat_graph import run_chat_pipeline_stream

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/chat", tags=["chat"])


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=5000)
    user_id: str
    language: str = "en"


@router.post("/stream")
async def chat_stream(req: ChatRequest, db: AsyncSession = Depends(get_db)):
    """Stream chat response via SSE using the Chat Graph pipeline."""
    logger.info(f"POST /chat/stream called: user_id={req.user_id} message={req.message[:100]!r}")
    settings = get_settings()

    from ..models.db_models import User
    from sqlalchemy import select
    user = await db.execute(select(User).where(User.id == req.user_id))
    if not user.scalar_one_or_none():
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="User not found. Please complete onboarding first.")

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
