"""MERaLiON AudioLLM — Singlish-aware STT & translation via cr8lab API.

Flow: get upload URL → upload audio to presigned S3 → transcribe/translate.
Understands Singlish, code-switching, and Singapore's 4 official languages.
"""

import logging
from typing import Optional

import httpx

from ..core.config import get_settings

logger = logging.getLogger(__name__)

CRAB_BASE = "https://api.cr8lab.com"

# Hyperparameters tuned for elderly speech (slower, clearer, more repetitive)
DEFAULT_HYPER = {
    "temperature": 0.1,
    "topP": 0.9,
    "repetitionPenalty": 1.05,
    "noRepeatNGramSize": 8,
}


class MERaLiONService:
    """MERaLiON AudioLLM via cr8lab hosted API.

    Capabilities:
        - transcribe: Audio → text (Singlish-aware, speaker diarization)
        - translate:  Audio → translated text (Mandarin, Malay, Tamil, English)
    """

    def __init__(self) -> None:
        settings = get_settings()
        self.api_key: str = settings.mera_api_key or ""
        self.enabled: bool = bool(self.api_key)
        if not self.enabled:
            logger.warning("MERaLiON: mera_api_key not set — service disabled")

    def _headers(self, json_content: bool = True) -> dict:
        h = {"accept": "application/json", "x-api-key": self.api_key}
        if json_content:
            h["Content-Type"] = "application/json"
        return h

    # ── Internal: 3-step upload flow ────────────────────────────────────

    async def _get_upload_url(
        self, filename: str, content_type: str, file_size: int
    ) -> tuple[str, str]:
        """Step 1: Get presigned S3 URL + key from cr8lab."""
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(
                f"{CRAB_BASE}/upload-url",
                headers=self._headers(),
                json={
                    "filename": filename,
                    "contentType": content_type,
                    "fileSize": file_size,
                },
            )
            resp.raise_for_status()
            data = resp.json()["response"]
            return data["url"], data["key"]

    async def _upload_to_s3(
        self, upload_url: str, audio_bytes: bytes, content_type: str
    ) -> None:
        """Step 2: PUT audio bytes to the presigned S3 URL."""
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.put(
                upload_url,
                content=audio_bytes,
                headers={"Content-Type": content_type},
            )
            resp.raise_for_status()

    async def _upload_audio(
        self, audio_bytes: bytes, filename: str, content_type: str
    ) -> str:
        """Upload audio and return the S3 key for subsequent API calls."""
        upload_url, key = await self._get_upload_url(
            filename, content_type, len(audio_bytes)
        )
        await self._upload_to_s3(upload_url, audio_bytes, content_type)
        logger.info(f"MERaLiON: uploaded {len(audio_bytes)} bytes as {filename}")
        return key

    # ── Public API ──────────────────────────────────────────────────────

    async def transcribe(
        self,
        audio_bytes: bytes,
        filename: str = "audio.wav",
        hyper: Optional[dict] = None,
    ) -> Optional[str]:
        """Transcribe audio to text with Singlish awareness.

        Returns the transcribed text, or None on failure.
        Speaker labels (e.g. <Speaker 1>:) are stripped for single-speaker input.
        """
        if not self.enabled:
            return None

        content_type = _mime_from_filename(filename)

        try:
            key = await self._upload_audio(audio_bytes, filename, content_type)

            async with httpx.AsyncClient(timeout=60.0) as client:
                resp = await client.post(
                    f"{CRAB_BASE}/transcribe",
                    headers=self._headers(),
                    json={"key": key, "hyperParameters": hyper or DEFAULT_HYPER},
                )
                resp.raise_for_status()
                text = resp.json()["response"]["text"]

            # Strip speaker labels for single-speaker voice input
            text = _strip_speaker_labels(text).strip()
            logger.info(f"MERaLiON transcribe: {len(text)} chars")
            return text

        except Exception as exc:
            logger.error(f"MERaLiON transcribe failed: {exc}")
            return None

    async def translate(
        self,
        audio_bytes: bytes,
        target_language: str = "Mandarin",
        filename: str = "audio.wav",
        hyper: Optional[dict] = None,
    ) -> Optional[str]:
        """Translate audio to target language text.

        Supported languages: English, Mandarin, Malay, Tamil.
        """
        if not self.enabled:
            return None

        content_type = _mime_from_filename(filename)

        try:
            key = await self._upload_audio(audio_bytes, filename, content_type)

            async with httpx.AsyncClient(timeout=60.0) as client:
                resp = await client.post(
                    f"{CRAB_BASE}/translate",
                    headers=self._headers(),
                    json={
                        "key": key,
                        "language": target_language,
                        "hyperParameters": hyper or DEFAULT_HYPER,
                    },
                )
                resp.raise_for_status()
                text = resp.json()["response"]["text"]

            text = _strip_speaker_labels(text).strip()
            logger.info(f"MERaLiON translate ({target_language}): {len(text)} chars")
            return text

        except Exception as exc:
            logger.error(f"MERaLiON translate failed: {exc}")
            return None


# ── Helpers ─────────────────────────────────────────────────────────────

def _mime_from_filename(filename: str) -> str:
    """Map filename extension to MIME type."""
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    return {
        "wav": "audio/wav",
        "mp3": "audio/mpeg",
        "webm": "audio/webm",
        "ogg": "audio/ogg",
        "m4a": "audio/mp4",
        "mp4": "audio/mp4",
    }.get(ext, "audio/wav")


def _strip_speaker_labels(text: str) -> str:
    """Remove <Speaker N>: prefixes from MERaLiON output."""
    import re
    return re.sub(r"<Speaker \d+>:\s*", "", text)
