"""Brackify Arena — Administrator Management & Operations API.

Strictly protected by isolated Admin Session Cookie / Token.
Never accepts Supabase Player Tokens.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Body, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field

from app.core.admin_auth import (
    AdminUser,
    get_current_admin,
    require_super_admin,
)
from app.core.logging import get_logger
from app.schemas.admin_tournaments import (
    AdminCreateTournamentRequest,
    AdminDeleteTournamentRequest,
    AdminDeleteTournamentResponse,
    AdminTournamentDetailResponse,
    AdminTournamentListResponse,
    AdminUpdateTournamentRequest,
    TournamentLifecycleTransitionRequest,
)
from app.services.admin_auth_service import (
    create_admin_user_service,
    delete_admin_user_service,
    list_admin_users_service,
    update_admin_user_service,
)
from app.services.admin_tournament_service import (
    create_admin_tournament_service,
    delete_tournament_service,
    get_admin_tournament_service,
    list_admin_tournaments_service,
    transition_tournament_lifecycle_service,
    update_admin_tournament_service,
)

logger = get_logger(__name__)

router = APIRouter(prefix="/admin", tags=["admin-operations"])


class AdminUserCreateRequest(BaseModel):
    email: str
    password: str = Field(min_length=8)
    role: str = Field(default="sub_admin", pattern="^(super_admin|sub_admin)$")
    permissions: list[str] = Field(
        default_factory=lambda: ["delete_tournaments", "manage_brackets", "manage_matches"]
    )


class AdminUserUpdateRequest(BaseModel):
    role: str | None = Field(default=None, pattern="^(super_admin|sub_admin)$")
    permissions: list[str] | None = None
    active: bool | None = None
    password: str | None = Field(default=None, min_length=8)


# ---------------------------------------------------------------------------
# Tournament Management Endpoints
# ---------------------------------------------------------------------------


@router.get(
    "/tournaments", response_model=AdminTournamentListResponse, status_code=status.HTTP_200_OK
)
async def list_admin_tournaments_route(
    search: str | None = Query(default=None, max_length=100),
    status_filter: str | None = Query(default=None, alias="status", max_length=50),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=15, ge=1, le=100),
    current_admin: AdminUser = Depends(get_current_admin),
) -> AdminTournamentListResponse:
    """List tournaments for Admin Portal with search, status filtering, and pagination."""
    return await list_admin_tournaments_service(
        search=search,
        status_filter=status_filter,
        page=page,
        page_size=page_size,
    )


@router.post(
    "/tournaments",
    response_model=AdminTournamentDetailResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_admin_tournament_route(
    body: AdminCreateTournamentRequest,
    current_admin: AdminUser = Depends(get_current_admin),
) -> AdminTournamentDetailResponse:
    """Create a new tournament with full metadata and validation."""
    logger.info("admin_create_tournament_route", admin_id=current_admin.id, title=body.title)
    return await create_admin_tournament_service(body, current_admin)


@router.get(
    "/tournaments/{slug_or_id}",
    response_model=AdminTournamentDetailResponse,
    status_code=status.HTTP_200_OK,
)
async def get_admin_tournament_route(
    slug_or_id: str,
    current_admin: AdminUser = Depends(get_current_admin),
) -> AdminTournamentDetailResponse:
    """Retrieve full details of a tournament for admin review."""
    return await get_admin_tournament_service(slug_or_id)


@router.patch(
    "/tournaments/{slug_or_id}",
    response_model=AdminTournamentDetailResponse,
    status_code=status.HTTP_200_OK,
)
async def update_admin_tournament_route(
    slug_or_id: str,
    body: AdminUpdateTournamentRequest,
    current_admin: AdminUser = Depends(get_current_admin),
) -> AdminTournamentDetailResponse:
    """Update tournament properties. Disallows core financial/format edits when LIVE/COMPLETED."""
    logger.info("admin_update_tournament_route", slug_or_id=slug_or_id, admin_id=current_admin.id)
    return await update_admin_tournament_service(slug_or_id, body, current_admin)


@router.post(
    "/tournaments/{slug_or_id}/publish",
    response_model=AdminTournamentDetailResponse,
    status_code=status.HTTP_200_OK,
)
async def publish_tournament_route(
    slug_or_id: str,
    current_admin: AdminUser = Depends(get_current_admin),
) -> AdminTournamentDetailResponse:
    """Publish a draft tournament."""
    return await transition_tournament_lifecycle_service(
        slug_or_id=slug_or_id,
        action="publish",
        reason="Admin published tournament",
        current_admin=current_admin,
    )


@router.post(
    "/tournaments/{slug_or_id}/pause",
    response_model=AdminTournamentDetailResponse,
    status_code=status.HTTP_200_OK,
)
async def pause_tournament_route(
    slug_or_id: str,
    current_admin: AdminUser = Depends(get_current_admin),
) -> AdminTournamentDetailResponse:
    """Pause an active tournament."""
    return await transition_tournament_lifecycle_service(
        slug_or_id=slug_or_id,
        action="pause",
        reason="Admin paused tournament",
        current_admin=current_admin,
    )


@router.post(
    "/tournaments/{slug_or_id}/resume",
    response_model=AdminTournamentDetailResponse,
    status_code=status.HTTP_200_OK,
)
async def resume_tournament_route(
    slug_or_id: str,
    current_admin: AdminUser = Depends(get_current_admin),
) -> AdminTournamentDetailResponse:
    """Resume a paused tournament."""
    return await transition_tournament_lifecycle_service(
        slug_or_id=slug_or_id,
        action="resume",
        reason="Admin resumed tournament",
        current_admin=current_admin,
    )


@router.post(
    "/tournaments/{slug_or_id}/cancel",
    response_model=AdminTournamentDetailResponse,
    status_code=status.HTTP_200_OK,
)
async def cancel_tournament_route(
    slug_or_id: str,
    current_admin: AdminUser = Depends(get_current_admin),
) -> AdminTournamentDetailResponse:
    """Cancel a non-completed tournament."""
    return await transition_tournament_lifecycle_service(
        slug_or_id=slug_or_id,
        action="cancel",
        reason="Admin cancelled tournament",
        current_admin=current_admin,
    )


@router.post(
    "/tournaments/{slug_or_id}/lifecycle",
    response_model=AdminTournamentDetailResponse,
    status_code=status.HTTP_200_OK,
)
async def transition_tournament_lifecycle_route(
    slug_or_id: str,
    body: TournamentLifecycleTransitionRequest,
    current_admin: AdminUser = Depends(get_current_admin),
) -> AdminTournamentDetailResponse:
    """Execute lifecycle transition enforcing state machine rules."""
    return await transition_tournament_lifecycle_service(
        slug_or_id=slug_or_id,
        action=body.action,
        reason=body.reason,
        current_admin=current_admin,
    )


@router.delete(
    "/tournaments/{slug_or_id}",
    response_model=AdminDeleteTournamentResponse,
    status_code=status.HTTP_200_OK,
)
async def delete_tournament_admin_route(
    slug_or_id: str,
    body: AdminDeleteTournamentRequest | None = Body(default=None),
    reason: str | None = Query(default=None),
    current_admin: AdminUser = Depends(get_current_admin),
) -> dict[str, Any]:
    """Super Admin-only endpoint to soft delete a tournament.

    Includes audit logging and payment protection.
    Requires 'super_admin' role or delegated 'delete_tournaments' permission.
    """
    if (
        current_admin.role != "super_admin"
        and "delete_tournaments" not in current_admin.permissions
        and "all" not in current_admin.permissions
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "code": "super_admin_required",
                "message": (
                    "Super Admin privileges or delete_tournaments permission "
                    "required to delete a tournament."
                ),
            },
        )

    del_reason = (body.reason if body and body.reason else reason) or "Admin deleted tournament"
    conf_title = body.confirmation_title if body else None

    logger.info(
        "admin_delete_tournament_request",
        slug_or_id=slug_or_id,
        admin_id=current_admin.id,
        reason=del_reason,
    )
    try:
        return await delete_tournament_service(
            slug_or_id=slug_or_id,
            admin_user=current_admin,
            reason=del_reason,
            confirmation_title=conf_title,
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception(
            "admin_delete_tournament_unhandled_error", slug_or_id=slug_or_id, error=str(exc)
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "code": "delete_tournament_error",
                "message": f"Failed to delete tournament: {str(exc)}",
            },
        ) from exc


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
    """Update role, permissions, active state, or reset password for an administrator.

    (Super Admin only).
    """
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
