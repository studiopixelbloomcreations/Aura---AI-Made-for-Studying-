"""
services/evolution_service.py
Evolution Engine migrated from Netlify to FastAPI.
Persistent runtime using Supabase. Mode: fastapi_persistent_runtime.
"""

import time
import logging
from typing import Optional
from datetime import date

logger = logging.getLogger("aevra.evolution")


class EvolutionService:
    """
    Persistent evolution engine for AURA AI.
    Replaces the old Netlify-based in-memory evolution runtime.
    All data persists to Supabase.
    """

    RUNTIME_MODE = "fastapi_persistent_runtime"

    def __init__(self):
        self._client = None

    def _get_client(self):
        if self._client is not None:
            return self._client
        from core.auth_middleware import get_supabase_client
        self._client = get_supabase_client()
        return self._client

    async def record_experience(
        self,
        user_id: str,
        trigger_type: str,
        trigger_data: dict,
        response: dict,
        outcome: Optional[str] = None,
        score: float = 0,
        metadata: Optional[dict] = None,
    ) -> dict:
        """Record an evolution experience to Supabase."""
        client = self._get_client()
        if not client:
            return {"success": False, "error": "Database not available"}

        try:
            result = client.table("evolution_experiences").insert({
                "user_id": user_id,
                "trigger_type": trigger_type,
                "trigger_data": trigger_data,
                "response": response,
                "outcome": outcome,
                "score": score,
                "metadata": metadata or {},
            }).execute()

            if result.data:
                logger.info(f"Evolution experience recorded for {user_id}: {trigger_type}")
                return {"success": True, "id": result.data[0]["id"]}
            return {"success": False, "error": "No data returned"}
        except Exception as e:
            logger.error(f"Evolution record failed: {e}")
            return {"success": False, "error": str(e)}

    async def get_experiences(self, user_id: str, limit: int = 20, trigger_type: Optional[str] = None) -> list:
        """Get recent evolution experiences."""
        client = self._get_client()
        if not client:
            return []

        try:
            query = client.table("evolution_experiences").select("*").eq("user_id", user_id)
            if trigger_type:
                query = query.eq("trigger_type", trigger_type)
            result = query.order("created_at", desc=True).limit(limit).execute()
            return result.data or []
        except Exception as e:
            logger.error(f"Evolution fetch failed: {e}")
            return []

    async def get_score_cards(self, user_id: str) -> list:
        """Get evolution score cards for a user."""
        client = self._get_client()
        if not client:
            return []

        try:
            result = (
                client.table("evolution_score_cards")
                .select("*")
                .eq("user_id", user_id)
                .order("updated_at", desc=True)
                .execute()
            )
            return result.data or []
        except Exception as e:
            logger.error(f"Score cards fetch failed: {e}")
            return []

    async def update_score_card(
        self,
        user_id: str,
        dimension: str,
        score: float,
        weight: float = 1.0,
        trend: str = "stable",
        metadata: Optional[dict] = None,
    ) -> dict:
        """Update or create a score card dimension."""
        client = self._get_client()
        if not client:
            return {"success": False, "error": "Database not available"}

        try:
            # Check if exists
            existing = (
                client.table("evolution_score_cards")
                .select("id")
                .eq("user_id", user_id)
                .eq("dimension", dimension)
                .execute()
            )

            if existing.data:
                # Update
                client.table("evolution_score_cards").update({
                    "score": score,
                    "weight": weight,
                    "trend": trend,
                    "metadata": metadata or {},
                    "updated_at": "now()",
                }).eq("id", existing.data[0]["id"]).execute()
            else:
                # Insert
                client.table("evolution_score_cards").insert({
                    "user_id": user_id,
                    "dimension": dimension,
                    "score": score,
                    "weight": weight,
                    "trend": trend,
                    "metadata": metadata or {},
                }).execute()

            return {"success": True}
        except Exception as e:
            logger.error(f"Score card update failed: {e}")
            return {"success": False, "error": str(e)}

    async def evolve_from_interaction(
        self,
        user_id: str,
        interaction_type: str,
        quality_score: float,
        context: Optional[dict] = None,
    ) -> dict:
        """
        Process an interaction and evolve the system.
        Records experience and updates relevant score cards.
        """
        # Record the experience
        exp_result = await self.record_experience(
            user_id=user_id,
            trigger_type=interaction_type,
            trigger_data=context or {},
            response={"quality_score": quality_score},
            outcome="positive" if quality_score > 0.5 else "neutral",
            score=quality_score,
        )

        if not exp_result.get("success"):
            return exp_result

        # Update relevant score cards
        dimensions_to_update = []

        if interaction_type == "chat":
            dimensions_to_update.append("conversation_quality")
        elif interaction_type == "live":
            dimensions_to_update.append("live_engagement")
        elif interaction_type == "vision":
            dimensions_to_update.append("vision_accuracy")

        for dim in dimensions_to_update:
            # Get current score and apply EMA (Exponential Moving Average)
            current_scores = await self.get_score_cards(user_id)
            current = next((s for s in current_scores if s["dimension"] == dim), None)
            current_score = float(current["score"]) if current else 0.5
            alpha = 0.3  # EMA smoothing factor
            new_score = alpha * quality_score + (1 - alpha) * current_score

            trend = "improving" if new_score > current_score + 0.05 else \
                    "declining" if new_score < current_score - 0.05 else "stable"

            await self.update_score_card(
                user_id=user_id,
                dimension=dim,
                score=round(new_score, 4),
                trend=trend,
            )

        return {"success": True, "dimensions_updated": dimensions_to_update}

    async def get_evolution_status(self, user_id: str) -> dict:
        """Get complete evolution status for a user."""
        experiences = await self.get_experiences(user_id, limit=10)
        score_cards = await self.get_score_cards(user_id)

        return {
            "runtime_mode": self.RUNTIME_MODE,
            "total_experiences": len(experiences),
            "recent_experiences": experiences[:5],
            "score_cards": score_cards,
            "last_evolution": experiences[0]["created_at"] if experiences else None,
        }


# Singleton
_evolution_service = EvolutionService()


def get_evolution_service() -> EvolutionService:
    return _evolution_service
