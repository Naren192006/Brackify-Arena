import re
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AuthenticationError, ConflictError, NotFoundError
from app.core.logging import get_logger
from app.core.security import (
    create_access_token,
    generate_refresh_token,
    hash_password,
    hash_token,
    verify_password,
)
from app.models.base import UserRole
from app.models.user import (
    AuditLog,
    EmailVerificationToken,
    PasswordResetToken,
    RefreshToken,
    User,
    UserOAuthAccount,
    UserStatus,
)
from app.schemas.auth import RegisterRequest, UserPublic

logger = get_logger(__name__)


def user_to_public(user: User) -> UserPublic:
    role_val = user.role.value if hasattr(user.role, "value") else str(user.role or "user")
    status_val = (
        user.status.value if hasattr(user.status, "value") else str(user.status or "active")
    )
    return UserPublic(
        id=user.id,
        email=user.email,
        username=user.username,
        display_name=user.display_name,
        avatar_url=user.avatar_url,
        bio=user.bio,
        role=role_val,
        status=status_val,
        email_verified=user.email_verified_at is not None,
        email_notifications_enabled=bool(user.email_notifications_enabled),
        created_at=user.created_at or datetime.now(UTC),
    )


class AuthService:
    def __init__(self, session: AsyncSession, refresh_token_expire_days: int = 7) -> None:
        self.session = session
        self.refresh_token_expire_days = refresh_token_expire_days

    async def register(self, data: RegisterRequest) -> tuple[User, str, str]:
        existing_email = await self.session.scalar(select(User.id).where(User.email == data.email))
        if existing_email:
            raise ConflictError("Email already registered", code="email_exists")

        existing_username = await self.session.scalar(
            select(User.id).where(User.username == data.username)
        )
        if existing_username:
            raise ConflictError("Username already taken", code="username_exists")

        user = User(
            email=data.email,
            username=data.username,
            password_hash=hash_password(data.password),
            display_name=data.display_name or data.username,
            status=UserStatus.ACTIVE,
            role=UserRole.USER,
        )
        self.session.add(user)
        await self.session.flush()
        await self._audit("auth.register", user.id)

        role_val = user.role.value if hasattr(user.role, "value") else str(user.role or "user")
        access_token = create_access_token(str(user.id), role_val)
        refresh_token = await self._create_refresh_token(user.id)
        return user, access_token, refresh_token

    async def login(self, email: str, password: str) -> tuple[User, str, str]:
        user = await self.session.scalar(select(User).where(User.email == email))
        if not user or not user.password_hash:
            raise AuthenticationError("Invalid email or password", code="invalid_credentials")

        if user.status != UserStatus.ACTIVE:
            raise AuthenticationError("Account is not active", code="account_inactive")

        if not verify_password(password, user.password_hash):
            raise AuthenticationError("Invalid email or password", code="invalid_credentials")

        user.last_login_at = datetime.now(UTC)
        await self._audit("auth.login", user.id)
        access_token = create_access_token(str(user.id), user.role.value)
        refresh_token = await self._create_refresh_token(user.id)
        return user, access_token, refresh_token

    async def provision_from_supabase(
        self, email: str, password: str, supabase_user: dict[str, Any]
    ) -> tuple[User, str, str]:
        """Create a local user for an account that existed only in Supabase.

        The verified Supabase password is reused as the local password so both
        stores stay in agreement; the Supabase id is preserved so RLS-keyed
        features keep working.
        """
        email = email.lower().strip()
        existing = await self.session.scalar(select(User).where(User.email == email))
        if existing:
            raise ConflictError("Email already registered", code="email_exists")

        meta = supabase_user.get("user_metadata") or {}
        base_username = str(meta.get("user_name") or email.split("@")[0]).strip()
        username = re.sub(r"[^a-zA-Z0-9_]", "_", base_username) or "player"

        username_taken = await self.session.scalar(
            select(User.id).where(User.username == username)
        )
        if username_taken:
            sb_id = str(supabase_user.get("id") or uuid4().hex)
            username = f"{username}_{sb_id.replace('-', '')[:6]}"

        verified_at = (
            datetime.now(UTC)
            if supabase_user.get("email_confirmed_at") or supabase_user.get("confirmed_at")
            else None
        )
        user = User(
            id=supabase_user.get("id") or uuid4(),
            email=email,
            username=username,
            password_hash=hash_password(password),
            display_name=str(meta.get("full_name") or meta.get("name") or username),
            avatar_url=meta.get("avatar_url"),
            email_verified_at=verified_at,
            status=UserStatus.ACTIVE,
            role=UserRole.USER,
        )
        self.session.add(user)
        await self.session.flush()
        await self._audit("auth.provision_from_supabase", user.id)

        role_val = user.role.value if hasattr(user.role, "value") else str(user.role or "user")
        access_token = create_access_token(str(user.id), role_val)
        refresh_token = await self._create_refresh_token(user.id)
        return user, access_token, refresh_token

    async def login_with_google(
        self, subject: str, email: str, display_name: str | None
    ) -> tuple[User, str, str]:
        oauth_account = await self.session.scalar(
            select(UserOAuthAccount).where(
                UserOAuthAccount.provider == "google", UserOAuthAccount.provider_user_id == subject
            )
        )
        if oauth_account:
            user = await self.session.get(User, oauth_account.user_id)
        else:
            user = await self.session.scalar(select(User).where(User.email == email))
            if not user:
                username_base = (
                    "".join(ch.lower() if ch.isalnum() else "_" for ch in email.split("@", 1)[0])[
                        :42
                    ]
                    or "player"
                )
                username = username_base
                suffix = 1
                while await self.session.scalar(select(User.id).where(User.username == username)):
                    suffix += 1
                    username = f"{username_base[:45]}_{suffix}"
                user = User(
                    email=email,
                    username=username,
                    display_name=display_name or username,
                    email_verified_at=datetime.now(UTC),
                    status=UserStatus.ACTIVE,
                    role=UserRole.USER,
                )
                self.session.add(user)
                await self.session.flush()
            self.session.add(
                UserOAuthAccount(user_id=user.id, provider="google", provider_user_id=subject)
            )
        if not user or user.status != UserStatus.ACTIVE:
            raise AuthenticationError("Account is not active", code="account_inactive")
        role_val = user.role.value if hasattr(user.role, "value") else str(user.role or "user")
        access_token = create_access_token(str(user.id), role_val)
        refresh_token = await self._create_refresh_token(user.id)
        await self._audit("auth.oauth_login", user.id)
        return user, access_token, refresh_token

    async def refresh(self, raw_refresh_token: str) -> tuple[User, str, str]:
        token_hash = hash_token(raw_refresh_token)
        token_row = await self.session.scalar(
            select(RefreshToken).where(RefreshToken.token_hash == token_hash).with_for_update()
        )
        if not token_row:
            raise AuthenticationError("Invalid refresh token", code="invalid_refresh_token")

        if token_row.revoked_at is not None:
            await self._revoke_all_user_tokens(token_row.user_id)
            raise AuthenticationError("Refresh token reuse detected", code="token_reuse")

        if token_row.expires_at < datetime.now(UTC):
            raise AuthenticationError("Refresh token expired", code="refresh_token_expired")

        user = await self.session.get(User, token_row.user_id)
        if not user or user.status != UserStatus.ACTIVE:
            raise AuthenticationError("Account is not active", code="account_inactive")

        token_row.revoked_at = datetime.now(UTC)
        access_token = create_access_token(str(user.id), user.role.value)
        new_refresh_token = await self._create_refresh_token(user.id)
        return user, access_token, new_refresh_token

    async def logout(self, raw_refresh_token: str | None) -> None:
        if not raw_refresh_token:
            return
        token_hash = hash_token(raw_refresh_token)
        await self.session.execute(
            update(RefreshToken)
            .where(RefreshToken.token_hash == token_hash, RefreshToken.revoked_at.is_(None))
            .values(revoked_at=datetime.now(UTC))
        )
        user = await self.session.scalar(
            select(User.id).join(RefreshToken).where(RefreshToken.token_hash == token_hash)
        )
        if user:
            await self._audit("auth.logout", user)

    async def request_password_reset(self, email: str) -> str | None:
        user = await self.session.scalar(select(User).where(User.email == email))
        if not user:
            return None
        raw_token = generate_refresh_token()
        self.session.add(
            PasswordResetToken(
                user_id=user.id,
                token_hash=hash_token(raw_token),
                expires_at=datetime.now(UTC) + timedelta(hours=1),
            )
        )
        await self._audit("auth.password_reset_requested", user.id)
        # Deliver the link directly — the endpoint only logs the token.
        from app.config import settings
        from app.services.email_service import send_password_reset_email

        base = settings.frontend_url.rstrip("/")
        await send_password_reset_email(
            email, f"{base}/reset-password?token={raw_token}"
        )
        return raw_token

    async def reset_password(self, raw_token: str, password: str) -> None:
        token = await self.session.scalar(
            select(PasswordResetToken)
            .where(PasswordResetToken.token_hash == hash_token(raw_token))
            .with_for_update()
        )
        if not token or token.used_at is not None or token.expires_at < datetime.now(UTC):
            raise AuthenticationError(
                "Invalid or expired password reset token", code="invalid_reset_token"
            )
        user = await self.session.get(User, token.user_id)
        if not user:
            raise AuthenticationError("Invalid password reset token", code="invalid_reset_token")
        user.password_hash = hash_password(password)
        token.used_at = datetime.now(UTC)
        await self._revoke_all_user_tokens(user.id)
        # Keep the Supabase mirror in agreement — otherwise the old password
        # keeps working through the Supabase fallback path.
        from app.services.supabase_auth_bridge import bridge

        bridge_ok = await bridge.update_password(user.email, password)
        if not bridge_ok:
            logger.warning("password_reset_supabase_sync_failed", user_id=str(user.id))
        await self._audit("auth.password_reset_completed", user.id)

    async def get_user_by_id(self, user_id: UUID) -> User:
        user = await self.session.get(User, user_id)
        if not user:
            raise NotFoundError("User not found", code="user_not_found")
        return user

    async def delete_account(self, user_id: UUID) -> None:
        """Delete the account and cascade personal data (see /data-deletion).

        Competitive records in the Supabase-managed schema (matches, brackets,
        leaderboard) are keyed by Supabase user id and are intentionally left
        intact but de-identified from this store's perspective.
        """
        user = await self.session.get(User, user_id)
        if not user:
            raise NotFoundError("User not found", code="user_not_found")
        await self._revoke_all_user_tokens(user_id)
        # Delete the Supabase mirror too, or the bridge fallback would
        # resurrect the account on the next login attempt.
        from app.services.supabase_auth_bridge import bridge

        bridge_ok = await bridge.delete_user(user.email)
        if not bridge_ok:
            logger.warning("account_deletion_supabase_sync_failed", user_id=str(user_id))
        await self._audit("auth.account_deleted", user_id)
        await self.session.execute(delete(User).where(User.id == user_id))
        await self.session.flush()

    async def set_email_notifications(self, user_id: UUID, enabled: bool) -> User:
        user = await self.session.get(User, user_id)
        if not user:
            raise NotFoundError("User not found", code="user_not_found")
        user.email_notifications_enabled = enabled
        await self.session.flush()
        await self._audit(
            "auth.email_notifications_updated",
            user_id,
        )
        return user

    async def request_email_verification(self, user_id: UUID) -> str | None:
        user = await self.session.get(User, user_id)
        if not user:
            raise NotFoundError("User not found", code="user_not_found")
        if user.email_verified_at is not None:
            raise ConflictError("Email is already verified", code="email_already_verified")
        raw_token = generate_refresh_token()
        self.session.add(
            EmailVerificationToken(
                user_id=user.id,
                token_hash=hash_token(raw_token),
                expires_at=datetime.now(UTC) + timedelta(hours=24),
            )
        )
        await self._audit("auth.email_verification_requested", user.id)
        from app.config import settings
        from app.services.email_service import send_email_verification_email

        base = settings.frontend_url.rstrip("/")
        await send_email_verification_email(
            user.email, f"{base}/verify-email?token={raw_token}"
        )
        return raw_token

    async def confirm_email_verification(self, raw_token: str) -> None:
        token = await self.session.scalar(
            select(EmailVerificationToken)
            .where(EmailVerificationToken.token_hash == hash_token(raw_token))
            .with_for_update()
        )
        if not token or token.used_at is not None or token.expires_at < datetime.now(UTC):
            raise AuthenticationError(
                "Invalid or expired verification token", code="invalid_verification_token"
            )
        user = await self.session.get(User, token.user_id)
        if not user:
            raise AuthenticationError(
                "Invalid verification token", code="invalid_verification_token"
            )
        user.email_verified_at = datetime.now(UTC)
        token.used_at = datetime.now(UTC)
        await self._audit("auth.email_verified", user.id)

    async def _create_refresh_token(self, user_id: UUID) -> str:
        raw_token = generate_refresh_token()
        token = RefreshToken(
            user_id=user_id,
            token_hash=hash_token(raw_token),
            expires_at=datetime.now(UTC) + timedelta(days=self.refresh_token_expire_days),
        )
        self.session.add(token)
        await self.session.flush()
        return raw_token

    async def _revoke_all_user_tokens(self, user_id: UUID) -> None:
        await self.session.execute(
            update(RefreshToken)
            .where(RefreshToken.user_id == user_id, RefreshToken.revoked_at.is_(None))
            .values(revoked_at=datetime.now(UTC))
        )

    async def _audit(
        self, action: str, actor_user_id: UUID, metadata: dict[str, Any] | None = None
    ) -> None:
        self.session.add(
            AuditLog(action=action, actor_user_id=actor_user_id, metadata_json=metadata or {})
        )
