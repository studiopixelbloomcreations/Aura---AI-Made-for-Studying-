from typing import List

import requests
from fastapi import APIRouter, File, UploadFile, Request
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import Optional

from voice_service import save_upload_bytes, speech_to_text, text_to_speech
from audio_embedding_service import convert_to_pcm16k, cosine_similarity, decode_audio_base64, extract_embedding
from env_utils import env
from logging_utils import log_event

router = APIRouter(prefix="/voice", tags=["voice"])


class SpeakPayload(BaseModel):
    text: str
    voice: Optional[str] = None
    rate: Optional[int] = None


class VoiceRecognizePayload(BaseModel):
    audio: Optional[str] = None
    audio_base64: Optional[str] = None
    embedding: Optional[List[float]] = None


class VoiceEnrollPayload(BaseModel):
    userId: str
    embedding: Optional[List[float]] = None
    audio: Optional[str] = None
    audio_base64: Optional[str] = None
    displayName: Optional[str] = "Student"


def _supabase_headers():
    key = env("SUPABASE_SERVICE_KEY") or env("SUPABASE_ANON_KEY")
    return {"apikey": key or "", "authorization": f"Bearer {key}", "content-type": "application/json"}


def _supabase_url(path: str) -> str:
    base = str(env("SUPABASE_URL", "") or "").rstrip("/")
    if not base:
        raise RuntimeError("SUPABASE_URL is not configured")
    return f"{base}/rest/v1/{path}"


@router.post("/recognize")
async def recognize(request: Request, audio: Optional[UploadFile] = File(None), language: str = "en-US"):
    try:
        content_type = request.headers.get("content-type", "")
        raw = b""
        suffix = ".webm"
        embedding = None

        if "application/json" in content_type:
            payload = VoiceRecognizePayload(**(await request.json()))
            embedding = payload.embedding
            encoded = payload.audio or payload.audio_base64 or ""
            if embedding is None and encoded:
                raw = decode_audio_base64(encoded)
        elif audio is not None:
            raw = await audio.read()
            suffix = "." + ((audio.filename or "audio.webm").split(".")[-1] or "webm")

        if embedding is None:
            if not raw:
                return {"success": False, "data": None, "error": "Audio is required for voice recognition."}
            embedding = extract_embedding(convert_to_pcm16k(raw, suffix=suffix))

        rows = requests.get(_supabase_url("voice_signatures?select=user_id,embedding"), headers=_supabase_headers(), timeout=60).json()
        best = {"userId": None, "confidence": 0.0}
        for row in rows if isinstance(rows, list) else []:
            score = cosine_similarity(embedding, row.get("embedding") or [])
            if score > best["confidence"]:
                best = {"userId": row.get("user_id"), "confidence": score}

        data = {
            "matched": best["confidence"] >= 0.85,
            "userId": best["userId"] if best["confidence"] >= 0.85 else None,
            "confidence": best["confidence"],
        }
        log_event("info", "voice_recognition", data)
        return {"success": True, "data": data, "error": None, **data}
    except Exception as exc:
        log_event("error", "voice_recognition_error", {"error": str(exc)})
        return {"success": False, "data": None, "error": "Voice recognition is unavailable right now."}


@router.post("/enroll")
async def enroll(req: VoiceEnrollPayload):
    try:
        embedding = req.embedding
        if embedding is None:
            encoded = req.audio or req.audio_base64 or ""
            if not encoded:
                return {"success": False, "data": None, "error": "Audio or embedding is required."}
            embedding = extract_embedding(convert_to_pcm16k(decode_audio_base64(encoded), suffix=".webm"))
        if len(embedding) != 26:
            return {"success": False, "data": None, "error": "26-dimensional voice embedding is required."}
        profile = {"id": req.userId, "display_name": req.displayName or "Student", "grade": 9}
        requests.post(_supabase_url("user_profiles?on_conflict=id"), headers={**_supabase_headers(), "Prefer": "resolution=merge-duplicates,return=minimal"}, json=profile, timeout=60)
        saved = requests.post(_supabase_url("voice_signatures"), headers={**_supabase_headers(), "Prefer": "return=representation"}, json={"user_id": req.userId, "embedding": embedding}, timeout=60)
        saved.raise_for_status()
        return {"success": True, "data": {"userId": req.userId}, "error": None, "ok": True, "userId": req.userId}
    except Exception as exc:
        log_event("error", "voice_enroll_error", {"userId": req.userId, "error": str(exc)})
        return {"success": False, "data": None, "error": "Voice enrollment could not be saved."}


@router.post("/speak")
async def speak(req: SpeakPayload):
    out = text_to_speech(text=req.text, voice=req.voice, rate=req.rate)
    return FileResponse(out.path,
                        media_type=out.mime_type,
                        filename="speech.wav")
