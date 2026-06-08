"""Voice service — TTS powered by Gemini Native Audio, STT via Google Speech.

All voice output uses the Gemini 2.5 Flash TTS API (low-latency, high-quality).
No Puter, no ElevenLabs, no OpenAI.
"""
import os
import shutil
import subprocess
import uuid
import base64
from dataclasses import dataclass
from typing import Optional

import requests

from env_utils import env
from logging_utils import log_event

TEMP_DIR = env("TMPDIR") or env("TEMP") or "/tmp"
TEMP_DIR = os.path.join(TEMP_DIR, "tmp_media")

# Gemini TTS config
GEMINI_TTS_MODEL = "gemini-2.5-flash-preview-tts"
GEMINI_TTS_VOICE = "Kore"
GEMINI_TTS_SAMPLE_RATE = 24000


@dataclass
class STTResult:
    text: str
    engine: str


@dataclass
class TTSResult:
    path: str
    mime_type: str
    engine: str


def _unique_path(ext: str) -> str:
    os.makedirs(TEMP_DIR, exist_ok=True)
    ext_clean = (ext or "").lstrip(".")
    if not ext_clean:
        ext_clean = "bin"
    return os.path.join(TEMP_DIR, f"{uuid.uuid4().hex}.{ext_clean}")


def save_upload_bytes(data: bytes, ext: str) -> str:
    path = _unique_path(ext)
    with open(path, "wb") as f:
        f.write(data)
    return path


def _convert_to_wav_if_needed(audio_path: str) -> str:
    ext = os.path.splitext(audio_path)[1].lower().lstrip(".")
    if ext in {"wav", "aiff", "aif", "flac"}:
        return audio_path

    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        raise RuntimeError(
            "Unsupported audio format. Install ffmpeg or upload WAV/AIFF/FLAC instead."
        )

    out_path = _unique_path("wav")
    try:
        subprocess.run(
            [ffmpeg, "-y", "-i", audio_path, out_path],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
    except Exception as e:
        raise RuntimeError("Audio conversion failed (ffmpeg)") from e

    return out_path


def speech_to_text(audio_path: str, language: str = "en-US") -> STTResult:
    """Best-effort STT using SpeechRecognition (Google Web Speech API)."""
    try:
        import speech_recognition as sr
    except Exception as e:
        raise RuntimeError(
            "SpeechRecognition is not installed. Install with: pip install SpeechRecognition"
        ) from e

    r = sr.Recognizer()
    audio_path = _convert_to_wav_if_needed(audio_path)

    try:
        with sr.AudioFile(audio_path) as source:
            audio = r.record(source)
    except Exception as e:
        raise RuntimeError(
            "Unsupported audio format for SpeechRecognition. Please upload WAV/AIFF/FLAC."
        ) from e

    try:
        text = r.recognize_google(audio, language=language or "en-US")
    except sr.UnknownValueError:
        text = ""
    except sr.RequestError as e:
        raise RuntimeError(f"STT request failed: {e}") from e

    return STTResult(text=text, engine="speech_recognition:google")


def _pcm16_to_wav(pcm_bytes: bytes, sample_rate: int = 24000, channels: int = 1) -> bytes:
    """Convert raw PCM 16-bit little-endian to WAV bytes."""
    import struct
    bits_per_sample = 16
    block_align = channels * bits_per_sample // 8
    byte_rate = sample_rate * block_align
    data_size = len(pcm_bytes)

    header = struct.pack(
        "<4sI4s4sIHHIIHH4sI",
        b"RIFF",
        36 + data_size,
        b"WAVE",
        b"fmt ",
        16,
        1,
        channels,
        sample_rate,
        byte_rate,
        block_align,
        bits_per_sample,
        b"data",
        data_size,
    )
    return header + pcm_bytes


def text_to_speech(
    text: str,
    voice: Optional[str] = None,
    rate: Optional[int] = None,
) -> TTSResult:
    """TTS via Gemini 2.5 Flash Native Audio API.

    Fast, high-quality speech synthesis. Returns a WAV file path.
    """
    api_key = str(env("GEMINI_API_KEY", "")).strip()
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY is not configured for TTS.")

    voice_name = (voice or str(env("GEMINI_TTS_VOICE", GEMINI_TTS_VOICE)).strip()) or GEMINI_TTS_VOICE
    model = str(env("GEMINI_TTS_MODEL", GEMINI_TTS_MODEL)).strip() or GEMINI_TTS_MODEL
    sample_rate = int(env("GEMINI_TTS_SAMPLE_RATE", str(GEMINI_TTS_SAMPLE_RATE)))
    base_url = str(env("GEMINI_API_BASE", "https://generativelanguage.googleapis.com")).strip().rstrip("/")

    if not text or not text.strip():
        raise RuntimeError("Text is required for TTS.")

    url = f"{base_url}/v1beta/models/{model}:generateContent"
    payload = {
        "contents": [{"parts": [{"text": text.strip()}]}],
        "generationConfig": {
            "responseModalities": ["AUDIO"],
            "speechConfig": {
                "voiceConfig": {
                    "prebuiltVoiceConfig": {"voiceName": voice_name},
                },
            },
        },
    }

    try:
        resp = requests.post(
            url,
            headers={"Content-Type": "application/json"},
            params={"key": api_key},
            json=payload,
            timeout=15,  # 15s timeout for fast response
        )
        resp.raise_for_status()
        data = resp.json()
    except requests.exceptions.Timeout:
        raise RuntimeError("Gemini TTS timed out. Try again.")
    except Exception as e:
        raise RuntimeError(f"Gemini TTS request failed: {e}") from e

    # Extract audio from response
    parts = (
        data.get("candidates", [{}])[0]
        .get("content", {})
        .get("parts", [])
    )

    inline_data = None
    for p in parts:
        a = p.get("inlineData") or p.get("inline_data")
        if a and a.get("data"):
            inline_data = a
            break

    if not inline_data or not inline_data.get("data"):
        raise RuntimeError("Gemini TTS returned no audio data.")

    raw_audio = base64.b64decode(inline_data["data"])
    if not raw_audio or len(raw_audio) < 32:
        raise RuntimeError("Gemini TTS returned empty audio.")

    # Check if already WAV/MP3 or raw PCM
    is_wav = len(raw_audio) > 12 and raw_audio[:4] == b"RIFF" and raw_audio[8:12] == b"WAVE"
    is_mp3 = len(raw_audio) > 3 and raw_audio[:3] == b"ID3"

    out_path = _unique_path("wav" if is_wav or not is_mp3 else "mp3")
    mime = "audio/wav"

    if is_wav or is_mp3:
        with open(out_path, "wb") as f:
            f.write(raw_audio)
        mime = "audio/wav" if is_wav else "audio/mpeg"
    else:
        # Raw PCM — wrap in WAV header
        wav_bytes = _pcm16_to_wav(raw_audio, sample_rate)
        with open(out_path, "wb") as f:
            f.write(wav_bytes)
        mime = "audio/wav"

    log_event("info", "gemini_tts_success", {"voice": voice_name, "bytes": len(raw_audio)})
    return TTSResult(path=out_path, mime_type=mime, engine="gemini_native_audio")
