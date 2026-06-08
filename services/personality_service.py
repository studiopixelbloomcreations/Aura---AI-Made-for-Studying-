"""
services/personality_service.py
Personality engine — EMA-based adaptation from user feedback.
Feedback buttons (thumbs up/down) adjust personality weights over time.
"""

import logging
from typing import Optional

logger = logging.getLogger("aevra.personality")

# Default personality dimensions
DEFAULT_DIMENSIONS = {
    "warmth": 0.7,
    "formality": 0.4,
    "verbosity": 0.5,
    "encouragement": 0.8,
    "technical_depth": 0.5,
    "humor": 0.3,
}

# EMA smoothing factor — higher = more reactive to recent feedback
EMA_ALPHA = 0.15


class PersonalityService:
    """
    Adapts AURA's personality based on user feedback over time.
    Uses Exponential Moving Average (EMA) to smooth feedback signals.
    """

    def __init__(self):
        self._client = None

    def _get_client(self):
        if self._client is not None:
            return self._client
        from core.auth_middleware import get_supabase_client
        self._client = get_supabase_client()
        return self._client

    async def get_personality(self, user_id: str) -> dict:
        """Get current personality weights for a user."""
        client = self._get_client()
        if not client:
            return dict(DEFAULT_DIMENSIONS)

        try:
            result = client.table("evolution_score_cards").select(
                "dimension, score"
            ).eq("user_id", user_id).eq("trend", "personality").execute()

            if not result.data:
                return dict(DEFAULT_DIMENSIONS)

            personality = dict(DEFAULT_DIMENSIONS)
            for row in result.data:
                dim = row["dimension"]
                if dim in personality:
                    personality[dim] = float(row["score"])
            return personality
        except Exception as e:
            logger.error(f"Personality fetch failed: {e}")
            return dict(DEFAULT_DIMENSIONS)

    async def record_feedback(
        self,
        user_id: str,
        dimension: str,
        positive: bool,
        context: Optional[dict] = None,
    ) -> dict:
        """
        Record user feedback (thumbs up/down) and update personality via EMA.
        positive=True nudges dimension up, positive=False nudges it down.
        """
        if dimension not in DEFAULT_DIMENSIONS:
            return {"success": False, "error": f"Unknown dimension: {dimension}"}

        client = self._get_client()
        if not client:
            return {"success": False, "error": "Database not available"}

        try:
            # Get current value
            current = await self.get_personality(user_id)
            current_val = current.get(dimension, DEFAULT_DIMENSIONS[dimension])

            # EMA update: positive feedback → +0.1, negative → -0.1
            signal = 0.1 if positive else -0.1
            target = max(0, min(1, current_val + signal))
            new_val = EMA_ALPHA * target + (1 - EMA_ALPHA) * current_val
            new_val = round(max(0, min(1, new_val)), 4)

            # Upsert to evolution_score_cards with trend="personality"
            existing = client.table("evolution_score_cards").select("id").eq(
                "user_id", user_id
            ).eq("dimension", dimension).eq("trend", "personality").limit(1).execute()

            if existing.data:
                client.table("evolution_score_cards").update({
                    "score": new_val,
                    "updated_at": "now()",
                }).eq("id", existing.data[0]["id"]).execute()
            else:
                client.table("evolution_score_cards").insert({
                    "user_id": user_id,
                    "dimension": dimension,
                    "score": new_val,
                    "trend": "personality",
                    "metadata": {"feedback_count": 1},
                }).execute()

            # Record the feedback event
            client.table("evolution_experiences").insert({
                "user_id": user_id,
                "trigger_type": "personality_feedback",
                "trigger_data": {
                    "dimension": dimension,
                    "positive": positive,
                    "old_value": current_val,
                    "new_value": new_val,
                    "context": context or {},
                },
                "response": {"dimension": dimension, "value": new_val},
                "score": 1 if positive else -1,
            }).execute()

            logger.info(f"Personality feedback: {user_id} {dimension} {'+' if positive else '-'} → {new_val}")
            return {
                "success": True,
                "dimension": dimension,
                "old_value": current_val,
                "new_value": new_val,
            }
        except Exception as e:
            logger.error(f"Personality feedback failed: {e}")
            return {"success": False, "error": str(e)}

    def get_personality_prompt(self, personality: dict) -> str:
        """Convert personality weights into a prompt section."""
        lines = []
        if personality.get("warmth", 0.5) > 0.7:
            lines.append("Be especially warm and friendly.")
        elif personality.get("warmth", 0.5) < 0.3:
            lines.append("Keep a more neutral, professional tone.")

        if personality.get("formality", 0.5) > 0.7:
            lines.append("Use more formal, structured language.")
        elif personality.get("formality", 0.5) < 0.3:
            lines.append("Be casual and conversational.")

        if personality.get("verbosity", 0.5) > 0.7:
            lines.append("Provide detailed, thorough explanations.")
        elif personality.get("verbosity", 0.5) < 0.3:
            lines.append("Keep responses brief and to the point.")

        if personality.get("encouragement", 0.5) > 0.7:
            lines.append("Be highly encouraging and motivating.")

        if personality.get("technical_depth", 0.5) > 0.7:
            lines.append("Include technical details and deeper analysis.")
        elif personality.get("technical_depth", 0.5) < 0.3:
            lines.append("Simplify technical concepts, avoid jargon.")

        if personality.get("humor", 0.5) > 0.7:
            lines.append("Use light humor and playful analogies when appropriate.")

        return "\n".join(lines) if lines else ""


# Singleton
_personality_service = PersonalityService()


def get_personality_service() -> PersonalityService:
    return _personality_service
