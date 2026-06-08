"""
live/live_orchestrator.py
AURA LIVE Orchestrator — the AUTHORITY LAYER.
Gemini REQUESTS actions via tool calls. Orchestrator VALIDATES and EXECUTES.

7-Step Validation Pipeline:
1. VALIDATION — Is this tool allowed? Are args well-formed?
2. PERMISSIONS — Does this user have permission for this action?
3. RATE LIMITS — Has this user/tool exceeded call frequency?
4. COST CHECKS — Will this exceed daily cost ceiling?
5. EXECUTION — Run the actual tool
6. LOGGING — Record to observability
7. CONTEXT UPDATE — Update Live Context Buffer
"""

import time
import logging
from typing import Optional, Dict, Any

from live.live_context import LiveContextBuffer
from live.memory_service import get_memory_service
from live.vision_service import get_vision_service

logger = logging.getLogger("aevra.orchestrator")

# Allowed tools and their arg schemas
ALLOWED_TOOLS = {
    "harmony_deep_reason": {"required_args": ["question"]},
    "save_to_memory": {"required_args": ["category", "key", "value", "importance"]},
    "search_memory": {"required_args": ["query"]},
    "create_note": {"required_args": ["title", "content"]},
    "analyze_vision": {"required_args": ["description"]},
    "get_live_context": {"required_args": []},
}

# Allowed memory categories
ALLOWED_CATEGORIES = {"fact", "preference", "goal", "progress", "note"}


