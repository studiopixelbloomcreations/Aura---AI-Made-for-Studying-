from fastapi import FastAPI, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from typing import Optional, Dict, List
from groq import Groq
import os
import difflib
import re
import importlib.util
import logging

from core.env_config import (
    get_allowed_origins, validate_config, IS_PRODUCTION, ENVIRONMENT,
    GROQ_API_KEY, SUPABASE_URL
)
from core.auth_middleware import require_auth, init_firebase, get_supabase_client

# Optional routers — gracefully skip if dependencies are missing (e.g. on Vercel)
_optional_routers = {}

try:
    from user_personalization_router import router as personalization_router
    _optional_routers["personalization"] = personalization_router
except Exception as _e:
    logging.getLogger("aevra").warning(f"personalization_router unavailable: {_e}")

try:
    from gamification_router import router as gamification_router
    _optional_routers["gamification"] = gamification_router
except Exception as _e:
    logging.getLogger("aevra").warning(f"gamification_router unavailable: {_e}")

try:
    from exam_mode.exam_routes import router as exam_mode_router
    _optional_routers["exam_mode"] = exam_mode_router
except Exception as _e:
    logging.getLogger("aevra").warning(f"exam_mode_router unavailable: {_e}")

try:
    from personal_assistant_router import router as personal_assistant_router
    _optional_routers["personal_assistant"] = personal_assistant_router
except Exception as _e:
    logging.getLogger("aevra").warning(f"personal_assistant_router unavailable: {_e}")

try:
    from live.aura_live_server import router as live_router
    _optional_routers["live"] = live_router
except Exception as _e:
    logging.getLogger("aevra").warning(f"live_router unavailable: {_e}")

try:
    from services.evolution_routes import router as evolution_router
    _optional_routers["evolution"] = evolution_router
except Exception as _e:
    logging.getLogger("aevra").warning(f"evolution_router unavailable: {_e}")

logger = logging.getLogger("aevra")
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(name)s] %(levelname)s: %(message)s")

# Initialize Firebase Admin SDK on startup
init_firebase()

# Initialize Groq client
client = Groq(api_key=GROQ_API_KEY) if GROQ_API_KEY else None

app = FastAPI(title="AURA AI", version="2.0.0", environment=ENVIRONMENT)

for _name, _router in _optional_routers.items():
    app.include_router(_router)


def _include_optional_upload_routers(app: FastAPI) -> None:
    """
    File-upload routes require python-multipart. Keep the core API bootable
    if that optional dependency is missing.
    """
    if importlib.util.find_spec("multipart") is None:
        return

    try:
        from voice_router import router as voice_router
        from multimodal_router import router as multimodal_router
        app.include_router(voice_router)
        app.include_router(multimodal_router)
    except Exception as exc:
        logger.warning(f"Optional upload routers (voice/multimodal) unavailable: {exc}")


_include_optional_upload_routers(app)

_is_vercel = bool(os.environ.get("VERCEL"))

if not _is_vercel:
    # Serve frontend (index.html + assets) under /app
    FRONTEND_DIR = os.path.dirname(os.path.abspath(__file__))
    app.mount("/app", StaticFiles(directory=FRONTEND_DIR, html=True), name="app")

    @app.get("/", include_in_schema=False)
    async def root():
        # Serve UI from /app/ so relative asset links resolve correctly
        return RedirectResponse(url="/app/")

# Enable CORS from env config
_allowed_origins = get_allowed_origins()

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=True,
)

# In-memory user history
user_memory: Dict[str, Dict[str, List[Dict[str, str]]]] = {}

# In-memory progress persistence (per email)
user_progress: Dict[str, Dict] = {}

# Request models
class AskRequest(BaseModel):
    subject: str
    language: str
    student_question: str
    title: Optional[str] = "General Help"
    email: Optional[str] = "guest@student.com"

class TitleRequest(BaseModel):
    question: str

class ProgressPayload(BaseModel):
    email: Optional[str] = "guest@student.com"
    progress: Dict

class CheckAnswerPayload(BaseModel):
    question: Optional[str] = None
    correct_answer: str
    user_answer: str

# Startup event
@app.on_event("startup")
async def startup():
    config = validate_config()
    logger.info(f"AURA AI starting | env={config['environment']} | valid={config['valid']}")
    if config["issues"]:
        for issue in config["issues"]:
            logger.warning(f"  Config issue: {issue}")
    sb = get_supabase_client()
    if sb:
        logger.info("Supabase connected (service role)")
    else:
        logger.warning("Supabase not available")


