import base64
import math
import os
import shutil
import subprocess
import tempfile
import wave
from typing import List

import numpy as np


SAMPLE_RATE = 16000
EMBEDDING_SIZE = 26


def decode_audio_base64(value: str) -> bytes:
    raw = (value or "").strip()
    if "," in raw:
        raw = raw.split(",", 1)[1]
    return base64.b64decode(raw + "=" * ((4 - len(raw) % 4) % 4))


def convert_to_pcm16k(audio_bytes: bytes, suffix: str = ".webm") -> np.ndarray:
    """Convert common browser audio to mono float PCM at 16 kHz.

    Uses ffmpeg when available. If ffmpeg is unavailable or conversion fails,
    falls back to deterministic byte-domain features so the endpoint still
    responds without crashing.
    """
    if not audio_bytes:
        return np.zeros(SAMPLE_RATE, dtype=np.float32)

    ffmpeg = shutil.which("ffmpeg")
    if ffmpeg:
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as src:
            src.write(audio_bytes)
            src_path = src.name
        out_path = src_path + ".wav"
        try:
            subprocess.run(
                [ffmpeg, "-y", "-i", src_path, "-ac", "1", "-ar", str(SAMPLE_RATE), "-f", "wav", out_path],
                check=True,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                timeout=20,
            )
            with wave.open(out_path, "rb") as wf:
                frames = wf.readframes(wf.getnframes())
                pcm = np.frombuffer(frames, dtype=np.int16).astype(np.float32) / 32768.0
                return pcm if pcm.size else np.zeros(SAMPLE_RATE, dtype=np.float32)
        except Exception:
            pass
        finally:
            for path in (src_path, out_path):
                try:
                    os.remove(path)
                except Exception:
                    pass

    arr = np.frombuffer(audio_bytes, dtype=np.uint8).astype(np.float32)
    arr = (arr - 128.0) / 128.0
    if arr.size < SAMPLE_RATE:
        arr = np.pad(arr, (0, SAMPLE_RATE - arr.size))
    return arr


def extract_embedding(pcm: np.ndarray) -> List[float]:
    """Lightweight backend-only voice embedding from PCM statistics."""
    if pcm is None or pcm.size == 0:
        return [0.0] * EMBEDDING_SIZE
    signal = np.asarray(pcm, dtype=np.float32)
    signal = signal - float(np.mean(signal))
    std = float(np.std(signal)) or 1.0
    signal = signal / std
    chunks = np.array_split(signal, 13)
    means = [float(np.mean(chunk)) for chunk in chunks]
    variances = [float(np.var(chunk)) for chunk in chunks]
    return means + variances


def cosine_similarity(a: List[float], b: List[float]) -> float:
    aa = np.asarray(a, dtype=np.float64)
    bb = np.asarray(b, dtype=np.float64)
    if aa.size != bb.size or aa.size == 0:
        return 0.0
    denom = float(np.linalg.norm(aa) * np.linalg.norm(bb))
    return float(np.dot(aa, bb) / denom) if denom else 0.0
