"""
core/auth_middleware.py
Firebase Authentication middleware for AURA AI.
Every HTTP endpoint and WebSocket connection must verify Firebase token.
No anonymous sessions allowed.
"""

import logging
import json
from typing import Optional

from fastapi import Request, WebSocket, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

logger = logging.getLogger("aevra.auth")

# ──────────────────────────────────────────────
# Firebase Admin SDK initialization (lazy)
# ──────────────────────────────────────────────
_firebase_initialized = False
_firebase_auth = None


def init_firebase():
    """Initialize Firebase Admin SDK once. Safe to call multiple times."""
    global _firebase_initialized, _firebase_auth
    if _firebase_initialized:
        return _firebase_auth is not None

    try:
        import firebase_admin
        from firebase_admin import credentials, auth as fb_auth

        if firebase_admin._apps:
            _firebase_auth = fb_auth
            _firebase_initialized = True
            logger.info("Firebase Admin SDK: using existing app")
            return True

        # Try credential from env_config
        from core.env_config import (
            FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY,
            FIREBASE_PUBLIC_CONFIG
        )

        if FIREBASE_PROJECT_ID and FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY:
            cred = credentials.Certificate({
                "type": "service_account",
                "project_id": FIREBASE_PROJECT_ID,
                "client_email": FIREBASE_CLIENT_EMAIL,
                "private_key": FIREBASE_PRIVATE_KEY,
            })
            firebase_admin.initialize_app(cred)
        elif FIREBASE_PUBLIC_CONFIG and FIREBASE_PUBLIC_CONFIG.get("projectId"):
            # Minimal init with project ID only (token verification still works)
            firebase_admin.initialize_app(options={
                "projectId": FIREBASE_PUBLIC_CONFIG["projectId"],
            })
        else:
            logger.error("Firebase Admin SDK: no credentials configured")
            _firebase_initialized = True
            return False

        _firebase_auth = fb_auth
        _firebase_initialized = True
        logger.info(f"Firebase Admin SDK initialized (project: {FIREBASE_PROJECT_ID or FIREBASE_PUBLIC_CONFIG.get('projectId')})")
        return True

    except ImportError:
        logger.error("firebase-admin package not installed")
        _firebase_initialized = True
        return False
    except Exception as e:
        logger.error(f"Firebase Admin SDK init failed: {e}")
        _firebase_initialized = True
        return False


def verify_firebase_token(token: str) -> Optional[dict]:
    """
    Verify a Firebase ID token. Returns decoded token dict on success, None on failure.
    Decoded token contains: uid, email, name, picture, etc.
    """
    if not init_firebase() or _firebase_auth is None:
        logger.warning("Firebase not initialized, cannot verify token")
        return None

    try:
        decoded = _firebase_auth.verify_id_token(token, check_revoked=True)
        return decoded
    except Exception as e:
        logger.warning(f"Firebase token verification failed: {e}")
        return None


def extract_token_from_header(authorization: Optional[str]) -> Optional[str]:
    """Extract Bearer token from Authorization header."""
    if not authorization:
        return None
    parts = authorization.split(" ", 1)
    if len(parts) != 2 or parts[0].lower() != "bearer":
        return None
    return parts[1].strip()


# ──────────────────────────────────────────────
# FastAPI Dependencies
# ──────────────────────────────────────────────
_security = HTTPBearer(auto_error=False)


async def require_auth(request: Request) -> dict:
    """
    FastAPI dependency: require valid Firebase token for HTTP endpoints.
    Returns decoded token info including user_id (uid).
    
    Usage:
        @app.get("/protected")
        async def protected(user: dict = Depends(require_auth)):
            user_id = user["uid"]
    """
    auth_header = request.headers.get("Authorization", "")
    token = extract_token_from_header(auth_header)

    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid Authorization header. Expected: Bearer <firebase_token>",
        )

    decoded = verify_firebase_token(token)
    if decoded is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired Firebase token",
        )

    return {
        "uid": decoded.get("uid", ""),
        "email": decoded.get("email", ""),
        "name": decoded.get("name", ""),
        "picture": decoded.get("picture", ""),
        "email_verified": decoded.get("email_verified", False),
    }


async def require_ws_auth(websocket: WebSocket) -> Optional[dict]:
    """
    Verify Firebase token for WebSocket connections.
    Token is passed as query parameter: ?token=<firebase_id_token>
    
    Returns decoded token dict on success, None on failure.
    Caller must close WebSocket if None is returned.
    """
    token = websocket.query_params.get("token", "")
    if not token:
        # Also try Authorization header
        auth_header = websocket.headers.get("Authorization", "")
        token = extract_token_from_header(auth_header) or ""

    if not token:
        return None

    decoded = verify_firebase_token(token)
    if decoded is None:
        return None

    return {
        "uid": decoded.get("uid", ""),
        "email": decoded.get("email", ""),
        "name": decoded.get("name", ""),
    }


# ──────────────────────────────────────────────
# Supabase Client (service role, backend only)
# ──────────────────────────────────────────────
_supabase_client = None


def get_supabase_client():
    """Get Supabase client with service role key (backend only). Never expose to frontend."""
    global _supabase_client
    if _supabase_client is not None:
        return _supabase_client

    from core.env_config import SUPABASE_URL, SUPABASE_SERVICE_KEY
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        logger.error("Supabase not configured (missing URL or service key)")
        return None

    try:
        from supabase import create_client, Client
        _supabase_client: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
        logger.info("Supabase client initialized (service role)")
        return _supabase_client
    except ImportError:
        logger.error("supabase package not installed. Install with: pip install supabase")
        return None
    except Exception as e:
        logger.error(f"Supabase client init failed: {e}")
        return None
