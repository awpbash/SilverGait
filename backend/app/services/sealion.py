"""SeaLion LLM service - passthrough mode if no API key."""

import logging
from typing import Literal

from google import genai

from ..core.config import get_settings

logger = logging.getLogger(__name__)

DialectType = Literal["en", "hokkien", "cantonese", "mandarin", "singlish", "malay"]


class SeaLionService:
    """
    SeaLion Translation Layer.
    Returns original message if API key not configured.
    """

    def __init__(self):
        settings = get_settings()
        self.api_key = settings.sealion_api_key
        self.api_url = settings.sealion_api_url.rstrip("/")
        self.enabled = bool(self.api_key)
        self.gemini_client = genai.Client(api_key=settings.gemini_api_key)
        self.translation_model = settings.voice_intent_model

    async def translate_advice(self, message: str, dialect: DialectType = "singlish") -> str:
        """Return message as-is (SeaLion not configured)."""
        if not self.enabled:
            # Passthrough - just add friendly suffix
            return message
        # Future: actual SeaLion API call
        return message

    async def rewrite_for_locale(self, message: str, dialect: DialectType = "singlish") -> str:
        """Rewrite message for locale. Passthrough if not configured."""
        if dialect == "en":
            return message
        # NOTE: SeaLion API integration pending. Enforce translation via Gemini fallback.
        return await self._translate_with_gemini(message, dialect)

    async def _translate_with_gemini(self, message: str, dialect: DialectType) -> str:
        target = {
            "mandarin": "Simplified Chinese (Mandarin)",
            "malay": "Bahasa Melayu",
            "singlish": "Singlish",
            "hokkien": "Hokkien",
            "cantonese": "Cantonese",
        }.get(dialect, "English")
        prompt = (
            "You are localizing short health instructions for elderly users in Singapore.\n"
            f"Translate the text into {target}.\n"
            "Keep it short, polite, and simple. Return only the translation.\n"
            f"Text: {message}"
        )
        try:
            response = self.gemini_client.models.generate_content(
                model=self.translation_model,
                contents=prompt,
            )
            return (response.text or message).strip()
        except Exception as exc:
            logger.warning(f"Gemini translation failed: {exc}")
            return message

    async def health_check(self) -> bool:
        return True  # Always OK in demo mode
