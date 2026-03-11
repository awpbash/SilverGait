"""
Chat Graph — 4-node pipeline with Gemini function calling.

Context Assembly → Agent (Gemini + tool calls) → Safety Gate → Persist

The Agent node uses Gemini function calling to invoke Management Sub-Agents:
  - Exercise Agent (1 LLM call) — personalized exercise program
  - Sleep Agent (1 LLM call) — CBT-I + sleep hygiene plan
  - Education Agent (1 LLM call) — tailored health education
  - Monitoring Agent (1 LLM call) — trend analysis + deterioration detection
  - Progress Summary (deterministic) — SPPB/Katz trends
  - Alert Caregiver (deterministic) — caregiver notification
"""

from __future__ import annotations

import re
import json
import time
import logging
from datetime import datetime
from typing import TypedDict

from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession
from google import genai
from google.genai import types

from ..context import build_user_context, UserContext
from ..content_library import get_exercise_plan, get_sleep_advice, get_education
from .assessment_graph import run_assessment_pipeline
from .management_agents import (
    run_exercise_agent,
    run_sleep_agent,
    run_education_agent,
    run_monitoring_agent,
)

logger = logging.getLogger(__name__)

# ── Language Config ─────────────────────────────────────────────────────

LANGUAGE_CONFIG = {
    "en": {
        "name": "English",
        "instruction": "You MUST respond in English. Every word of your response must be in English.",
    },
    "zh": {
        "name": "Mandarin Chinese",
        "instruction": "你必须用简体中文回复。每一句话都必须是中文。Use simple, everyday vocabulary suitable for elderly Singaporean Chinese speakers. Do NOT use English.",
    },
    "ms": {
        "name": "Bahasa Melayu",
        "instruction": "Anda MESTI menjawab dalam Bahasa Melayu. Setiap ayat mesti dalam Bahasa Melayu. Use simple, conversational Malay suitable for elderly Singaporean Malay speakers. Do NOT use English.",
    },
    "ta": {
        "name": "Tamil",
        "instruction": "நீங்கள் தமிழில் பதிலளிக்க வேண்டும். ஒவ்வொரு வாக்கியமும் தமிழில் இருக்க வேண்டும். Use simple, conversational Tamil suitable for elderly Singaporean Tamil speakers. Do NOT use English.",
    },
}

SAFETY_APPENDIX_EMERGENCY = {
    "en": "\n\n⚠️ If you are experiencing chest pain or difficulty breathing, please call 995 (Singapore Emergency) immediately.",
    "zh": "\n\n⚠️ 如果您正在经历胸痛或呼吸困难，请立即拨打995（新加坡急救电话）。",
    "ms": "\n\n⚠️ Jika anda mengalami sakit dada atau kesukaran bernafas, sila hubungi 995 (Kecemasan Singapura) dengan segera.",
    "ta": "\n\n⚠️ நெஞ்சு வலி அல்லது சுவாசிக்க சிரமம் இருந்தால், உடனடியாக 995 (சிங்கப்பூர் அவசர எண்) அழைக்கவும்.",
}

SAFETY_APPENDIX_DISTRESS = {
    "en": "\n\nYou are not alone. Please reach out for help:\n• SOS (Singapore): 1767 (24hr)\n• SAF Counselling: 1800-278-0022\n• IMH Crisis Line: 6389-2222",
    "zh": "\n\n你并不孤单。请寻求帮助：\n• SOS（新加坡）：1767（24小时）\n• SAF 辅导热线：1800-278-0022\n• IMH 危机热线：6389-2222",
    "ms": "\n\nAnda tidak bersendirian. Sila hubungi untuk bantuan:\n• SOS (Singapura): 1767 (24 jam)\n• SAF Kaunseling: 1800-278-0022\n• IMH Krisis: 6389-2222",
    "ta": "\n\nநீங்கள் தனியாக இல்லை. உதவிக்கு அழைக்கவும்:\n• SOS (சிங்கப்பூர்): 1767 (24 மணி நேரம்)\n• SAF ஆலோசனை: 1800-278-0022\n• IMH நெருக்கடி: 6389-2222",
}

SYSTEM_PROMPT_TEMPLATE = """⚠️ {language_instruction}

You're helping an elderly person in Singapore. You're like their caring grandchild — warm, empathetic, conversational.

STYLE:
- Casual chat: 1-2 sentences max.
- Tool results: 1 short sentence intro, then 3-5 bullet points. Each bullet ≤ 12 words. Bold the key action. No preamble, no fluff, no encouragement paragraph. Just the tips.
- NEVER start with long empathetic preambles. Jump straight to advice.
- Speak as YOU the expert. Never say "the app" or "the system".
- Warm but brief — like a text from family, not a letter.

TOOL CALLING — you MUST use tools proactively. When in doubt, CALL THE TOOL:
- exercise/workout/what to do/staying active → get_exercise_plan
- can't sleep/tired/insomnia/fatigue/sleep problems → get_sleep_advice
- why do I fall/frailty/nutrition/balance/diet → get_education
- getting better/worse/progress/scores/trends → get_progress_summary or analyze_trends
- fell/chest pain/hurt/injury/breathing problems → alert_caregiver (ONLY for acute physical safety)
Do NOT use alert_caregiver for sleep, tiredness, or general wellness questions.

{user_context}

⚠️ {language_instruction}
Every word in that language. No mixing."""


