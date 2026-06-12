"""Personalization data store for user profiles, progress, and feedback."""
import json
import os
import time
from dataclasses import dataclass, field, asdict
from typing import Any, Dict, List, Optional


@dataclass
class TopicProgress:
    topic: str
    total_questions: int = 0
    total_correct: int = 0
    total_score: int = 0
    last_question: str = ""
    last_updated: str = ""


@dataclass
class UserProfile:
    email: str
    name: str = ""
    grade: str = ""
    preferred_language: str = "English"
    created_at: str = ""
    updated_at: str = ""


@dataclass
class UserFeedback:
    total_positive: int = 0
    total_negative: int = 0


class PersonalizationStore:
    """File-backed store for user personalization data."""

    def __init__(self, path: str):
        self._path = path
        self._data: Dict[str, Any] = {"profiles": {}, "progress": {}, "feedback": {}}
        self._load()

    def _load(self):
        if os.path.exists(self._path):
            try:
                with open(self._path, "r", encoding="utf-8") as f:
                    self._data = json.load(f)
            except (json.JSONDecodeError, IOError):
                pass
        # Ensure required keys
        self._data.setdefault("profiles", {})
        self._data.setdefault("progress", {})
        self._data.setdefault("feedback", {})

    def _save(self):
        try:
            os.makedirs(os.path.dirname(self._path) or ".", exist_ok=True)
            with open(self._path, "w", encoding="utf-8") as f:
                json.dump(self._data, f, indent=2, default=str)
        except IOError:
            pass

    def upsert_profile(self, email: str, name: Optional[str] = None,
                       grade: Optional[str] = None, preferred_language: Optional[str] = None) -> UserProfile:
        email_key = (email or "guest@student.com").strip().lower()
        existing = self._data["profiles"].get(email_key, {})
        now = time.strftime("%Y-%m-%dT%H:%M:%SZ")
        profile = UserProfile(
            email=email_key,
            name=name or existing.get("name", ""),
            grade=grade or existing.get("grade", ""),
            preferred_language=preferred_language or existing.get("preferred_language", "English"),
            created_at=existing.get("created_at", now),
            updated_at=now,
        )
        self._data["profiles"][email_key] = asdict(profile)
        self._save()
        return profile

    def record_attempt(self, email: str, topic: str, correct: bool,
                       score: int = 0, question: Optional[str] = None) -> TopicProgress:
        email_key = (email or "guest@student.com").strip().lower()
        topic_key = (topic or "general").strip().lower()
        progress_key = f"{email_key}:{topic_key}"
        existing = self._data["progress"].get(progress_key, {})
        now = time.strftime("%Y-%m-%dT%H:%M:%SZ")
        progress = TopicProgress(
            topic=topic_key,
            total_questions=existing.get("total_questions", 0) + 1,
            total_correct=existing.get("total_correct", 0) + (1 if correct else 0),
            total_score=existing.get("total_score", 0) + score,
            last_question=question or existing.get("last_question", ""),
            last_updated=now,
        )
        self._data["progress"][progress_key] = asdict(progress)
        self._save()
        return progress

    def get_user_snapshot(self, email: str) -> Dict[str, Any]:
        email_key = (email or "guest@student.com").strip().lower()
        profile = self._data["profiles"].get(email_key, {})
        # Aggregate progress
        total_questions = 0
        total_correct = 0
        total_score = 0
        for key, val in self._data["progress"].items():
            if key.startswith(f"{email_key}:"):
                total_questions += val.get("total_questions", 0)
                total_correct += val.get("total_correct", 0)
                total_score += val.get("total_score", 0)
        progress = {
            "total_questions": total_questions,
            "total_correct": total_correct,
            "total_score": total_score,
        }
        feedback = self._data["feedback"].get(email_key, {"total_positive": 0, "total_negative": 0})
        return {"profile": profile, "progress": progress, "feedback": feedback}

    def reset_user(self, email: str):
        email_key = (email or "guest@student.com").strip().lower()
        # Remove all progress entries for this email
        keys_to_remove = [k for k in self._data["progress"] if k.startswith(f"{email_key}:")]
        for k in keys_to_remove:
            del self._data["progress"][k]
        self._data["feedback"].pop(email_key, None)
        self._save()
