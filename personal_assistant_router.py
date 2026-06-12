from typing import Dict, List, Optional, Any
import hashlib
import time

from fastapi import APIRouter, Query
from pydantic import BaseModel

from personal_assistant_service import (
    ask_aevra_personal_agent,
    connect_service,
    get_personal_assistant_status,
    set_home_address,
)


router = APIRouter(prefix="/personal-intelligence", tags=["personal-intelligence"])

# In-memory profile store (for local dev and Vercel serverless)
_profile_store: Dict[str, Dict[str, Any]] = {}


class PersonalAssistantAskRequest(BaseModel):
    message: Optional[str] = ""
    student_question: Optional[str] = ""
    email: Optional[str] = "guest@student.com"
    language: Optional[str] = "English"
    subject: Optional[str] = "General"
    title: Optional[str] = "Personal Intelligence"
    history: Optional[List[Dict[str, str]]] = None
    context: Optional[Dict[str, Any]] = None
    identity: Optional[Dict[str, Any]] = None
    user: Optional[Dict[str, Any]] = None
    user_id: Optional[str] = ""
    name: Optional[str] = ""
    profile: Optional[Dict[str, Any]] = None
    unique_id: Optional[str] = ""


class ConnectServicePayload(BaseModel):
    email: Optional[str] = "guest@student.com"
    service: str


class HomeAddressPayload(BaseModel):
    email: Optional[str] = "guest@student.com"
    address: str


@router.post("/ask")
async def personal_assistant_ask(req: PersonalAssistantAskRequest):
    message = req.message or req.student_question or ""
    email = req.email or "guest@student.com"
    if req.identity and req.identity.get("email"):
        email = req.identity["email"]
    elif req.user and req.user.get("email"):
        email = req.user["email"]
    return ask_aevra_personal_agent(
        message=message,
        email=email,
        language=req.language,
        subject=req.subject,
        title=req.title,
        history=req.history,
        context=req.context,
    )


@router.get("/status")
async def personal_assistant_status(email: str = "guest@student.com"):
    return get_personal_assistant_status(email=email)


@router.post("/connect")
async def personal_assistant_connect(req: ConnectServicePayload):
    return connect_service(email=req.email, service=req.service)


@router.post("/set-home")
async def personal_assistant_set_home(req: HomeAddressPayload):
    return set_home_address(email=req.email, address=req.address)


class ConfigPostPayload(BaseModel):
    user_id: Optional[str] = ""
    email: Optional[str] = ""
    name: Optional[str] = ""
    avatar: Optional[str] = ""
    identity: Optional[Dict[str, Any]] = None
    user: Optional[Dict[str, Any]] = None
    answers: Optional[Dict[str, Any]] = None
    onboarding_answers: Optional[Dict[str, Any]] = None
    personalization_answers: Optional[Dict[str, Any]] = None


@router.get("/config")
async def get_config(user_id: str = Query(default="")):
    """Get or check if a personal intelligence profile exists for a user."""
    uid = (user_id or "").strip()
    if not uid:
        return {"profile": None, "success": True}
    profile = _profile_store.get(uid)
    if profile:
        return {"profile": profile, "success": True, "data": {"profile": profile}}
    return {"profile": None, "success": True}


@router.post("/config")
async def create_or_update_config(req: ConfigPostPayload):
    """Create or update a personal intelligence profile."""
    uid = (req.user_id or "").strip()
    if not uid and req.identity:
        uid = (req.identity.get("user_id") or "").strip()
    if not uid and req.user:
        uid = (req.user.get("user_id") or "").strip()
    if not uid:
        uid = f"guest-{int(time.time())}"

    email = (req.email or "").strip()
    if not email and req.identity:
        email = (req.identity.get("email") or "").strip()
    if not email and req.user:
        email = (req.user.get("email") or "").strip()

    name = (req.name or "").strip()
    if not name and req.identity:
        name = (req.identity.get("name") or "").strip()
    if not name and req.user:
        name = (req.user.get("name") or "").strip()

    hash_input = f"{uid}:{email}:{time.time()}"
    unique_id = hashlib.sha256(hash_input.encode()).hexdigest()[:16]
    answers = req.answers or req.onboarding_answers or req.personalization_answers or {}

    existing = _profile_store.get(uid, {})
    profile = {
        **existing,
        "user_id": uid,
        "email": email,
        "name": name,
        "avatar": req.avatar or existing.get("avatar", ""),
        "unique_id": existing.get("unique_id") or unique_id,
        "unique_identifier": existing.get("unique_id") or unique_id,
        "profile_file": f"{uid}.piuser.json",
        "personalization_data": {
            "onboarding_answers": answers,
            "teaching_style": answers.get("teachingStyle", "socratic"),
            "response_length": answers.get("responseLength", "balanced"),
            "difficulty_level": answers.get("difficultyLevel", 3),
            "tone_adjustment": answers.get("toneAdjustment", "encouraging"),
            "memory_preference": answers.get("memoryPreference", "deep"),
            "learning_speed": answers.get("learningSpeed", "normal"),
        },
        "created_at": existing.get("created_at") or time.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "updated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ"),
    }
    _profile_store[uid] = profile
    return {"profile": profile, "success": True, "data": {"profile": profile}}