# ── Gemini Function Declarations ──────────────────────────────────────

TOOL_DECLARATIONS = types.Tool(
    function_declarations=[
        types.FunctionDeclaration(
            name="get_exercise_plan",
            description="Get personalized exercises. CALL when user mentions: exercise, workout, stretching, staying active, knee pain, leg pain, joint ache, body pain, stiffness, what should I do today, want to get stronger.",
        ),
        types.FunctionDeclaration(
            name="get_sleep_advice",
            description="Get sleep advice. ONLY call when user explicitly mentions: sleep, can't sleep, insomnia, waking up at night, sleepless. Do NOT call for pain, tiredness, fatigue, or general complaints.",
        ),
        types.FunctionDeclaration(
            name="get_education",
            description="Get health education. CALL when user asks: nutrition, food, diet, what to eat, frailty, why do I fall, balance tips, what is SPPB.",
            parameters={
                "type": "OBJECT",
                "properties": {
                    "topic": {
                        "type": "STRING",
                        "description": "One of: frailty, balance, falls_prevention, nutrition",
                        "enum": ["frailty", "balance", "falls_prevention", "nutrition"],
                    }
                },
                "required": ["topic"],
            },
        ),
        types.FunctionDeclaration(
            name="analyze_trends",
            description="Analyze health trends. CALL when user asks: am I getting better/worse, how am I doing over time, trends.",
        ),
        types.FunctionDeclaration(
            name="get_progress_summary",
            description="Get progress data. CALL when user asks: my progress, my scores, what's my streak.",
        ),
        types.FunctionDeclaration(
            name="alert_caregiver",
            description="Send urgent alert. ONLY for emergencies: fell/falling, chest pain, breathing difficulty, sudden dizziness, serious injury. NOT for knee pain, tiredness, sleep, or general aches.",
            parameters={
                "type": "OBJECT",
                "properties": {
                    "message": {
                        "type": "STRING",
                        "description": "Brief description of what happened",
                    }
                },
                "required": ["message"],
            },
        ),
    ]
)

GEMINI_MODEL = "gemini-2.5-flash"


# ── State ───────────────────────────────────────────────────────────────

class ChatState(TypedDict, total=False):
    user_id: str
    user_message: str
    language: str

    # Built by Context Assembly
    system_prompt: str | None
    user_context: UserContext | None

    # Produced by Agent
    agent_response: str | None
    tool_calls: list[dict] | None

    # Modified by Safety Gate
    safety_alerts: list[dict]
    response_appendix: str | None

    # DB session
    db: AsyncSession | None


# ── Tool Execution ────────────────────────────────────────────────────

async def _execute_tool(
    tool_name: str,
    args: dict,
    ctx: UserContext,
    db: AsyncSession,
    user_id: str,
    gemini_client: genai.Client | None = None,
    language: str = "en",
) -> str:
    """Execute a tool — management agents (LLM) or deterministic helpers."""
    logger.info(f"[_execute_tool] tool={tool_name} args={args} lang={language}")

    if tool_name == "get_exercise_plan":
        if gemini_client:
            result = run_exercise_agent(gemini_client, ctx, language)
        else:
            # Fallback to curated content
            tier = ctx.current_tier or "pre_frail"
            result = json.dumps(get_exercise_plan(tier))

    elif tool_name == "get_sleep_advice":
        if gemini_client:
            result = run_sleep_agent(gemini_client, ctx, language)
        else:
            result = get_sleep_advice(ctx.sleep_risk)

    elif tool_name == "get_education":
        topic = args.get("topic", "frailty")
        if gemini_client:
            result = run_education_agent(gemini_client, ctx, topic, language)
        else:
            result = get_education(topic, ctx.current_tier)

    elif tool_name == "analyze_trends":
        if gemini_client:
            result = run_monitoring_agent(gemini_client, ctx, language)
        else:
            result = "Trend analysis requires the AI system. Please try again later."

    elif tool_name == "get_progress_summary":
        # Always deterministic — just data
        parts = []
        if ctx.sppb_trend:
            parts.append(f"SPPB scores: {' → '.join(str(s) for s in ctx.sppb_trend)} ({ctx.sppb_direction})")
        if ctx.katz_trend:
            parts.append(f"Katz ADL: {' → '.join(str(s) for s in ctx.katz_trend)}")
        if ctx.tier_history:
            parts.append(f"Tier history: {' → '.join(ctx.tier_history)}")
        parts.append(f"Exercise streak: {ctx.exercise_streak} days")
        parts.append(f"Exercises this week: {ctx.exercises_this_week}")
        result = "\n".join(parts) if parts else "No progress data available yet. Try doing an assessment first!"

    elif tool_name == "alert_caregiver":
        message = args.get("message", "Alert from user")
        from ...models.db_models import Alert
        alert = Alert(
            user_id=user_id,
            alert_type="caregiver_alert",
            severity="warning",
            message=message,
            source="chat_agent",
        )
        db.add(alert)
        await db.flush()
        result = "Caregiver has been notified."

    else:
        result = f"Unknown tool: {tool_name}"

    logger.info(f"[_execute_tool] tool={tool_name} result ({len(str(result))} chars)")
    return result


