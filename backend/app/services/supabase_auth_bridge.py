"""Bridge FastAPI auth to Supabase auth (GoTrue).

The frontend gates /dashboard on a Supabase session, while the register/login
forms authenticate against the local FastAPI user store. This service keeps the
two stores in sync: it mirrors verified backend credentials into Supabase
(via the service-role Admin API) and mints a Supabase session the browser can
adopt with supabase.auth.setSession().

All operations are best-effort: on any failure we log a warning and return
None so the primary FastAPI auth flow is never broken by the bridge.
"""

from __future__ import annotations

from typing import Any, cast

import httpx

from app.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)

_TIMEOUT = httpx.Timeout(10.0)


class SupabaseAuthBridge:
    """Minimal GoTrue Admin API client for auth bridging."""

    def __init__(self) -> None:
        self._base = settings.supabase_url.rstrip("/")
        self._service_key = settings.supabase_service_role_key
        self._anon_key = settings.supabase_anon_key or self._service_key

    @property
    def configured(self) -> bool:
        # Never touch real Supabase from the test environment.
        return bool(self._base and self._service_key) and not settings.is_test

    def _admin_headers(self) -> dict[str, str]:
        return {
            "apikey": self._service_key,
            "Authorization": f"Bearer {self._service_key}",
            "Content-Type": "application/json",
        }

    async def create_or_update_user(
        self, email: str, password: str, user_metadata: dict[str, Any] | None = None
    ) -> dict[str, Any] | None:
        """Create the Supabase user, or update password/metadata if it exists."""
        if not self.configured:
            logger.warning("supabase_bridge_not_configured")
            return None

        payload: dict[str, Any] = {
            "email": email,
            "password": password,
            "email_confirm": True,
            "user_metadata": user_metadata or {},
        }
        try:
            async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
                resp = await client.post(
                    f"{self._base}/auth/v1/admin/users",
                    headers=self._admin_headers(),
                    json=payload,
                )
                if resp.status_code in (200, 201):
                    return cast(dict[str, Any], resp.json())

                # Already registered: find the user and refresh their password
                # and metadata so both stores agree.
                if resp.status_code == 422:
                    user_id = await self._find_user_id(client, email)
                    if user_id:
                        update: dict[str, Any] = {
                            "password": password,
                            "email_confirm": True,
                        }
                        if user_metadata:
                            update["user_metadata"] = user_metadata
                        resp2 = await client.put(
                            f"{self._base}/auth/v1/admin/users/{user_id}",
                            headers=self._admin_headers(),
                            json=update,
                        )
                        if resp2.status_code == 200:
                            return cast(dict[str, Any], resp2.json())
                        logger.warning(
                            "supabase_bridge_update_failed",
                            status=resp2.status_code,
                            detail=resp2.text[:200],
                        )
                        return None

                logger.warning(
                    "supabase_bridge_create_failed",
                    status=resp.status_code,
                    detail=resp.text[:200],
                )
                return None
        except Exception as exc:
            logger.warning("supabase_bridge_error", action="create_or_update", error=str(exc))
            return None

    async def _find_user_id(self, client: httpx.AsyncClient, email: str) -> str | None:
        resp = await client.get(
            f"{self._base}/auth/v1/admin/users",
            headers=self._admin_headers(),
            params={"email": email, "per_page": 1},
        )
        if resp.status_code != 200:
            return None
        users = (resp.json() or {}).get("users") or []
        return users[0].get("id") if users else None

    async def update_password(self, email: str, new_password: str) -> bool:
        """Sync a password change to the Supabase-side account, if one exists.

        Returns True when Supabase was updated (or no Supabase account exists —
        nothing to sync), False when a real failure occurred.
        """
        if not self.configured:
            return True  # nothing to sync when the bridge is off (tests)
        try:
            async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
                user_id = await self._find_user_id(client, email)
                if not user_id:
                    return True  # no mirror account; nothing to sync
                resp = await client.put(
                    f"{self._base}/auth/v1/admin/users/{user_id}",
                    headers=self._admin_headers(),
                    json={"password": new_password, "email_confirm": True},
                )
                if resp.status_code == 200:
                    return True
                logger.warning(
                    "supabase_bridge_password_update_failed",
                    status=resp.status_code,
                    detail=resp.text[:200],
                )
                return False
        except Exception as exc:
            logger.warning("supabase_bridge_error", action="update_password", error=str(exc))
            return False

    async def delete_user(self, email: str) -> bool:
        """Remove the Supabase-side account so login cannot re-provision it."""
        if not self.configured:
            return True
        try:
            async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
                user_id = await self._find_user_id(client, email)
                if not user_id:
                    return True
                resp = await client.delete(
                    f"{self._base}/auth/v1/admin/users/{user_id}",
                    headers=self._admin_headers(),
                )
                if resp.status_code == 200:
                    return True
                logger.warning(
                    "supabase_bridge_delete_failed",
                    status=resp.status_code,
                    detail=resp.text[:200],
                )
                return False
        except Exception as exc:
            logger.warning("supabase_bridge_error", action="delete_user", error=str(exc))
            return False

    async def verify_password(self, email: str, password: str) -> dict[str, Any] | None:
        """Verify credentials directly against Supabase auth.

        Returns the Supabase user dict on success, None on failure or if the
        bridge is not configured. Used to authenticate accounts that were
        created before the FastAPI user store (they exist only in Supabase).
        """
        if not self.configured:
            return None
        try:
            async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
                resp = await client.post(
                    f"{self._base}/auth/v1/token?grant_type=password",
                    headers={"apikey": self._anon_key, "Content-Type": "application/json"},
                    json={"email": email, "password": password},
                )
                if resp.status_code == 200:
                    data = cast(dict[str, Any], resp.json() or {})
                    return cast(dict[str, Any], data.get("user") or {})
                return None
        except Exception as exc:
            logger.warning("supabase_bridge_error", action="verify_password", error=str(exc))
            return None

    async def mint_session(self, email: str, password: str) -> dict[str, Any] | None:
        """Exchange verified credentials for a Supabase session (password grant)."""
        if not self.configured:
            return None
        try:
            async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
                resp = await client.post(
                    f"{self._base}/auth/v1/token?grant_type=password",
                    headers={"apikey": self._anon_key, "Content-Type": "application/json"},
                    json={"email": email, "password": password},
                )
                if resp.status_code == 200:
                    data = cast(dict[str, Any], resp.json())
                    return {
                        "access_token": data.get("access_token"),
                        "refresh_token": data.get("refresh_token"),
                        "expires_in": data.get("expires_in"),
                        "user_id": (data.get("user") or {}).get("id"),
                    }
                logger.warning(
                    "supabase_bridge_session_failed",
                    status=resp.status_code,
                    detail=resp.text[:200],
                )
                return None
        except Exception as exc:
            logger.warning("supabase_bridge_error", action="mint_session", error=str(exc))
            return None


bridge = SupabaseAuthBridge()
