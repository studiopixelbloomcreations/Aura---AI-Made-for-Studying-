"""
live/usage_manager.py
Usage and cost control for AURA AI.
Enforces daily cost ceilings, rate limits, and usage tracking via Supabase.
"""

import time
import logging
from datetime import date, timedelta
from typing import Optional

logger = logging.getLogger("aevra.usage")


class UsageManager:
    """
    Tracks and enforces cost/rate limits per user.
    All persistent data in Supabase usage_metrics table.
    """

    def __init__(self):
        # In-memory cache: {user_id: {date: cost_usd}}
        self._daily_cache: dict = {}
        self._cache_ttl = 300  # 5 minutes

    def _get_client(self):
        from core.auth_middleware import get_supabase_client
        return get_supabase_client()

    async def check_budget(self, user_id: str, estimated_cost: float = 0) -> bool:
        """Check if user can afford this action within daily ceiling."""
        from core.env_config import DAILY_COST_CEILING_USD

        current = await self.get_daily_cost(user_id)
        allowed = current + estimated_cost <= DAILY_COST_CEILING_USD

        if not allowed:
            logger.warning(f"Budget check failed for {user_id}: "
                         f"${current:.4f} + ${estimated_cost:.4f} > ${DAILY_COST_CEILING_USD}")
        return allowed

    async def get_daily_cost(self, user_id: str) -> float:
        """Get user's current daily cost from cache or Supabase."""
        today = date.today().isoformat()

        # Check in-memory cache
        if user_id in self._daily_cache:
            cached = self._daily_cache[user_id]
            if cached.get("date") == today and time.time() - cached.get("fetched_at", 0) < self._cache_ttl:
                return cached.get("cost", 0)

        # Fetch from Supabase
        client = self._get_client()
        if not client:
            return 0

        try:
            result = (
                client.table("usage_metrics")
                .select("metric_value")
                .eq("user_id", user_id)
                .eq("metric_type", "cost")
                .eq("metric_key", "daily_total")
                .eq("period_start", today)
                .execute()
            )

            cost = 0
            if result.data:
                cost = float(result.data[0].get("metric_value", 0))

            # Update cache
            self._daily_cache[user_id] = {
                "date": today,
                "cost": cost,
                "fetched_at": time.time(),
            }

            return cost
        except Exception as e:
            logger.error(f"Daily cost fetch failed: {e}")
            return 0

    async def record_cost(self, user_id: str, cost_usd: float, metric_key: str = "daily_total"):
        """Record a cost event to Supabase."""
        client = self._get_client()
        if not client or cost_usd <= 0:
            return

        today = date.today().isoformat()

        try:
            # Upsert: update existing or insert new
            existing = (
                client.table("usage_metrics")
                .select("id, metric_value")
                .eq("user_id", user_id)
                .eq("metric_type", "cost")
                .eq("metric_key", metric_key)
                .eq("period_start", today)
                .execute()
            )

            if existing.data:
                new_value = float(existing.data[0]["metric_value"]) + cost_usd
                client.table("usage_metrics").update({
                    "metric_value": new_value,
                    "updated_at": "now()",
                }).eq("id", existing.data[0]["id"]).execute()
            else:
                client.table("usage_metrics").insert({
                    "user_id": user_id,
                    "metric_type": "cost",
                    "metric_key": metric_key,
                    "metric_value": cost_usd,
                    "period": "daily",
                    "period_start": today,
                }).execute()

            # Invalidate cache
            if user_id in self._daily_cache:
                del self._daily_cache[user_id]

            logger.info(f"Cost recorded: {user_id} +${cost_usd:.4f} ({metric_key})")
        except Exception as e:
            logger.error(f"Cost record failed: {e}")

    async def record_usage(self, user_id: str, metric_type: str, metric_key: str, value: float):
        """Record a generic usage metric."""
        client = self._get_client()
        if not client:
            return

        today = date.today().isoformat()
        try:
            client.table("usage_metrics").insert({
                "user_id": user_id,
                "metric_type": metric_type,
                "metric_key": metric_key,
                "metric_value": value,
                "period": "daily",
                "period_start": today,
            }).execute()
        except Exception as e:
            logger.error(f"Usage record failed: {e}")

    async def get_usage_summary(self, user_id: str, days: int = 7) -> dict:
        """Get usage summary for a user over the past N days."""
        client = self._get_client()
        if not client:
            return {"error": "Supabase not available"}

        start_date = (date.today() - timedelta(days=days)).isoformat()
        try:
            result = (
                client.table("usage_metrics")
                .select("metric_type, metric_key, metric_value, period_start")
                .eq("user_id", user_id)
                .gte("period_start", start_date)
                .order("period_start", desc=True)
                .limit(100)
                .execute()
            )

            records = result.data or []
            total_cost = sum(float(r["metric_value"]) for r in records if r["metric_type"] == "cost")

            return {
                "user_id": user_id,
                "days": days,
                "total_cost_usd": round(total_cost, 4),
                "records": len(records),
                "by_type": self._group_by_type(records),
            }
        except Exception as e:
            return {"error": str(e)}

    def _group_by_type(self, records: list) -> dict:
        """Group records by metric_type."""
        groups = {}
        for r in records:
            key = r.get("metric_type", "unknown")
            if key not in groups:
                groups[key] = {"count": 0, "total": 0}
            groups[key]["count"] += 1
            groups[key]["total"] += float(r.get("metric_value", 0))
        return groups


# Singleton
_usage_manager = UsageManager()


def get_usage_manager() -> UsageManager:
    return _usage_manager
