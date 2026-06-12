"""Gamification data store for points, badges, and leaderboard."""
import json
import os
import time
from typing import Any, Dict, List, Optional


class GamificationStore:
    """File-backed store for gamification data."""

    def __init__(self, path: str):
        self._path = path
        self._data: Dict[str, Any] = {"users": {}}
        self._load()

    def _load(self):
        if os.path.exists(self._path):
            try:
                with open(self._path, "r", encoding="utf-8") as f:
                    self._data = json.load(f)
            except (json.JSONDecodeError, IOError):
                pass
        self._data.setdefault("users", {})

    def _save(self):
        try:
            os.makedirs(os.path.dirname(self._path) or ".", exist_ok=True)
            with open(self._path, "w", encoding="utf-8") as f:
                json.dump(self._data, f, indent=2, default=str)
        except IOError:
            pass

    def _ensure_user(self, email: str):
        email_key = email.strip().lower()
        if email_key not in self._data["users"]:
            self._data["users"][email_key] = {
                "email": email_key,
                "total_points": 0,
                "streak": 0,
                "badges": [],
                "history": [],
            }
        return self._data["users"][email_key]

    def add_points(self, email: str, points: int = 0, reason: Optional[str] = None,
                   subject: Optional[str] = None) -> Dict[str, Any]:
        email_key = email.strip().lower()
        user = self._ensure_user(email_key)
        user["total_points"] += points
        user["history"].append({
            "points": points,
            "reason": reason or "general",
            "subject": subject or "general",
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ"),
        })
        # Auto-award badges
        if user["total_points"] >= 100 and "century" not in user["badges"]:
            user["badges"].append("century")
        if user["total_points"] >= 500 and "scholar" not in user["badges"]:
            user["badges"].append("scholar")
        if user["total_points"] >= 1000 and "master" not in user["badges"]:
            user["badges"].append("master")
        self._save()
        return {"email": email_key, "total_points": user["total_points"], "badges": user["badges"]}

    def get_points(self, email: str) -> Dict[str, Any]:
        email_key = email.strip().lower()
        user = self._ensure_user(email_key)
        return {"email": email_key, "total_points": user["total_points"], "streak": user.get("streak", 0)}

    def get_badges(self, email: str) -> List[str]:
        email_key = email.strip().lower()
        user = self._ensure_user(email_key)
        return user.get("badges", [])

    def get_leaderboard(self, limit: int = 10) -> List[Dict[str, Any]]:
        users = sorted(
            self._data["users"].values(),
            key=lambda u: u.get("total_points", 0),
            reverse=True,
        )
        return [{"email": u["email"], "total_points": u["total_points"]} for u in users[:limit]]