# Health check
@app.get("/health")
async def health():
    config = validate_config()
    return {
        "status": "ok" if config["valid"] else "degraded",
        "environment": config["environment"],
        "supabase": config["supabase"],
        "firebase": config["firebase"],
        "gemini": config["gemini"],
    }


@app.get("/progress")
async def get_progress(email: str = "guest@student.com"):
    data = user_progress.get(email)
    return {"email": email, "progress": data}


@app.post("/progress")
async def set_progress(req: ProgressPayload):
    email = req.email or "guest@student.com"
    # Accept and store as-is; client-side is authoritative for aggregation.
    user_progress[email] = req.progress
    return {"ok": True}


def _normalize_answer(text: str) -> str:
    t = (text or "").strip().lower()
    t = re.sub(r"\s+", " ", t)
    t = re.sub(r"[^a-z0-9 .\-+/]", "", t)
    return t


@app.post("/check_answer")
async def check_answer(req: CheckAnswerPayload):
    # Simple heuristic check. For robust scoring, replace with rubric/LLM evaluation.
    correct = _normalize_answer(req.correct_answer)
    user = _normalize_answer(req.user_answer)
    if not correct or not user:
        return {"correct": False}
    if user == correct:
        return {"correct": True}
    # Allow partial match for short answers
    if len(correct) >= 4 and correct in user:
        return {"correct": True}
    if len(user) >= 4 and user in correct:
        return {"correct": True}
    return {"correct": False}


# AI answer endpoint with memory + optional auth
@app.post("/ask")
async def ask(req: AskRequest, request: Request = None):
    # Try to get auth user (optional for backward compat)
    user_id = None
    auth_header = request.headers.get("Authorization", "") if request else ""
    if auth_header.startswith("Bearer "):
        from core.auth_middleware import verify_firebase_token
        token = auth_header[7:].strip()
        decoded = verify_firebase_token(token)
        if decoded:
            user_id = decoded.get("uid", "")
            # Use Firebase UID as email for memory isolation
            email = req.email if req.email != "guest@student.com" else decoded.get("email", req.email)
            req.email = email
    # Initialize memory buckets
    user_memory.setdefault(req.email, {})
    user_memory[req.email].setdefault(req.title, [])

    # Build conversation history for this topic
    history = user_memory[req.email][req.title]
    history_block = "\n".join(
        [f"Q: {h['question']} → A: {h['answer']}" for h in history]
    )

    # Cross-topic recall
    related_context = []
    for topic, past in user_memory[req.email].items():
        for entry in past:
            similarity = difflib.SequenceMatcher(
                None, req.student_question.lower(), entry["question"].lower()
            ).ratio()
            if similarity > 0.6:
                related_context.append(
                    f"From '{topic}': Q: {entry['question']} → A: {entry['answer']}"
                )

    # Simple off-syllabus detection (subject match against common Grade 9 subjects)
    allowed_subjects = {
        "math", "maths", "mathematics", "science", "english",
        "sinhala", "history", "geography", "health", "civics"
    }
    off_syllabus = False
    subj_key = (req.subject or "general").strip().lower()
    if subj_key and subj_key not in allowed_subjects and subj_key != "general":
        off_syllabus = True

    # System persona: Aevra AI for Grade 9 Sri Lanka (concise, used as system message)
    system_prompt = (
        "You are 'Aevra AI' — a kind, patient Grade 9 tutor aligned to the Sri Lankan Grade 9 syllabus. "
        "Always prioritize syllabus alignment, explain simply first then add depth, use analogies and step-by-step reasoning, "
        "support Sinhala and English, and mark clearly when a question is off-syllabus with a short 'Scope note'. "
        "Be encouraging and show step-by-step solutions for problems. Keep language clear and age-appropriate. "
        "\n\nProgress tracking requirement (VERY IMPORTANT): "
        "When the student answers a question you asked, you MUST evaluate whether it is correct. "
        "You MUST ALWAYS include EXACTLY ONE final line at the very end of your message in this format: 'AWARD_POINTS: N'. "
        "If the student's answer is correct, set N to an integer > 0 based on difficulty (e.g. 5, 10, 15, 20). "
        "If the student's answer is NOT correct (or the student did not answer a question), set N to 0. "
        "This must be the LAST line of your message. Do not add any text after it."
    )

    # Build user-facing prompt content
    prompt_parts = [
        f"Subject: {req.subject}",
        f"Language: {req.language}",
    ]
    if history_block:
        prompt_parts.append("Conversation so far in this topic:")
        prompt_parts.append(history_block)
    if related_context:
        prompt_parts.append("Related past questions:")
        prompt_parts.append("\n".join(related_context))
    if off_syllabus:
        prompt_parts.append("[Note: This question appears to be outside the official Grade 9 Sri Lankan syllabus. Please mark it as off-syllabus and provide a short scope note before answering.]")
    prompt_parts.append("Student question:")
    prompt_parts.append(req.student_question)
    user_prompt = "\n\n".join(prompt_parts)

    try:
        if not client:
            return {"answer": "AI service is currently unavailable. Please try again later.", "off_syllabus": False}
        # Send both system and user messages to the chat API
        response = client.chat.completions.create(
            model="moonshotai/kimi-k2-instruct-0905",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.7,
        )
        answer = response.choices[0].message.content.strip()

        # If off_syllabus, ensure there is a small scope note (safety fallback)
        if off_syllabus and "Scope note" not in answer and "off-syllabus" not in answer.lower():
            answer = "Scope note: This is beyond the Grade 9 syllabus. " + answer

        # Save Q&A (include off_syllabus flag)
        user_memory[req.email][req.title].append({
            "question": req.student_question,
            "answer": answer,
            "off_syllabus": off_syllabus
        })

        return {"answer": answer, "off_syllabus": off_syllabus}
    except Exception as e:
        return {"error": f"AI request failed: {str(e)}"}

