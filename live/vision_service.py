"""
live/vision_service.py
Server-side structured vision processing for AURA AI.
No continuous streaming. On-demand capture only. No biometrics.
"""

import time
import hashlib
import logging
import json
from typing import Optional

logger = logging.getLogger("aevra.vision")

# Vision cache TTL in seconds
CACHE_TTL = 30


class VisionService:
    """
    Processes camera frames for object understanding, OCR, scene understanding.
    NO biometric features — no face recognition, identity tracking, or people storage.
    Uses perceptual hash cache to prevent redundant API calls.
    """

    def __init__(self, api_key: Optional[str] = None):
        self._api_key = api_key
        self._cache: dict = {}  # hash → {result, timestamp}

    def _get_api_key(self) -> Optional[str]:
        if self._api_key:
            return self._api_key
        from core.env_config import GEMINI_API_KEY
        return GEMINI_API_KEY

    def compute_frame_hash(self, image_base64: str) -> str:
        """Compute perceptual hash of frame for cache dedup.
        Uses a simple approach: hash of downsampled brightness grid (8x8).
        """
        try:
            import base64
            from io import BytesIO
            from PIL import Image

            img_data = base64.b64decode(image_base64)
            img = Image.open(BytesIO(img_data)).convert("L")  # Grayscale
            img = img.resize((8, 8), Image.LANCZOS)

            # Average brightness per pixel as hash
            pixels = list(img.getdata())
            avg = sum(pixels) / len(pixels) if pixels else 0
            bits = "".join("1" if p > avg else "0" for p in pixels)
            return hashlib.md5(bits.encode()).hexdigest()
        except Exception as e:
            # Fallback to simple hash of first 1000 bytes
            return hashlib.md5(image_base64[:1000].encode()).hexdigest()

    def _check_cache(self, frame_hash: str) -> Optional[dict]:
        """Check if this frame was recently analyzed."""
        if frame_hash in self._cache:
            entry = self._cache[frame_hash]
            if time.time() - entry["timestamp"] < CACHE_TTL:
                logger.info("Vision cache hit (within TTL)")
                return entry["result"]
            else:
                del self._cache[frame_hash]
        return None

    def _update_cache(self, frame_hash: str, result: dict):
        """Update cache with new result."""
        # Prune old entries
        now = time.time()
        expired = [k for k, v in self._cache.items() if now - v["timestamp"] > CACHE_TTL]
        for k in expired:
            del self._cache[k]

        self._cache[frame_hash] = {"result": result, "timestamp": now}

    async def analyze_frame(self, image_base64: str, live_context: Optional[dict] = None) -> dict:
        """
        Analyze a camera frame using Gemini Multimodal.
        Returns structured result: {objects, text_detected, scene, actions}
        NO biometric analysis — no faces, identity, or people tracking.
        """
        start_time = time.time()

        # Compute hash and check cache
        frame_hash = self.compute_frame_hash(image_base64)
        cached = self._check_cache(frame_hash)
        if cached:
            cached["cached"] = True
            return cached

        api_key = self._get_api_key()
        if not api_key:
            return {
                "objects": [],
                "text_detected": [],
                "scene": "unknown",
                "actions": [],
                "error": "Gemini API key not configured",
                "cached": False,
            }

        try:
            from google import genai
            from google.genai import types

            client = genai.Client(api_key=api_key)

            # Build the vision analysis prompt
            context_hint = ""
            if live_context and live_context.get("current_topic"):
                context_hint = f" The student is currently studying: {live_context['current_topic']}."

            prompt = (
                f"Analyze this image for a Grade 9 study assistant.{context_hint}\n"
                "Return a JSON object with these fields:\n"
                '- "objects": list of visible objects/items\n'
                '- "text_detected": list of readable text found in the image\n'
                '- "scene": brief description of the scene/setting\n'
                '- "actions": list of inferred activities\n'
                "Do NOT identify, name, or describe any people. No biometric analysis."
            )

            import base64
            image_bytes = base64.b64decode(image_base64)

            response = client.models.generate_content(
                model="gemini-2.0-flash",
                contents=[
                    types.Part.from_bytes(data=image_bytes, mime_type="image/jpeg"),
                    prompt,
                ],
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                ),
            )

            # Parse the JSON response
            text = response.text.strip()
            try:
                result = json.loads(text)
            except json.JSONDecodeError:
                # If not valid JSON, extract what we can
                result = {
                    "objects": [],
                    "text_detected": [],
                    "scene": text[:200],
                    "actions": [],
                }

            # Ensure all expected fields exist
            result.setdefault("objects", [])
            result.setdefault("text_detected", [])
            result.setdefault("scene", "")
            result.setdefault("actions", [])
            result["cached"] = False
            result["latency_ms"] = int((time.time() - start_time) * 1000)

            # Update cache
            self._update_cache(frame_hash, result)

            logger.info(f"Vision analysis: {len(result['objects'])} objects, "
                       f"{len(result['text_detected'])} text items, "
                       f"scene: {result['scene'][:50]}")
            return result

        except Exception as e:
            logger.error(f"Vision analysis failed: {e}")
            return {
                "objects": [],
                "text_detected": [],
                "scene": "analysis failed",
                "actions": [],
                "error": str(e),
                "cached": False,
                "latency_ms": int((time.time() - start_time) * 1000),
            }

    def get_cache_stats(self) -> dict:
        """Return cache statistics."""
        now = time.time()
        active = sum(1 for v in self._cache.values() if now - v["timestamp"] < CACHE_TTL)
        return {
            "total_entries": len(self._cache),
            "active_entries": active,
            "ttl_seconds": CACHE_TTL,
        }


# Singleton
_vision_service = VisionService()


def get_vision_service() -> VisionService:
    return _vision_service
