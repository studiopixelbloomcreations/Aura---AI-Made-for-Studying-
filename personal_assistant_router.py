from typing import Dict, List, Optional, Any

from fastapi import APIRouter
from pydantic import BaseModel

from personal_assistant_service import (
    ask_aevra_personal_agent,
    connect_service,
    create_openai_realtime_session,
    get_personal_assistant_status,
    set_home_address,
)


router = APIRouter(prefix="/personal-intelligence", tags=["personal-intelligence"])


class PersonalAssistantAskRequest(BaseModel):
    message: str
    email: Optional[str] = "guest@student.com"
    language: Optional[str] = "English"
    subject: Optional[str] = "General"
    title: Optional[str] = "Perosnla IIntelligence"
    history: Optional[List[Dict[str, str]]] = None
    context: Optional[Dict[str, Any]] = None


class ConnectServicePayload(BaseModel):
    email: Optional[str] = "guest@student.com"
    service: str


class HomeAddressPayload(BaseModel):
    email: Optional[str] = "guest@student.com"
    address: str


class RealtimeSessionPayload(BaseModel):
    email: Optional[str] = "guest@student.com"


@router.post("/ask")
async def personal_assistant_ask(req: PersonalAssistantAskRequest):
    return ask_aevra_personal_agent(
        message=req.message,
        email=req.email,
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


@router.post("/realtime/session")
async def personal_assistant_realtime_session(req: RealtimeSessionPayload):
    return create_openai_realtime_session(email=req.email)