# Title generation
@app.post("/generate_title")
async def generate_title(req: TitleRequest):
    prompt = (
        'Generate a short, clear topic title (2–5 words) for this Grade 9 student question: '
        f'"{req.question}". The title should describe the type of help or subject area. '
        'Return ONLY the title, no punctuation or quotes.'
    )
    try:
        response = client.chat.completions.create(
            model="mixtral-8x7b-32768",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.5,
        )
        title = response.choices[0].message.content.strip()
        title = title.strip().strip('"').strip("'")
        return {"title": title}
    except Exception as e:
        return {"title": "General Help", "error": f"Title AI failed: {str(e)}"}

# Optional: memory inspection
@app.get("/memory")
async def get_memory(email: str, title: Optional[str] = None):
    if email not in user_memory:
        return {"email": email, "memory": {}}
    if title is None:
        return {"email": email, "memory": user_memory[email]}
    return {"email": email, "title": title, "history": user_memory[email].get(title, [])}


# ──────────────────────────────────────────────
# OBSERVABILITY ENDPOINTS
# ──────────────────────────────────────────────
@app.get("/api/observability/summary")
async def observability_summary(days: int = 7, user: dict = Depends(require_auth)):
    """Get observability metrics summary (authenticated)."""
    from live.observability import get_observability
    obs = get_observability()
    return obs.get_summary(days=days)


@app.get("/api/observability/events")
async def observability_events(limit: int = 50, user: dict = Depends(require_auth)):
    """Get recent observability events (authenticated)."""
    from live.observability import get_observability
    obs = get_observability()
    return {"events": obs.get_recent_events(limit=limit)}


# ──────────────────────────────────────────────
# LUMEN MEMORY API
# ──────────────────────────────────────────────
@app.get("/api/lumen/memories")
async def lumen_get_memories(limit: int = 10, user: dict = Depends(require_auth)):
    """Get user's LUMEN memories."""
    from live.memory_service import get_memory_service
    mem = get_memory_service()
    memories = await mem.get_top_memories(user["uid"], limit=limit)
    return {"memories": memories, "count": len(memories)}


@app.get("/api/lumen/search")
async def lumen_search(query: str, limit: int = 5, user: dict = Depends(require_auth)):
    """Search LUMEN memories."""
    from live.memory_service import get_memory_service
    mem = get_memory_service()
    results = await mem.search_memory(user["uid"], query, limit=limit)
    return {"results": results, "count": len(results)}


# ──────────────────────────────────────────────
# NOTES API (full CRUD)
# ──────────────────────────────────────────────
class NotePayload(BaseModel):
    title: str
    content: str
    tags: Optional[List[str]] = []
    pinned: Optional[bool] = False


