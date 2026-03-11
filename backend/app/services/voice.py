"""Voice services: STT, intent detection, and TTS."""

from __future__ import annotations

import asyncio
import base64
import json
import logging
import struct
import wave
from dataclasses import dataclass, field
from io import BytesIO
import re
from typing import AsyncIterator, Dict, Optional

import httpx
from google import genai
from google.genai import types

from ..core.config import get_settings
from ..utils.text import strip_markdown_fences

logger = logging.getLogger(__name__)


@dataclass
class IntentResult:
    intent: str
    confidence: float
    slots: Dict[str, str] = field(default_factory=dict)


@dataclass
class LanguageResult:
    language: str
    confidence: float


class GeminiVoiceService:
    """Gemini STT (gemini-2.5-flash) + TTS (gemini-2.5-flash-preview-tts)."""

    def __init__(self) -> None:
        settings = get_settings()
        self.client = genai.Client(api_key=settings.gemini_api_key)
        self.stt_model = settings.voice_stt_model
        self.tts_model = settings.voice_tts_model
        self.enabled = bool(settings.gemini_api_key)

    async def transcribe(self, audio_bytes: bytes, filename: str) -> Optional[str]:
        if not self.enabled:
            return None
        try:
            # Determine MIME type from filename
            mime = "audio/webm"
            if filename.endswith(".wav"):
                mime = "audio/wav"
            elif filename.endswith(".mp3"):
                mime = "audio/mpeg"
            elif filename.endswith(".ogg"):
                mime = "audio/ogg"

            response = await asyncio.to_thread(
                self.client.models.generate_content,
                model=self.stt_model,
                contents=[
                    types.Part.from_bytes(data=audio_bytes, mime_type=mime),
                    "Transcribe this audio exactly as spoken. Return only the transcription text, nothing else.",
                ],
            )
            return (response.text or "").strip()
        except Exception as exc:
            logger.error(f"Gemini STT failed: {exc}")
            return None

    @staticmethod
    def _pcm_to_wav(pcm: bytes, channels: int = 1, rate: int = 24000, sample_width: int = 2) -> bytes:
        """Wrap raw PCM bytes in a WAV header so browsers can play it."""
        buf = BytesIO()
        with wave.open(buf, "wb") as wf:
            wf.setnchannels(channels)
            wf.setsampwidth(sample_width)
            wf.setframerate(rate)
            wf.writeframes(pcm)
        return buf.getvalue()

    async def synthesize(self, text: str) -> Optional[bytes]:
        if not self.enabled:
            return None
        try:
            response = await asyncio.to_thread(
                self.client.models.generate_content,
                model=self.tts_model,
                contents=text,
                config=types.GenerateContentConfig(
                    response_modalities=["AUDIO"],
                    speech_config=types.SpeechConfig(
                        voice_config=types.VoiceConfig(
                            prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name="Kore")
                        )
                    ),
                ),
            )
            # Extract raw PCM audio bytes from response
            if response.candidates and response.candidates[0].content.parts:
                for part in response.candidates[0].content.parts:
                    if part.inline_data and part.inline_data.data:
                        pcm = part.inline_data.data
                        logger.info(f"TTS synthesized {len(pcm)} bytes PCM, wrapping as WAV")
                        return self._pcm_to_wav(pcm)
            logger.warning("TTS: no audio data in response")
            return None
        except Exception as exc:
            logger.error(f"Gemini TTS failed: {exc}")
            return None

    async def stream_speech(self, text: str):
        """Fallback: synthesize then yield the whole blob."""
        audio = await self.synthesize(text)
        if audio:
            yield audio

    @staticmethod
    def encode_audio(audio_bytes: Optional[bytes]) -> Optional[str]:
        if not audio_bytes:
            return None
        return base64.b64encode(audio_bytes).decode("ascii")