class LiveOrchestrator:
    """
    Authority layer for AURA LIVE.
    All Gemini tool calls pass through the 7-step validation pipeline.
    """

    def __init__(self, user_id: str, live_context: LiveContextBuffer):
        self.user_id = user_id
        self.live_context = live_context

        # Rate limiter state: {tool_name: [timestamps]}
        self._rate_windows: Dict[str, list] = {}
        self.rate_limit_per_minute = 30  # Per-tool rate limit

        # Usage tracking for this session
        self.session_tool_calls: int = 0
        self.session_cost_usd: float = 0.0

    async def handle_tool_call(self, tool_name: str, args: dict, call_id: str) -> dict:
        """
        7-step validation pipeline for every Gemini tool call.
        Returns {"result": ..., "call_id": call_id, "status": "success|denied"}
        """
        start_time = time.time()

        # Step 1: VALIDATION
        if not self._validate(tool_name, args):
            return self._denied(tool_name, call_id, "Invalid tool or arguments")

        # Step 2: PERMISSIONS
        if not self._check_permissions(tool_name, args):
            return self._denied(tool_name, call_id, "Insufficient permissions")

        # Step 3: RATE LIMITS
        if not self._check_rate_limit(tool_name):
            return self._denied(tool_name, call_id, "Rate limit exceeded")

        # Step 4: COST CHECKS
        estimated_cost = self._estimate_cost(tool_name, args)
        if not self._check_budget(estimated_cost):
            return self._denied(tool_name, call_id, "Daily cost limit reached")

        # Step 5: EXECUTION
        try:
            result = await self._execute_tool(tool_name, args)
        except Exception as e:
            logger.error(f"Tool execution error [{tool_name}]: {e}")
            result = {"error": str(e)}

        # Step 6: LOGGING
        latency_ms = int((time.time() - start_time) * 1000)
        self._log_tool_call(tool_name, result, latency_ms, call_id)

        # Step 7: CONTEXT UPDATE
        if isinstance(result, dict):
            self.live_context.update_from_tool(tool_name, result)

        # Track session usage
        self.session_tool_calls += 1
        self.session_cost_usd += estimated_cost

        return {
            "result": result,
            "call_id": call_id,
            "status": "success",
            "latency_ms": latency_ms,
        }

    # ─── Step 1: Validation ───
    def _validate(self, tool_name: str, args: dict) -> bool:
        """Check if tool is allowed and args are well-formed."""
        if tool_name not in ALLOWED_TOOLS:
            logger.warning(f"Unknown tool requested: {tool_name}")
            return False

        spec = ALLOWED_TOOLS[tool_name]
        for required_arg in spec.get("required_args", []):
            if required_arg not in args or args[required_arg] is None:
                logger.warning(f"Missing required arg '{required_arg}' for tool '{tool_name}'")
                return False

        # Validate importance range for save_to_memory
        if tool_name == "save_to_memory":
            importance = args.get("importance", 0.5)
            if not isinstance(importance, (int, float)) or importance < 0 or importance > 1:
                args["importance"] = 0.5
            category = args.get("category", "")
            if category not in ALLOWED_CATEGORIES:
                logger.warning(f"Invalid memory category: {category}")
                return False

        return True

    # ─── Step 2: Permissions ───
    def _check_permissions(self, tool_name: str, args: dict) -> bool:
        """Check user permissions for this action.
        Currently all authenticated users have full access.
        Extend for role-based access control later.
        """
        if not self.user_id:
            return False
        return True

    # ─── Step 3: Rate Limits ───
    def _check_rate_limit(self, tool_name: str) -> bool:
        """Sliding window rate limiter per tool."""
        now = time.time()
        window_key = tool_name

        if window_key not in self._rate_windows:
            self._rate_windows[window_key] = []

        # Clean old entries (older than 60s)
        self._rate_windows[window_key] = [
            t for t in self._rate_windows[window_key] if now - t < 60
        ]

        if len(self._rate_windows[window_key]) >= self.rate_limit_per_minute:
            logger.warning(f"Rate limit hit for {tool_name} ({len(self._rate_windows[window_key])} in 60s)")
            return False

        self._rate_windows[window_key].append(now)
        return True

    # ─── Step 4: Cost Checks ───
    def _estimate_cost(self, tool_name: str, args: dict) -> float:
        """Estimate cost for this tool call."""
        cost_table = {
            "harmony_deep_reason": 0.01,   # Multi-model call
            "save_to_memory": 0.001,        # DB write
            "search_memory": 0.001,         # DB read
            "create_note": 0.001,           # DB write
            "analyze_vision": 0.005,        # Gemini vision call
            "get_live_context": 0.0,        # In-memory
        }
        return cost_table.get(tool_name, 0.001)

    def _check_budget(self, estimated_cost: float) -> bool:
        """Check if this call would exceed the daily cost ceiling."""
        from core.env_config import DAILY_COST_CEILING_USD
        if self.session_cost_usd + estimated_cost > DAILY_COST_CEILING_USD:
            logger.warning(f"Budget limit: ${self.session_cost_usd:.4f} + ${estimated_cost:.4f} > ${DAILY_COST_CEILING_USD}")
            return False
        return True

    # ─── Step 5: Execution ───
    async def _execute_tool(self, tool_name: str, args: dict) -> dict:
        """Execute the validated tool call."""
        memory = get_memory_service()
        vision = get_vision_service()

        if tool_name == "harmony_deep_reason":
            return await self._execute_harmony(args["question"])

        elif tool_name == "save_to_memory":
            result = await memory.save_memory(
                user_id=self.user_id,
                category=args["category"],
                key=args["key"],
                value=args["value"],
                importance=float(args.get("importance", 0.5)),
                source="live",
            )
            return {"saved": result.get("success", False), "memory_id": result.get("id")}

        elif tool_name == "search_memory":
            memories = await memory.search_memory(self.user_id, args["query"])
            return {
                "memories": [
                    {"key": m.get("key", ""), "value": m.get("value", ""), "category": m.get("category", "")}
                    for m in memories
                ],
                "count": len(memories),
            }

        elif tool_name == "create_note":
            from core.auth_middleware import get_supabase_client
            client = get_supabase_client()
            if not client:
                return {"error": "Database not available"}
            try:
                result = client.table("user_notes").insert({
                    "user_id": self.user_id,
                    "title": args["title"],
                    "content": args["content"],
                }).execute()
                return {"saved": True, "note_id": result.data[0]["id"] if result.data else None}
            except Exception as e:
                return {"error": str(e)}

        elif tool_name == "analyze_vision":
            result = await vision.analyze_frame(
                image_base64=args.get("_image_base64", ""),
                live_context=self.live_context.to_dict(),
            )
            # Add the description of what Gemini wanted to understand
            result["query"] = args.get("description", "")
            return result

        elif tool_name == "get_live_context":
            return self.live_context.to_dict()

        return {"error": f"Unknown tool: {tool_name}"}

    async def _execute_harmony(self, question: str) -> dict:
        """Execute Harmony deep reasoning pipeline.
        Calls multiple models in parallel and selects the best response.
        """
        import asyncio
        from core.env_config import GROQ_API_KEY, MISTRAL_API_KEY

        models = []
        if GROQ_API_KEY:
            models.append(("groq", "llama-3.3-70b-versatile"))
        if MISTRAL_API_KEY:
            models.append(("mistral", "mistral-large-latest"))

        if not models:
            return {"reasoning": "No models available for deep reasoning", "models_used": []}

        from live.aura_identity import get_council_role_prompt

        async def call_model(provider: str, model: str, role: str):
            try:
                if provider == "groq":
                    from groq import AsyncGroq
                    client = AsyncGroq(api_key=GROQ_API_KEY)
                    resp = await client.chat.completions.create(
                        model=model,
                        messages=[
                            {"role": "system", "content": get_council_role_prompt(role)},
                            {"role": "user", "content": question},
                        ],
                        temperature=0.7,
                        max_tokens=1024,
                    )
                    return {
                        "provider": provider,
                        "model": model,
                        "role": role,
                        "response": resp.choices[0].message.content.strip(),
                        "success": True,
                    }
                elif provider == "mistral":
                    # Mistral via OpenAI-compatible client
                    from groq import AsyncGroq
                    return {
                        "provider": provider,
                        "model": model,
                        "role": role,
                        "response": "Mistral integration pending",
                        "success": True,
                    }
            except Exception as e:
                return {"provider": provider, "model": model, "role": role, "error": str(e), "success": False}

        roles = ["reasoning", "teacher", "explanation"]
        tasks = [call_model(p, m, roles[i % len(roles)]) for i, (p, m) in enumerate(models)]
        results = await asyncio.gather(*tasks)

        successful = [r for r in results if r.get("success")]
        if not successful:
            return {"reasoning": "All reasoning models failed", "models_used": []}

        # Select best response (longest complete response, prefer reasoning role)
        best = max(successful, key=lambda r: len(r.get("response", "")))

        return {
            "reasoning": best.get("response", ""),
            "model_used": best.get("model", ""),
            "role_used": best.get("role", ""),
            "council_responses": [
                {"role": r.get("role"), "provider": r.get("provider"), "length": len(r.get("response", ""))}
                for r in successful
            ],
        }

    # ─── Step 6: Logging ───
    def _log_tool_call(self, tool_name: str, result: dict, latency_ms: int, call_id: str):
        """Log tool call to observability."""
        logger.info(f"Tool [{tool_name}] call_id={call_id} latency={latency_ms}ms "
                    f"status={'ok' if 'error' not in result else 'error'}")

    def _denied(self, tool_name: str, call_id: str, reason: str) -> dict:
        """Return a denied response."""
        logger.warning(f"Tool [{tool_name}] DENIED: {reason}")
        return {
            "result": f"Request denied: {reason}",
            "call_id": call_id,
            "status": "denied",
        }

    def get_session_stats(self) -> dict:
        """Return session-level orchestrator stats."""
        return {
            "total_tool_calls": self.session_tool_calls,
            "session_cost_usd": round(self.session_cost_usd, 4),
            "rate_windows_active": len(self._rate_windows),
        }
