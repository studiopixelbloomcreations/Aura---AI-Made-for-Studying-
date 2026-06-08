"""
services/voice_identity.py
Optional voice identity module — opt-in only.
Real audio embeddings only (no text-hash fakes). No identity tracking.
If user opts out, this module is completely bypassed.
"""

import logging
from typing import Optional

logger = logging.getLogger("aevra.voice_identity")


class VoiceIdentityService:
    """
    Opt-in voice identity verification using audio embeddings.
    - Stores audio embedding vectors only (no raw audio)
    - User must explicitly opt-in to enable
    - Opt-out completely removes all stored data
    - No identity tracking across sessions without explicit consent
    """

    def __init__(self):
        self._client = None

    def _get_client(self):
        if self._client is not None:
            return self._client
        from core.auth_middleware import get_supabase_client
        self._client = get_supabase_client()
        return self._client

    async def is_opted_in(self, user_id: str) -> bool:
        """Check if user has opted into voice identity."""
        client = self._get_client()
        if not client:
            return False
        try:
            result = client.table("user_notes").select("id").eq(
                "user_id", user_id
            ).eq("title", "__voice_identity_opt_in").limit(1).execute()
            return len(result.data or []) > 0
        except Exception:
            return False

    async def opt_in(self, user_id: str) -> dict:
        """Enable voice identity for this user."""
        client = self._get_client()
        if not client:
            return {"success": False, "error": "Database not available"}
        try:
            # Use a sentinel note to track opt-in status
            existing = client.table("user_notes").select("id").eq(
                "user_id", user_id
            ).eq("title", "__voice_identity_opt_in").limit(1).execute()

            if existing.data:
                return {"success": True, "message": "Already opted in"}

            client.table("user_notes").insert({
                "user_id": user_id,
                "title": "__voice_identity_opt_in",
                "content": "active",
                "tags": ["system", "voice_identity"],
            }).execute()

            logger.info(f"Voice identity opt-in for {user_id}")
            return {"success": True, "message": "Opted in to voice identity"}
        except Exception as e:
            logger.error(f"Voice identity opt-in failed: {e}")
            return {"success": False, "error": str(e)}

    async def opt_out(self, user_id: str) -> dict:
        """Disable voice identity and delete all stored data."""
        client = self._get_client()
        if not client:
            return {"success": False, "error": "Database not available"}
        try:
            # Delete opt-in flag
            client.table("user_notes").delete().eq(
                "user_id", user_id
            ).eq("title", "__voice_identity_opt_in").execute()

            # Delete any stored voice embeddings
            client.table("user_notes").delete().eq(
                "user_id", user_id
            ).eq("title", "__voice_embedding").execute()

            logger.info(f"Voice identity opt-out + data purge for {user_id}")
            return {"success": True, "message": "Opted out, all voice data deleted"}
        except Exception as e:
            logger.error(f"Voice identity opt-out failed: {e}")
            return {"success": False, "error": str(e)}

    async def store_embedding(self, user_id: str, embedding: list, metadata: Optional[dict] = None) -> dict:
        """Store a voice embedding vector (only if opted in)."""
        opted_in = await self.is_opted_in(user_id)
        if not opted_in:
            return {"success": False, "error": "User has not opted in"}

        client = self._get_client()
        if not client:
            return {"success": False, "error": "Database not available"}

        try:
            import json
            client.table("user_notes").insert({
                "user_id": user_id,
                "title": "__voice_embedding",
                "content": json.dumps({
                    "embedding": embedding,
                    "metadata": metadata or {},
                    "dimensions": len(embedding),
                }),
                "tags": ["system", "voice_embedding"],
            }).execute()

            logger.info(f"Voice embedding stored for {user_id} (dim={len(embedding)})")
            return {"success": True, "dimensions": len(embedding)}
        except Exception as e:
            logger.error(f"Voice embedding store failed: {e}")
            return {"success": False, "error": str(e)}

    async def verify_voice(self, user_id: str, embedding: list, threshold: float = 0.85) -> dict:
        """
        Verify a voice embedding against stored embeddings.
        Returns match confidence. Only works if user is opted in.
        """
        opted_in = await self.is_opted_in(user_id)
        if not opted_in:
            return {"verified": False, "error": "User has not opted in"}

        client = self._get_client()
        if not client:
            return {"verified": False, "error": "Database not available"}

        try:
            import json
            result = client.table("user_notes").select("content").eq(
                "user_id", user_id
            ).eq("title", "__voice_embedding").order("created_at", desc=True).limit(5).execute()

            if not result.data:
                return {"verified": False, "confidence": 0, "error": "No stored embeddings"}

            # Compare against stored embeddings (cosine similarity)
            max_similarity = 0
            for row in result.data:
                stored = json.loads(row["content"])
                stored_emb = stored.get("embedding", [])
                if len(stored_emb) != len(embedding):
                    continue
                similarity = _cosine_similarity(embedding, stored_emb)
                max_similarity = max(max_similarity, similarity)

            verified = max_similarity >= threshold
            return {
                "verified": verified,
                "confidence": round(max_similarity, 4),
                "threshold": threshold,
            }
        except Exception as e:
            logger.error(f"Voice verification failed: {e}")
            return {"verified": False, "error": str(e)}


def _cosine_similarity(a: list, b: list) -> float:
    """Compute cosine similarity between two vectors."""
    if len(a) != len(b) or len(a) == 0:
        return 0.0

    dot = sum(x * y for x, y in zip(a, b))
    mag_a = sum(x * x for x in a) ** 0.5
    mag_b = sum(x * x for x in b) ** 0.5

    if mag_a == 0 or mag_b == 0:
        return 0.0
    return dot / (mag_a * mag_b)


# Singleton
_voice_identity = VoiceIdentityService()


def get_voice_identity() -> VoiceIdentityService:
    return _voice_identity
