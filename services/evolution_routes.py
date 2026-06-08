"""
services/evolution_routes.py
API routes for the Evolution Engine (FastAPI persistent runtime).
All endpoints require Firebase authentication.
"""

import logging
from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from core.auth_middleware import require_auth
from services.evolution_service import get_evolution_service

logger = logging.getLogger("aevra.evolution_routes")

router = APIRouter(prefix="/api/evolution", tags=["evolution"])


class ExperiencePayload(BaseModel):
    trigger_type: str
    trigger_data: dict = {}
    response: dict = {}
    outcome: Optional[str] = None
    score: float = 0
    metadata: dict = {}


class ScoreCardPayload(BaseModel):
    dimension: str
    score: float
    weight: float = 1.0
    trend: str = "stable"
    metadata: dict = {}


class InteractionPayload(BaseModel):
    interaction_type: str
    quality_score: float
    context: dict = {}


@router.get("/status")
async def evolution_status(user: dict = Depends(require_auth)):
    """Get evolution status for authenticated user."""
    svc = get_evolution_service()
    return await svc.get_evolution_status(user["uid"])


@router.get("/experiences")
async def get_experiences(
    limit: int = 20,
    trigger_type: Optional[str] = None,
    user: dict = Depends(require_auth),
):
    """Get recent evolution experiences."""
    svc = get_evolution_service()
    experiences = await svc.get_experiences(user["uid"], limit=limit, trigger_type=trigger_type)
    return {"experiences": experiences, "count": len(experiences)}


@router.post("/experience")
async def record_experience(req: ExperiencePayload, user: dict = Depends(require_auth)):
    """Record a new evolution experience."""
    svc = get_evolution_service()
    result = await svc.record_experience(
        user_id=user["uid"],
        trigger_type=req.trigger_type,
        trigger_data=req.trigger_data,
        response=req.response,
        outcome=req.outcome,
        score=req.score,
        metadata=req.metadata,
    )
    return result


@router.get("/score-cards")
async def get_score_cards(user: dict = Depends(require_auth)):
    """Get evolution score cards."""
    svc = get_evolution_service()
    cards = await svc.get_score_cards(user["uid"])
    return {"score_cards": cards}


@router.post("/score-card")
async def update_score_card(req: ScoreCardPayload, user: dict = Depends(require_auth)):
    """Update a score card dimension."""
    svc = get_evolution_service()
    return await svc.update_score_card(
        user_id=user["uid"],
        dimension=req.dimension,
        score=req.score,
        weight=req.weight,
        trend=req.trend,
        metadata=req.metadata,
    )


@router.post("/interact")
async def evolve_from_interaction(req: InteractionPayload, user: dict = Depends(require_auth)):
    """Process an interaction and evolve the system."""
    svc = get_evolution_service()
    return await svc.evolve_from_interaction(
        user_id=user["uid"],
        interaction_type=req.interaction_type,
        quality_score=req.quality_score,
        context=req.context,
    )
