"""
live/memory_service.py
Server-side LUMEN memory access for AURA LIVE.
All memory operations go through Supabase with service role key.
"""

import logging
from typing import Optional

logger = logging.getLogger("aevra.memory_service")


class MemoryService:
    """Handles LUMEN memory read/write via Supabase. Backend-only access."""

    def __init__(self):
        self._client = None

    def _get_client(self):
        if self._client is not None:
            return self._client
        from core.auth_middleware import get_supabase_client
        self._client = get_supabase_client()
        return self._client

    async def save_memory(
        self,
        user_id: str,
        category: str,
        key: str,
        value: str,
        importance: float = 0.5,
        tags: Optional[list] = None,
        source: str = "live",
    ) -> dict:
        """Save a memory to LUMEN (Supabase lumen_memories table)."""
        client = self._get_client()
        if not client:
            return {"success": False, "error": "Supabase not available"}

        try:
            result = client.table("lumen_memories").insert({
                "user_id": user_id,
                "category": category,
                "key": key,
                "value": value,
                "importance": importance,
                "tags": tags or [],
                "source": source,
            }).execute()

            if result.data:
                logger.info(f"Memory saved for {user_id}: {category}/{key}")
                return {"success": True, "id": result.data[0]["id"]}
            return {"success": False, "error": "No data returned"}
        except Exception as e:
            logger.error(f"Memory save failed: {e}")
            return {"success": False, "error": str(e)}

    async def search_memory(self, user_id: str, query: str, limit: int = 5) -> list:
        """Search memories by relevance (keyword match + importance)."""
        client = self._get_client()
        if not client:
            return []

        try:
            # Keyword-based search (upgrade to vector search later)
            search_terms = query.lower().split()
            or_conditions = " OR ".join([f"value.ilike.%{term}%" for term in search_terms])

            result = (
                client.table("lumen_memories")
                .select("id, category, key, value, importance, tags")
                .eq("user_id", user_id)
                .or_(or_conditions)
                .order("importance", desc=True)
                .limit(limit)
                .execute()
            )

            memories = result.data or []

            # Update access counts
            for mem in memories:
                try:
                    client.table("lumen_memories").update({
                        "access_count": mem.get("access_count", 0) + 1,
                        "accessed_at": "now()",
                    }).eq("id", mem["id"]).execute()
                except Exception:
                    pass  # Non-critical

            return memories
        except Exception as e:
            logger.error(f"Memory search failed: {e}")
            return []

    async def get_top_memories(self, user_id: str, limit: int = 5) -> list:
        """Get most important memories for prompt injection."""
        client = self._get_client()
        if not client:
            return []

        try:
            result = (
                client.table("lumen_memories")
                .select("category, key, value, importance")
                .eq("user_id", user_id)
                .order("importance", desc=True)
                .limit(limit)
                .execute()
            )
            return result.data or []
        except Exception as e:
            logger.error(f"Top memories fetch failed: {e}")
            return []

    def format_memories_for_prompt(self, memories: list) -> str:
        """Format memories into a prompt-friendly string."""
        if not memories:
            return ""
        lines = []
        for mem in memories:
            cat = mem.get("category", "general")
            key = mem.get("key", "")
            val = mem.get("value", "")
            lines.append(f"- [{cat}] {key}: {val}")
        return "\n".join(lines)


# Singleton
_memory_service = MemoryService()


def get_memory_service() -> MemoryService:
    return _memory_service
