"""Cross-Site Request Forgery (CSRF) Protection Module.

Provides:
- Cryptographic CSRF token generation (HMAC-SHA256 with timestamp)
- Constant-time verification
- Endpoint dependency for mutation routes (payments, admin actions)
- GET /api/v1/auth/csrf token dispenser
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import time
from typing import Any

from fastapi import Depends, HTTPException, Request, Response, status

from app.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)

CSRF_COOKIE_NAME = "csrf_token"
CSRF_HEADER_NAME = "x-csrf-token"
CSRF_EXPIRY_SECONDS = 3600  # 1 hour


def generate_csrf_token(secret: str | None = None, salt: str = "csrf") -> str:
    """Generate a signed, timestamped CSRF token."""
    key = (secret or settings.secret_key or "default-secret-key-csrf-32chars!").encode("utf-8")
    now = int(time.time())
    message = f"{salt}:{now}".encode("utf-8")
    sig = hmac.new(key, message, hashlib.sha256).hexdigest()
    raw = f"{salt}:{now}:{sig}"
    return base64.urlsafe_b64encode(raw.encode("utf-8")).decode("ascii")


def validate_csrf_token(token: str, secret: str | None = None, salt: str = "csrf") -> bool:
    """Validate CSRF token signature and freshness."""
    if not token:
        return False
    try:
        raw = base64.urlsafe_b64decode(token.encode("ascii")).decode("utf-8")
        parts = raw.split(":")
        if len(parts) != 3:
            return False
        token_salt, ts_str, signature = parts
        if token_salt != salt:
            return False

        ts = int(ts_str)
        now = int(time.time())
        # Check freshness (must not be older than 1 hour or from the future)
        if now - ts > CSRF_EXPIRY_SECONDS or ts > now + 60:
            return False

        key = (secret or settings.secret_key or "default-secret-key-csrf-32chars!").encode("utf-8")
        expected_msg = f"{salt}:{ts}".encode("utf-8")
        expected_sig = hmac.new(key, expected_msg, hashlib.sha256).hexdigest()

        return hmac.compare_digest(signature, expected_sig)
    except Exception as exc:
        logger.warning("csrf_validation_failed", error=str(exc))
        return False


async def verify_csrf_token(request: Request) -> None:
    """FastAPI dependency for protecting sensitive state-changing endpoints.
    
    Bearer tokens (Supabase JWTs) sent in Authorization header are immune to CSRF
    because browsers never automatically attach custom Authorization headers on cross-site requests.
    If the request relies on cookies or does not use Bearer auth, a valid CSRF token is required.
    """
    # 1. Bearer token requests are inherently immune to CSRF
    auth_header = request.headers.get("Authorization") or request.headers.get("authorization")
    if auth_header and auth_header.startswith("Bearer "):
        return

    # 2. Extract CSRF token from header or cookie
    token = request.headers.get(CSRF_HEADER_NAME) or request.headers.get("X-CSRF-Token")
    if not token:
        token = request.cookies.get(CSRF_COOKIE_NAME)

    if not token or not validate_csrf_token(token):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "error": "csrf_validation_failed",
                "message": "Invalid or missing CSRF token. Please refresh the page.",
            },
        )

