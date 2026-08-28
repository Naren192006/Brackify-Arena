from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.exceptions import AppError, app_error_to_http
from app.db.session import get_db_session
from app.models.user import User
from app.schemas.auth import UserPublic, UserProfileUpdate
from app.services.user_service import UserService

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/me", response_model=UserPublic)
async def get_my_profile(current_user: User = Depends(get_current_user)) -> UserPublic:
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
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> UserPublic:
    service = UserService(session)
    try:
        return await service.update_profile(current_user.id, data)
    except AppError as exc:
        raise app_error_to_http(exc) from exc
