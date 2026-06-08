"""
live/aura_live_server.py
AURA LIVE WebSocket server — bridges browser ↔ Gemini 2.5 Native Audio Live API.

Architecture:
  Browser (audio/text) ↔ FastAPI WebSocket ↔ Orchestrator ↔ Gemini Live
                                              ↕
                              LUMEN, Harmony, Vision, Notes

Gemini Live handles: real-time voice, audio I/O, interruption, tone.
Orchestrator handles: tool validation, permissions, rate limits, cost, execution.

Replacing Gemini: modify ONLY this file + aura_identity.py + live_system_prompt.py.
"""

import asyncio
import json
import logging
import time
import base64
from typing import Optional

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from google import genai
from google.genai import types

from core.auth_middleware import require_ws_auth, get_supabase_client
from core.env_config import GEMINI_API_KEY, GEMINI_LIVE_TIMEOUT_SECONDS
from live.live_orchestrator import LiveOrchestrator
from live.live_context import LiveContextBuffer
from live.gemini_health import GeminiHealthMonitor, HEALTHY, DEGRADED, FAILED
from live.aura_identity import get_identity_prompt
from live.prompts.live_system_prompt import get_prompt_builder, GEMINI_LIVE_TOOLS
from live.memory_service import get_memory_service

logger = logging.getLogger("aevra.live_server")

router = APIRouter()

# Active sessions: {session_id: session_data}
_active_sessions: dict = {}

# Gemini Live model
GEMINI_LIVE_MODEL = "gemini-live-2.5-flash-preview"


