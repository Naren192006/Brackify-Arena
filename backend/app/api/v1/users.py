from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_backend_user
from app.core.exceptions import AppError, app_error_to_http
from app.core.security import verify_password
from app.db.session import get_db_session
from app.models.user import User
from app.schemas.auth import (
    DeleteAccountRequest,
    NotificationPreferencesUpdate,
    UserProfileUpdate,
    UserPublic,
)
from app.services.auth_service import AuthService
from app.services.user_service import UserService

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/me", response_model=UserPublic)
async def get_my_profile(current_user: User = Depends(get_current_backend_user)) -> UserPublic:
    return UserPublic(
        id=current_user.id,
        email=current_user.email,
        username=current_user.username,
        display_name=current_user.display_name,
        avatar_url=current_user.avatar_url,
        bio=current_user.bio,
        role=current_user.role.value,
        status=current_user.status.value,
        email_verified=current_user.email_verified_at is not None,
        created_at=current_user.created_at,
    )


@router.patch("/me", response_model=UserPublic)
async def update_my_profile(
    data: UserProfileUpdate,
    current_user: User = Depends(get_current_backend_user),
    session: AsyncSession = Depends(get_db_session),
) -> UserPublic:
    service = UserService(session)
    try:
        return await service.update_profile(current_user.id, data)
    except AppError as exc:
        raise app_error_to_http(exc) from exc


@router.patch("/me/notification-preferences", response_model=UserPublic)
async def update_notification_preferences(
    data: NotificationPreferencesUpdate,
    current_user: User = Depends(get_current_backend_user),
    session: AsyncSession = Depends(get_db_session),
) -> UserPublic:
    service = AuthService(session)
    user = await service.set_email_notifications(current_user.id, data.email_notifications_enabled)
    from app.services.auth_service import user_to_public

    return user_to_public(user)


@router.post("/me/delete", status_code=status.HTTP_204_NO_CONTENT)
async def delete_my_account(
    data: DeleteAccountRequest,
    response: Response,
    current_user: User = Depends(get_current_backend_user),
    session: AsyncSession = Depends(get_db_session),
) -> Response:
    """Irreversibly delete the account after password re-confirmation."""
    if not current_user.password_hash or not verify_password(
        data.password, current_user.password_hash
    ):
        from app.core.exceptions import AuthenticationError

        raise app_error_to_http(
            AuthenticationError("Password confirmation failed", code="invalid_credentials")
        )

    service = AuthService(session)
    await service.delete_account(current_user.id)

    # Clear session cookies so the browser is fully signed out.
    from app.api.deps import ACCESS_COOKIE, REFRESH_COOKIE

    response.delete_cookie(key=ACCESS_COOKIE, path="/")
    response.delete_cookie(key=REFRESH_COOKIE, path="/")
    response.status_code = status.HTTP_204_NO_CONTENT
    return response