class NoteUpdatePayload(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None
    tags: Optional[List[str]] = None
    pinned: Optional[bool] = None


@app.get("/api/notes")
async def get_notes(user: dict = Depends(require_auth)):
    """Get user's notes."""
    client = get_supabase_client()
    if not client:
        return {"notes": [], "error": "Database not available"}
    try:
        result = client.table("user_notes").select("*").eq("user_id", user["uid"]).order("updated_at", desc=True).limit(100).execute()
        return {"notes": result.data or []}
    except Exception as e:
        return {"notes": [], "error": str(e)}


@app.post("/api/notes")
async def create_note(req: NotePayload, user: dict = Depends(require_auth)):
    """Create a new note."""
    client = get_supabase_client()
    if not client:
        return {"error": "Database not available"}
    try:
        result = client.table("user_notes").insert({
            "user_id": user["uid"],
            "title": req.title,
            "content": req.content,
            "tags": req.tags or [],
            "pinned": req.pinned or False,
        }).execute()
        return {"success": True, "note": result.data[0] if result.data else None}
    except Exception as e:
        return {"error": str(e)}


@app.put("/api/notes/{note_id}")
async def update_note(note_id: str, req: NoteUpdatePayload, user: dict = Depends(require_auth)):
    """Update an existing note."""
    client = get_supabase_client()
    if not client:
        return {"error": "Database not available"}
    try:
        updates = {"updated_at": "now()"}
        if req.title is not None:
            updates["title"] = req.title
        if req.content is not None:
            updates["content"] = req.content
        if req.tags is not None:
            updates["tags"] = req.tags
        if req.pinned is not None:
            updates["pinned"] = req.pinned

        result = client.table("user_notes").update(updates).eq(
            "id", note_id
        ).eq("user_id", user["uid"]).execute()
        return {"success": True, "note": result.data[0] if result.data else None}
    except Exception as e:
        return {"error": str(e)}


@app.delete("/api/notes/{note_id}")
async def delete_note(note_id: str, user: dict = Depends(require_auth)):
    """Delete a note."""
    client = get_supabase_client()
    if not client:
        return {"error": "Database not available"}
    try:
        client.table("user_notes").delete().eq("id", note_id).eq("user_id", user["uid"]).execute()
        return {"success": True}
    except Exception as e:
        return {"error": str(e)}


# ──────────────────────────────────────────────
# USAGE API
# ──────────────────────────────────────────────
@app.get("/api/usage/summary")
async def usage_summary(days: int = 7, user: dict = Depends(require_auth)):
    """Get user's usage summary."""
    from live.usage_manager import get_usage_manager
    mgr = get_usage_manager()
    return await mgr.get_usage_summary(user["uid"], days=days)


# ──────────────────────────────────────────────
# VOICE IDENTITY API
# ──────────────────────────────────────────────
@app.get("/api/voice-identity/status")
async def voice_identity_status(user: dict = Depends(require_auth)):
    """Check if user has opted into voice identity."""
    from services.voice_identity import get_voice_identity
    vid = get_voice_identity()
    opted_in = await vid.is_opted_in(user["uid"])
    return {"opted_in": opted_in}


@app.post("/api/voice-identity/opt-in")
async def voice_identity_opt_in(user: dict = Depends(require_auth)):
    """Opt into voice identity verification."""
    from services.voice_identity import get_voice_identity
    vid = get_voice_identity()
    return await vid.opt_in(user["uid"])


@app.post("/api/voice-identity/opt-out")
async def voice_identity_opt_out(user: dict = Depends(require_auth)):
    """Opt out and delete all voice data."""
    from services.voice_identity import get_voice_identity
    vid = get_voice_identity()
    return await vid.opt_out(user["uid"])


# ──────────────────────────────────────────────
# PERSONALITY ENGINE API
# ──────────────────────────────────────────────
class FeedbackPayload(BaseModel):
    dimension: str
    positive: bool
    context: Optional[Dict] = None


@app.get("/api/personality")
async def get_personality(user: dict = Depends(require_auth)):
    """Get user's current personality weights."""
    from services.personality_service import get_personality_service
    svc = get_personality_service()
    personality = await svc.get_personality(user["uid"])
    return {"personality": personality}


@app.post("/api/personality/feedback")
async def personality_feedback(req: FeedbackPayload, user: dict = Depends(require_auth)):
    """Record thumbs up/down feedback for a personality dimension."""
    from services.personality_service import get_personality_service
    svc = get_personality_service()
    return await svc.record_feedback(user["uid"], req.dimension, req.positive, req.context)


# ──────────────────────────────────────────────
# PUBLIC CONFIG (safe Firebase config for client)
# ──────────────────────────────────────────────
@app.get("/public-config")
async def public_config():
    """Return safe public configuration (no secrets)."""
    from core.env_config import FIREBASE_PUBLIC_CONFIG, BACKEND_BASE_URL, LIVE_WS_URL
    return {
        "ok": True,
        "firebase": FIREBASE_PUBLIC_CONFIG,
        "backend_url": BACKEND_BASE_URL,
        "live_ws_url": LIVE_WS_URL,
    }
