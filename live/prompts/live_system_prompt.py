"""
live/prompts/live_system_prompt.py
Centralized prompt management for AURA AI.
Prompts are NOT hardcoded inside servers — this module assembles all prompts.

Prompt composition order:
1. AURA Identity (from aura_identity.py)
2. User Preferences (from LUMEN + Personalization Engine)
3. LUMEN Context (top-5 relevant memories)
4. Live Context (current session state)
5. Safety Rules (hardcoded guardrails)
6. Prompt version tag (for A/B testing)
"""

import logging
from typing import Optional

logger = logging.getLogger("aevra.prompts")

# Prompt version for A/B testing
PROMPT_VERSION = "1.0.0"

# Tool definitions for Gemini Live
GEMINI_LIVE_TOOLS = [
    {
        "function_declarations": [
            {
                "name": "harmony_deep_reason",
                "description": "Request deep multi-model reasoning from the Harmony council. Use for complex math, science, or analytical questions that need step-by-step analysis.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "question": {
                            "type": "string",
                            "description": "The question or problem to analyze deeply"
                        }
                    },
                    "required": ["question"]
                }
            },
            {
                "name": "save_to_memory",
                "description": "Save important information to long-term memory (LUMEN). Only use for genuinely important facts the student would want to recall later.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "category": {
                            "type": "string",
                            "description": "Memory category: 'fact', 'preference', 'goal', 'progress', 'note'"
                        },
                        "key": {
                            "type": "string",
                            "description": "Short identifier for this memory"
                        },
                        "value": {
                            "type": "string",
                            "description": "The actual information to remember"
                        },
                        "importance": {
                            "type": "number",
                            "description": "Importance from 0.0 to 1.0. Use 0.8+ for truly important items."
                        }
                    },
                    "required": ["category", "key", "value", "importance"]
                }
            },
            {
                "name": "search_memory",
                "description": "Search long-term memory (LUMEN) for previously saved information.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "query": {
                            "type": "string",
                            "description": "What to search for in memory"
                        }
                    },
                    "required": ["query"]
                }
            },
            {
                "name": "create_note",
                "description": "Create a study note for the student.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "title": {
                            "type": "string",
                            "description": "Note title"
                        },
                        "content": {
                            "type": "string",
                            "description": "Note content in markdown"
                        }
                    },
                    "required": ["title", "content"]
                }
            },
            {
                "name": "analyze_vision",
                "description": "Analyze what the camera sees. Describe what you want to understand about the visual input.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "description": {
                            "type": "string",
                            "description": "What to look for or understand from the camera"
                        }
                    },
                    "required": ["description"]
                }
            },
            {
                "name": "get_live_context",
                "description": "Get the current live session context including topic, objects visible, and session state.",
                "parameters": {
                    "type": "object",
                    "properties": {}
                }
            }
        ]
    }
]


class LiveSystemPromptBuilder:
    """Assembles system prompts for all AURA AI modes."""

    def build_live_prompt(
        self,
        identity_prompt: str,
        user_prefs: Optional[dict] = None,
        lumen_context: Optional[str] = None,
        live_context_summary: str = "",
        safety_rules: Optional[str] = None,
    ) -> str:
        """Assemble the complete system instruction for Gemini Live."""
        parts = [identity_prompt]

        if user_prefs:
            prefs_text = self._format_user_prefs(user_prefs)
            if prefs_text:
                parts.append(f"## User Preferences\n{prefs_text}")

        if lumen_context:
            parts.append(f"## Relevant Memories\n{lumen_context}")

        if live_context_summary and live_context_summary != "Fresh session":
            parts.append(f"## Current Session Context\n{live_context_summary}")

        if safety_rules:
            parts.append(f"## Additional Safety\n{safety_rules}")

        parts.append(f"## Available Tools\n"
                     "You have access to tools for memory, deep reasoning, notes, and vision. "
                     "Use them when appropriate. The orchestrator will validate all tool calls.")

        parts.append(f"[prompt_version:{PROMPT_VERSION}]")

        return "\n\n".join(parts)

    def build_fallback_prompt(
        self,
        identity_prompt: str,
        user_prefs: Optional[dict] = None,
    ) -> str:
        """System prompt for Harmony/text fallback mode when Gemini is unavailable."""
        parts = [
            identity_prompt,
            "IMPORTANT: You are currently in enhanced text mode. Gemini Live is temporarily unavailable.",
            "Provide thorough text-based responses. You don't have access to live audio or vision tools.",
        ]

        if user_prefs:
            prefs_text = self._format_user_prefs(user_prefs)
            if prefs_text:
                parts.append(f"## User Preferences\n{prefs_text}")

        parts.append(f"[prompt_version:{PROMPT_VERSION}|mode:fallback]")
        return "\n\n".join(parts)

    def build_text_chat_prompt(
        self,
        identity_prompt: str,
        user_prefs: Optional[dict] = None,
        ncs_context: Optional[str] = None,
    ) -> str:
        """System prompt for standard text chat pipeline (/ask endpoint)."""
        parts = [identity_prompt]

        if user_prefs:
            prefs_text = self._format_user_prefs(user_prefs)
            if prefs_text:
                parts.append(f"## User Preferences\n{prefs_text}")

        if ncs_context:
            parts.append(f"## Context from NCS\n{ncs_context}")

        parts.append(f"[prompt_version:{PROMPT_VERSION}|mode:text]")
        return "\n\n".join(parts)

    def _format_user_prefs(self, prefs: dict) -> str:
        """Format user preferences into a prompt string."""
        parts = []
        if prefs.get("tone"):
            parts.append(f"- Preferred tone: {prefs['tone']}")
        if prefs.get("verbosity"):
            parts.append(f"- Response length: {prefs['verbosity']}")
        if prefs.get("language"):
            parts.append(f"- Preferred language: {prefs['language']}")
        if prefs.get("subjects"):
            subjects = prefs["subjects"]
            if isinstance(subjects, list):
                parts.append(f"- Focus subjects: {', '.join(subjects)}")
        if prefs.get("learning_style"):
            parts.append(f"- Learning style: {prefs['learning_style']}")
        return "\n".join(parts)


# Singleton builder
_prompt_builder = LiveSystemPromptBuilder()


def get_prompt_builder() -> LiveSystemPromptBuilder:
    return _prompt_builder