class ElevenLabsTTSService:
    """ElevenLabs TTS — high-quality, multilingual, streaming, voice cloning."""

    BASE_URL = "https://api.elevenlabs.io/v1"

    def __init__(self) -> None:
        settings = get_settings()
        self.api_key = settings.elevenlabs_api_key
        self.default_voice_id = settings.elevenlabs_voice_id
        self.model_id = settings.elevenlabs_model_id
        self.output_format = settings.elevenlabs_output_format
        self.optimize_latency = settings.elevenlabs_optimize_latency
        self.enabled = bool(self.api_key)
        # Voice settings — controls warmth, expressiveness, clarity
        self.voice_settings = {
            "stability": settings.elevenlabs_stability,
            "similarity_boost": settings.elevenlabs_similarity_boost,
            "style": settings.elevenlabs_style,
            "use_speaker_boost": settings.elevenlabs_speaker_boost,
        }

    def _headers(self) -> dict:
        return {"xi-api-key": self.api_key}

    def _resolve_voice(self, voice_id: Optional[str] = None) -> str:
        return voice_id or self.default_voice_id

    def _tts_payload(self, text: str) -> dict:
        """Build the JSON payload for TTS requests."""
        return {
            "text": text,
            "model_id": self.model_id,
            "voice_settings": self.voice_settings,
        }

    def _query_params(self) -> dict:
        return {
            "output_format": self.output_format,
            "optimize_streaming_latency": self.optimize_latency,
        }

    async def synthesize(self, text: str, voice_id: Optional[str] = None) -> Optional[bytes]:
        """Full synthesis — returns MP3 bytes."""
        if not self.enabled:
            return None
        vid = self._resolve_voice(voice_id)
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.post(
                    f"{self.BASE_URL}/text-to-speech/{vid}",
                    headers={**self._headers(), "Content-Type": "application/json"},
                    json=self._tts_payload(text),
                    params=self._query_params(),
                )
                if resp.status_code != 200:
                    logger.error(f"ElevenLabs TTS failed: {resp.status_code} {resp.text[:200]}")
                    return None
                logger.info(f"ElevenLabs TTS: {len(resp.content)} bytes MP3")
                return resp.content
        except Exception as exc:
            logger.error(f"ElevenLabs TTS error: {exc}")
            return None

    async def stream_speech(self, text: str, voice_id: Optional[str] = None) -> AsyncIterator[bytes]:
        """Stream audio chunks as they're generated."""
        if not self.enabled:
            return
        vid = self._resolve_voice(voice_id)
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                async with client.stream(
                    "POST",
                    f"{self.BASE_URL}/text-to-speech/{vid}/stream",
                    headers={**self._headers(), "Content-Type": "application/json"},
                    json=self._tts_payload(text),
                    params=self._query_params(),
                ) as resp:
                    if resp.status_code != 200:
                        logger.error(f"ElevenLabs stream failed: {resp.status_code}")
                        return
                    async for chunk in resp.aiter_bytes(1024):
                        yield chunk
        except Exception as exc:
            logger.error(f"ElevenLabs stream error: {exc}")

    # Curated default voices — warm, calm, multilingual-friendly for elderly care
    CURATED_VOICE_IDS = {
        "JBFqnCBsd6RMkjVDRZzb",  # George — warm storyteller (default)
        "Xb7hH8MSUJpSbSDYk0k2",  # Alice — clear educator
        "nPczCjzI2devNBz1zQrb",  # Brian — deep, comforting
        "pFZP5JQG7iQjIQuC4Bku",  # Lily — velvety, confident
    }

    async def list_voices(self) -> list[dict]:
        """List cloned voices + curated defaults (not the full ElevenLabs library)."""
        if not self.enabled:
            return []
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(
                    f"{self.BASE_URL}/voices",
                    headers=self._headers(),
                )
                if resp.status_code != 200:
                    logger.error(f"ElevenLabs list voices failed: {resp.status_code}")
                    return []
                data = resp.json()
                return [
                    {
                        "voice_id": v["voice_id"],
                        "name": v.get("name", ""),
                        "category": v.get("category", ""),
                        "preview_url": v.get("preview_url"),
                        "labels": v.get("labels", {}),
                    }
                    for v in data.get("voices", [])
                    if v.get("category") == "cloned" or v["voice_id"] in self.CURATED_VOICE_IDS
                ]
        except Exception as exc:
            logger.error(f"ElevenLabs list voices error: {exc}")
            return []

    async def clone_voice(self, name: str, audio_bytes: bytes, filename: str, description: str = "") -> Optional[dict]:
        """Clone a voice from an audio sample. Returns {voice_id, name} or None."""
        if not self.enabled:
            return None
        try:
            # Determine mime type from filename
            mime = "audio/mpeg"
            if filename.endswith(".webm"):
                mime = "audio/webm"
            elif filename.endswith(".wav"):
                mime = "audio/wav"
            elif filename.endswith(".m4a") or filename.endswith(".mp4"):
                mime = "audio/mp4"
            elif filename.endswith(".ogg"):
                mime = "audio/ogg"

            async with httpx.AsyncClient(timeout=60.0) as client:
                resp = await client.post(
                    f"{self.BASE_URL}/voices/add",
                    headers=self._headers(),
                    data={
                        "name": name,
                        "description": description or f"Cloned voice: {name}",
                    },
                    files=[("files", (filename, audio_bytes, mime))],
                )
                if resp.status_code != 200:
                    logger.error(f"ElevenLabs clone failed: {resp.status_code} {resp.text[:500]}")
                    return None
                data = resp.json()
                logger.info(f"ElevenLabs voice cloned: {data.get('voice_id')}")
                return {"voice_id": data["voice_id"], "name": name}
        except Exception as exc:
            logger.error(f"ElevenLabs clone error: {exc}")
            return None

    async def delete_voice(self, voice_id: str) -> bool:
        """Delete a cloned voice."""
        if not self.enabled:
            return False
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.delete(
                    f"{self.BASE_URL}/voices/{voice_id}",
                    headers=self._headers(),
                )
                if resp.status_code != 200:
                    logger.error(f"ElevenLabs delete voice failed: {resp.status_code}")
                    return False
                logger.info(f"ElevenLabs voice deleted: {voice_id}")
                return True
        except Exception as exc:
            logger.error(f"ElevenLabs delete voice error: {exc}")
            return False


