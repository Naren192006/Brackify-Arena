"""Brackify Arena — Administrator Management & Operations API.

Strictly protected by isolated Admin Session Cookie / Token.
Never accepts Supabase Player Tokens.
"""

from __future__ import annotations

from typing import Any
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.core.admin_auth import (
    AdminUser,
    get_current_admin,
    require_super_admin,
)
from app.core.logging import get_logger
from app.services.admin_auth_service import (
    create_admin_user_service,
    delete_admin_user_service,
    list_admin_users_service,
    update_admin_user_service,
)
from app.services.admin_tournament_service import delete_tournament_service

logger = get_logger(__name__)

router = APIRouter(prefix="/admin", tags=["admin-operations"])


class AdminUserCreateRequest(BaseModel):
    email: str
    password: str = Field(min_length=8)
    role: str = Field(default="sub_admin", pattern="^(super_admin|sub_admin)$")
    permissions: list[str] = Field(default_factory=lambda: ["delete_tournaments", "manage_brackets", "manage_matches"])


class AdminUserUpdateRequest(BaseModel):
    role: str | None = Field(default=None, pattern="^(super_admin|sub_admin)$")
    permissions: list[str] | None = None
    active: bool | None = None
    password: str | None = Field(default=None, min_length=8)


# ---------------------------------------------------------------------------
# Tournament Administration (Protected: Super Admin or delete_tournaments)
# ---------------------------------------------------------------------------

@router.delete("/tournaments/{tournament_id}", status_code=status.HTTP_200_OK)
async def delete_tournament_admin_route(
    tournament_id: str,
    current_admin: AdminUser = Depends(get_current_admin),
) -> dict[str, Any]:
    """Admin-only endpoint to permanently delete a tournament.

    Requires 'super_admin' role or 'delete_tournaments' permission.
    """
    if current_admin.role != "super_admin" and "delete_tournaments" not in current_admin.permissions and "all" not in current_admin.permissions:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "permission_denied", "message": "You do not have permission to delete tournaments."},
        )

    logger.info("admin_delete_tournament_request", tournament_id=tournament_id, admin_id=current_admin.id)
    return await delete_tournament_service(tournament_id, current_admin)


# ---------------------------------------------------------------------------
# Admin User Management (Protected: Super Admin Only)
# ---------------------------------------------------------------------------

@router.get("/users", status_code=status.HTTP_200_OK)
async def list_admin_users_route(
    current_admin: AdminUser = Depends(require_super_admin),
) -> list[dict[str, Any]]:
    """List all platform administrators (Super Admin only)."""
    return await list_admin_users_service()


@router.post("/users", status_code=status.HTTP_201_CREATED)
async def create_admin_user_route(
    body: AdminUserCreateRequest,
    current_admin: AdminUser = Depends(require_super_admin),
) -> dict[str, Any]:
    """Create a new administrator account (Super Admin only)."""
    logger.info("admin_create_user", creator_id=current_admin.id, target_email=body.email)
    return await create_admin_user_service(
        email=body.email,
        password=body.password,
        role=body.role,
        permissions=body.permissions,
    )


@router.patch("/users/{user_id}", status_code=status.HTTP_200_OK)
async def update_admin_user_route(
    user_id: str,
    body: AdminUserUpdateRequest,
    current_admin: AdminUser = Depends(require_super_admin),
) -> dict[str, Any]:
    """Update role, permissions, active state, or reset password for an administrator (Super Admin only)."""
    logger.info("admin_update_user", updater_id=current_admin.id, target_id=user_id)
    return await update_admin_user_service(
        target_id=user_id,
        current_admin=current_admin,
        role=body.role,
        permissions=body.permissions,
        active=body.active,
        password=body.password,
    )


@router.delete("/users/{user_id}", status_code=status.HTTP_200_OK)
async def delete_admin_user_route(
    user_id: str,
    current_admin: AdminUser = Depends(require_super_admin),
) -> dict[str, Any]:
    """Permanently delete an administrator account (Super Admin only)."""
    logger.info("admin_delete_user", deleter_id=current_admin.id, target_id=user_id)
    await delete_admin_user_service(target_id=user_id, current_admin=current_admin)
    return {"success": True, "message": "Administrator account deleted successfully."}
