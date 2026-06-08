"""
live/audio_processing.py
Server-side audio processing for AURA LIVE.
Handles PCM audio format conversion and buffering.
"""

import struct
import logging
import math

logger = logging.getLogger("aevra.audio")

# Audio format constants
SAMPLE_RATE_INPUT = 16000   # Mic input (PCM 16-bit)
SAMPLE_RATE_OUTPUT = 24000  # Gemini output (PCM 16-bit)
CHANNELS = 1
SAMPLE_WIDTH = 2  # 16-bit = 2 bytes


def calculate_rms(audio_bytes: bytes) -> float:
    """Calculate RMS (Root Mean Square) for VAD threshold detection."""
    if not audio_bytes or len(audio_bytes) < 2:
        return 0.0
    try:
        num_samples = len(audio_bytes) // SAMPLE_WIDTH
        if num_samples == 0:
            return 0.0
        samples = struct.unpack(f"<{num_samples}h", audio_bytes[:num_samples * SAMPLE_WIDTH])
        sum_squares = sum(s * s for s in samples)
        return math.sqrt(sum_squares / num_samples)
    except Exception:
        return 0.0


def is_speech(audio_bytes: bytes, threshold: float = 800) -> bool:
    """Simple VAD: check if audio chunk contains speech based on RMS."""
    rms = calculate_rms(audio_bytes)
    return rms > threshold


class AudioBuffer:
    """Circular buffer for audio chunks with silence detection."""

    def __init__(self, max_chunks: int = 100):
        self.chunks: list = []
        self.max_chunks = max_chunks
        self.total_bytes: int = 0

    def add(self, data: bytes):
        """Add a chunk to the buffer."""
        self.chunks.append(data)
        self.total_bytes += len(data)
        if len(self.chunks) > self.max_chunks:
            removed = self.chunks.pop(0)
            self.total_bytes -= len(removed)

    def clear(self):
        """Clear the buffer."""
        self.chunks.clear()
        self.total_bytes = 0

    def get_all(self) -> bytes:
        """Get all buffered audio as single bytes object."""
        return b"".join(self.chunks)

    @property
    def duration_ms(self) -> float:
        """Estimated duration in milliseconds."""
        if self.total_bytes == 0:
            return 0
        samples = self.total_bytes // SAMPLE_WIDTH
        return (samples / SAMPLE_RATE_INPUT) * 1000