# ── Nodes ───────────────────────────────────────────────────────────────

async def context_assembly_node(state: ChatState) -> dict:
    """Build UserContext from DB tables, inject into system prompt."""
    db: AsyncSession = state["db"]
    user_id = state["user_id"]
    language = state.get("language", "en")

    user_context = await build_user_context(db, user_id)
    lang_config = LANGUAGE_CONFIG.get(language, LANGUAGE_CONFIG["en"])

    context_str = user_context.to_system_prompt_context()
    system_prompt = SYSTEM_PROMPT_TEMPLATE.format(
        language_instruction=lang_config["instruction"],
        user_context=context_str,
    )

    active_plan_types = list(user_context.active_plans.keys()) if user_context.active_plans else []
    logger.info(f"[context_assembly_node] user={user_id} lang={language} lang_instruction={lang_config['instruction'][:60]}... tier={user_context.current_tier} active_plans={active_plan_types}")

    return {
        "system_prompt": system_prompt,
        "user_context": user_context,
    }


async def agent_node(state: ChatState, api_key: str) -> dict:
    """Gemini with function calling. Invokes management sub-agents via tools."""
    client = genai.Client(api_key=api_key)
    system_prompt = state.get("system_prompt", "")
    user_message = state["user_message"]
    language = state.get("language", "en")

    logger.info(f"[agent_node] user={state['user_id']} lang={language} message={user_message!r}")

    # Load recent chat history — filtered by current language so Gemini
    # follows the language instruction instead of copying English history
    from ...models.db_models import ChatMessage
    db: AsyncSession = state["db"]
    result = await db.execute(
        select(ChatMessage)
        .where(ChatMessage.user_id == state["user_id"], ChatMessage.language == language)
        .order_by(desc(ChatMessage.timestamp))
        .limit(2)
    )
    history_rows = list(reversed(result.scalars().all()))
    logger.info(f"[agent_node] loaded {len(history_rows)} history messages")

    # Don't pass old conversation turns — they bias Gemini toward old topics.
    # Instead, note recent user questions so Gemini avoids repeating itself.
    recent_user_qs = [m.content[:80] for m in history_rows if m.role == "user" and m.content]
    topic_note = ""
    if recent_user_qs:
        topic_note = f"\n(User recently asked about: {' | '.join(recent_user_qs)}. Do NOT repeat that advice. Focus ONLY on the current message.)"

    # Gemini needs at least one model turn for proper function calling
    contents = [
        {"role": "user", "parts": [{"text": "Hello"}]},
        {"role": "model", "parts": [{"text": "Hello! How can I help you today?"}]},
        {"role": "user", "parts": [{"text": user_message + topic_note}]},
    ]

    tool_calls = []
    ctx: UserContext = state.get("user_context")

    try:
        # First call — Gemini may respond directly or request tool calls
        response = client.models.generate_content(
            model=GEMINI_MODEL,
            contents=contents,
            config=types.GenerateContentConfig(
                system_instruction=system_prompt,
                tools=[TOOL_DECLARATIONS],
                max_output_tokens=600,
            ),
        )

        # Check for function calls
        function_calls = []
        if response.candidates and response.candidates[0].content.parts:
            for part in response.candidates[0].content.parts:
                if hasattr(part, "function_call") and part.function_call:
                    function_calls.append(part.function_call)

        if function_calls and ctx:
            # Execute each function call
            logger.info(f"[agent_node] Gemini requested {len(function_calls)} tool calls: {[fc.name for fc in function_calls]}")

            # Build conversation with function call + responses
            extended_contents = contents.copy()
            extended_contents.append({"role": "model", "parts": [
                {"function_call": {"name": fc.name, "args": dict(fc.args or {})}}
                for fc in function_calls
            ]})

            function_response_parts = []
            for fc in function_calls:
                fc_args = dict(fc.args or {})
                try:
                    tool_result = await _execute_tool(fc.name, fc_args, ctx, db, state["user_id"], client, language=language)
                except Exception as e:
                    logger.error(f"Tool {fc.name} failed: {e}")
                    tool_result = f"Tool {fc.name} is temporarily unavailable."
                tool_calls.append({"name": fc.name, "args": fc_args, "result": tool_result})
                function_response_parts.append({
                    "function_response": {"name": fc.name, "response": {"result": tool_result}}
                })

            extended_contents.append({"role": "user", "parts": function_response_parts})

            # Second call — Gemini synthesizes tool results into response
            response2 = client.models.generate_content(
                model=GEMINI_MODEL,
                contents=extended_contents,
                config=types.GenerateContentConfig(
                    system_instruction=system_prompt,
                    max_output_tokens=600,
                ),
            )
            agent_response = response2.text or ""
            logger.info(f"[agent_node] final response after tools ({len(agent_response)} chars)")
        else:
            # No tool calls — use direct response
            agent_response = response.text or ""
            if not agent_response:
                # Log why Gemini returned empty
                block = getattr(response, 'prompt_feedback', None)
                cands = response.candidates if response.candidates else []
                finish = cands[0].finish_reason if cands else 'no_candidates'
                logger.warning(f"[agent_node] EMPTY response! finish_reason={finish} block={block}")
            logger.info(f"[agent_node] direct response ({len(agent_response)} chars)")

    except Exception as e:
        logger.error(f"Agent node failed: {e}", exc_info=True)
        fallback = {
            "en": "Sorry, I'm having a little trouble right now. You can still tap the buttons below!",
            "zh": "抱歉，我现在遇到了一些问题。您可以点击下面的按钮继续操作！",
            "ms": "Maaf, saya menghadapi sedikit masalah sekarang. Anda masih boleh tekan butang di bawah!",
            "ta": "மன்னிக்கவும், இப்போது சிறிய சிக்கல் உள்ளது. கீழே உள்ள பொத்தான்களை அழுத்தவும்!",
        }
        agent_response = fallback.get(language, fallback["en"])

    # Fallback for empty responses — Gemini sometimes returns nothing with long history
    if not agent_response.strip():
        logger.warning("[agent_node] Empty response — retrying without history")
        try:
            retry_resp = client.models.generate_content(
                model=GEMINI_MODEL,
                contents=[{"role": "user", "parts": [{"text": user_message}]}],
                config=types.GenerateContentConfig(
                    system_instruction=system_prompt,
                    max_output_tokens=600,
                ),
            )
            agent_response = retry_resp.text or "I'm here to help! Try asking me about exercises, sleep, or how you're doing."
        except Exception:
            agent_response = "I'm here to help! Try asking me about exercises, sleep, or how you're doing."

    return {
        "agent_response": agent_response,
        "tool_calls": tool_calls if tool_calls else None,
    }


