"""
Management Sub-Agents — invoked by the Chat Agent via Gemini function calling.
Each makes 1 Gemini LLM call to generate personalized, context-aware content.

Architecture:
  Chat Agent (Gemini) --function_call--> Management Agent (Gemini) --result--> Chat Agent --> streamed response

Agents:
  1. Exercise Agent — Personalized 4-week progressive exercise program
  2. Sleep Agent — CBT-I + sleep hygiene intervention plan
  3. Education Agent — Frailty/balance/nutrition education tailored to tier
  4. Monitoring Agent — Health trend analysis + deterioration detection
"""

import logging
from google import genai
from ..context import UserContext

logger = logging.getLogger(__name__)

MODEL = "gemini-2.5-flash-lite"

INTENSITY_GUIDE = {
    "robust": "moderate intensity — maintain and build strength",
    "pre_frail": "light to moderate — emphasize balance and functional strength",
    "frail": "gentle, seated or supported — prioritize safety and consistency",
    "severely_frail": "very gentle, primarily seated — comfort and minimal exertion",
}


# ── Exercise Agent ─────────────────────────────────────────────────────

def _lang_instruction(language: str) -> str:
    """Return a language instruction suffix for management agent prompts."""
    instructions = {
        "zh": "\n\nIMPORTANT: Respond entirely in simple Mandarin Chinese (简体中文). Do NOT use English.",
        "ms": "\n\nIMPORTANT: Respond entirely in simple Bahasa Melayu. Do NOT use English.",
        "ta": "\n\nIMPORTANT: Respond entirely in simple Tamil (தமிழ்). Do NOT use English.",
    }
    return instructions.get(language, "")


def run_exercise_agent(client: genai.Client, ctx: UserContext, language: str = "en") -> str:
    """Generate a personalized 4-week exercise program. 1 LLM call."""
    tier = ctx.current_tier or "pre_frail"
    sppb = ctx.sppb_total or 0
    intensity = INTENSITY_GUIDE.get(tier, "light to moderate")

    deficits = []
    if ctx.balance_score is not None and ctx.balance_score <= 1:
        deficits.append("low balance")
    if ctx.gait_score is not None and ctx.gait_score <= 1:
        deficits.append("slow gait")
    if ctx.chair_score is not None and ctx.chair_score <= 1:
        deficits.append("weak chair stand")

    issues = ctx.recent_issues or []

    prompt = f"""You are a physiotherapist giving brief exercise advice to an elderly patient.

Patient: {ctx.display_name or 'User'} | Tier: {tier} | SPPB: {sppb}/12 | Intensity: {intensity}
Deficits: {', '.join(deficits) if deficits else 'None'} | Streak: {ctx.exercise_streak} days

Give exactly 5 bullet points. Each bullet: bold the exercise name, then ≤15 words (sets/reps/safety). Home-friendly, chair-based if frail. Personalize to deficits above.

Format:
- **Exercise Name** — X reps/sets, short safety note

NO preamble. NO closing paragraph. NO headers. Just 5 bullets. Under 100 words total.{_lang_instruction(language)}"""

    logger.info(f"[exercise_agent] tier={tier} sppb={sppb} deficits={deficits}")
    try:
        response = client.models.generate_content(
            model=MODEL,
            contents=[{"role": "user", "parts": [{"text": prompt}]}],
            config={"max_output_tokens": 300},
        )
        result = response.text or "Could not generate exercise plan."
        logger.info(f"[exercise_agent] generated {len(result)} chars")
        return result
    except Exception as e:
        logger.error(f"[exercise_agent] failed: {e}")
        return "Exercise plan temporarily unavailable. Please try the Exercises tab for your daily routine."


# ── Sleep Agent ────────────────────────────────────────────────────────

def run_sleep_agent(client: genai.Client, ctx: UserContext, language: str = "en") -> str:
    """Generate a personalized sleep improvement plan. 1 LLM call."""
    sleep_risk = ctx.sleep_risk or "low"
    tier = ctx.current_tier or "pre_frail"
    mood_risk = ctx.mood_risk or "low"

    # Build contextual factors
    factors = []
    if mood_risk in ("moderate", "high"):
        factors.append(f"mood risk is {mood_risk} — anxiety/low mood can worsen sleep")
    if ctx.exercise_streak == 0:
        factors.append("not currently exercising — physical activity helps sleep quality")
    elif ctx.exercise_streak >= 3:
        factors.append(f"active {ctx.exercise_streak}-day exercise streak — good for sleep")
    if tier in ("frail", "severely_frail"):
        factors.append(f"frailty tier is {tier} — poor sleep accelerates muscle loss")
    if ctx.social_isolation_risk in ("moderate", "high"):
        factors.append("socially isolated — loneliness linked to poor sleep in elderly")

    cbti_section = ""
    if sleep_risk in ("moderate", "high"):
        cbti_section = """
**Behavioral Techniques (CBT-I):**
- Sleep restriction: limit time in bed to actual sleep time (e.g. 11pm-6am only)
- Stimulus control: bed is ONLY for sleep — no TV, phone, or reading in bed
- If can't sleep after 20 minutes, get up and do something calm, then return
- Progressive muscle relaxation: tense and release each muscle group, toes to head"""

    prompt = f"""You are a sleep specialist giving brief advice to an elderly patient in Singapore.

Patient: {ctx.display_name or 'User'} | Sleep risk: {sleep_risk} | Tier: {tier} | Mood: {mood_risk} | Exercise streak: {ctx.exercise_streak} days
Factors: {'; '.join(factors) if factors else 'None'}

Give exactly 5 bullet points. Each bullet: bold the action, then ≤15 words of explanation. Personalize to their data above. Include Singapore-specific tips (kopi, AC temp, hawker timing).
{cbti_section}
Format:
- **Action** — short explanation

NO preamble. NO closing paragraph. NO headers. Just 5 bullets. Under 100 words total.{_lang_instruction(language)}"""

    logger.info(f"[sleep_agent] sleep_risk={sleep_risk} tier={tier} factors={factors}")
    try:
        response = client.models.generate_content(
            model=MODEL,
            contents=[{"role": "user", "parts": [{"text": prompt}]}],
            config={"max_output_tokens": 300},
        )
        result = response.text or "Could not generate sleep plan."
        logger.info(f"[sleep_agent] generated {len(result)} chars")
        return result
    except Exception as e:
        logger.error(f"[sleep_agent] failed: {e}")
        return "Sleep advice temporarily unavailable."


