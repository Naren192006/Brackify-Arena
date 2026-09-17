import secrets
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, Cookie, Depends, HTTPException, Request, Response, status
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import ACCESS_COOKIE, REFRESH_COOKIE, get_current_user
from app.config import settings
from app.core.exceptions import AppError, app_error_to_http
from app.db.session import get_db_session
from app.models.user import User
from app.schemas.auth import (
    AuthResponse,
    LoginRequest,
    PasswordResetConfirm,
    PasswordResetRequest,
    RegisterRequest,
)
from app.services.auth_service import AuthService, user_to_public

router = APIRouter(prefix="/auth", tags=["auth"])
GOOGLE_STATE_COOKIE = "google_oauth_state"

COOKIE_KWARGS = {
    "httponly": True,
    "secure": settings.is_production,
    "samesite": "lax",
    "path": "/",
}


def _set_auth_cookies(response: Response, access_token: str, refresh_token: str) -> None:
    response.set_cookie(
        key=ACCESS_COOKIE,
        value=access_token,
        max_age=settings.access_token_expire_minutes * 60,
        **COOKIE_KWARGS,
    )
    response.set_cookie(
        key=REFRESH_COOKIE,
        value=refresh_token,
        max_age=settings.refresh_token_expire_days * 24 * 60 * 60,
        **COOKIE_KWARGS,
    )


def _clear_auth_cookies(response: Response) -> None:
    response.delete_cookie(key=ACCESS_COOKIE, path="/")
    response.delete_cookie(key=REFRESH_COOKIE, path="/")


@router.post("/register", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
@router.post("/signup", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
async def register(
    data: RegisterRequest,
    response: Response,
    session: AsyncSession = Depends(get_db_session),
) -> AuthResponse:
    """Create a new user account with strict input validation."""
    service = AuthService(session, settings.refresh_token_expire_days)
    try:
        user, access_token, refresh_token = await service.register(data)
    except AppError as exc:
        raise app_error_to_http(exc) from exc

    _set_auth_cookies(response, access_token, refresh_token)
    return AuthResponse(user=user_to_public(user))


@router.post("/login", response_model=AuthResponse)
async def login(
    data: LoginRequest,
    response: Response,
    session: AsyncSession = Depends(get_db_session),
) -> AuthResponse:
    service = AuthService(session, settings.refresh_token_expire_days)
    try:
        user, access_token, refresh_token = await service.login(data.email, data.password)
    except AppError as exc:
        raise app_error_to_http(exc) from exc

    _set_auth_cookies(response, access_token, refresh_token)
    return AuthResponse(user=user_to_public(user))


@router.post("/refresh", response_model=AuthResponse)
async def refresh_session(
    response: Response,
    refresh_token: str | None = Cookie(default=None, alias=REFRESH_COOKIE),
    session: AsyncSession = Depends(get_db_session),
) -> AuthResponse:
    if not refresh_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "not_authenticated", "message": "No refresh token"},
        )

    service = AuthService(session, settings.refresh_token_expire_days)
    try:
        user, access_token, new_refresh_token = await service.refresh(refresh_token)
    except AppError as exc:
        _clear_auth_cookies(response)
        raise app_error_to_http(exc) from exc

    _set_auth_cookies(response, access_token, new_refresh_token)
    return AuthResponse(user=user_to_public(user))


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    response: Response,
    refresh_token: str | None = Cookie(default=None, alias=REFRESH_COOKIE),
    session: AsyncSession = Depends(get_db_session),
) -> Response:
    service = AuthService(session, settings.refresh_token_expire_days)
    await service.logout(refresh_token)
    _clear_auth_cookies(response)
    return response


@router.post("/password-reset/request", status_code=status.HTTP_202_ACCEPTED)
async def request_password_reset(
    data: PasswordResetRequest, session: AsyncSession = Depends(get_db_session)
) -> dict[str, str]:
    service = AuthService(session, settings.refresh_token_expire_days)
    await service.request_password_reset(data.email)
    return {"message": "If the account exists, password reset instructions will be sent."}