async def safety_gate_node(state: ChatState) -> dict:
    """Check for emergency signals in user message AND agent response."""
    user_msg = (state.get("user_message") or "").lower()
    agent_resp = (state.get("agent_response") or "").lower()
    language = state.get("language", "en")
    combined = user_msg + " " + agent_resp

    safety_alerts = []
    appendix = ""

    db: AsyncSession = state["db"]
    user_id = state["user_id"]
    from ...models.db_models import Alert

    # Fall detection
    fall_patterns = [r"\bfell(?!\s+(?:asleep|ill))\b", r"\bfall(?:ing)?\b", r"\bfallen\b", r"\bslipped?\b", r"\btripped?\b", r"\bstumble[ds]?\b", r"\bjatuh\b", r"\bterjatuh\b", r"跌倒", r"摔倒", r"摔了", r"跌了", r"விழுந்த", r"விழ"]
    if any(re.search(p, user_msg) for p in fall_patterns):
        alert = Alert(
            user_id=user_id, alert_type="fall_reported", severity="urgent",
            message="User reported a fall during chat.", source="chat_safety_gate",
        )
        db.add(alert)
        safety_alerts.append({"type": "fall_reported", "severity": "urgent"})

    # Emergency signals
    emergency_patterns = [r"chest\s*(pain|hurt|tight|ache)", r"can'?t breathe", r"breathing difficulty", r"heart\s*(attack|pain|hurt)", r"胸痛", r"胸口", r"呼吸困难", r"sakit dada", r"sakit jantung", r"நெஞ்சு வலி"]
    if any(re.search(p, user_msg) for p in emergency_patterns):
        alert = Alert(
            user_id=user_id, alert_type="emergency", severity="urgent",
            message="User reported emergency symptoms.", source="chat_safety_gate",
        )
        db.add(alert)
        safety_alerts.append({"type": "emergency", "severity": "urgent"})
        appendix = SAFETY_APPENDIX_EMERGENCY.get(language, SAFETY_APPENDIX_EMERGENCY["en"])

    # Mental health
    distress_patterns = [r"want to die", r"hopeless", r"no point living", r"想死", r"不想活"]
    if any(re.search(p, user_msg) for p in distress_patterns):
        alert = Alert(
            user_id=user_id, alert_type="emergency", severity="urgent",
            message="User expressed distress / suicidal ideation.", source="chat_safety_gate",
        )
        db.add(alert)
        safety_alerts.append({"type": "distress", "severity": "urgent"})
        appendix = SAFETY_APPENDIX_DISTRESS.get(language, SAFETY_APPENDIX_DISTRESS["en"])

    if safety_alerts:
        await db.flush()
        triggered = [a["type"] for a in safety_alerts]
        logger.warning(f"[safety_gate_node] user={user_id} TRIGGERED patterns: {triggered}")
    else:
        logger.info(f"[safety_gate_node] user={user_id} no safety patterns triggered")

    return {
        "safety_alerts": safety_alerts,
        "response_appendix": appendix if appendix else None,
    }


