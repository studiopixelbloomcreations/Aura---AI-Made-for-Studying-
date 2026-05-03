import base64
import math
import os
from typing import List

import numpy as np
import requests
from fastapi import APIRouter, File, UploadFile, Request
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import Optional

from voice_service import save_upload_bytes, speech_to_text, text_to_speech

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
    embedding: List[float]
    displayName: Optional[str] = "Student"


def _cosine(a: List[float], b: List[float]) -> float:
    aa = np.array(a, dtype=float)
    bb = np.array(b, dtype=float)
    if aa.size != bb.size or aa.size == 0:
        return 0.0
    denom = float(np.linalg.norm(aa) * np.linalg.norm(bb))
    return float(np.dot(aa, bb) / denom) if denom else 0.0


def _simple_pcm_embedding(raw: bytes) -> List[float]:
    if not raw:
        return [0.0] * 26
    arr = np.frombuffer(raw, dtype=np.uint8).astype(np.float32)
    arr = (arr - np.mean(arr)) / (np.std(arr) + 1e-6)
    chunks = np.array_split(arr, 13)
    mean = [float(np.mean(c)) for c in chunks]
    var = [float(np.var(c)) for c in chunks]
    return mean + var


def _supabase_headers():
    key = os.environ.get("SUPABASE_SERVICE_KEY") or os.environ.get("SUPABASE_ANON_KEY")
    return {"apikey": key or "", "authorization": f"Bearer {key}", "content-type": "application/json"}


def _supabase_url(path: str) -> str:
    base = (os.environ.get("SUPABASE_URL") or "").rstrip("/")
    if not base:
        raise RuntimeError("SUPABASE_URL is not configured")
    return f"{base}/rest/v1/{path}"


@router.post("/recognize")
async def recognize(request: Request, audio: Optional[UploadFile] = File(None), language: str = "en-US"):
    content_type = request.headers.get("content-type", "")
    if "application/json" in content_type:
      payload = VoiceRecognizePayload(**(await request.json()))
      embedding = payload.embedding
      if embedding is None:
          encoded = payload.audio or payload.audio_base64 or ""
          raw = base64.b64decode(encoded.split(",", 1)[-1]) if encoded else b""
          embedding = _simple_pcm_embedding(raw)
      rows = requests.get(_supabase_url("voice_signatures?select=user_id,embedding"), headers=_supabase_headers(), timeout=60).json()
      best = {"userId": None, "confidence": 0.0}
      for row in rows if isinstance(rows, list) else []:
          score = _cosine(embedding, row.get("embedding") or [])
          if score > best["confidence"]:
              best = {"userId": row.get("user_id"), "confidence": score}
      return {"matched": best["confidence"] >= 0.85, "userId": best["userId"] if best["confidence"] >= 0.85 else None, "confidence": best["confidence"]}

    if audio is None:
        return {"matched": False, "userId": None, "confidence": 0, "error": "audio upload or JSON embedding is required"}
    raw = await audio.read()
    ext = (audio.filename or "audio").split(".")[-1] if audio.filename and "." in audio.filename else "webm"
    path = save_upload_bytes(raw, ext)
    out = speech_to_text(path, language=language)
    return {"ok": True, "text": out.text, "engine": out.engine, "matched": False, "userId": None, "confidence": 0}


@router.post("/enroll")
async def enroll(req: VoiceEnrollPayload):
    if len(req.embedding) != 26:
        return {"ok": False, "error": "26-dimensional voice embedding is required"}
    profile = {"id": req.userId, "display_name": req.displayName or "Student", "grade": 9}
    requests.post(_supabase_url("user_profiles?on_conflict=id"), headers={**_supabase_headers(), "Prefer": "resolution=merge-duplicates,return=minimal"}, json=profile, timeout=60)
    saved = requests.post(_supabase_url("voice_signatures"), headers={**_supabase_headers(), "Prefer": "return=representation"}, json={"user_id": req.userId, "embedding": req.embedding}, timeout=60)
    saved.raise_for_status()
    return {"ok": True, "userId": req.userId}


@router.post("/speak")
async def speak(req: SpeakPayload):
    out = text_to_speech(text=req.text, voice=req.voice, rate=req.rate)
    return FileResponse(out.path,
                        media_type=out.mime_type,
                        filename="speech.wav")
