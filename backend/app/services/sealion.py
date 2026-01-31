"""SeaLion LLM service - passthrough mode if no API key."""

import logging
from typing import Literal

from ..core.config import get_settings

logger = logging.getLogger(__name__)

DialectType = Literal["en", "hokkien", "cantonese", "mandarin", "singlish"]


class SeaLionService:
    """
    SeaLion Translation Layer.
    Returns original message if API key not configured.
    """

    def __init__(self):
        settings = get_settings()
        self.api_key = settings.sealion_api_key
        self.enabled = bool(self.api_key)

    async def translate_advice(self, message: str, dialect: DialectType = "singlish") -> str:
        """Return message as-is (SeaLion not configured)."""
        if not self.enabled:
            # Passthrough - just add friendly suffix
            return message
        # Future: actual SeaLion API call
        return message

    async def health_check(self) -> bool:
        return True  # Always OK in demo mode