class VoiceIntentService:
    """Intent detection using Gemini with a keyword fallback."""

    INTENTS = [
        "home",
        "assessment",
        "start_assessment",
        "exercises",
        "activity",
        "help",
        "caregiver",
        "repeat",
        "cancel",
        "unknown",
    ]

    def __init__(self) -> None:
        settings = get_settings()
        self.use_gemini = settings.voice_use_gemini_intent
        self.client = genai.Client(api_key=settings.gemini_api_key)
        self.model = settings.voice_intent_model

    async def classify(self, text: str) -> IntentResult:
        text = (text or "").strip()
        if not text:
            return IntentResult(intent="unknown", confidence=0.0)

        if self.use_gemini:
            result = await self._classify_with_gemini(text)
            if result:
                return result

        return self._classify_with_keywords(text)

    async def _classify_with_gemini(self, text: str) -> Optional[IntentResult]:
        prompt = (
            "You are a voice intent classifier for a Singapore elderly mobility app.\n"
            "The text may be in English, Singlish, Mandarin, or Malay.\n"
            "Return ONLY JSON, no markdown.\n"
            "Valid intents: home, assessment, start_assessment, exercises, activity, help, caregiver, repeat, cancel, unknown.\n"
            "If an exercise is mentioned, include slots.exercise as one of:\n"
            "chair-stand, wall-push, heel-raise, marching.\n"
            f'Text: "{text}"\n'
            "Return: {\"intent\": \"...\", \"confidence\": 0-1, \"slots\": {\"exercise\": \"...\"}}\n"
        )
        try:
            response = await asyncio.to_thread(
                self.client.models.generate_content,
                model=self.model,
                contents=prompt,
            )
            result_text = strip_markdown_fences((response.text or "").strip())
            data = json.loads(result_text)
            intent = data.get("intent", "unknown")
            if intent not in self.INTENTS:
                intent = "unknown"
            confidence = float(data.get("confidence", 0.0))
            slots = data.get("slots") or {}
            return IntentResult(intent=intent, confidence=confidence, slots=slots)
        except Exception as exc:
            logger.warning(f"Gemini intent parse failed: {exc}")
            return None

    def _classify_with_keywords(self, text: str) -> IntentResult:
        text_lower = text.lower()

        if any(kw in text_lower for kw in ["repeat", "again", "say again", "once more"]):
            return IntentResult(intent="repeat", confidence=0.6)
        if any(kw in text_lower for kw in ["caregiver", "family", "daughter", "son", "grandchild"]):
            return IntentResult(intent="caregiver", confidence=0.6)
        if any(kw in text_lower for kw in ["help", "assist"]):
            return IntentResult(intent="help", confidence=0.6)
        if any(kw in text_lower for kw in ["cancel", "stop", "exit"]):
            return IntentResult(intent="cancel", confidence=0.6)
        if any(kw in text_lower for kw in ["exercise", "workout", "practice"]):
            return IntentResult(intent="exercises", confidence=0.6, slots={"exercise": match_exercise_id(text_lower) or ""})
        if any(kw in text_lower for kw in ["assessment", "check", "test", "strength"]):
            if "start" in text_lower or "begin" in text_lower:
                return IntentResult(intent="start_assessment", confidence=0.7)
            return IntentResult(intent="assessment", confidence=0.6)
        if any(kw in text_lower for kw in ["progress", "activity", "steps"]):
            return IntentResult(intent="activity", confidence=0.6)
        if any(kw in text_lower for kw in ["home", "main"]):
            return IntentResult(intent="home", confidence=0.6)

        return IntentResult(intent="unknown", confidence=0.2)


