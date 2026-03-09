"""Chat router — friendly Gemini-powered assistant for elderly users (streaming, multilingual)."""

from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from google import genai
import logging
import json

from ..core.config import get_settings
from ..core.database import async_session
from ..models.db_models import Assessment, ExerciseLog
from sqlalchemy import select, desc, func
from datetime import date, timedelta

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/chat", tags=["chat"])

# Language display names and instruction fragments
LANGUAGE_CONFIG = {
    "en": {
        "name": "English",
        "instruction": "Respond in English.",
    },
    "mandarin": {
        "name": "Mandarin Chinese",
        "instruction": "Respond in Simplified Chinese (Mandarin). Use simple, everyday vocabulary suitable for elderly Singaporean Chinese speakers. Avoid complex literary Chinese.",
    },
    "malay": {
        "name": "Bahasa Melayu",
        "instruction": "Respond in Bahasa Melayu. Use simple, conversational Malay suitable for elderly Singaporean Malay speakers.",
    },
    "tamil": {
        "name": "Tamil",
        "instruction": "Respond in Tamil (தமிழ்). Use simple, conversational Tamil suitable for elderly Singaporean Tamil speakers. Avoid overly formal or literary Tamil.",
    },
}

SYSTEM_PROMPT = """You are SilverGait, a warm and friendly physiotherapy companion for elderly people in Singapore.

PERSONALITY:
- Speak simply and warmly, like a caring grandchild
- Use short sentences (max 2 lines per paragraph)
- Be encouraging but never condescending
- Always prioritize safety — remind them to hold onto something if needed

LANGUAGE:
{language_instruction}
The user may write in any language — always reply in the language specified above.

CAPABILITIES (mention these naturally when relevant):
- "Check my strength" — starts a mobility assessment using the phone camera
- "Show exercises" — guided daily exercises for balance and strength
- "How am I doing?" — shows their progress and scores over time

RULES:
- Never give medical diagnoses
- Always suggest seeing a doctor for pain or sudden changes
- Keep responses under 3 short paragraphs
- If they mention falling or feeling unsteady, take it seriously and recommend professional help
- If they greet you, greet them warmly and suggest what they can do today

CONTEXT:
{context}

Respond naturally to the user's message. If they seem confused, gently guide them to one of the three main actions (check, exercises, progress)."""


class ChatRequest(BaseModel):
    message: str
    user_id: str
    language: str = "en"


def _get_suggested_actions(message: str, reply: str, language: str) -> list[dict]:
    """Return contextual quick-reply suggestions based on the conversation."""
    lower = (message + " " + reply).lower()
    actions = []

    # Keywords in multiple languages
    check_kw = ["check", "assess", "strength", "test", "walk", "检查", "力量", "periksa", "semak"]
    exercise_kw = ["exercise", "stretch", "move", "workout", "运动", "锻炼", "senaman", "latihan"]
    progress_kw = ["progress", "score", "history", "doing", "trend", "进度", "分数", "kemajuan"]

    # Localized labels
    labels = {
        "en": {"check": "Start Check", "exercise": "Show Exercises", "progress": "View Progress",
                "check_default": "Check My Strength", "exercise_default": "Daily Exercises", "progress_default": "My Progress"},
        "mandarin": {"check": "开始检查", "exercise": "查看运动", "progress": "查看进度",
                      "check_default": "检查体力", "exercise_default": "每日运动", "progress_default": "我的进度"},
        "malay": {"check": "Mula Semakan", "exercise": "Lihat Senaman", "progress": "Lihat Kemajuan",
                   "check_default": "Semak Kekuatan", "exercise_default": "Senaman Harian", "progress_default": "Kemajuan Saya"},
        "tamil": {"check": "சோதனை தொடங்கு", "exercise": "பயிற்சிகள்", "progress": "முன்னேற்றம்",
                   "check_default": "என் வலிமை சோதி", "exercise_default": "தினசரி பயிற்சி", "progress_default": "என் முன்னேற்றம்"},
    }
    l = labels.get(language, labels["en"])

    if any(w in lower for w in check_kw):
        actions.append({"label": l["check"], "route": "/check"})
    if any(w in lower for w in exercise_kw):
        actions.append({"label": l["exercise"], "route": "/exercises"})
    if any(w in lower for w in progress_kw):
        actions.append({"label": l["progress"], "route": "/progress"})

    if not actions:
        actions = [
            {"label": l["check_default"], "route": "/check"},
            {"label": l["exercise_default"], "route": "/exercises"},
            {"label": l["progress_default"], "route": "/progress"},
        ]

    return actions


