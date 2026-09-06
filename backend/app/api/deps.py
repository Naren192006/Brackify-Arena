from uuid import UUID

from fastapi import Cookie, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.security import decode_access_token
from app.db.session import get_db_session
from app.models.base import UserRole
from app.models.user import User, UserStatus
from app.services.auth_service import AuthService

ACCESS_COOKIE = "access_token"
REFRESH_COOKIE = "refresh_token"


async def get_current_user(
    access_token: str | None = Cookie(default=None, alias=ACCESS_COOKIE),
    session: AsyncSession = Depends(get_db_session),
) -> User:
    if not access_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "not_authenticated", "message": "Not authenticated"},
        )

    payload = decode_access_token(access_token)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "invalid_token", "message": "Invalid or expired token"},
        )

    auth_service = AuthService(session, settings.refresh_token_expire_days)
    user = await auth_service.get_user_by_id(UUID(payload["sub"]))

    if user.status != UserStatus.ACTIVE:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "account_inactive", "message": "Account is not active"},
        )

    return user


def require_roles(*roles: UserRole):
    async def dependency(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={"code": "insufficient_permissions", "message": "Insufficient permissions"},
            )
        return current_user

    return dependency


require_organizer = require_roles(UserRole.ORGANIZER, UserRole.ADMIN, UserRole.SUPER_ADMIN)
require_admin = require_roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
require_super_admin = require_roles(UserRole.SUPER_ADMIN)

# Re-export Supabase auth dependencies
from app.core.auth import (
    AuthUser,
    get_current_auth_user,
    verify_admin_only_for_winner,
    verify_organizer_owns_tournament,
    verify_player_owns_registration,
    verify_player_owns_team,
)

