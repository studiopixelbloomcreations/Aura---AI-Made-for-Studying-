"""
core/env_config.py
Environment configuration loader for AURA AI.

Supports TWO modes:
  1. Single JSON env var: AURA_ENV='{"KEY":"value",...}' (Vercel / production)
  2. Individual env vars via .env.development / .env.production (local dev)

If AURA_ENV is set, ALL config is read from that single JSON string.
Otherwise falls back to individual environment variables.
"""

import os
import json
import logging
from typing import Optional

logger = logging.getLogger("aevra.env")

# ──────────────────────────────────────────────
# SINGLE ENV VAR MODE (AURA_ENV = JSON string)
# ──────────────────────────────────────────────
_AURA_ENV_RAW = os.environ.get("AURA_ENV", "").strip()
_AURA_ENV: dict = {}
if _AURA_ENV_RAW:
    try:
        _AURA_ENV = json.loads(_AURA_ENV_RAW)
        # Inject all keys into os.environ so downstream code works normally
        for _k, _v in _AURA_ENV.items():
            if _k not in os.environ or not os.environ[_k]:
                os.environ[_k] = str(_v)
        logger.info(f"Loaded {len(_AURA_ENV)} config keys from AURA_ENV")
    except json.JSONDecodeError as e:
        logger.error(f"AURA_ENV is not valid JSON: {e}")

# Determine environment
ENVIRONMENT = _AURA_ENV.get("ENVIRONMENT", os.environ.get("ENVIRONMENT", "development")).strip().lower()
IS_PRODUCTION = ENVIRONMENT == "production"

# Load environment-specific .env file (only if AURA_ENV not set)
if not _AURA_ENV_RAW:
    _env_file = f".env.{ENVIRONMENT}"
    if os.path.exists(_env_file):
        try:
            from dotenv import load_dotenv
            load_dotenv(_env_file, override=False)
            logger.info(f"Loaded {_env_file}")
        except ImportError:
            logger.warning("python-dotenv not installed, skipping .env file loading")


def _get(key: str, default: str = "") -> str:
    """Get environment variable with fallback."""
    return os.environ.get(key, default)


def _get_required(key: str) -> str:
    """Get required environment variable, raise if missing."""
    val = os.environ.get(key, "").strip()
    if not val:
        raise RuntimeError(f"Required environment variable '{key}' is not set")
    return val


# ──────────────────────────────────────────────
# Supabase
# ──────────────────────────────────────────────
SUPABASE_URL = _get("SUPABASE_URL")
SUPABASE_ANON_KEY = _get("SUPABASE_ANON_KEY")
SUPABASE_SERVICE_KEY = _get("SUPABASE_SERVICE_KEY")


# ──────────────────────────────────────────────
# Firebase
# ──────────────────────────────────────────────
FIREBASE_PROJECT_ID = _get("FIREBASE_PROJECT_ID")
FIREBASE_CLIENT_EMAIL = _get("FIREBASE_CLIENT_EMAIL")
FIREBASE_PRIVATE_KEY = _get("FIREBASE_PRIVATE_KEY", "").replace("\\n", "\n")
FIREBASE_DATABASE_URL = _get("FIREBASE_DATABASE_URL")

# Public Firebase config (safe to send to client)
FIREBASE_PUBLIC_CONFIG: Optional[dict] = None
_raw_firebase = _get("FIREBASE_CONFIG")
if _raw_firebase:
    try:
        FIREBASE_PUBLIC_CONFIG = json.loads(_raw_firebase)
    except json.JSONDecodeError:
        logger.warning("FIREBASE_CONFIG is not valid JSON")


