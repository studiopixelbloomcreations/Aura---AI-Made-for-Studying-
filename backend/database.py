import os
from typing import Any, Dict, Optional

import requests


class SupabaseUsersRepository:
    def __init__(self) -> None:
        self.base_url = os.environ.get("SUPABASE_URL", "").rstrip("/")
        self.api_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_ANON_KEY", "")

    def _headers(self) -> Dict[str, str]:
        if not self.base_url or not self.api_key:
            raise RuntimeError("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
        return {
            "apikey": self.api_key,
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

    def _url(self, path: str) -> str:
        return f"{self.base_url}/rest/v1/{path.lstrip('/')}"

    def get_user(self, username: str) -> Optional[Dict[str, Any]]:
        response = requests.get(
            self._url(f"users?select=*&username=eq.{requests.utils.quote(username, safe='')}&limit=1"),
            headers=self._headers(),
            timeout=20,
        )
        response.raise_for_status()
        rows = response.json()
        return rows[0] if rows else None

    def upsert_user(
        self,
        username: str,
        face_folder_path: str,
        personalization_profile: Dict[str, Any],
        ai_config: Dict[str, Any],
        memory: Dict[str, Any],
    ) -> Dict[str, Any]:
        payload = {
            "username": username,
            "face_folder_path": face_folder_path,
            "personalization_profile": personalization_profile or {},
            "ai_config": ai_config or {},
            "memory": memory or {},
        }
        response = requests.post(
            self._url("users"),
            headers={**self._headers(), "Prefer": "resolution=merge-duplicates,return=representation"},
            json=payload,
            timeout=20,
        )
        response.raise_for_status()
        rows = response.json()
        return rows[0] if rows else payload
