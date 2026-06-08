"""
live/observability.py
Observability system for AURA AI.
Tracks: WebSocket health, Gemini latency, tool failures, model latency, errors,
session metrics, vision cache hits, audio quality, fallback events.
"""

import time
import logging
from typing import Optional
from collections import defaultdict

logger = logging.getLogger("aevra.observability")


class ObservabilitySystem:
    """Centralized metrics collection for AURA AI."""

    def __init__(self):
        self._metrics: dict = defaultdict(lambda: {"count": 0, "total": 0, "errors": 0})
        self._events: list = []
        self._max_events = 1000  # Keep last 1000 events in memory
        self._session_start = time.time()

    def log_tool_call(self, tool_name: str, result: dict, latency_ms: int, call_id: str = ""):
        """Log a tool call execution."""
        metric_key = f"tool:{tool_name}"
        self._metrics[metric_key]["count"] += 1
        self._metrics[metric_key]["total"] += latency_ms
        if "error" in result:
            self._metrics[metric_key]["errors"] += 1

        self._add_event("tool_call", {
            "tool": tool_name,
            "latency_ms": latency_ms,
            "call_id": call_id,
            "success": "error" not in result,
        })

    def log_gemini_latency(self, latency_ms: int):
        """Log Gemini response latency."""
        self._metrics["gemini:latency"]["count"] += 1
        self._metrics["gemini:latency"]["total"] += latency_ms

    def log_model_call(self, model_name: str, latency_ms: int, success: bool, tokens_used: int = 0):
        """Log a model API call."""
        key = f"model:{model_name}"
        self._metrics[key]["count"] += 1
        self._metrics[key]["total"] += latency_ms
        if not success:
            self._metrics[key]["errors"] += 1

        self._add_event("model_call", {
            "model": model_name,
            "latency_ms": latency_ms,
            "success": success,
            "tokens": tokens_used,
        })

    def log_error(self, error: str, source: str = "unknown", severity: str = "error"):
        """Log an error event."""
        self._metrics["errors"]["count"] += 1
        self._add_event("error", {
            "error": error[:500],
            "source": source,
            "severity": severity,
        }, severity=severity)
        logger.error(f"[Observability] {source}: {error[:200]}")

    def log_fallback_event(self, event_type: str, reason: str = ""):
        """Log a fallback activation or restoration."""
        self._metrics[f"fallback:{event_type}"]["count"] += 1
        self._add_event("fallback", {
            "type": event_type,
            "reason": reason,
        })

    def log_vision_cache(self, cached: bool):
        """Log a vision cache hit or miss."""
        if cached:
            self._metrics["vision:cache_hit"]["count"] += 1
        else:
            self._metrics["vision:cache_miss"]["count"] += 1

    def log_websocket_event(self, event_type: str, details: Optional[dict] = None):
        """Log WebSocket connection events."""
        self._metrics[f"ws:{event_type}"]["count"] += 1
        self._add_event("websocket", {
            "event": event_type,
            **(details or {}),
        })

    def log_session_end(self, user_id: str, session_data: dict):
        """Log session completion metrics."""
        self._add_event("session_end", {
            "user_id": user_id,
            **session_data,
        })

    def get_summary(self, days: int = 7) -> dict:
        """Get aggregated metrics summary."""
        summary = {}
        for key, data in self._metrics.items():
            count = data["count"]
            total = data["total"]
            avg_ms = total / count if count > 0 else 0
            summary[key] = {
                "count": count,
                "avg_ms": round(avg_ms, 1),
                "errors": data["errors"],
            }

        # Add uptime
        summary["system"] = {
            "uptime_seconds": int(time.time() - self._session_start),
            "events_logged": len(self._events),
        }

        return summary

    def get_recent_events(self, limit: int = 50) -> list:
        """Get most recent events."""
        return self._events[-limit:]

    async def flush_to_supabase(self, user_id: str, session_id: Optional[str] = None):
        """Persist metrics to Supabase observability_logs table."""
        try:
            from core.auth_middleware import get_supabase_client
            client = get_supabase_client()
            if not client:
                return

            # Batch insert events
            records = []
            for event in self._events:
                records.append({
                    "user_id": user_id,
                    "event_type": event["type"],
                    "payload": event.get("data", {}),
                    "severity": event.get("severity", "info"),
                    "session_id": session_id,
                })

            if records:
                # Insert in batches of 100
                for i in range(0, len(records), 100):
                    batch = records[i:i + 100]
                    client.table("observability_logs").insert(batch).execute()

                logger.info(f"Flushed {len(records)} observability events to Supabase")
                self._events.clear()

        except Exception as e:
            logger.error(f"Observability flush failed: {e}")

    def _add_event(self, event_type: str, data: dict, severity: str = "info"):
        """Add an event to the in-memory log."""
        self._events.append({
            "type": event_type,
            "data": data,
            "severity": severity,
            "timestamp": time.time(),
        })
        # Prune old events
        if len(self._events) > self._max_events:
            self._events = self._events[-self._max_events:]


# Singleton
_observability = ObservabilitySystem()


def get_observability() -> ObservabilitySystem:
    return _observability
