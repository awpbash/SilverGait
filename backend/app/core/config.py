"""Application configuration - only Gemini required."""

import os
from pathlib import Path
from pydantic_settings import BaseSettings
from functools import lru_cache
from typing import Optional

# Absolute path to project root (.env lives here)
# config.py is in backend/app/core/ → 3 levels up to project root
_PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent


class Settings(BaseSettings):
    """Environment settings. Only Gemini API key required."""

    # Gemini Vision API (Required)
    gemini_api_key: str

    # HPB (Optional - demo mode if not set)
    hpb_api_url: str = "https://api.healthhub.sg/v1"
    hpb_api_key: Optional[str] = None
    hpb_client_id: Optional[str] = None
    hpb_client_secret: Optional[str] = None

    # MERaLiON AudioLLM (Optional — Singlish-aware STT via cr8lab API)
    mera_api_key: Optional[str] = None

    # SeaLion (Optional - passthrough if not set)
    sealion_api_url: str = "https://api.sea-lion.ai/v1"
    sealion_api_key: Optional[str] = None

    # Voice settings
    voice_enabled: bool = True
    voice_use_gemini_intent: bool = True
    voice_intent_model: str = "gemini-2.5-flash-lite"
    voice_stt_model: str = "gemini-2.5-flash"
    voice_tts_model: str = "gemini-2.5-flash-preview-tts"
    voice_stream_tts: bool = False

    # ElevenLabs TTS (optional — used if API key is set)
    elevenlabs_api_key: Optional[str] = None
    elevenlabs_voice_id: str = "JBFqnCBsd6RMkjVDRZzb"  # "George" — warm, calm male
    elevenlabs_model_id: str = "eleven_flash_v2_5"  # low-latency, still multilingual
    elevenlabs_output_format: str = "mp3_22050_32"   # smaller/faster than mp3_44100_128
    elevenlabs_optimize_latency: int = 3              # 0-4, higher = lower latency
    # Voice settings — tuned for warm, caregiving tone
    elevenlabs_stability: float = 0.35        # 0-1, lower = more varied cadence
    elevenlabs_similarity_boost: float = 0.8  # 0-1, how close to original voice
    elevenlabs_style: float = 0.55            # 0-1, style exaggeration (warmth + intonation)
    elevenlabs_speaker_boost: bool = True      # enhance voice clarity

    # Session management
    session_expiry_days: int = 90

    # Server
    backend_host: str = "0.0.0.0"
    backend_port: int = 8000
    cors_origins: str = "http://localhost:5173,http://localhost:3000"

    class Config:
        env_file = str(_PROJECT_ROOT / ".env")
        env_file_encoding = "utf-8"
        extra = "ignore"


@lru_cache
def get_settings() -> Settings:
    return Settings()
