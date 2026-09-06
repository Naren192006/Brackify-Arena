"""FastAPI Endpoints for Dedicated Admin Authentication.

Endpoints:
- POST /api/v1/admin/login
- POST /api/v1/admin/logout
- GET  /api/v1/admin/me
- GET  /api/v1/admin/csrf
"""

from __future__ import annotations

from typing import Any
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel, EmailStr

from app.config import settings
from app.core.admin_auth import (
    AdminUser,
    generate_admin_csrf_token,
    get_current_admin,
)
from app.core.logging import get_logger
from app.services.admin_auth_service import authenticate_admin_service

logger = get_logger(__name__)

router = APIRouter(prefix="/admin", tags=["admin-auth"])


class AdminLoginRequest(BaseModel):
    email: str
    password: str


class AdminUserResponse(BaseModel):
    id: str
    email: str
    role: str
    permissions: list[str]
    csrf_token: str | None = None


@router.post("/login", status_code=status.HTTP_200_OK, response_model=AdminUserResponse)
async def admin_login_endpoint(
    body: AdminLoginRequest,
    response: Response,
) -> dict[str, Any]:
    """Authenticate administrator via email & password and issue HttpOnly admin_session cookie."""
    logger.info("admin_login_attempt", email=body.email.strip().lower())

    admin_user, token = await authenticate_admin_service(body.email, body.password)
    csrf_token = generate_admin_csrf_token(admin_user.id)

    # Set HttpOnly Secure Admin Session Cookie (24 hour TTL)
    cookie_name = settings.admin_cookie_name or "admin_session"
    response.set_cookie(
        key=cookie_name,
        value=token,
        max_age=settings.admin_session_expire_hours * 3600,
        httponly=True,
        samesite="lax",
        secure=settings.is_production,
        path="/",
    )

    # Set CSRF cookie (readable by browser JS to send in X-CSRF-Token header)
    csrf_cookie_name = settings.admin_csrf_cookie_name or "admin_csrf"
    response.set_cookie(
        key=csrf_cookie_name,
        value=csrf_token,
        max_age=settings.admin_session_expire_hours * 3600,
        httponly=False,
        samesite="lax",
        secure=settings.is_production,
        path="/",
    )

    return {
        "id": admin_user.id,
        "email": admin_user.email,
        "role": admin_user.role,
        "permissions": admin_user.permissions,
        "csrf_token": csrf_token,
    }


@router.post("/logout", status_code=status.HTTP_200_OK)
async def admin_logout_endpoint(
    response: Response,
) -> dict[str, Any]:
    """Clear administrator session and CSRF cookies."""
    cookie_name = settings.admin_cookie_name or "admin_session"
    csrf_cookie_name = settings.admin_csrf_cookie_name or "admin_csrf"

    response.delete_cookie(key=cookie_name, path="/")
    response.delete_cookie(key=csrf_cookie_name, path="/")

    return {"success": True, "message": "Admin session terminated successfully."}


@router.get("/me", status_code=status.HTTP_200_OK, response_model=AdminUserResponse)
async def admin_get_me_endpoint(
    current_admin: AdminUser = Depends(get_current_admin),
) -> dict[str, Any]:
    """Return currently authenticated administrator profile and active permissions."""
    csrf_token = generate_admin_csrf_token(current_admin.id)
    return {
        "id": current_admin.id,
        "email": current_admin.email,
        "role": current_admin.role,
        "permissions": current_admin.permissions,
        "csrf_token": csrf_token,
    }


@router.get("/csrf", status_code=status.HTTP_200_OK)
async def admin_get_csrf_endpoint(
    current_admin: AdminUser = Depends(get_current_admin),
) -> dict[str, Any]:
    """Retrieve CSRF token for the authenticated admin session."""
    csrf_token = generate_admin_csrf_token(current_admin.id)
    return {"csrf_token": csrf_token}

