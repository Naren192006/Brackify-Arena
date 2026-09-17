from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AuthorizationError
from app.models.user import UserStatus
from app.schemas.auth import UserProfileUpdate, UserPublic
from app.services.auth_service import AuthService, user_to_public


class UserService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.auth_service = AuthService(session)

    async def get_profile(self, user_id: UUID) -> UserPublic:
        user = await self.auth_service.get_user_by_id(user_id)
        return user_to_public(user)

    async def update_profile(self, user_id: UUID, data: UserProfileUpdate) -> UserPublic:
        user = await self.auth_service.get_user_by_id(user_id)
        if user.status != UserStatus.ACTIVE:
            raise AuthorizationError("Account is not active", code="account_inactive")

        if data.display_name is not None:
            user.display_name = data.display_name
        if data.avatar_url is not None:
            user.avatar_url = data.avatar_url
        if data.bio is not None:
            user.bio = data.bio

        await self.session.flush()
        return user_to_public(user)
