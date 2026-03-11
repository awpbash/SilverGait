"""Voice router - speech navigation for elderly-friendly UX."""

from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.config import get_settings
from ..core.database import get_db
from ..models.db_models import User
from ..services.voice import (
    GeminiVoiceService,
    ElevenLabsTTSService,
    VoiceIntentService,
    VoiceLanguageService,
    build_reply_text,
    build_voice_action,
)
from ..services.sealion import SeaLionService
from ..services.meralion import MERaLiONService

router = APIRouter(tags=["voice"])

voice_service = GeminiVoiceService()
elevenlabs_service = ElevenLabsTTSService()
meralion_service = MERaLiONService()
intent_service = VoiceIntentService()
language_service = VoiceLanguageService()
sealion_service = SeaLionService()


@router.get("/voice/status")
async def voice_status():
    settings = get_settings()
    return {
        "enabled": settings.voice_enabled and (meralion_service.enabled or voice_service.enabled),
        "stt_ready": meralion_service.enabled or voice_service.enabled,
        "stt_provider": "meralion" if meralion_service.enabled else "gemini",
        "tts_ready": elevenlabs_service.enabled or voice_service.enabled,
        "tts_provider": "elevenlabs" if elevenlabs_service.enabled else "gemini",
        "sealion_ready": sealion_service.enabled,
        "stream_tts": settings.voice_stream_tts,
        "tts_format": "mp3" if elevenlabs_service.enabled else "wav",
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

    # MERaLiON primary (Singlish-aware) → Gemini fallback
    filename = audio.filename or "voice.webm"
    transcript = None
    stt_provider = "gemini"
    if meralion_service.enabled:
        transcript = await meralion_service.transcribe(audio_bytes, filename)
        if transcript:
            stt_provider = "meralion"
    if not transcript:
        transcript = await voice_service.transcribe(audio_bytes, filename)
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
        "stt_provider": stt_provider,
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


@router.post("/voice/transcribe")
async def voice_transcribe(
    audio: UploadFile = File(...),
):
    """Lightweight transcription-only endpoint. MERaLiON primary → Gemini fallback."""
    settings = get_settings()
    if not settings.voice_enabled and not meralion_service.enabled:
        raise HTTPException(status_code=503, detail="Voice is not enabled.")

    audio_bytes = await audio.read()
    if not audio_bytes:
        raise HTTPException(status_code=400, detail="Empty audio.")

    filename = audio.filename or "voice.webm"
    transcript = None
    stt_provider = "gemini"

    # MERaLiON primary (Singlish-aware) → Gemini fallback
    if meralion_service.enabled:
        transcript = await meralion_service.transcribe(audio_bytes, filename)
        if transcript:
            stt_provider = "meralion"
    if not transcript and voice_service.enabled:
        transcript = await voice_service.transcribe(audio_bytes, filename)
    if not transcript:
        raise HTTPException(status_code=502, detail="Could not transcribe audio.")

    return {"transcript": transcript, "stt_provider": stt_provider}


@router.post("/voice/tts-stream")
async def voice_tts_stream(
    text: str = Form(...),
    user_id: Optional[str] = Form(None),
    voice_id: Optional[str] = Form(None),
    db: AsyncSession = Depends(get_db),
):
    settings = get_settings()
    if not text.strip():
        raise HTTPException(status_code=400, detail="Empty text.")

    # Resolve voice_id: explicit param > user's saved voice > default
    resolved_voice_id = voice_id
    if not resolved_voice_id and user_id:
        user = await db.get(User, user_id)
        if user and user.voice_id:
            resolved_voice_id = user.voice_id

    # ElevenLabs first (streaming MP3, high quality)
    if elevenlabs_service.enabled:
        async def el_generator():
            async for chunk in elevenlabs_service.stream_speech(text, voice_id=resolved_voice_id):
                yield chunk
        return StreamingResponse(el_generator(), media_type="audio/mpeg")

    # Gemini fallback
    if not settings.voice_enabled or not voice_service.enabled:
        raise HTTPException(status_code=503, detail="Voice is not enabled.")

    async def gemini_generator():
        async for chunk in voice_service.stream_speech(text):
            yield chunk

    return StreamingResponse(gemini_generator(), media_type="audio/wav")


@router.get("/voice/voices")
async def list_voices():
    """List all available ElevenLabs voices."""
    if not elevenlabs_service.enabled:
        raise HTTPException(status_code=503, detail="ElevenLabs not configured.")
    voices = await elevenlabs_service.list_voices()
    return {"voices": voices, "default_voice_id": elevenlabs_service.default_voice_id}


@router.post("/voice/voices/clone")
async def clone_voice(
    name: str = Form(...),
    audio: UploadFile = File(...),
    description: str = Form(""),
):
    """Clone a voice from an audio sample (caregiver uploads familiar voice)."""
    if not elevenlabs_service.enabled:
        raise HTTPException(status_code=503, detail="ElevenLabs not configured.")

    audio_bytes = await audio.read()
    if not audio_bytes:
        raise HTTPException(status_code=400, detail="Empty audio file.")

    result = await elevenlabs_service.clone_voice(
        name=name,
        audio_bytes=audio_bytes,
        filename=audio.filename or "sample.wav",
        description=description,
    )
    if not result:
        raise HTTPException(status_code=502, detail="Voice cloning failed.")
    return result


@router.delete("/voice/voices/{vid}")
async def delete_voice(vid: str):
    """Delete a cloned voice."""
    if not elevenlabs_service.enabled:
        raise HTTPException(status_code=503, detail="ElevenLabs not configured.")
    ok = await elevenlabs_service.delete_voice(vid)
    if not ok:
        raise HTTPException(status_code=502, detail="Could not delete voice.")
    return {"deleted": True}


@router.patch("/voice/voices/select")
async def select_voice(
    user_id: str = Form(...),
    voice_id: str = Form(...),
    db: AsyncSession = Depends(get_db),
):
    """Set a user's preferred ElevenLabs voice."""
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")
    user.voice_id = voice_id
    await db.commit()
    return {"user_id": user_id, "voice_id": voice_id}


@router.get("/voice/voice-settings")
async def get_voice_settings():
    """Get current ElevenLabs voice settings (stability, style, etc.)."""
    if not elevenlabs_service.enabled:
        raise HTTPException(status_code=503, detail="ElevenLabs not configured.")
    return elevenlabs_service.voice_settings


@router.patch("/voice/voice-settings")
async def update_voice_settings(
    stability: Optional[float] = Form(None),
    similarity_boost: Optional[float] = Form(None),
    style: Optional[float] = Form(None),
    use_speaker_boost: Optional[bool] = Form(None),
):
    """Update ElevenLabs voice settings at runtime (caregiver tuning).

    - stability: 0-1 (lower = more expressive, higher = more consistent)
    - similarity_boost: 0-1 (how close to the original voice)
    - style: 0-1 (warmth/style exaggeration)
    - use_speaker_boost: true/false (enhance clarity)
    """
    if not elevenlabs_service.enabled:
        raise HTTPException(status_code=503, detail="ElevenLabs not configured.")

    if stability is not None:
        elevenlabs_service.voice_settings["stability"] = max(0.0, min(1.0, stability))
    if similarity_boost is not None:
        elevenlabs_service.voice_settings["similarity_boost"] = max(0.0, min(1.0, similarity_boost))
    if style is not None:
        elevenlabs_service.voice_settings["style"] = max(0.0, min(1.0, style))
    if use_speaker_boost is not None:
        elevenlabs_service.voice_settings["use_speaker_boost"] = use_speaker_boost

    return elevenlabs_service.voice_settings