async def persist_node(state: ChatState) -> dict:
    """Save conversation turn to chat_messages table."""
    db: AsyncSession = state["db"]
    user_id = state["user_id"]
    from ...models.db_models import ChatMessage

    # Save user message
    user_msg = ChatMessage(
        user_id=user_id,
        role="user",
        content=state["user_message"],
        language=state.get("language"),
    )
    db.add(user_msg)

    # Build final response
    response = state.get("agent_response", "")
    if state.get("response_appendix"):
        response += state["response_appendix"]

    # Save assistant response
    assistant_msg = ChatMessage(
        user_id=user_id,
        role="assistant",
        content=response,
        language=state.get("language"),
    )
    if state.get("tool_calls"):
        assistant_msg.tool_calls = state["tool_calls"]
    db.add(assistant_msg)

    await db.commit()
    logger.info(f"[persist_node] user={user_id} messages saved (user + assistant)")
    return {}


# ── Graph Runner ────────────────────────────────────────────────────────

async def run_chat_pipeline(
    db: AsyncSession,
    user_id: str,
    message: str,
    language: str = "en",
    api_key: str = "",
) -> dict:
    """Run the full chat pipeline. Returns response + metadata."""
    start = time.time()

    state: ChatState = {
        "user_id": user_id,
        "user_message": message,
        "language": language,
        "db": db,
        "safety_alerts": [],
    }

    # Context Assembly
    updates = await context_assembly_node(state)
    state.update(updates)

    # Agent (Gemini with function calling → management agents)
    updates = await agent_node(state, api_key)
    state.update(updates)

    # Safety Gate
    updates = await safety_gate_node(state)
    state.update(updates)

    # Persist
    await persist_node(state)

    elapsed = time.time() - start

    # Build final response
    response = state.get("agent_response", "")
    if state.get("response_appendix"):
        response += state["response_appendix"]

    return {
        "response": response,
        "tool_calls": state.get("tool_calls"),
        "safety_alerts": state.get("safety_alerts", []),
        "elapsed_seconds": elapsed,
    }