# ── Education Agent ────────────────────────────────────────────────────

def run_education_agent(client: genai.Client, ctx: UserContext, topic: str = "frailty", language: str = "en") -> str:
    """Generate personalized health education content. 1 LLM call."""
    tier = ctx.current_tier or "pre_frail"
    sppb = ctx.sppb_total or 0
    cfs_label = f"CFS {ctx.cfs_score}/9" if ctx.cfs_score else "not assessed"

    prompt = f"""You are a health educator giving brief advice to an elderly patient in Singapore.

Patient: {ctx.display_name or 'User'} | Tier: {tier} | SPPB: {sppb}/12 | CFS: {cfs_label}
Topic: {topic}

Give exactly 5 bullet points about "{topic}". Each bullet: bold the key point, then ≤15 words of simple explanation. Personalize to their tier ({tier}). Include Singapore-specific tips.

Format:
- **Key Point** — short explanation

NO preamble. NO closing paragraph. NO headers. Just 5 bullets. Under 100 words total.{_lang_instruction(language)}"""

    logger.info(f"[education_agent] topic={topic} tier={tier}")
    try:
        response = client.models.generate_content(
            model=MODEL,
            contents=[{"role": "user", "parts": [{"text": prompt}]}],
            config={"max_output_tokens": 300},
        )
        result = response.text or "Could not generate education content."
        logger.info(f"[education_agent] generated {len(result)} chars")
        return result
    except Exception as e:
        logger.error(f"[education_agent] failed: {e}")
        return "Education content temporarily unavailable."


# ── Monitoring Agent ───────────────────────────────────────────────────

def run_monitoring_agent(client: genai.Client, ctx: UserContext, language: str = "en") -> str:
    """Analyze user health trends and detect deterioration. 1 LLM call."""
    sppb_trend = " -> ".join(str(s) for s in ctx.sppb_trend) if ctx.sppb_trend else "No data"
    katz_trend = " -> ".join(str(s) for s in ctx.katz_trend) if ctx.katz_trend else "No data"
    tier_history = " -> ".join(ctx.tier_history) if ctx.tier_history else "No data"

    prompt = f"""Analyze health trends for an elderly patient. Be direct.

Patient: {ctx.display_name or 'User'} | Tier: {ctx.current_tier or 'unknown'}
SPPB: {sppb_trend} ({ctx.sppb_direction or 'unknown'}) | Katz: {katz_trend} | Tiers: {tier_history}
Streak: {ctx.exercise_streak} days | This week: {ctx.exercises_this_week} exercises
Risks — Sleep: {ctx.sleep_risk or '?'}, Mood: {ctx.mood_risk or '?'}, Cognitive: {ctx.cognitive_risk or '?'}, Social: {ctx.social_isolation_risk or '?'}
Recheck due: {'Yes' if ctx.recheck_due else 'No'} | Days since last: {ctx.days_since_last_assessment or '?'}

Give exactly 4 bullet points:
1. **Trend** — improving/stable/declining + why (≤15 words)
2. **Concern** — biggest red flag or "none" (≤15 words)
3. **Focus** — what to prioritize now (≤15 words)
4. **Recheck** — when to reassess (≤10 words)

NO preamble. NO closing. Just 4 bullets. Under 80 words total.{_lang_instruction(language)}"""

    logger.info(f"[monitoring_agent] tier={ctx.current_tier} sppb_direction={ctx.sppb_direction}")
    try:
        response = client.models.generate_content(
            model=MODEL,
            contents=[{"role": "user", "parts": [{"text": prompt}]}],
            config={"max_output_tokens": 300},
        )
        result = response.text or "Could not analyze trends."
        logger.info(f"[monitoring_agent] generated {len(result)} chars")
        return result
    except Exception as e:
        logger.error(f"[monitoring_agent] failed: {e}")
        return "Trend analysis temporarily unavailable."
