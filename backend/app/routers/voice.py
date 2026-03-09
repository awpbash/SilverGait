"""Voice router - speech navigation for elderly-friendly UX."""

from typing import Optional

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import StreamingResponse

from ..core.config import get_settings
from ..services.voice import (
    GeminiVoiceService,
    VoiceIntentService,
    VoiceLanguageService,
    build_reply_text,
    build_voice_action,
)
from ..services.sealion import SeaLionService

router = APIRouter(tags=["voice"])

voice_service = GeminiVoiceService()
intent_service = VoiceIntentService()
language_service = VoiceLanguageService()
sealion_service = SeaLionService()


@router.get("/voice/status")
async def voice_status():
    settings = get_settings()
    return {
        "enabled": settings.voice_enabled and voice_service.enabled,
        "stt_ready": voice_service.enabled,
        "tts_ready": voice_service.enabled,
        "sealion_ready": sealion_service.enabled,
        "stream_tts": settings.voice_stream_tts,
        "tts_format": "wav",
    }


@router.post("/voice/turn")
async def voice_turn(
    audio: UploadFile = File(...),
    dialect: str = Form("en"),
    last_prompt: Optional[str] = Form(None),
    use_detected_language: bool = Form(False),
):
    settings = get_settings()
    if not settings.voice_enabled or not voice_service.enabled:
        raise HTTPException(status_code=503, detail="Voice is not enabled.")

    audio_bytes = await audio.read()
    if not audio_bytes:
        raise HTTPException(status_code=400, detail="Empty audio.")

    transcript = await voice_service.transcribe(audio_bytes, audio.filename or "voice.webm")
    if not transcript:
        raise HTTPException(status_code=502, detail="Could not transcribe audio.")

    intent_result = await intent_service.classify(transcript)
    detected = await language_service.detect(transcript)
    action = build_voice_action(intent_result, transcript)
    reply_text = build_reply_text(intent_result, last_prompt)

    dialect_map = {
        "en": "en",
        "english": "en",
        "mandarin": "mandarin",
        "chinese": "mandarin",
        "zh": "mandarin",
        "malay": "malay",
        "bahasa": "malay",
        "tamil": "tamil",
        "ta": "tamil",
    }
    dialect = dialect_map.get(dialect.lower(), "en")

    reply_language = dialect
    if use_detected_language and detected.confidence >= 0.45:
        reply_language = detected.language

    if reply_language != "en":
        reply_text = await sealion_service.rewrite_for_locale(reply_text, dialect=reply_language)  # type: ignore[arg-type]

    speech_b64 = None
    audio_mime = None
    if not settings.voice_stream_tts:
        speech_bytes = await voice_service.synthesize(reply_text)
        speech_b64 = voice_service.encode_audio(speech_bytes)
        if speech_b64:
            audio_mime = "audio/wav"

    return {
        "transcript": transcript,
        "intent": intent_result.intent,
        "confidence": intent_result.confidence,
        "detected_language": detected.language,
        "detected_confidence": detected.confidence,
        "reply_language": reply_language,
        "action": action,
        "reply_text": reply_text,
        "reply_audio": speech_b64,
        "audio_mime_type": audio_mime,
        "stream_tts": settings.voice_stream_tts,
        "tts_format": "wav",
    }


@router.post("/voice/tts-stream")
async def voice_tts_stream(text: str = Form(...)):
    settings = get_settings()
    if not settings.voice_enabled or not voice_service.enabled:
        raise HTTPException(status_code=503, detail="Voice is not enabled.")
    if not text.strip():
        raise HTTPException(status_code=400, detail="Empty text.")

    async def generator():
        async for chunk in voice_service.stream_speech(text):
            yield chunk

    return StreamingResponse(generator(), media_type="audio/wav")
