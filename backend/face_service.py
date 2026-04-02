from __future__ import annotations

import os
from collections import defaultdict, deque
from pathlib import Path
from typing import Deque, Dict, List, Optional, Tuple

import numpy as np

from .utils import (
    decode_base64_image,
    face_db_root,
    image_signature,
    movement_score,
    resize_for_deepface,
    save_face_images,
)

try:
    from deepface import DeepFace
except Exception as exc:  # pragma: no cover
    DeepFace = None
    DEEPFACE_IMPORT_ERROR = exc
else:
    DEEPFACE_IMPORT_ERROR = None


class DeepFaceService:
    def __init__(self) -> None:
        self.face_db_path = str(face_db_root())
        Path(self.face_db_path).mkdir(parents=True, exist_ok=True)
        self.model_name = os.environ.get("VIS_DEEPFACE_MODEL", "Facenet")
        self.distance_metric = os.environ.get("VIS_DISTANCE_METRIC", "cosine")
        self.detector_backend = os.environ.get("VIS_DETECTOR_BACKEND", "opencv")
        self._model = None
        self._liveness_frames: Dict[str, Deque[str]] = defaultdict(lambda: deque(maxlen=3))
        self._preload()

    def _preload(self) -> None:
        if DeepFace is None:
            return
        try:
            self._model = DeepFace.build_model(self.model_name)
        except Exception:
            self._model = None

    def _ensure_available(self) -> None:
        if DeepFace is None:
            raise RuntimeError(f"DeepFace is not available: {DEEPFACE_IMPORT_ERROR}")

    def _decode(self, image_b64: str) -> np.ndarray:
        return resize_for_deepface(decode_base64_image(image_b64))

    def detect_face(self, image_b64: str) -> Tuple[bool, int, List[Dict[str, object]]]:
        self._ensure_available()
        image = self._decode(image_b64)
        faces = DeepFace.extract_faces(
            img_path=image,
            detector_backend=self.detector_backend,
            enforce_detection=False,
        )
        valid_faces = [face for face in faces if face.get("confidence", 0) >= 0]
        ih, iw = image.shape[:2]
        face_rows: List[Dict[str, object]] = []
        for face in valid_faces:
            area = face.get("facial_area") or {}
            x = float(area.get("x", 0) or 0)
            y = float(area.get("y", 0) or 0)
            w = float(area.get("w", area.get("width", 0)) or 0)
            h = float(area.get("h", area.get("height", 0)) or 0)
            landmarks = []
            for key in ("left_eye", "right_eye", "nose", "mouth_left", "mouth_right"):
                point = area.get(key)
                if isinstance(point, (list, tuple)) and len(point) >= 2:
                    landmarks.append({
                        "name": key,
                        "x": float(point[0]) / max(1.0, iw),
                        "y": float(point[1]) / max(1.0, ih),
                    })
            face_rows.append({
                "confidence": float(face.get("confidence", 0) or 0),
                "box": {
                    "x": x / max(1.0, iw),
                    "y": y / max(1.0, ih),
                    "width": w / max(1.0, iw),
                    "height": h / max(1.0, ih),
                },
                "landmarks": landmarks,
            })
        return bool(valid_faces), len(valid_faces), face_rows

    def analyze_emotion(self, image_b64: str) -> str:
        self._ensure_available()
        image = self._decode(image_b64)
        result = DeepFace.analyze(
            img_path=image,
            actions=["emotion"],
            detector_backend=self.detector_backend,
            enforce_detection=False,
            silent=True,
        )
        payload = result[0] if isinstance(result, list) else result
        return str(payload.get("dominant_emotion", "neutral"))

    def _liveness_passed(self, client_key: str, image: np.ndarray) -> bool:
        signature = image_signature(image)
        buffer = self._liveness_frames[client_key]
        if signature in buffer:
            buffer.append(signature)
            return False
        buffer.append(signature)
        return len(buffer) >= 3 and len(set(buffer)) == len(buffer)

    def _has_registered_faces(self) -> bool:
        db_root = Path(self.face_db_path)
        if not db_root.exists():
            return False
        for ext in ("*.jpg", "*.jpeg", "*.png", "*.webp"):
            if any(db_root.rglob(ext)):
                return True
        return False

    def recognize_user(self, image_b64: str, client_key: str) -> Tuple[Optional[str], float, float, bool]:
        self._ensure_available()
        image = self._decode(image_b64)
        liveness = self._liveness_passed(client_key, image)
        if not liveness:
            return None, 0.0, 0.0, False

        if not self._has_registered_faces():
            return None, 0.0, 0.0, True

        result = None
        for attempt in range(2):
            try:
                result = DeepFace.find(
                    img_path=image,
                    db_path=self.face_db_path,
                    model_name=self.model_name,
                    distance_metric=self.distance_metric,
                    detector_backend=self.detector_backend,
                    enforce_detection=False,
                    silent=True,
                )
                break
            except Exception as exc:
                message = str(exc)
                lowered = message.lower()
                missing_face_db = "no item found in face_db" in lowered or (
                    "no item found" in lowered and "face_db" in lowered
                )
                if missing_face_db:
                    self._refresh_embeddings_cache()
                    if attempt == 0 and self._has_registered_faces():
                        continue
                    return None, 0.0, 0.0, True
                raise
        rows = result[0] if isinstance(result, list) else result
        if rows is None or getattr(rows, "empty", True):
            return None, 0.0, 0.0, True

        best = rows.iloc[0]
        identity = str(best.get("identity", ""))
        distance = float(best.get(self.distance_metric, best.get("distance", 1.0)))
        username = Path(identity).parent.name if identity else ""
        similarity = max(0.0, 1.0 - distance)
        confidence = max(0.0, min(100.0, similarity * 100.0))
        return (username or None), similarity, confidence, True

    def register_user(self, username: str, images_b64: List[str]) -> str:
        self._ensure_available()
        images = [self._decode(image) for image in images_b64 if image]
        if len(images) < 3:
            raise ValueError("At least 3 frames are required for registration")
        if movement_score(images[: min(len(images), 5)]) <= 1.0:
            raise ValueError("Registration failed liveness check")
        verification_pairs = [
            (0, len(images) - 1),
            (0, len(images) // 2),
            (len(images) // 3, (2 * len(images)) // 3),
            (1, max(2, len(images) - 2)),
            (max(0, len(images) // 4), max(0, (3 * len(images)) // 4)),
        ]
        consistent = False
        relaxed_matches = 0
        for left_index, right_index in verification_pairs:
            if left_index == right_index:
                continue
            verification = DeepFace.verify(
                img1_path=images[left_index],
                img2_path=images[right_index],
                model_name=self.model_name,
                distance_metric=self.distance_metric,
                detector_backend=self.detector_backend,
                enforce_detection=False,
                silent=True,
            )
            if verification.get("verified", False):
                consistent = True
                break
            distance = float(verification.get("distance", 1.0))
            threshold = float(verification.get("max_threshold_to_verify", 0.4) or 0.4)
            if distance <= threshold * 1.30:
                relaxed_matches += 1
            if distance <= threshold * 1.45:
                consistent = True
                break
        if not consistent and relaxed_matches >= 2:
            consistent = True
        if not consistent:
            raise ValueError("Registration frames are not consistent enough for one user")
        folder = save_face_images(username, images)
        self._refresh_embeddings_cache()
        return folder

    def _refresh_embeddings_cache(self) -> None:
        try:
            db_root = Path(self.face_db_path)
            cache = db_root / f"representations_{self.model_name.lower()}.pkl"
            if cache.exists():
                cache.unlink()
        except Exception:
            pass


face_service = DeepFaceService()
