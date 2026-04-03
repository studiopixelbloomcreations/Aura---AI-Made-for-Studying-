from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class ImagePayload(BaseModel):
    image: str = Field(..., min_length=1)


class RegisterUserPayload(BaseModel):
    username: str = Field(..., min_length=1)
    images: List[str] = Field(..., min_length=1)
    personalization_profile: Dict[str, Any] = Field(default_factory=dict)
    ai_config: Dict[str, Any] = Field(default_factory=dict)
    memory: Dict[str, Any] = Field(default_factory=dict)


class DetectFaceResponse(BaseModel):
    face_detected: bool
    face_count: int
    faces: List[Dict[str, Any]] = Field(default_factory=list)


class RecognizeUserResponse(BaseModel):
    user_id: Optional[str]
    similarity: float
    confidence: float
    liveness_passed: bool


class AnalyzeEmotionResponse(BaseModel):
    emotion: str


class ProcessFaceResponse(BaseModel):
    face_detected: bool
    face_count: int = 0
    faces: List[Dict[str, Any]] = Field(default_factory=list)
    user_id: Optional[str] = None
    similarity: float = 0.0
    confidence: float = 0.0
    liveness_passed: bool = False
    emotion: str = "neutral"


class UserProfileResponse(BaseModel):
    id: Optional[str] = None
    username: str
    face_folder_path: str
    personalization_profile: Dict[str, Any] = Field(default_factory=dict)
    ai_config: Dict[str, Any] = Field(default_factory=dict)
    memory: Dict[str, Any] = Field(default_factory=dict)
