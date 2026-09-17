"""Admin Authentication & User Management Service.

Handles secure database operations for admin_users table using Supabase REST API (service role).
"""

from __future__ import annotations

import datetime
from typing import Any

import httpx
from fastapi import HTTPException, status

from app.config import settings
from app.core.admin_auth import (
    AdminUser,
    create_admin_token,
    hash_password,
    verify_password,
)
from app.core.exceptions import AppError
from app.core.logging import get_logger

logger = get_logger(__name__)


def _now_iso() -> str:
    return datetime.datetime.now(datetime.UTC).isoformat()


def _supabase_headers(prefer: str | None = None) -> dict[str, str]:
    if not settings.supabase_url or not settings.supabase_service_role_key:
        raise AppError("Supabase service role is not configured.", "service_not_configured")
    headers = {
        "apikey": settings.supabase_service_role_key,
        "Authorization": f"Bearer {settings.supabase_service_role_key}",
        "Content-Type": "application/json",
    }
    if prefer:
        headers["Prefer"] = prefer
    return headers


def _sb_url(table: str) -> str:
    base = (
        settings.supabase_url.rstrip("/") if settings.supabase_url else "https://test.supabase.co"
    )
    return f"{base}/rest/v1/{table}"


async def authenticate_admin_service(email: str, password: str) -> tuple[AdminUser, str]:
    """Verify admin email and password against admin_users table.

    Returns AdminUser + signed JWT.
    """
    clean_email = email.strip().lower()
    if not clean_email or not password:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                "code": "invalid_credentials",
                "message": "Admin email and password are required.",
            },
        )

    url = _sb_url("admin_users")
    headers = _supabase_headers(prefer="return=representation")
    params = {
        "email": f"eq.{clean_email}",
        "select": "id,email,password_hash,role,permissions,active,last_login_at",
    }

    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(url, headers=headers, params=params)
            resp.raise_for_status()
            rows = resp.json()
    except Exception as exc:
        logger.error("admin_auth_db_query_failed", email=clean_email, error=str(exc))
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "code": "service_unavailable",
                "message": "Database connection error during authentication.",
            },
        ) from exc

    if not rows or not isinstance(rows, list) or len(rows) == 0:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "invalid_credentials", "message": "Invalid admin email or password."},
        )

    admin_row = rows[0]
    stored_hash = admin_row.get("password_hash") or ""
    if not verify_password(password, stored_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "invalid_credentials", "message": "Invalid admin email or password."},
        )

    if not admin_row.get("active", True):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "code": "account_deactivated",
                "message": "This admin account has been deactivated.",
            },
        )

    # Update last_login_at timestamp
    admin_id = str(admin_row["id"])
    now_ts = _now_iso()
    try:
        async with httpx.AsyncClient(timeout=4.0) as client:
            await client.patch(
                url,
                headers=_supabase_headers(prefer="return=minimal"),
                params={"id": f"eq.{admin_id}"},
                json={"last_login_at": now_ts},
            )
    except Exception:
        pass

    raw_perms = admin_row.get("permissions")
    permissions = raw_perms if isinstance(raw_perms, list) else []

    admin_user = AdminUser(
        id=admin_id,
        email=str(admin_row["email"]),
        role=str(admin_row["role"]),
        permissions=permissions,
        active=True,
        last_login_at=now_ts,
    )

    token = create_admin_token(admin_user)
    return admin_user, token


async def list_admin_users_service() -> list[dict[str, Any]]:
    """List all administrator accounts without exposing password hashes."""
    url = _sb_url("admin_users")
    headers = _supabase_headers(prefer="return=representation")
    params = {
        "select": "id,email,role,permissions,active,last_login_at,created_at,updated_at",
        "order": "created_at.asc",
    }

    async with httpx.AsyncClient(timeout=5.0) as client:
        resp = await client.get(url, headers=headers, params=params)
        resp.raise_for_status()
        rows = resp.json()
        return rows if isinstance(rows, list) else []


