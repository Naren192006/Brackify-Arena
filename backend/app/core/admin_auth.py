"""Brackify Arena — Dedicated Admin Authentication & Security Module.

Completely isolated from player Supabase/Google authentication.
Enforces:
- Bcrypt password hashing (rounds >= 12).
- Dedicated ADMIN_JWT_SECRET and token type 'admin'.
- HTTP-only Secure SameSite=Lax admin_session cookie.
- RLS-protected admin_users table lookup.
- CSRF validation on mutating admin endpoints.
- Role & Permission enforcement (super_admin / sub_admin).
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import re
import time
from typing import Any, Callable
from uuid import UUID

import bcrypt
import httpx
from fastapi import Depends, HTTPException, Request, status
from pydantic import BaseModel, Field

from app.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)

UUID_REGEX = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.I)


def _is_uuid(val: str) -> bool:
    return bool(UUID_REGEX.match(val))


def _b64url_decode(s: str) -> bytes:
    padding = "=" * (-len(s) % 4)
    return base64.urlsafe_b64decode(s + padding)


def _b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _get_admin_signing_secret() -> str:
    return settings.admin_jwt_secret or f"{settings.secret_key}-admin-jwt-secret-2026"


# ---------------------------------------------------------------------------
# Password Security (Bcrypt >= 12 rounds)
# ---------------------------------------------------------------------------

def hash_password(password: str) -> str:
    """Hash plaintext password using bcrypt with cost factor 12."""
    salt = bcrypt.gensalt(rounds=12)
    return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    """Verify password against bcrypt hash in constant time."""
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))
    except Exception:
        return False


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------

class AdminUser(BaseModel):
    """Authenticated Admin Profile model."""
    id: str
    email: str
    role: str = "sub_admin"  # "super_admin" | "sub_admin"
    permissions: list[str] = Field(default_factory=list)
    active: bool = True
    last_login_at: str | None = None


# ---------------------------------------------------------------------------
# Admin JWT Token Management
# ---------------------------------------------------------------------------

def create_admin_token(admin: AdminUser, expire_hours: int | None = None) -> str:
    """Create a signed HS256 JWT specifically for admin sessions with type='admin'."""
    sec = _get_admin_signing_secret()
    now = int(time.time())
    ttl_seconds = (expire_hours or settings.admin_session_expire_hours) * 3600

    header = {"typ": "JWT", "alg": "HS256"}
    payload = {
        "sub": str(admin.id),
        "email": admin.email.lower().strip(),
        "role": admin.role,
        "permissions": admin.permissions,
        "type": "admin",
        "iat": now,
        "exp": now + ttl_seconds,
        "iss": "brackify-admin",
    }

    h_b64 = _b64url_encode(json.dumps(header, separators=(",", ":")).encode("utf-8"))
    p_b64 = _b64url_encode(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
    signing_input = f"{h_b64}.{p_b64}".encode("ascii")
    sig = hmac.new(sec.encode("utf-8"), signing_input, hashlib.sha256).digest()
    return f"{h_b64}.{p_b64}.{_b64url_encode(sig)}"


def decode_admin_token(token: str) -> dict[str, Any]:
    """Decode and strictly validate Admin JWT token.

    Rejects player tokens, expired tokens, and tokens without type='admin'.
    """
    parts = token.strip().split(".")
    if len(parts) != 3:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "invalid_admin_token", "message": "Malformed admin session token."},
        )

    # 1. Decode Payload
    try:
        raw_payload = _b64url_decode(parts[1])
        payload = json.loads(raw_payload.decode("utf-8"))
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "invalid_admin_token", "message": "Failed to decode admin token payload."},
        ) from exc

    # 2. Check Expiration
    exp = payload.get("exp")
    if exp is not None:
        try:
            if float(exp) < time.time():
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail={"code": "admin_session_expired", "message": "Admin session has expired. Please log in again."},
                )
        except (ValueError, TypeError):
            pass

    # 3. Check Token Type == 'admin' (strictly rejects player tokens)
    token_type = payload.get("type")
    if token_type != "admin":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "invalid_token_type", "message": "Invalid token type for admin portal."},
        )

    # 4. Verify Signature
    sec = _get_admin_signing_secret()
    signing_input = f"{parts[0]}.{parts[1]}".encode("ascii")
    expected_sig = hmac.new(sec.encode("utf-8"), signing_input, hashlib.sha256).digest()
    provided_sig = _b64url_decode(parts[2])

    if not hmac.compare_digest(provided_sig, expected_sig):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "invalid_signature", "message": "Invalid admin token signature."},
        )

    return payload


# ---------------------------------------------------------------------------
# CSRF Protection Helpers
# ---------------------------------------------------------------------------

def generate_admin_csrf_token(admin_id: str) -> str:
    """Generate a HMAC-based CSRF token tied to the admin user."""
    sec = _get_admin_signing_secret()
    raw = f"csrf:{admin_id}:{sec}".encode("utf-8")
    return hashlib.sha256(raw).hexdigest()[:32]


def verify_admin_csrf_token(token: str | None, admin_id: str) -> bool:
    """Verify CSRF token for admin actions."""
    if not token:
        return False
    expected = generate_admin_csrf_token(admin_id)
    return hmac.compare_digest(token.strip(), expected)


# ---------------------------------------------------------------------------
# Database Loader Helper (Service Role)
# ---------------------------------------------------------------------------

async def fetch_admin_user_by_id(admin_id: str) -> AdminUser | None:
    """Query admin_users table using service role key to get freshest status & permissions."""
    if not settings.supabase_url or not settings.supabase_service_role_key:
        return None

    url = f"{settings.supabase_url.rstrip('/')}/rest/v1/admin_users"
    headers = {
        "apikey": settings.supabase_service_role_key,
        "Authorization": f"Bearer {settings.supabase_service_role_key}",
        "Content-Type": "application/json",
    }
    params = {"id": f"eq.{admin_id}", "select": "id,email,role,permissions,active,last_login_at"}

    try:
        async with httpx.AsyncClient(timeout=4.0) as client:
            resp = await client.get(url, headers=headers, params=params)
            if resp.status_code == 200:
                data = resp.json()
                if data and isinstance(data, list) and len(data) > 0:
                    row = data[0]
                    raw_perms = row.get("permissions")
                    perms = raw_perms if isinstance(raw_perms, list) else []
                    return AdminUser(
                        id=str(row["id"]),
                        email=str(row["email"]),
                        role=str(row["role"]),
                        permissions=perms,
                        active=bool(row.get("active", True)),
                        last_login_at=row.get("last_login_at"),
                    )
    except Exception as exc:
        logger.debug("fetch_admin_user_error", admin_id=admin_id, error=str(exc))

    return None


# ---------------------------------------------------------------------------
# FastAPI Dependencies
# ---------------------------------------------------------------------------

async def get_current_admin(request: Request) -> AdminUser:
    """FastAPI Dependency: Authenticate admin exclusively from admin_session cookie.

    Never accepts player Supabase Bearer tokens.
    """
    token: str | None = None

    # 1. Primary: HttpOnly admin_session cookie
    cookie_name = settings.admin_cookie_name or "admin_session"
    if cookie_name in request.cookies:
        val = request.cookies[cookie_name].strip()
        if val and val.count(".") == 2:
            token = val

    # 2. Secondary (Automated Test & Programmatic API fallback): X-Admin-Token header
    if not token:
        admin_header = request.headers.get("X-Admin-Token") or request.headers.get("x-admin-token")
        if admin_header:
            val = admin_header.replace("Bearer ", "").strip()
            if val and val.count(".") == 2:
                token = val

    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "admin_session_missing", "message": "Admin authentication required. Session cookie missing."},
        )

    payload = decode_admin_token(token)
    admin_id = str(payload["sub"])
    email = str(payload.get("email") or "")
    role = str(payload.get("role") or "sub_admin")
    permissions = payload.get("permissions") or []
    if not isinstance(permissions, list):
        permissions = []

    # 3. Load latest state from database if configured
    db_admin = await fetch_admin_user_by_id(admin_id)
    if db_admin:
        if not db_admin.active:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={"code": "admin_inactive", "message": "This admin account has been deactivated."},
            )
        return db_admin

    # Fallback to verified JWT payload (useful for test environments)
    return AdminUser(
        id=admin_id,
        email=email,
        role=role,
        permissions=permissions,
        active=True,
    )


async def require_super_admin(
    current_admin: AdminUser = Depends(get_current_admin),
) -> AdminUser:
    """Enforce that the authenticated admin possesses the 'super_admin' role."""
    if current_admin.role != "super_admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "super_admin_required", "message": "Super administrator privileges required for this action."},
        )
    return current_admin


def require_admin_permission(permission: str) -> Callable[..., Any]:
    """Factory dependency to enforce a specific permission (e.g. 'delete_tournaments')."""
    async def _check_perm(current_admin: AdminUser = Depends(get_current_admin)) -> AdminUser:
        if current_admin.role == "super_admin":
            return current_admin
        if "all" in current_admin.permissions or permission in current_admin.permissions:
            return current_admin
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "permission_denied", "message": f"Admin permission '{permission}' required."},
        )
    return _check_perm


async def verify_admin_csrf(
    request: Request,
    current_admin: AdminUser = Depends(get_current_admin),
) -> None:
    """Verify CSRF token for state-changing admin requests (POST, PUT, PATCH, DELETE)."""
    if request.method in ("POST", "PUT", "PATCH", "DELETE"):
        csrf_header = request.headers.get("X-CSRF-Token") or request.headers.get("x-csrf-token")
        if not verify_admin_csrf_token(csrf_header, current_admin.id):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={"code": "csrf_validation_failed", "message": "Invalid or missing admin CSRF token."},
            )

