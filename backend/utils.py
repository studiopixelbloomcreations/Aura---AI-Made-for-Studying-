import base64
import hashlib
import io
import os
import re
from pathlib import Path
from typing import Iterable, List

import cv2
import numpy as np
from PIL import Image


FACE_IMAGE_SIZE = (224, 224)


def project_root() -> Path:
    return Path(__file__).resolve().parents[1]


def face_db_root() -> Path:
    root = os.environ.get("FACE_DB_ROOT", "").strip()
    return Path(root) if root else project_root() / "face_db"


def ensure_dir(path: Path) -> Path:
    path.mkdir(parents=True, exist_ok=True)
    return path


def sanitize_username(value: str) -> str:
    safe = re.sub(r"[^a-zA-Z0-9._-]+", "_", (value or "").strip())
    return safe.strip("._") or "user"


def decode_base64_image(image_b64: str) -> np.ndarray:
    value = (image_b64 or "").strip()
    if value.startswith("data:"):
        value = value.split(",", 1)[1]
    raw = base64.b64decode(value)
    image = Image.open(io.BytesIO(raw)).convert("RGB")
    return np.array(image)


def resize_for_deepface(image: np.ndarray) -> np.ndarray:
    resized = cv2.resize(image, FACE_IMAGE_SIZE, interpolation=cv2.INTER_AREA)
    return resized


def image_signature(image: np.ndarray) -> str:
    encoded = cv2.imencode(".jpg", cv2.cvtColor(image, cv2.COLOR_RGB2BGR))[1].tobytes()
    return hashlib.sha256(encoded).hexdigest()


def movement_score(images: Iterable[np.ndarray]) -> float:
    frames: List[np.ndarray] = []
    for image in images:
        gray = cv2.cvtColor(resize_for_deepface(image), cv2.COLOR_RGB2GRAY)
        frames.append(gray)
    if len(frames) < 2:
        return 0.0
    diffs = []
    for prev, curr in zip(frames, frames[1:]):
        diffs.append(float(np.mean(cv2.absdiff(prev, curr))))
    return float(sum(diffs) / max(len(diffs), 1))


def save_face_images(username: str, images: List[np.ndarray]) -> str:
    folder = ensure_dir(face_db_root() / sanitize_username(username))
    for index, image in enumerate(images):
        target = folder / f"frame_{index + 1:02d}.jpg"
        rgb = resize_for_deepface(image)
        Image.fromarray(rgb).save(target, format="JPEG", quality=90)
    return str(folder)
