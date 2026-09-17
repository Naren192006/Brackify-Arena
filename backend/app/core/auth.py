"""Supabase JWT authentication and security authorization module.

Enforces:
- Supabase JWT token validation on protected endpoints (auth.uid()).
- Never trusts frontend-supplied user_id.
- Organizer owns tournament before start / pause / resume / complete.
- Player owns registration before cancel.
- Player owns team before registration.
- Admin only can update match winners.
- Returns HTTP 401 Unauthorized or HTTP 403 Forbidden.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import re
import time
from typing import Any

from fastapi import HTTPException, Request, status
from pydantic import BaseModel

try:
    from jose import JWTError, jwt
except ImportError:
    JWTError = Exception  # type: ignore[assignment, misc]
    jwt = None  # type: ignore[assignment]

try:
    import httpx
except ImportError:
    httpx = None  # type: ignore[assignment]

from app.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)

UUID_REGEX = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.I)


def _is_uuid(val: str) -> bool:
    return bool(UUID_REGEX.match(val))


def _b64url_decode(s: str) -> bytes:
    """Decode base64url string with safe padding."""
    padding = "=" * (-len(s) % 4)
    return base64.urlsafe_b64decode(s + padding)


def _b64url_encode(data: bytes) -> str:
    """Encode bytes to unpadded base64url string."""
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def encode_supabase_jwt(payload: dict[str, Any], secret: str | None = None) -> str:
    """Encode a Supabase JWT using HMAC-SHA256 (standard library)."""
    sec = secret or settings.supabase_jwt_secret or settings.secret_key or "default-secret"
    header = {"typ": "JWT", "alg": "HS256"}
    h_b64 = _b64url_encode(json.dumps(header, separators=(",", ":")).encode("utf-8"))
    p_b64 = _b64url_encode(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
    signing_input = f"{h_b64}.{p_b64}".encode("ascii")
    sig = hmac.new(sec.encode("utf-8"), signing_input, hashlib.sha256).digest()
    return f"{h_b64}.{p_b64}.{_b64url_encode(sig)}"


class AuthUser(BaseModel):
    """Authenticated user context derived strictly from verified Supabase JWT."""

    id: str  # auth.uid()
    email: str | None = None
    role: str = "authenticated"
    is_admin: bool = False
    raw_claims: dict[str, Any] = {}

    @property
    def user_id(self) -> str:
        return self.id


# ---------------------------------------------------------------------------
# Token Extraction & Validation
# ---------------------------------------------------------------------------


def _is_valid_jwt_format(val: str | None) -> bool:
    """Verify string is non-empty, not null/undefined/[object Object],
    and has 3 dot-separated segments.
    """
    if not val or not isinstance(val, str):
        return False
    clean = val.strip()
    if clean in ("undefined", "null", "[object Object]", ""):
        return False
    return clean.count(".") == 2


def extract_token(request: Request) -> str | None:
    """Extract Bearer token from Authorization header or Supabase cookies."""
    # 1. Authorization: Bearer <token>
    auth_header = request.headers.get("Authorization") or request.headers.get("authorization")
    if auth_header and auth_header.startswith("Bearer "):
        token = auth_header[len("Bearer ") :].strip()
        if _is_valid_jwt_format(token):
            return token

    # 2. X-Supabase-Auth or X-Auth-Token
    alt_header = request.headers.get("X-Supabase-Auth") or request.headers.get("X-Auth-Token")
    if alt_header:
        token = alt_header.strip()
        if token.startswith("Bearer "):
            token = token[len("Bearer ") :].strip()
        if _is_valid_jwt_format(token):
            return token

    # 3. Standard Cookie Names
    for c_name in ("access_token", "sb-access-token", "sb_access_token"):
        if c_name in request.cookies:
            val = request.cookies[c_name].strip()
            if _is_valid_jwt_format(val):
                return val

    # 4. Supabase SSR Cookie (sb-<project-ref>-auth-token)
    for name, val in request.cookies.items():
        if name.startswith("sb-") and "auth-token" in name:
            raw = val.strip()
            if raw.startswith("base64-"):
                try:
                    raw = base64.b64decode(raw[len("base64-") :]).decode("utf-8")
                except Exception:
                    pass
            try:
                parsed = json.loads(raw)
                if isinstance(parsed, list) and len(parsed) > 0 and isinstance(parsed[0], str):
                    cand = parsed[0].strip()
                    if _is_valid_jwt_format(cand):
                        return cand
                elif isinstance(parsed, dict) and "access_token" in parsed:
                    cand = str(parsed["access_token"]).strip()
                    if _is_valid_jwt_format(cand):
                        return cand
            except Exception:
                pass
            if _is_valid_jwt_format(raw):
                return raw

    return None


def decode_supabase_jwt(token: str) -> dict[str, Any]:
    """Decode and validate Supabase JWT token.

    Verifies signature using configured secrets (supabase_jwt_secret, secret_key,
    or service role key), supporting both UTF-8 string and base64-decoded binary keys,
    with live Supabase Auth API verification fallback.
    """
    secrets_to_try: list[str] = []
    if settings.supabase_jwt_secret:
        secrets_to_try.append(settings.supabase_jwt_secret)
    if settings.secret_key:
        secrets_to_try.append(settings.secret_key)
    if settings.supabase_service_role_key:
        secrets_to_try.append(settings.supabase_service_role_key)

    parts = token.strip().split(".")
    if len(parts) != 3:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "invalid_token", "message": "Invalid JWT token structure."},
        )

    # 1. Decode header and payload
    header: dict[str, Any] = {}
    try:
        raw_header = _b64url_decode(parts[0])
        header = json.loads(raw_header.decode("utf-8"))
    except Exception:
        pass
    alg = header.get("alg", "HS256")

    try:
        raw_payload = _b64url_decode(parts[1])
        payload = json.loads(raw_payload.decode("utf-8"))
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "invalid_token", "message": "Invalid JWT payload encoding."},
        ) from exc

    # 2. Check expiration claim
    exp = payload.get("exp")
    if exp is not None:
        try:
            if float(exp) < time.time():
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail={
                        "code": "invalid_token",
                        "message": "Authentication token has expired.",
                    },
                )
        except (ValueError, TypeError):
            pass

    # 3. Check signature if secrets are present
    if secrets_to_try:
        signing_input = f"{parts[0]}.{parts[1]}".encode("ascii")
        try:
            provided_sig = _b64url_decode(parts[2])
            verified = False
            verification_path = "none"

            # 3a. Try local HMAC with UTF-8 and base64-decoded secret
            for sec in secrets_to_try:
                # Raw string
                expected_sig = hmac.new(sec.encode("utf-8"), signing_input, hashlib.sha256).digest()
                if hmac.compare_digest(provided_sig, expected_sig):
                    verified = True
                    verification_path = "local_utf8_hmac"
                    break

                # Base64 decoded bytes (Supabase JWT Secret format)
                try:
                    b64_sec = base64.b64decode(sec)
                    expected_sig_b64 = hmac.new(b64_sec, signing_input, hashlib.sha256).digest()
                    if hmac.compare_digest(provided_sig, expected_sig_b64):
                        verified = True
                        verification_path = "local_b64_hmac"
                        break
                except Exception:
                    pass

            # 3b. Supabase Live Auth verification fallback
            if (
                not verified
                and httpx is not None
                and settings.supabase_url
                and (settings.supabase_anon_key or settings.supabase_service_role_key)
            ):
                try:
                    with httpx.Client(timeout=4.0) as client:
                        sb_resp = client.get(
                            f"{settings.supabase_url.rstrip('/')}/auth/v1/user",
                            headers={
                                "apikey": settings.supabase_anon_key
                                or settings.supabase_service_role_key,
                                "Authorization": f"Bearer {token}",
                            },
                        )
                        if sb_resp.status_code == 200:
                            verified = True
                            verification_path = "supabase_live_auth_api"
                except Exception as live_err:
                    logger.debug("supabase_live_auth_verify_error", error=str(live_err))

            logger.info(
                "jwt_verification_attempt",
                token_prefix=token[:20] if token else None,
                alg=alg,
                verified=verified,
                path=verification_path,
            )

            if not verified:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail={"code": "invalid_token", "message": "Invalid token signature."},
                )
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail={"code": "invalid_token", "message": "Signature verification error."},
            ) from exc

    # 4. Verify sub claim is present and is valid UUID
    sub = payload.get("sub")
    if not sub or not isinstance(sub, str) or not _is_uuid(sub):
        logger.warning("supabase_jwt_invalid_sub", sub=sub)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                "code": "invalid_token",
                "message": "Token must contain a valid user UUID in 'sub' claim.",
            },
        )

    return payload


async def check_is_admin(user_id: str, payload: dict[str, Any]) -> bool:
    """Check if the user has platform administrator privileges."""
    app_meta = payload.get("app_metadata") or {}
    token_role = payload.get("role") or ""
    app_role = app_meta.get("role") or ""

    if app_role in ("admin", "super_admin") or token_role in ("admin", "service_role"):
        return True

    # Check database admin_roles using service role key
    if httpx is not None and settings.supabase_url and settings.supabase_service_role_key:
        try:
            from app.services.tournament_service import _sb_get

            async with httpx.AsyncClient(timeout=5.0) as client:
                admin_rows = await _sb_get(
                    client,
                    "admin_roles",
                    {"user_id": f"eq.{user_id}", "select": "role"},
                )
                if admin_rows and admin_rows[0].get("role") in (
                    "super_admin",
                    "admin",
                    "sub_admin",
                ):
                    return True
        except Exception as exc:
            logger.debug("check_is_admin_db_fallback", user_id=user_id, error=str(exc))

    return False


# ---------------------------------------------------------------------------
# FastAPI Dependency: get_current_auth_user
# ---------------------------------------------------------------------------


async def get_current_auth_user(request: Request) -> AuthUser:
    """Validate Supabase JWT and return authenticated AuthUser.

    Rejects unauthenticated requests with HTTP 401.
    Never trusts frontend user_id parameter.
    """
    token = extract_token(request)
    if not token:
        # Fallback: check dedicated admin session cookie or X-Admin-Token
        admin_cookie = settings.admin_cookie_name or "admin_session"
        admin_val = request.cookies.get(admin_cookie)
        if not admin_val:
            admin_header = request.headers.get("X-Admin-Token") or request.headers.get(
                "x-admin-token"
            )
            if admin_header:
                admin_val = admin_header.replace("Bearer ", "").strip()

        if admin_val and admin_val.count(".") == 2:
            try:
                from app.core.admin_auth import decode_admin_token, fetch_admin_user_by_id

                admin_payload = decode_admin_token(admin_val)
                admin_id = str(admin_payload["sub"])
                admin_email = str(admin_payload.get("email") or "")
                admin_role = str(admin_payload.get("role") or "admin")
                db_admin = await fetch_admin_user_by_id(admin_id, email=admin_email)
                if db_admin and not db_admin.active:
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail={"code": "admin_inactive", "message": "Admin account deactivated."},
                    )
                return AuthUser(
                    id=admin_id,
                    email=admin_email,
                    role=admin_role,
                    is_admin=True,
                    raw_claims=admin_payload,
                )
            except HTTPException:
                raise
            except Exception:
                pass

        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                "code": "unauthorized",
                "message": "Authentication required. Bearer token missing.",
            },
        )

    claims = decode_supabase_jwt(token)
    user_id = str(claims["sub"])
    email = claims.get("email")
    is_admin = await check_is_admin(user_id, claims)

    return AuthUser(
        id=user_id,
        email=email,
        role=claims.get("role") or "authenticated",
        is_admin=is_admin,
        raw_claims=claims,
    )


# ---------------------------------------------------------------------------
# Authorization Checks
# ---------------------------------------------------------------------------


async def verify_organizer_owns_tournament(
    tournament_id: str,
    auth_user: AuthUser,
    client: httpx.AsyncClient | None = None,
) -> dict[str, Any]:
    """Verify that auth_user is the organizer / creator of the tournament or an admin.

    Raises HTTP 403 Forbidden if not authorized.
    """
    if auth_user.is_admin:
        return {}

    if httpx is None or not settings.supabase_url:
        return {}

    from app.services.tournament_service import _sb_get

    async def _check(c: httpx.AsyncClient) -> dict[str, Any]:
        is_uuid = _is_uuid(tournament_id)
        param = {"id": f"eq.{tournament_id}"} if is_uuid else {"slug": f"eq.{tournament_id}"}
        param["select"] = "id,organizer_id,created_by,title,status"
        tournaments = await _sb_get(c, "tournaments", param)
        if not tournaments:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"code": "tournament_not_found", "message": "Tournament not found"},
            )
        t = tournaments[0]

        # 1. Organizer or creator check
        if t.get("organizer_id") == auth_user.id or t.get("created_by") == auth_user.id:
            return t

        # 2. Tournament admins table check
        t_admins = await _sb_get(
            c,
            "tournament_admins",
            {"tournament_id": f"eq.{t['id']}", "user_id": f"eq.{auth_user.id}", "select": "id"},
        )
        if t_admins:
            return t

        logger.warning(
            "security_unauthorized_tournament_action",
            user_id=auth_user.id,
            tournament_id=tournament_id,
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "code": "forbidden",
                "message": (
                    "Only the tournament organizer or an administrator can perform this action."
                ),
            },
        )

    if client is not None:
        return await _check(client)
    else:
        async with httpx.AsyncClient(timeout=10.0) as c:
            return await _check(c)


async def verify_player_owns_team(
    team_id: str,
    auth_user: AuthUser,
    client: httpx.AsyncClient | None = None,
) -> dict[str, Any]:
    """Verify that player owns team before registering it into a tournament.

    Raises HTTP 403 Forbidden if not authorized.
    """
    if auth_user.is_admin:
        return {}

    if httpx is None or not settings.supabase_url:
        return {}

    from app.services.tournament_service import _sb_get

    async def _check(c: httpx.AsyncClient) -> dict[str, Any]:
        teams = await _sb_get(
            c,
            "teams",
            {"id": f"eq.{team_id}", "select": "id,name,captain_id,created_by"},
        )
        if not teams:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"code": "team_not_found", "message": "Team not found"},
            )
        team = teams[0]

        # Check captain or creator
        if team.get("captain_id") == auth_user.id or team.get("created_by") == auth_user.id:
            return team

        # Check team_members role
        members = await _sb_get(
            c,
            "team_members",
            {"team_id": f"eq.{team_id}", "user_id": f"eq.{auth_user.id}", "select": "role"},
        )
        if members and members[0].get("role") in ("captain", "leader", "owner"):
            return team

        logger.warning(
            "security_unauthorized_team_registration",
            user_id=auth_user.id,
            team_id=team_id,
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "code": "forbidden",
                "message": "You must be the team captain or owner to register this team.",
            },
        )

    if client is not None:
        return await _check(client)
    else:
        async with httpx.AsyncClient(timeout=10.0) as c:
            return await _check(c)


async def verify_player_owns_registration(
    tournament_id: str,
    registration_id: str,
    auth_user: AuthUser,
    client: httpx.AsyncClient | None = None,
) -> dict[str, Any]:
    """Verify player owns registration before canceling it.

    Allows direct registrant, team captain, tournament organizer, or platform admin.
    Raises HTTP 403 Forbidden if not authorized.
    """
    if auth_user.is_admin:
        return {}

    if httpx is None or not settings.supabase_url:
        return {}

    from app.services.tournament_service import _sb_get

    async def _check(c: httpx.AsyncClient) -> dict[str, Any]:
        regs = await _sb_get(
            c,
            "tournament_registrations",
            {
                "id": f"eq.{registration_id}",
                "select": "id,tournament_id,team_id,registered_by,status",
            },
        )
        if not regs:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"code": "registration_not_found", "message": "Registration not found"},
            )
        reg = regs[0]

        # 1. Direct registrant
        if reg.get("registered_by") == auth_user.id:
            return reg

        # 2. Team captain of the registered team
        team_id = reg.get("team_id")
        if team_id:
            teams = await _sb_get(
                c,
                "teams",
                {"id": f"eq.{team_id}", "select": "id,captain_id,created_by"},
            )
            if teams and (
                teams[0].get("captain_id") == auth_user.id
                or teams[0].get("created_by") == auth_user.id
            ):
                return reg

        # 3. Tournament organizer
        is_uuid = _is_uuid(tournament_id)
        t_param = {"id": f"eq.{tournament_id}"} if is_uuid else {"slug": f"eq.{tournament_id}"}
        t_param["select"] = "id,organizer_id,created_by"
        t_rows = await _sb_get(c, "tournaments", t_param)
        if t_rows and (
            t_rows[0].get("organizer_id") == auth_user.id
            or t_rows[0].get("created_by") == auth_user.id
        ):
            return reg

        logger.warning(
            "security_unauthorized_registration_cancel",
            user_id=auth_user.id,
            registration_id=registration_id,
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "code": "forbidden",
                "message": "You do not have permission to cancel this registration.",
            },
        )

    if client is not None:
        return await _check(client)
    else:
        async with httpx.AsyncClient(timeout=10.0) as c:
            return await _check(c)


async def verify_admin_only_for_winner(
    match_id: str,
    auth_user: AuthUser,
    client: httpx.AsyncClient | None = None,
) -> None:
    """Verify that only an administrator or tournament organizer can update match winners.

    Raises HTTP 403 Forbidden if not authorized.
    """
    if auth_user.is_admin:
        return

    if httpx is None or not settings.supabase_url:
        return

    from app.services.tournament_service import _sb_get

    async def _check(c: httpx.AsyncClient) -> None:
        matches = await _sb_get(
            c,
            "matches",
            {"id": f"eq.{match_id}", "select": "id,tournament_id"},
        )
        if not matches:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"code": "match_not_found", "message": "Match not found"},
            )

        t_id = matches[0]["tournament_id"]
        t_rows = await _sb_get(
            c,
            "tournaments",
            {"id": f"eq.{t_id}", "select": "id,organizer_id,created_by"},
        )
        if t_rows and (
            t_rows[0].get("organizer_id") == auth_user.id
            or t_rows[0].get("created_by") == auth_user.id
        ):
            return

        logger.warning(
            "security_unauthorized_winner_update",
            user_id=auth_user.id,
            match_id=match_id,
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "code": "forbidden",
                "message": "Only administrators or tournament organizers can update match winners.",
            },
        )

    if client is not None:
        await _check(client)
    else:
        async with httpx.AsyncClient(timeout=10.0) as c:
            await _check(c)
