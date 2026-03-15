from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
import base64
import io
import os

from PIL import Image
import numpy as np

try:
    from deepface import DeepFace
except Exception:
    DeepFace = None


router = APIRouter()


class FaceEmbedRequest(BaseModel):
    image_base64: str
    detector: Optional[str] = None
    model: Optional[str] = None
    enforce_detection: Optional[bool] = True


def _decode_image(data_url: str) -> np.ndarray:
    if not data_url:
        raise ValueError("empty image payload")
    if data_url.startswith("data:"):
        comma = data_url.find(",")
        if comma != -1:
            data_url = data_url[comma + 1 :]
    raw = base64.b64decode(data_url)
    img = Image.open(io.BytesIO(raw)).convert("RGB")
    return np.array(img)


@router.get("/vis/face/health")
def vis_face_health() -> Dict[str, Any]:
    return {"ok": DeepFace is not None}


@router.post("/vis/face/embedding")
def vis_face_embedding(req: FaceEmbedRequest) -> Dict[str, Any]:
    if DeepFace is None:
        raise HTTPException(status_code=503, detail="DeepFace not installed")

    model_name = req.model or os.environ.get("DEEPFACE_MODEL", "Facenet512")
    detector = req.detector or os.environ.get("DEEPFACE_DETECTOR", "opencv")
    enforce = True if req.enforce_detection is None else bool(req.enforce_detection)

    try:
        img = _decode_image(req.image_base64)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Invalid image payload: {exc}")

    try:
        reps = DeepFace.represent(
            img_path=img,
            model_name=model_name,
            detector_backend=detector,
            enforce_detection=enforce,
            align=True,
        )
    except Exception as exc:
        # No face or detector failure
        return {"faces": [], "model": model_name, "detector": detector, "error": str(exc)}

    faces: List[Dict[str, Any]] = []
    if isinstance(reps, dict):
        reps = [reps]
    if isinstance(reps, list):
        for r in reps:
            emb = r.get("embedding") if isinstance(r, dict) else None
            area = r.get("facial_area") if isinstance(r, dict) else None
            area = area or {}
            faces.append(
                {
                    "embedding": emb or [],
                    "box": {
                        "x": int(area.get("x", 0) or 0),
                        "y": int(area.get("y", 0) or 0),
                        "width": int(area.get("w", 0) or 0),
                        "height": int(area.get("h", 0) or 0),
                    },
                    "score": float(r.get("face_confidence", r.get("confidence", 0)) or 0),
                }
            )

    return {"faces": faces, "model": model_name, "detector": detector}