async def run_chat_pipeline_stream(
    db: AsyncSession,
    user_id: str,
    message: str,
    language: str = "en",
    api_key: str = "",
):
    """
    Streaming version — yields SSE chunks.
    Uses Gemini function calling: if Gemini requests a tool,
    executes the management agent, then streams the final response.
    """
    from ...models.db_models import ChatMessage

    logger.info(f"CHAT GRAPH START user={user_id} message={message[:100]!r}")

    state: ChatState = {
        "user_id": user_id,
        "user_message": message,
        "language": language,
        "db": db,
        "safety_alerts": [],
    }

    # 1. Context Assembly
    updates = await context_assembly_node(state)
    state.update(updates)
    logger.info("CHAT GRAPH: context assembled")

    system_prompt = state.get("system_prompt", "")
    user_context: UserContext = state.get("user_context")

    # 2. Load chat history — filtered by current language
    result = await db.execute(
        select(ChatMessage)
        .where(ChatMessage.user_id == user_id, ChatMessage.language == language)
        .order_by(desc(ChatMessage.timestamp))
        .limit(2)
    )
    history_rows = list(reversed(result.scalars().all()))
    logger.info(f"CHAT GRAPH: loaded {len(history_rows)} history messages")

    # Don't pass old conversation turns — they bias Gemini toward old topics.
    # Instead, note recent user questions so Gemini avoids repeating itself.
    recent_user_qs = [m.content[:80] for m in history_rows if m.role == "user" and m.content]
    topic_note = ""
    if recent_user_qs:
        topic_note = f"\n(User recently asked about: {' | '.join(recent_user_qs)}. Do NOT repeat that advice. Focus ONLY on the current message.)"

    contents = [
        {"role": "user", "parts": [{"text": "Hello"}]},
        {"role": "model", "parts": [{"text": "Hello! How can I help you today?"}]},
        {"role": "user", "parts": [{"text": message + topic_note}]},
    ]

    # 3. Gemini call with function calling
    logger.info("CHAT GRAPH: calling Gemini with function declarations")
    client = genai.Client(api_key=api_key)
    full_reply = ""
    tool_calls = []

    try:
        # First call: stream with tools — Gemini decides if it needs to call one
        response_stream = client.models.generate_content_stream(
            model=GEMINI_MODEL,
            contents=contents,
            config=types.GenerateContentConfig(
                system_instruction=system_prompt,
                tools=[TOOL_DECLARATIONS],
                max_output_tokens=600,
            ),
        )

        # First pass: collect ALL chunks to detect function calls before streaming
        # This avoids streaming pre-tool text that gets duplicated after tool execution
        all_parts = []
        function_calls_detected = []
        for chunk in response_stream:
            if chunk.candidates and chunk.candidates[0].content and chunk.candidates[0].content.parts:
                for part in chunk.candidates[0].content.parts:
                    if hasattr(part, "function_call") and part.function_call:
                        function_calls_detected.append(part.function_call)
                    elif hasattr(part, "text") and part.text:
                        all_parts.append(part.text)

        # If no tool calls, stream the collected text now
        if not function_calls_detected:
            for text in all_parts:
                full_reply += text
                yield json.dumps({"type": "chunk", "text": text})

        # If Gemini requested tool calls, execute them and get final response
        if function_calls_detected and user_context:
            logger.info(f"CHAT GRAPH: Gemini requested tools: {[fc.name for fc in function_calls_detected]}")

            # Execute each management agent
            function_response_parts = []
            for fc in function_calls_detected:
                fc_args = dict(fc.args or {})
                logger.info(f"CHAT GRAPH: executing {fc.name}({fc_args})")

                try:
                    tool_result = await _execute_tool(
                        fc.name, fc_args, user_context, db, user_id, client, language=language
                    )
                except Exception as e:
                    logger.error(f"Tool {fc.name} failed: {e}")
                    tool_result = f"Tool {fc.name} is temporarily unavailable."
                tool_calls.append({"name": fc.name, "args": fc_args, "result": tool_result})
                function_response_parts.append({
                    "function_response": {"name": fc.name, "response": {"result": tool_result}}
                })

            # Build extended conversation with tool results
            extended_contents = contents.copy()
            extended_contents.append({"role": "model", "parts": [
                {"function_call": {"name": fc.name, "args": dict(fc.args or {})}}
                for fc in function_calls_detected
            ]})
            extended_contents.append({"role": "user", "parts": function_response_parts})

            # Second streaming call — Gemini synthesizes tool results (needs more tokens)
            logger.info("CHAT GRAPH: streaming final response with tool results")
            full_reply = ""
            response_stream2 = client.models.generate_content_stream(
                model=GEMINI_MODEL,
                contents=extended_contents,
                config=types.GenerateContentConfig(
                    system_instruction=system_prompt,
                    max_output_tokens=600,
                ),
            )
            for chunk in response_stream2:
                if chunk.candidates and chunk.candidates[0].content and chunk.candidates[0].content.parts:
                    for part in chunk.candidates[0].content.parts:
                        if hasattr(part, "text") and part.text:
                            full_reply += part.text
                            yield json.dumps({"type": "chunk", "text": part.text})

            # Fallback: if second stream empty, retry non-streaming, then pre-tool text, then ack
            if not full_reply.strip():
                # Try a non-streaming call as last resort
                try:
                    retry_response = client.models.generate_content(
                        model=GEMINI_MODEL,
                        contents=extended_contents,
                        config=types.GenerateContentConfig(
                            system_instruction=system_prompt,
                            max_output_tokens=600,
                        ),
                    )
                    if retry_response.text:
                        full_reply = retry_response.text
                        yield json.dumps({"type": "chunk", "text": full_reply})
                except Exception:
                    pass

            if not full_reply.strip():
                if all_parts:
                    for text in all_parts:
                        full_reply += text
                        yield json.dumps({"type": "chunk", "text": text})
                else:
                    # Build a meaningful fallback from tool results
                    tool_names = [tc["name"] for tc in tool_calls]
                    if "alert_caregiver" in tool_names:
                        msg = {"en": "I've let your caregiver know.", "zh": "我已经通知了你的照顾者。", "ms": "Saya telah maklumkan penjaga anda.", "ta": "உங்கள் பராமரிப்பாளருக்கு தெரிவிக்கப்பட்டது."}.get(language, "I've let your caregiver know.")
                    elif "get_exercise_plan" in tool_names:
                        # Include the actual tool result as fallback
                        exercise_result = next((tc["result"] for tc in tool_calls if tc["name"] == "get_exercise_plan"), "")
                        msg = exercise_result[:500] if exercise_result else {"en": "Here's your exercise plan!", "zh": "这是您的运动计划！", "ms": "Ini pelan senaman anda!", "ta": "இதோ உங்கள் பயிற்சி திட்டம்!"}.get(language, "Here's your exercise plan!")
                    else:
                        # Generic fallback with tool result content
                        first_result = tool_calls[0]["result"] if tool_calls else ""
                        msg = first_result[:500] if first_result else {"en": "Done!", "zh": "好的！", "ms": "Siap!", "ta": "முடிந்தது!"}.get(language, "Done!")
                    full_reply = msg
                    yield json.dumps({"type": "chunk", "text": msg})

    except Exception as e:
        logger.error(f"Chat stream failed: {e}", exc_info=True)
        fallback_map = {
            "en": "Sorry, I'm having a little trouble right now. You can still tap the buttons below!",
            "zh": "抱歉，我现在遇到了一些问题。您可以点击下面的按钮继续操作！",
            "ms": "Maaf, saya menghadapi sedikit masalah sekarang. Anda masih boleh tekan butang di bawah!",
            "ta": "மன்னிக்கவும், இப்போது சிறிய சிக்கல் உள்ளது. கீழே உள்ள பொத்தான்களை அழுத்தவும்!",
        }
        fallback = fallback_map.get(language, fallback_map["en"])
        full_reply = fallback
        yield json.dumps({"type": "chunk", "text": fallback})

    state["agent_response"] = full_reply
    state["tool_calls"] = tool_calls if tool_calls else None
    logger.info(f"CHAT GRAPH: agent done ({len(full_reply)} chars, {len(tool_calls)} tools)")

    # 4. Safety Gate
    updates = await safety_gate_node(state)
    state.update(updates)
    logger.info("CHAT GRAPH: safety gate done")

    if state.get("response_appendix"):
        yield json.dumps({"type": "chunk", "text": state["response_appendix"]})
        full_reply += state["response_appendix"]
        state["agent_response"] = full_reply

    # 5. Persist
    await persist_node(state)
    logger.info("CHAT GRAPH: persisted")

    # 6. Suggested actions
    actions = _get_suggested_actions(message, full_reply, language)
    yield json.dumps({"type": "done", "actions": actions, "safety_alerts": state.get("safety_alerts", []),
                       "tools_used": [tc["name"] for tc in tool_calls] if tool_calls else []})
    logger.info(f"CHAT GRAPH DONE (tools_used={[tc['name'] for tc in tool_calls]})")


