"""
live/gemini_health.py
Gemini Live failure detection, fallback management, and auto-restore.
States: healthy | degraded | failed | reconnecting
"""

import time
import asyncio
import logging
from typing import Optional, Callable, Awaitable

logger = logging.getLogger("aevra.gemini_health")

# Health states
HEALTHY = "healthy"
DEGRADED = "degraded"
FAILED = "failed"
RECONNECTING = "reconnecting"


class GeminiHealthMonitor:
    """
    Monitors Gemini Live connection health.
    On failure: preserves context, switches to fallback, retries in background.
    On restore: re-injects context, seamlessly returns to Live mode.
    """

    def __init__(
        self,
        retry_interval: int = 30,
        max_retries: int = 10,
        timeout_seconds: int = 30,
    ):
        self.state: str = HEALTHY
        self.retry_interval = retry_interval
        self.max_retries = max_retries
        self.timeout_seconds = timeout_seconds
        self.retry_count: int = 0
        self.last_error: Optional[str] = None
        self.last_healthy_time: float = time.time()
        self.fallback_active: bool = False
        self._retry_task: Optional[asyncio.Task] = None

        # Callbacks
        self._on_fallback: Optional[Callable] = None
        self._on_restore: Optional[Callable] = None
        self._on_state_change: Optional[Callable] = None

    def set_callbacks(
        self,
        on_fallback: Optional[Callable] = None,
        on_restore: Optional[Callable] = None,
        on_state_change: Optional[Callable] = None,
    ):
        """Register callbacks for health events."""
        self._on_fallback = on_fallback
        self._on_restore = on_restore
        self._on_state_change = on_state_change

    async def set_state(self, new_state: str, error: Optional[str] = None):
        """Transition to a new health state."""
        old_state = self.state
        if new_state == old_state:
            return

        self.state = new_state
        self.last_error = error

        logger.info(f"Gemini health: {old_state} → {new_state}" + (f" ({error})" if error else ""))

        if self._on_state_change:
            try:
                result = self._on_state_change(old_state, new_state, error)
                if asyncio.iscoroutine(result):
                    await result
            except Exception as e:
                logger.error(f"State change callback error: {e}")

        if new_state in (FAILED, DEGRADED) and not self.fallback_active:
            self.fallback_active = True
            self.retry_count = 0
            if self._on_fallback:
                try:
                    result = self._on_fallback(error)
                    if asyncio.iscoroutine(result):
                        await result
                except Exception as e:
                    logger.error(f"Fallback callback error: {e}")
            # Start background retry
            self._start_retry_loop()

        elif new_state == HEALTHY and self.fallback_active:
            self.fallback_active = False
            self.last_healthy_time = time.time()
            self.retry_count = 0
            self._cancel_retry()
            if self._on_restore:
                try:
                    result = self._on_restore()
                    if asyncio.iscoroutine(result):
                        await result
                except Exception as e:
                    logger.error(f"Restore callback error: {e}")

    async def report_success(self):
        """Report a successful Gemini interaction."""
        self.last_healthy_time = time.time()
        if self.state != HEALTHY:
            await self.set_state(HEALTHY)

    async def report_error(self, error: str):
        """Report a Gemini interaction error."""
        if self.state == HEALTHY:
            await self.set_state(DEGRADED, error)
        elif self.state == DEGRADED:
            # Second failure → mark as failed
            await self.set_state(FAILED, error)

    async def report_timeout(self):
        """Report that Gemini didn't respond within timeout."""
        await self.report_error(f"Gemini timeout ({self.timeout_seconds}s)")

    def _start_retry_loop(self):
        """Start background retry task."""
        self._cancel_retry()
        try:
            loop = asyncio.get_event_loop()
            if loop.is_running():
                self._retry_task = asyncio.ensure_future(self._retry_loop())
        except Exception as e:
            logger.error(f"Failed to start retry loop: {e}")

    def _cancel_retry(self):
        """Cancel existing retry task."""
        if self._retry_task and not self._retry_task.done():
            self._retry_task.cancel()
            self._retry_task = None

    async def _retry_loop(self):
        """Background retry loop with exponential backoff."""
        while self.retry_count < self.max_retries and self.fallback_active:
            self.retry_count += 1
            backoff = min(self.retry_interval * (2 ** (self.retry_count - 1)), 300)
            logger.info(f"Gemini retry {self.retry_count}/{self.max_retries} in {backoff}s")

            await asyncio.sleep(backoff)

            if not self.fallback_active:
                break  # Already restored

            await self.set_state(RECONNECTING, f"Retry {self.retry_count}")

            # The actual reconnection is handled by the server
            # This just signals that a retry should be attempted

    def get_status(self) -> dict:
        """Return current health status."""
        return {
            "state": self.state,
            "fallback_active": self.fallback_active,
            "retry_count": self.retry_count,
            "max_retries": self.max_retries,
            "last_error": self.last_error,
            "uptime_seconds": int(time.time() - self.last_healthy_time) if self.state == HEALTHY else 0,
        }
