from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from typing import Optional, Dict, List
from groq import Groq
import os
import difflib
import re
import importlib.util
import requests

try:
    from slowapi import Limiter
    from slowapi.util import get_remote_address
    from slowapi.middleware import SlowAPIMiddleware
except Exception:
    Limiter = None
    get_remote_address = None
    SlowAPIMiddleware = None

from user_personalization_router import router as personalization_router
from gamification_router import router as gamification_router
from exam_mode.exam_routes import router as exam_mode_router
from personal_assistant_router import router as personal_assistant_router
from env_utils import env, allowed_origins
from logging_utils import log_event

# Initialize Groq client
client = Groq(api_key=env("GROQ_API_KEY"))

app = FastAPI()
if Limiter and get_remote_address:
    limiter = Limiter(key_func=get_remote_address)
    app.state.limiter = limiter
    app.add_middleware(SlowAPIMiddleware)
else:
    class _NoopLimiter:
        def limit(self, _rule):
            def deco(fn):
                return fn
            return deco
    limiter = _NoopLimiter()

app.include_router(personalization_router)
app.include_router(gamification_router)
app.include_router(exam_mode_router)
app.include_router(personal_assistant_router)


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
    except RuntimeError as exc:
        if "python-multipart" in str(exc):
            return
        raise
    app.include_router(voice_router)
    app.include_router(multimodal_router)


_include_optional_upload_routers(app)

_is_vercel = bool(env("VERCEL", ""))

if not _is_vercel:
    # Serve frontend (index.html + assets) under /app
    FRONTEND_DIR = os.path.dirname(os.path.abspath(__file__))
    app.mount("/app", StaticFiles(directory=FRONTEND_DIR, html=True), name="app")

    @app.get("/", include_in_schema=False)
    async def root():
        # Serve UI from /app/ so relative asset links resolve correctly
        return RedirectResponse(url="/app/")

# Enable CORS
_default_allowed_origins = {
    "http://127.0.0.1:5500",
    "http://localhost:5500",
    "http://127.0.0.1:8000",
    "http://localhost:8000",
    "https://aevra-ai.netlify.app",
    "https://aevra-ai.netlify.app",
    "https://aevra-ai.netlify.app",
    "https://aevra-ai.netlify.app",
}
_allowed_origins = allowed_origins(_default_allowed_origins)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_methods=["*"],
    allow_headers=["*"],
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

# Health check
@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/progress")
@limiter.limit("100/minute")
async def get_progress(request: Request, email: str = "guest@student.com"):
    data = user_progress.get(email)
    return {"email": email, "progress": data}


@app.get("/progress/{user_id}")
@limiter.limit("100/minute")
async def get_progress_by_user(request: Request, user_id: str):
    base = (env("SUPABASE_URL", "") or "").rstrip("/")
    key = env("SUPABASE_SERVICE_KEY") or env("SUPABASE_ANON_KEY")
    if base and key:
        try:
            res = requests.get(
                f"{base}/rest/v1/gamification_data?user_id=eq.{user_id}&select=*&limit=1",
                headers={"apikey": key, "authorization": f"Bearer {key}"},
                timeout=60,
            )
            res.raise_for_status()
            rows = res.json()
            return {"ok": True, "user_id": user_id, "progress": rows[0] if rows else None}
        except Exception as exc:
            log_event("error", "progress_fetch", {"user_id": user_id, "error": str(exc)})
    return {"ok": True, "user_id": user_id, "progress": user_progress.get(user_id)}


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


# AI answer endpoint with memory
@app.post("/ask")
@limiter.limit("30/minute")
async def ask(request: Request, req: AskRequest):
    # Initialize memory buckets
    user_memory.setdefault(req.email, {})
    user_memory[req.email].setdefault(req.title, [])

    # Build conversation history for this topic
    history = user_memory[req.email][req.title]
    history_block = "\n".join(
        [f"Q: {h['question']} â†’ A: {h['answer']}" for h in history]
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
                    f"From '{topic}': Q: {entry['question']} â†’ A: {entry['answer']}"
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

    system_prompt = (
        "You are Aevra, a warm and intelligent AI study companion designed for students. "
        "You explain concepts clearly, adapt to each student's learning style, and make studying feel engaging rather than overwhelming. "
        "You are encouraging, patient, and always focused on helping the student genuinely understand - not just memorize. "
        "Your name is Aevra. Always prioritize syllabus alignment, explain simply first then add depth, support Sinhala and English. "
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
        'Generate a short, clear topic title (2â€“5 words) for this Grade 9 student question: '
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