def _get_suggested_actions(message: str, reply: str, language: str) -> list[dict]:
    """Return contextual quick-reply suggestions. Uses 'prompt' for chat follow-ups, 'route' for page navigation."""
    lower = (message + " " + reply).lower()

    # Topic-specific follow-up prompts (these send a chat message, not navigate)
    prompts = {
        "en": {
            "sleep_routine": {"label": "My bedtime routine", "prompt": "Can you give me a step-by-step bedtime routine?"},
            "sleep_exercise": {"label": "Exercise for sleep", "prompt": "What exercises help me sleep better?"},
            "exercise_plan": {"label": "My exercise plan", "prompt": "Give me a personalized exercise plan"},
            "nutrition": {"label": "Nutrition tips", "prompt": "What should I eat to stay strong?"},
            "balance": {"label": "Balance tips", "prompt": "How can I improve my balance?"},
            "trends": {"label": "Am I improving?", "prompt": "How am I doing over time?"},
            "falls": {"label": "Prevent falls", "prompt": "How do I prevent falls at home?"},
        },
        "zh": {
            "sleep_routine": {"label": "睡前例程", "prompt": "你能给我一个睡前步骤吗？"},
            "sleep_exercise": {"label": "助眠运动", "prompt": "什么运动可以帮助我睡得更好？"},
            "exercise_plan": {"label": "运动计划", "prompt": "给我一个个人运动计划"},
            "nutrition": {"label": "营养建议", "prompt": "我应该吃什么来保持健康？"},
            "balance": {"label": "平衡训练", "prompt": "我怎样才能提高平衡能力？"},
            "trends": {"label": "我在进步吗？", "prompt": "我的健康趋势怎么样？"},
            "falls": {"label": "防跌倒", "prompt": "在家怎么防止跌倒？"},
        },
        "ms": {
            "sleep_routine": {"label": "Rutin tidur", "prompt": "Boleh beri saya rutin tidur langkah demi langkah?"},
            "sleep_exercise": {"label": "Senaman untuk tidur", "prompt": "Senaman apa yang boleh bantu saya tidur?"},
            "exercise_plan": {"label": "Pelan senaman", "prompt": "Beri saya pelan senaman peribadi"},
            "nutrition": {"label": "Tips pemakanan", "prompt": "Apa yang patut saya makan untuk kekal sihat?"},
            "balance": {"label": "Tips imbangan", "prompt": "Bagaimana saya boleh tingkatkan imbangan?"},
            "trends": {"label": "Ada kemajuan?", "prompt": "Bagaimana prestasi saya dari masa ke masa?"},
            "falls": {"label": "Cegah jatuh", "prompt": "Bagaimana elak jatuh di rumah?"},
        },
        "ta": {
            "sleep_routine": {"label": "படுக்கை நேரம்", "prompt": "படுக்கைக்கு முன் நான் என்ன செய்ய வேண்டும்?"},
            "sleep_exercise": {"label": "தூக்க பயிற்சி", "prompt": "எந்த பயிற்சிகள் நன்றாக தூங்க உதவும்?"},
            "exercise_plan": {"label": "பயிற்சி திட்டம்", "prompt": "எனக்கு தனிப்பட்ட பயிற்சி திட்டம் தாருங்கள்"},
            "nutrition": {"label": "உணவு குறிப்புகள்", "prompt": "வலிமையாக இருக்க நான் என்ன சாப்பிட வேண்டும்?"},
            "balance": {"label": "சமநிலை", "prompt": "என் சமநிலையை எப்படி மேம்படுத்துவது?"},
            "trends": {"label": "முன்னேற்றம்?", "prompt": "நான் எப்படி முன்னேறுகிறேன்?"},
            "falls": {"label": "விழுவதை தடு", "prompt": "வீட்டில் விழுவதை எப்படி தடுப்பது?"},
        },
    }
    p = prompts.get(language, prompts["en"])

    # Page navigation actions (for pages that actually exist)
    nav = {
        "en": {"check": {"label": "Check My Strength", "route": "/check"}, "exercises": {"label": "Daily Exercises", "route": "/exercises"}, "progress": {"label": "My Progress", "route": "/progress"}, "sleep": {"label": "Sleep & Wellness", "route": "/sleep"}},
        "zh": {"check": {"label": "检查体力", "route": "/check"}, "exercises": {"label": "每日运动", "route": "/exercises"}, "progress": {"label": "我的进度", "route": "/progress"}, "sleep": {"label": "睡眠与健康", "route": "/sleep"}},
        "ms": {"check": {"label": "Semak Kekuatan", "route": "/check"}, "exercises": {"label": "Senaman Harian", "route": "/exercises"}, "progress": {"label": "Kemajuan Saya", "route": "/progress"}, "sleep": {"label": "Tidur & Kesejahteraan", "route": "/sleep"}},
        "ta": {"check": {"label": "என் வலிமை சோதி", "route": "/check"}, "exercises": {"label": "தினசரி பயிற்சி", "route": "/exercises"}, "progress": {"label": "என் முன்னேற்றம்", "route": "/progress"}, "sleep": {"label": "தூக்கம் & நலம்", "route": "/sleep"}},
    }
    n = nav.get(language, nav["en"])

    # Detect topic and return relevant follow-ups
    sleep_kw = ["sleep", "insomnia", "tired", "fatigue", "rest", "night", "bed", "睡", "眠", "tidur", "penat", "தூக்க"]
    exercise_kw = ["exercise", "stretch", "move", "workout", "运动", "锻炼", "senaman", "latihan", "பயிற்சி"]
    check_kw = ["check", "assess", "strength", "test", "检查", "力量", "periksa", "semak", "சோதனை"]
    progress_kw = ["progress", "score", "trend", "better", "worse", "improving", "进度", "分数", "kemajuan", "முன்னேற்றம்"]
    education_kw = ["frailty", "balance", "fall", "nutrition", "diet", "eat", "food", "strong", "learn", "what is", "why", "虚弱", "营养", "吃", "makanan", "makan", "jatuh", "pemakanan", "உணவு", "சாப்பிட"]

    if any(w in lower for w in sleep_kw):
        return [n["sleep"], p["sleep_routine"], p["sleep_exercise"]]
    elif any(w in lower for w in exercise_kw):
        return [n["exercises"], p["balance"], p["nutrition"]]
    elif any(w in lower for w in education_kw):
        return [p["falls"], p["balance"], n["exercises"]]
    elif any(w in lower for w in progress_kw):
        return [n["check"], p["trends"], n["exercises"]]
    elif any(w in lower for w in check_kw):
        return [n["check"], n["exercises"], p["trends"]]
    else:
        return [p["exercise_plan"], n["sleep"], p["trends"]]
