"""Application configuration - only Gemini required."""

from pydantic_settings import BaseSettings
from functools import lru_cache
from typing import Optional


class Settings(BaseSettings):
    """Environment settings. Only Gemini API key required."""

    # Gemini Vision API (Required)
    gemini_api_key: str

    # HPB (Optional - demo mode if not set)
    hpb_api_url: str = "https://api.healthhub.sg/v1"
    hpb_api_key: Optional[str] = None
    hpb_client_id: Optional[str] = None
    hpb_client_secret: Optional[str] = None

    # SeaLion (Optional - passthrough if not set)
    sealion_api_url: str = "https://api.sea-lion.ai/v1"
    sealion_api_key: Optional[str] = None

    # OpenAI (Optional - required for voice)
    openai_api_key: Optional[str] = None
    openai_stt_model: str = "gpt-4o-mini-transcribe"
    openai_tts_model: str = "gpt-4o-mini-tts"
    openai_tts_voice: str = "alloy"
    openai_tts_format: str = "mp3"

    # Voice settings
    voice_enabled: bool = True
    voice_use_gemini_intent: bool = True
    voice_intent_model: str = "gemini-1.5-flash"
    voice_stream_tts: bool = False

    # Server
    backend_host: str = "0.0.0.0"
    backend_port: int = 8000
    cors_origins: str = "http://localhost:5173,http://localhost:3000"

    class Config:
        env_file = "../.env"
        env_file_encoding = "utf-8"


@lru_cache
def get_settings() -> Settings:
    return Settings()
