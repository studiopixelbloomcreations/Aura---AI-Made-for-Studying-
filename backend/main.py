from fastapi import APIRouter, HTTPException, Request

from .database import SupabaseUsersRepository
from .face_service import face_service
from .models import (
    AnalyzeEmotionResponse,
    DetectFaceResponse,
    ImagePayload,
    RecognizeUserResponse,
    RegisterUserPayload,
    UserProfileResponse,
)

router = APIRouter()
users_repo = SupabaseUsersRepository()


def client_key(request: Request) -> str:
    host = request.client.host if request.client else "anonymous"
    agent = request.headers.get("user-agent", "unknown")
    return f"{host}:{agent}"


@router.post("/detect-face", response_model=DetectFaceResponse)
async def detect_face(payload: ImagePayload) -> DetectFaceResponse:
    try:
        detected, count = face_service.detect_face(payload.image)
        return DetectFaceResponse(face_detected=detected, face_count=count)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/recognize-user", response_model=RecognizeUserResponse)
async def recognize_user(payload: ImagePayload, request: Request) -> RecognizeUserResponse:
    try:
        user_id, similarity, confidence, liveness = face_service.recognize_user(payload.image, client_key(request))
        return RecognizeUserResponse(
            user_id=user_id,
            similarity=similarity,
            confidence=confidence,
            liveness_passed=liveness,
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/register-user")
async def register_user(payload: RegisterUserPayload):
    try:
        folder = face_service.register_user(payload.username, payload.images)
        record = users_repo.upsert_user(
            username=payload.username,
            face_folder_path=folder,
            personalization_profile=payload.personalization_profile,
            ai_config=payload.ai_config,
            memory=payload.memory,
        )
        return {"success": True, "user": record}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/analyze-emotion", response_model=AnalyzeEmotionResponse)
async def analyze_emotion(payload: ImagePayload) -> AnalyzeEmotionResponse:
    try:
        emotion = face_service.analyze_emotion(payload.image)
        return AnalyzeEmotionResponse(emotion=emotion)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/user-profile/{username}", response_model=UserProfileResponse)
async def user_profile(username: str) -> UserProfileResponse:
    try:
        user = users_repo.get_user(username)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        return UserProfileResponse(**user)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