class VoiceLanguageService:
    """Language detection (English, Mandarin, Malay, Singlish)."""

    LANGUAGES = ["en", "mandarin", "malay", "tamil"]

    def __init__(self) -> None:
        settings = get_settings()
        self.use_gemini = settings.voice_use_gemini_intent
        self.client = genai.Client(api_key=settings.gemini_api_key)
        self.model = settings.voice_intent_model

    async def detect(self, text: str) -> LanguageResult:
        text = (text or "").strip()
        if not text:
            return LanguageResult(language="en", confidence=0.0)

        if self.use_gemini:
            result = await self._detect_with_gemini(text)
            if result:
                return result

        return self._detect_with_rules(text)

    async def _detect_with_gemini(self, text: str) -> Optional[LanguageResult]:
        prompt = (
            "Detect the language of the text for a Singapore elderly app.\n"
            "Return ONLY JSON, no markdown.\n"
            "Supported: en, mandarin, malay, tamil.\n"
            f'Text: "{text}"\n'
            "Return: {\"language\": \"...\", \"confidence\": 0-1}\n"
        )
        try:
            response = await asyncio.to_thread(
                self.client.models.generate_content,
                model=self.model,
                contents=prompt,
            )
            result_text = strip_markdown_fences((response.text or "").strip())
            data = json.loads(result_text)
            language = data.get("language", "en")
            if language not in self.LANGUAGES:
                language = "en"
            confidence = float(data.get("confidence", 0.0))
            return LanguageResult(language=language, confidence=confidence)
        except Exception as exc:
            logger.warning(f"Gemini language detect failed: {exc}")
            return None

    def _detect_with_rules(self, text: str) -> LanguageResult:
        if re.search(r"[\u4e00-\u9fff]", text):
            return LanguageResult(language="mandarin", confidence=0.7)

        lower = text.lower()
        malay_keywords = [
            "sila", "tolong", "boleh", "terima kasih", "selamat", "pagi", "petang",
            "malam", "senaman", "latihan", "rumah", "kaki", "tangan", "berdiri",
        ]
        if any(kw in lower for kw in malay_keywords):
            return LanguageResult(language="malay", confidence=0.6)

        tamil_keywords = [
            "vanakkam", "nandri", "enna", "epdi", "udambu", "kaal", "kai",
            "payirchi", "udarpayirchi", "paathukaappu",
        ]
        if any(kw in lower for kw in tamil_keywords):
            return LanguageResult(language="tamil", confidence=0.6)

        # Tamil script detection
        if re.search(r"[\u0B80-\u0BFF]", text):
            return LanguageResult(language="tamil", confidence=0.7)

        return LanguageResult(language="en", confidence=0.5)


def match_exercise_id(text: str) -> Optional[str]:
    if "chair" in text and "stand" in text:
        return "chair-stand"
    if "wall" in text and ("push" in text or "pushup" in text):
        return "wall-push"
    if "heel" in text:
        return "heel-raise"
    if "march" in text:
        return "marching"
    return None


def build_voice_action(intent_result: IntentResult, transcript: str) -> Dict[str, Optional[str]]:
    intent = intent_result.intent
    action: Dict[str, Optional[str]] = {"type": "none", "target": None, "exercise_id": None, "auto_start": None}

    if intent == "home":
        action.update({"type": "navigate", "target": "home"})
    elif intent == "assessment":
        action.update({"type": "navigate", "target": "assessment", "auto_start": False})
    elif intent == "start_assessment":
        action.update({"type": "navigate", "target": "assessment", "auto_start": True})
    elif intent == "exercises":
        exercise_id = intent_result.slots.get("exercise") if intent_result.slots else None
        if not exercise_id:
            exercise_id = match_exercise_id(transcript.lower())
        action.update({"type": "navigate", "target": "exercises", "exercise_id": exercise_id or None})
    elif intent == "activity":
        action.update({"type": "navigate", "target": "activity"})
    elif intent == "help":
        action.update({"type": "navigate", "target": "help"})
    elif intent == "caregiver":
        action.update({"type": "navigate", "target": "caregiver"})
    elif intent == "cancel":
        action.update({"type": "navigate", "target": "home"})

    return action


def build_reply_text(intent_result: IntentResult, last_prompt: Optional[str] = None) -> str:
    intent = intent_result.intent
    if intent == "start_assessment":
        return "Okay. I will open the check. Place the phone on a table and stand inside the box."
    if intent == "assessment":
        return "Opening the check screen. Say start when you are ready."
    if intent == "exercises":
        return "Sure. Here are your exercises for today."
    if intent == "activity":
        return "Here is your progress for the week."
    if intent == "home":
        return "Going back to the home screen."
    if intent == "help":
        return "Here is the help and safety page."
    if intent == "caregiver":
        return "Opening caregiver summary."
    if intent == "repeat":
        return last_prompt or "Please say that again."
    if intent == "cancel":
        return "Okay. Returning to the home screen."
    return "Sorry, I did not catch that. You can say start check, show exercises, or go home."