# ──────────────────────────────────────────────
# AI Provider Keys
# ──────────────────────────────────────────────
GROQ_API_KEY = _get("GROQ_API_KEY")
OPENROUTER_API_KEY = _get("OPENROUTER_API_KEY")
MISTRAL_API_KEY = _get("MISTRAL_API_KEY")
GEMINI_API_KEY = _get("GEMINI_API_KEY")
OPENAI_API_KEY = _get("OPENAI_API_KEY")
DEEPSEEK_API_KEY = _get("DEEPSEEK_API_KEY")
HUGGINGFACE_API_KEY = _get("HUGGINGFACE_API_KEY")
PUTER_API_KEY = _get("PUTER_API_KEY")
ELEVENLABS_API_KEY = _get("ELEVENLABS_API_KEY")


# ──────────────────────────────────────────────
# Server / Deployment
# ──────────────────────────────────────────────
BACKEND_BASE_URL = _get("BACKEND_BASE_URL", "http://localhost:8000")
FRONTEND_BASE_URL = _get("FRONTEND_BASE_URL", "http://localhost:5500")
FASTAPI_BASE_URL = _get("FASTAPI_BASE_URL", BACKEND_BASE_URL)
ALLOWED_ORIGINS_RAW = _get("ALLOWED_ORIGINS", "")

# WebSocket URL for AURA LIVE
LIVE_WS_URL = _get("LIVE_WS_URL", BACKEND_BASE_URL.replace("https://", "wss://").replace("http://", "ws://"))


# ──────────────────────────────────────────────
# Cost & Rate Limits
# ──────────────────────────────────────────────
DAILY_COST_CEILING_USD = float(_get("DAILY_COST_CEILING_USD", "5.00"))
RATE_LIMIT_REQUESTS_PER_MINUTE = int(_get("RATE_LIMIT_REQUESTS_PER_MINUTE", "30"))
RATE_LIMIT_LIVE_SESSIONS_PER_USER = int(_get("RATE_LIMIT_LIVE_SESSIONS_PER_USER", "1"))
GEMINI_LIVE_TIMEOUT_SECONDS = int(_get("GEMINI_LIVE_TIMEOUT_SECONDS", "30"))


# ──────────────────────────────────────────────
# CORS Origins
# ──────────────────────────────────────────────
def get_allowed_origins() -> list[str]:
    """Return list of allowed CORS origins based on environment."""
    defaults = {
        "http://127.0.0.1:5500",
        "http://localhost:5500",
        "http://127.0.0.1:8000",
        "http://localhost:8000",
    }
    env_origins = set()
    if ALLOWED_ORIGINS_RAW:
        env_origins = {o.strip() for o in ALLOWED_ORIGINS_RAW.split(",") if o.strip()}
    if IS_PRODUCTION:
        # In production, only allow explicitly configured origins
        return sorted(env_origins) if env_origins else []
    return sorted(defaults | env_origins)


# ──────────────────────────────────────────────
# Validation
# ──────────────────────────────────────────────
def validate_config() -> dict:
    """Validate that required config is present. Returns status dict."""
    issues = []
    
    if not SUPABASE_URL:
        issues.append("SUPABASE_URL not set")
    if not SUPABASE_SERVICE_KEY:
        issues.append("SUPABASE_SERVICE_KEY not set")
    if not GROQ_API_KEY:
        issues.append("GROQ_API_KEY not set (text chat will fail)")
    if not GEMINI_API_KEY:
        issues.append("GEMINI_API_KEY not set (AURA LIVE will be unavailable)")
    if not FIREBASE_PROJECT_ID and not FIREBASE_PUBLIC_CONFIG:
        issues.append("Firebase not configured (auth will fail)")
    
    return {
        "environment": ENVIRONMENT,
        "is_production": IS_PRODUCTION,
        "valid": len(issues) == 0,
        "issues": issues,
        "supabase": bool(SUPABASE_URL and SUPABASE_SERVICE_KEY),
        "firebase": bool(FIREBASE_PROJECT_ID or FIREBASE_PUBLIC_CONFIG),
        "groq": bool(GROQ_API_KEY),
        "gemini": bool(GEMINI_API_KEY),
    }


logger.info(f"AURA AI environment: {ENVIRONMENT} (production={IS_PRODUCTION})")