@router.post("/password-reset/confirm", status_code=status.HTTP_204_NO_CONTENT)
async def confirm_password_reset(
    data: PasswordResetConfirm, session: AsyncSession = Depends(get_db_session)
) -> Response:
    service = AuthService(session, settings.refresh_token_expire_days)
    try:
        await service.reset_password(data.token, data.password)
    except AppError as exc:
        raise app_error_to_http(exc) from exc
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/google")
async def google_login() -> RedirectResponse:
    if not settings.google_client_id or not settings.google_client_secret:
        raise HTTPException(
            status_code=503,
            detail={"code": "oauth_not_configured", "message": "Google sign-in is not configured"},
        )
    state = secrets.token_urlsafe(32)
    query = urlencode(
        {
            "client_id": settings.google_client_id,
            "redirect_uri": settings.google_redirect_uri,
            "response_type": "code",
            "scope": "openid email profile",
            "state": state,
            "access_type": "online",
            "prompt": "select_account",
        }
    )
    response = RedirectResponse(f"https://accounts.google.com/o/oauth2/v2/auth?{query}")
    response.set_cookie(
        GOOGLE_STATE_COOKIE,
        state,
        httponly=True,
        secure=settings.is_production,
        samesite="lax",
        max_age=600,
        path="/",
    )
    return response


@router.get("/google/callback")
async def google_callback(
    request: Request,
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
    session: AsyncSession = Depends(get_db_session),
) -> RedirectResponse:
    if error or not code or not state or state != request.cookies.get(GOOGLE_STATE_COOKIE):
        return RedirectResponse(f"{settings.frontend_url}/login?error=oauth_cancelled")
    if not settings.google_client_id or not settings.google_client_secret:
        return RedirectResponse(f"{settings.frontend_url}/login?error=oauth_not_configured")
    async with httpx.AsyncClient(timeout=10) as client:
        token_response = await client.post(
            "https://oauth2.googleapis.com/token",
            data={
                "code": code,
                "client_id": settings.google_client_id,
                "client_secret": settings.google_client_secret,
                "redirect_uri": settings.google_redirect_uri,
                "grant_type": "authorization_code",
            },
        )
        if token_response.is_error:
            return RedirectResponse(f"{settings.frontend_url}/login?error=oauth_failed")
        token = token_response.json().get("access_token")
        profile_response = await client.get(
            "https://openidconnect.googleapis.com/v1/userinfo",
            headers={"Authorization": f"Bearer {token}"},
        )
        if profile_response.is_error:
            return RedirectResponse(f"{settings.frontend_url}/login?error=oauth_failed")
        profile = profile_response.json()
    email = profile.get("email")
    subject = profile.get("sub")
    if (
        not isinstance(email, str)
        or not isinstance(subject, str)
        or profile.get("email_verified") is not True
    ):
        return RedirectResponse(f"{settings.frontend_url}/login?error=oauth_email_unverified")
    service = AuthService(session, settings.refresh_token_expire_days)
    _user, access_token, refresh_token = await service.login_with_google(
        subject, email, profile.get("name")
    )
    response = RedirectResponse(f"{settings.frontend_url}/dashboard")
    response.delete_cookie(GOOGLE_STATE_COOKIE, path="/")
    _set_auth_cookies(response, access_token, refresh_token)
    return response


@router.get("/me", response_model=AuthResponse)
async def get_me(current_user: User = Depends(get_current_user)) -> AuthResponse:
    return AuthResponse(user=user_to_public(current_user), message="OK")


@router.get("/csrf")
async def get_csrf_token(response: Response) -> dict[str, str]:
    """Dispense signed CSRF token for web clients."""
    from app.core.csrf import CSRF_COOKIE_NAME, generate_csrf_token

    token = generate_csrf_token()
    response.set_cookie(
        key=CSRF_COOKIE_NAME,
        value=token,
        httponly=False,
        secure=settings.is_production,
        samesite="lax",
        max_age=3600,
        path="/",
    )
    return {"csrf_token": token}
