"""
live/live_context.py
Live Context Buffer — temporary session-scoped memory.
NOT stored in LUMEN. Preserved on Gemini failure, re-injected on restoration.
"""

import time
import uuid
import logging
from typing import Optional

logger = logging.getLogger("aevra.live_context")


class LiveContextBuffer:
    """
    Session-scoped temporary memory for AURA LIVE conversations.
    Survives Gemini failures and is re-injected on reconnection.
    Only Orchestrator-approved important information flows to LUMEN.
    """

    def __init__(self, user_id: str, session_id: Optional[str] = None):
        self.session_id = session_id or str(uuid.uuid4())
        self.user_id = user_id
        self.created_at = time.time()
        self.last_active = time.time()

        # Context state
        self.current_topic: str = ""
        self.current_goal: str = ""
        self.detected_objects: list = []
        self.current_scene: str = ""
        self.recent_commands: list = []  # Last 10 tool calls
        self.camera_active: bool = False

        # Conversation state
        self.turn_count: int = 0
        self.transcript: list = []  # [{role, content, timestamp}]
        self.fallback_count: int = 0
        self.gemini_health_state: str = "healthy"

        # Vision context (session only)
        self.last_vision_result: Optional[dict] = None
        self.vision_cache_hash: Optional[str] = None
        self.vision_cache_time: float = 0

    def update_from_tool(self, tool_name: str, result: dict):
        """Update context after a tool call execution."""
        self.recent_commands.append({
            "tool": tool_name,
            "timestamp": time.time(),
            "summary": str(result)[:200],
        })
        # Keep only last 10 commands
        if len(self.recent_commands) > 10:
            self.recent_commands = self.recent_commands[-10:]

        if tool_name == "analyze_vision" and isinstance(result, dict):
            self.last_vision_result = result
            self.detected_objects = result.get("objects", [])
            self.current_scene = result.get("scene", "")

    def add_turn(self, role: str, content: str):
        """Add a conversation turn."""
        self.turn_count += 1
        self.last_active = time.time()
        self.transcript.append({
            "role": role,
            "content": content[:500],  # Truncate to prevent memory bloat
            "timestamp": time.time(),
        })
        # Keep last 50 turns
        if len(self.transcript) > 50:
            self.transcript = self.transcript[-50:]

    def to_dict(self) -> dict:
        """Serialize context for Gemini awareness or storage."""
        return {
            "session_id": self.session_id,
            "user_id": self.user_id,
            "current_topic": self.current_topic,
            "current_goal": self.current_goal,
            "detected_objects": self.detected_objects,
            "current_scene": self.current_scene,
            "camera_active": self.camera_active,
            "turn_count": self.turn_count,
            "fallback_count": self.fallback_count,
            "gemini_health": self.gemini_health_state,
            "last_vision_result": self.last_vision_result,
            "recent_commands": self.recent_commands[-5:],  # Last 5 for Gemini
            "duration_seconds": int(time.time() - self.created_at),
        }

    def get_gemini_context_summary(self) -> str:
        """Build a brief context summary for Gemini's awareness."""
        parts = []
        if self.current_topic:
            parts.append(f"Current topic: {self.current_topic}")
        if self.current_goal:
            parts.append(f"Current goal: {self.current_goal}")
        if self.detected_objects:
            parts.append(f"Objects visible: {', '.join(self.detected_objects)}")
        if self.current_scene:
            parts.append(f"Scene: {self.current_scene}")
        if self.turn_count > 0:
            parts.append(f"Conversation turns: {self.turn_count}")
        if self.fallback_count > 0:
            parts.append(f"Fallbacks used: {self.fallback_count}")
        return "; ".join(parts) if parts else "Fresh session"

    def reset_vision_cache(self):
        """Clear vision cache on demand."""
        self.last_vision_result = None
        self.vision_cache_hash = None
        self.vision_cache_time = 0

    def get_duration(self) -> int:
        """Session duration in seconds."""
        return int(time.time() - self.created_at)