class GeminiLiveSession:
    """Manages a single Gemini Live API session for one user."""

    def __init__(self, user_id: str, websocket: WebSocket, session_id: str):
        self.user_id = user_id
        self.websocket = websocket
        self.session_id = session_id

        # Core components
        self.live_context = LiveContextBuffer(user_id=user_id, session_id=session_id)
        self.health = GeminiHealthMonitor(timeout_seconds=GEMINI_LIVE_TIMEOUT_SECONDS)
        self.orchestrator = LiveOrchestrator(user_id=user_id, live_context=self.live_context)
        self.prompt_builder = get_prompt_builder()
        self.memory = get_memory_service()

        # Gemini session
        self._session = None
        self._running = True
        self._tasks: list = []
        self._gemini_client = None

        # Health callbacks
        self.health.set_callbacks(
            on_fallback=self._on_fallback,
            on_restore=self._on_restore,
        )

    async def start(self):
        """Initialize and start the Gemini Live session."""
        if not GEMINI_API_KEY:
            await self._send_to_client("error", {"message": "Gemini API key not configured"})
            return

        try:
            self._gemini_client = genai.Client(api_key=GEMINI_API_KEY)

            # Build system prompt
            identity_prompt = get_identity_prompt()
            lumen_memories = await self.memory.get_top_memories(self.user_id, limit=5)
            lumen_text = self.memory.format_memories_for_prompt(lumen_memories)
            context_summary = self.live_context.get_gemini_context_summary()

            system_prompt = self.prompt_builder.build_live_prompt(
                identity_prompt=identity_prompt,
                lumen_context=lumen_text or None,
                live_context_summary=context_summary,
            )

            # Configure Gemini Live connection
            config = types.LiveConnectConfig(
                response_modalities=["AUDIO"],
                output_audio_transcription={},
                input_audio_transcription={},
                system_instruction=system_prompt,
                tools=GEMINI_LIVE_TOOLS,
                speech_config=types.SpeechConfig(
                    voice_config=types.VoiceConfig(
                        prebuilt_voice_config=types.PrebuiltVoiceConfig(
                            voice_name="Kore"
                        )
                    )
                ),
            )

            # Connect to Gemini Live
            async with self._gemini_client.aio.live.connect(
                model=GEMINI_LIVE_MODEL,
                config=config,
            ) as session:
                self._session = session
                await self.health.report_success()
                await self._send_to_client("status", {
                    "state": "connected",
                    "gemini_health": HEALTHY,
                    "session_id": self.session_id,
                })

                # Start concurrent tasks
                self._tasks = [
                    asyncio.ensure_future(self._receive_from_gemini()),
                    asyncio.ensure_future(self._receive_from_client()),
                ]

                await asyncio.gather(*self._tasks, return_exceptions=True)

        except Exception as e:
            logger.error(f"Gemini Live session error: {e}")
            await self.health.report_error(str(e))

    async def _receive_from_client(self):
        """Receive messages from the browser WebSocket."""
        try:
            while self._running:
                data = await self.websocket.receive_text()
                message = json.loads(data)
                msg_type = message.get("type", "")

                if msg_type == "audio":
                    # Forward raw audio to Gemini
                    if self._session and self.health.state == HEALTHY:
                        audio_b64 = message.get("data", "")
                        if audio_b64:
                            try:
                                audio_bytes = base64.b64decode(audio_b64)
                                await self._session.send(input={
                                    "mime_type": "audio/pcm",
                                    "data": audio_bytes,
                                })
                                self.live_context.add_turn("user_audio", f"[audio {len(audio_bytes)} bytes]")
                            except Exception as e:
                                logger.warning(f"Audio forward error: {e}")

                elif msg_type == "text":
                    # Text message from user (for fallback mode or text input)
                    text = message.get("content", "")
                    if text:
                        self.live_context.add_turn("user", text)
                        if self._session and self.health.state == HEALTHY:
                            await self._session.send(input=text, end_of_turn=True)
                        else:
                            # Fallback: use text chat pipeline
                            await self._handle_text_fallback(text)

                elif msg_type == "vision_frame":
                    # Camera frame from client
                    frame_b64 = message.get("frame", "")
                    if frame_b64:
                        self.live_context.camera_active = True
                        # Send frame to Gemini as part of the conversation
                        if self._session and self.health.state == HEALTHY:
                            await self._session.send(input={
                                "mime_type": "image/jpeg",
                                "data": base64.b64decode(frame_b64),
                            })

                elif msg_type == "ping":
                    await self._send_to_client("pong", {
                        "timestamp": time.time(),
                        "health": self.health.state,
                    })

        except WebSocketDisconnect:
            logger.info(f"Client disconnected: {self.session_id}")
            self._running = False
        except json.JSONDecodeError:
            logger.warning(f"Invalid JSON from client: {self.session_id}")
        except Exception as e:
            logger.error(f"Client receive error: {e}")
            self._running = False

    async def _receive_from_gemini(self):
        """Receive audio, text, and tool calls from Gemini Live."""
        try:
            async for response in self._session.receive():
                if not self._running:
                    break

                # Audio response
                if response.data:
                    audio_b64 = base64.b64encode(response.data).decode()
                    await self._send_to_client("audio", {"data": audio_b64})

                # Text transcription (output)
                if response.server_content:
                    content = response.server_content
                    if content.output_transcription:
                        text = content.output_transcription.text
                        if text:
                            self.live_context.add_turn("ai", text)
                            await self._send_to_client("transcription", {
                                "role": "ai",
                                "text": text,
                                "type": "output",
                            })
                    if content.input_transcription:
                        text = content.input_transcription.text
                        if text:
                            self.live_context.add_turn("user", text)
                            await self._send_to_client("transcription", {
                                "role": "user",
                                "text": text,
                                "type": "input",
                            })

                # Tool call from Gemini
                if response.tool_call:
                    await self._handle_tool_call(response.tool_call)

                # Report success on any response
                if self.health.state != HEALTHY:
                    await self.health.report_success()

        except Exception as e:
            logger.error(f"Gemini receive error: {e}")
            await self.health.report_error(str(e))

    async def _handle_tool_call(self, tool_call):
        """Route Gemini tool calls through the Orchestrator."""
        for fc in tool_call.function_calls:
            tool_name = fc.name
            call_id = fc.id
            args = dict(fc.args) if fc.args else {}

            logger.info(f"Gemini tool call: {tool_name} (call_id={call_id})")

            # Special handling for vision: attach current frame
            if tool_name == "analyze_vision":
                frame = self._get_latest_frame()
                if frame:
                    args["_image_base64"] = frame

            # Route through Orchestrator 7-step validation
            result = await self.orchestrator.handle_tool_call(tool_name, args, call_id)

            # Send tool response back to Gemini
            if self._session:
                tool_response = types.FunctionResponse(
                    id=call_id,
                    response={"result": result.get("result", {})},
                )
                await self._session.send_tool_response(tool_response)

            # Notify client of tool execution
            await self._send_to_client("tool_result", {
                "tool": tool_name,
                "status": result.get("status", "unknown"),
                "result": result.get("result", {}),
                "latency_ms": result.get("latency_ms", 0),
            })

    async def _handle_text_fallback(self, text: str):
        """Handle text input when Gemini is unavailable — use Harmony/text pipeline."""
        self.live_context.fallback_count += 1
        logger.info(f"Fallback text handling for session {self.session_id}")

        try:
            # Use the Groq-based /ask pipeline
            from core.env_config import GROQ_API_KEY
            if GROQ_API_KEY:
                from groq import AsyncGroq
                client = AsyncGroq(api_key=GROQ_API_KEY)
                identity_prompt = get_identity_prompt()
                fallback_prompt = self.prompt_builder.build_fallback_prompt(
                    identity_prompt=identity_prompt,
                )

                resp = await client.chat.completions.create(
                    model="llama-3.3-70b-versatile",
                    messages=[
                        {"role": "system", "content": fallback_prompt},
                        {"role": "user", "content": text},
                    ],
                    temperature=0.7,
                    max_tokens=2048,
                )
                answer = resp.choices[0].message.content.strip()
                self.live_context.add_turn("ai", answer)
                await self._send_to_client("transcription", {
                    "role": "ai",
                    "text": answer,
                    "type": "fallback",
                })
            else:
                await self._send_to_client("transcription", {
                    "role": "ai",
                    "text": "AI service is temporarily unavailable. Please try again later.",
                    "type": "error",
                })
        except Exception as e:
            logger.error(f"Fallback text error: {e}")
            await self._send_to_client("transcription", {
                "role": "ai",
                "text": "Sorry, I encountered an error processing your message.",
                "type": "error",
            })

    def _get_latest_frame(self) -> Optional[str]:
        """Get the latest camera frame from context (set by vision_frame messages)."""
        # The frame is stored temporarily in live_context
        return getattr(self.live_context, '_latest_frame', None)

    async def _on_fallback(self, error: Optional[str] = None):
        """Called when Gemini fails — switch to fallback mode."""
        logger.info(f"Session {self.session_id}: switching to fallback (error: {error})")
        self.live_context.gemini_health_state = "failed"
        await self._send_to_client("status", {
            "state": "fallback",
            "gemini_health": self.health.state,
            "message": "Using enhanced text mode",
            "error": error,
        })

    async def _on_restore(self):
        """Called when Gemini is restored — re-inject context."""
        logger.info(f"Session {self.session_id}: Gemini restored, re-injecting context")
        self.live_context.gemini_health_state = "healthy"
        context_summary = self.live_context.get_gemini_context_summary()
        await self._send_to_client("status", {
            "state": "connected",
            "gemini_health": HEALTHY,
            "message": "Live mode restored",
            "context": context_summary,
        })

    async def _send_to_client(self, msg_type: str, data: dict):
        """Send a message to the browser WebSocket."""
        try:
            if self.websocket.client_state.value == 1:  # CONNECTED
                await self.websocket.send_json({"type": msg_type, **data})
        except Exception as e:
            logger.warning(f"Send to client failed: {e}")

    async def cleanup(self):
        """Clean up session resources and save transcript."""
        self._running = False
        for task in self._tasks:
            if not task.done():
                task.cancel()

        # Save session transcript to Supabase
        try:
            client = get_supabase_client()
            if client and self.live_context.transcript:
                client.table("live_sessions").insert({
                    "id": self.session_id,
                    "user_id": self.user_id,
                    "session_type": "live",
                    "transcript": json.dumps(self.live_context.transcript),
                    "context": json.dumps(self.live_context.to_dict()),
                    "fallback_count": self.live_context.fallback_count,
                    "gemini_health": self.live_context.gemini_health_state,
                    "ended_at": "now()",
                }).execute()
                logger.info(f"Session {self.session_id} saved ({self.live_context.turn_count} turns)")
        except Exception as e:
            logger.error(f"Session save failed: {e}")

        # Remove from active sessions
        _active_sessions.pop(self.session_id, None)
        logger.info(f"Session {self.session_id} cleaned up")