async def _get_user_context(user_id: str) -> str:
    """Build context about the user's recent assessments."""
    try:
        async with async_session() as session:
            result = await session.execute(
                select(Assessment)
                .where(Assessment.user_id == user_id)
                .order_by(desc(Assessment.timestamp))
                .limit(3)
            )
            assessments = result.scalars().all()

            if not assessments:
                return "This user has not done any assessments yet. Encourage them to try their first check."

            latest = assessments[0]
            bd = latest.sppb_breakdown or {}
            total = bd.get("balance_score", 0) + bd.get("gait_score", 0) + bd.get("chair_stand_score", 0)
            if total == 0 and latest.score:
                total = latest.score  # fallback to stored score
            context_lines = [
                f"Latest SPPB score: {total}/12 (balance: {bd.get('balance_score', '?')}, gait: {bd.get('gait_score', '?')}, chair stand: {bd.get('chair_stand_score', '?')})",
                f"Total assessments done: {len(assessments)}+",
            ]

            recs = latest.recommendations
            if recs:
                context_lines.append(f"Latest recommendations: {', '.join(recs[:2])}")

            # Exercise stats
            today = date.today()
            week_ago = today - timedelta(days=6)
            ex_result = await session.execute(
                select(ExerciseLog).where(
                    ExerciseLog.user_id == user_id,
                    ExerciseLog.date >= week_ago,
                    ExerciseLog.completed == True,
                )
            )
            ex_logs = ex_result.scalars().all()
            today_exercises = [l.exercise_id for l in ex_logs if l.date == today]
            week_total = len(ex_logs)
            active_days = len(set(l.date for l in ex_logs))

            if today_exercises:
                context_lines.append(f"Exercises completed today: {', '.join(today_exercises)} ({len(today_exercises)} total)")
            else:
                context_lines.append("No exercises completed today yet.")
            context_lines.append(f"This week: {week_total} exercises across {active_days} days")

            return "\n".join(context_lines)
    except Exception as e:
        logger.warning(f"Could not fetch user context: {e}")
        return "No assessment data available yet."


@router.post("/stream")
async def chat_stream(req: ChatRequest):
    """Stream chat response via SSE with multilingual support."""
    settings = get_settings()
    client = genai.Client(api_key=settings.gemini_api_key)

    context = await _get_user_context(req.user_id)
    lang_config = LANGUAGE_CONFIG.get(req.language, LANGUAGE_CONFIG["en"])
    system = SYSTEM_PROMPT.format(
        context=context,
        language_instruction=lang_config["instruction"],
    )

    async def generate():
        full_reply = ""
        try:
            response = client.models.generate_content_stream(
                model="gemini-2.5-flash-lite",
                contents=[
                    {"role": "user", "parts": [{"text": system + "\n\nUser says: " + req.message}]},
                ],
            )

            for chunk in response:
                text = chunk.text
                if text:
                    full_reply += text
                    yield f"data: {json.dumps({'type': 'chunk', 'text': text})}\n\n"

        except Exception as e:
            logger.error(f"Chat stream failed: {e}")
            fallback = "Sorry, I'm having a little trouble right now. You can still tap the buttons below!"
            full_reply = fallback
            yield f"data: {json.dumps({'type': 'chunk', 'text': fallback})}\n\n"

        actions = _get_suggested_actions(req.message, full_reply, req.language)
        yield f"data: {json.dumps({'type': 'done', 'actions': actions})}\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