async def create_admin_user_service(
    email: str,
    password: str,
    role: str = "sub_admin",
    permissions: list[str] | None = None,
) -> dict[str, Any]:
    """Create a new sub_admin or super_admin account with bcrypt hashed password."""
    clean_email = email.strip().lower()
    if len(password) < 8:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "password_too_short",
                "message": "Password must be at least 8 characters long.",
            },
        )

    if role not in ("super_admin", "sub_admin"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "invalid_role",
                "message": "Role must be 'super_admin' or 'sub_admin'.",
            },
        )

    # Check if user already exists
    existing = await list_admin_users_service()
    if any(u.get("email", "").lower() == clean_email for u in existing):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "email_exists",
                "message": "An administrator with this email already exists.",
            },
        )

    pwd_hash = hash_password(password)
    perms = permissions or (
        ["delete_tournaments", "manage_brackets", "manage_matches"]
        if role == "sub_admin"
        else ["all"]
    )

    body = {
        "email": clean_email,
        "password_hash": pwd_hash,
        "role": role,
        "permissions": perms,
        "active": True,
    }

    url = _sb_url("admin_users")
    headers = _supabase_headers(prefer="return=representation")

    async with httpx.AsyncClient(timeout=5.0) as client:
        resp = await client.post(url, headers=headers, json=body)
        resp.raise_for_status()
        data = resp.json()
        row = data[0] if isinstance(data, list) and len(data) > 0 else data
        row.pop("password_hash", None)
        return row


async def update_admin_user_service(
    target_id: str,
    current_admin: AdminUser,
    role: str | None = None,
    permissions: list[str] | None = None,
    active: bool | None = None,
    password: str | None = None,
) -> dict[str, Any]:
    """Update an admin account (role, permissions, active state, or reset password)."""
    # Verify target exists
    all_users = await list_admin_users_service()
    target = next((u for u in all_users if str(u.get("id")) == target_id), None)
    if not target:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "admin_not_found", "message": "Administrator account not found."},
        )

    # Protect against demoting or deactivating the last super admin
    if target.get("role") == "super_admin" and (role == "sub_admin" or active is False):
        super_count = sum(
            1 for u in all_users if u.get("role") == "super_admin" and u.get("active", True)
        )
        if super_count <= 1:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    "code": "cannot_disable_last_super_admin",
                    "message": (
                        "Cannot deactivate or demote the last remaining super administrator."
                    ),
                },
            )

    update_payload: dict[str, Any] = {}
    if role is not None:
        if role not in ("super_admin", "sub_admin"):
            raise HTTPException(status_code=400, detail="Invalid role specified.")
        update_payload["role"] = role

    if permissions is not None:
        update_payload["permissions"] = permissions

    if active is not None:
        update_payload["active"] = active

    if password is not None:
        if len(password) < 8:
            raise HTTPException(status_code=400, detail="Password must be at least 8 characters.")
        update_payload["password_hash"] = hash_password(password)

    if not update_payload:
        return target

    url = _sb_url("admin_users")
    headers = _supabase_headers(prefer="return=representation")

    async with httpx.AsyncClient(timeout=5.0) as client:
        resp = await client.patch(
            url, headers=headers, params={"id": f"eq.{target_id}"}, json=update_payload
        )
        resp.raise_for_status()
        data = resp.json()
        row = data[0] if isinstance(data, list) and len(data) > 0 else data
        row.pop("password_hash", None)
        return row


async def delete_admin_user_service(target_id: str, current_admin: AdminUser) -> None:
    """Permanently delete a sub-admin account."""
    if target_id == current_admin.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "cannot_delete_self",
                "message": "Cannot delete your own administrator account.",
            },
        )

    all_users = await list_admin_users_service()
    target = next((u for u in all_users if str(u.get("id")) == target_id), None)
    if not target:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "admin_not_found", "message": "Administrator account not found."},
        )

    if target.get("role") == "super_admin":
        super_count = sum(1 for u in all_users if u.get("role") == "super_admin")
        if super_count <= 1:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    "code": "cannot_delete_last_super_admin",
                    "message": "Cannot delete the last remaining super administrator.",
                },
            )

    url = _sb_url("admin_users")
    headers = _supabase_headers(prefer="return=representation")

    async with httpx.AsyncClient(timeout=5.0) as client:
        resp = await client.delete(url, headers=headers, params={"id": f"eq.{target_id}"})
        resp.raise_for_status()