@router.websocket("/ws/live")
async def live_websocket(websocket: WebSocket):
    """
    WebSocket endpoint for AURA LIVE.
    Auth: Firebase token via query param ?token=<firebase_id_token>
    """
    # Authenticate
    user = await require_ws_auth(websocket)
    if not user:
        await websocket.close(code=4001, reason="Authentication required")
        return

    user_id = user["uid"]
    session_id = f"live-{user_id}-{int(time.time())}"

    await websocket.accept()
    logger.info(f"AURA LIVE session started: {session_id} (user: {user_id})")

    # Check if user already has an active session
    existing = next(
        (s for s in _active_sessions.values() if s.user_id == user_id),
        None,
    )
    if existing:
        await websocket.send_json({
            "type": "error",
            "message": "You already have an active live session",
            "existing_session": existing.session_id,
        })
        await websocket.close(code=4002, reason="Duplicate session")
        return

    # Create and register session
    session = GeminiLiveSession(user_id=user_id, websocket=websocket, session_id=session_id)
    _active_sessions[session_id] = session

    try:
        await session.start()
    except Exception as e:
        logger.error(f"Session start failed: {e}")
        await websocket.send_json({
            "type": "error",
            "message": f"Failed to start live session: {str(e)}",
        })
    finally:
        await session.cleanup()


@router.get("/api/live/status")
async def live_status(user: dict = None):
    """Get active live sessions status (admin)."""
    return {
        "active_sessions": len(_active_sessions),
        "sessions": [
            {
                "session_id": s.session_id,
                "user_id": s.user_id,
                "turns": s.live_context.turn_count,
                "health": s.health.state,
                "duration": s.live_context.get_duration(),
            }
            for s in _active_sessions.values()
        ],
    }
