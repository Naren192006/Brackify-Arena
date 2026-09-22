"""Tests for account deletion, notification preferences, and email verification.

These endpoints authenticate with Supabase Bearer JWTs resolved through
``get_current_backend_user``. The suite overrides ``get_current_auth_user``
(the same pattern as ``test_teams.py``) to exercise both identity-resolution
paths: backend row keyed by the Supabase uid, and the email fallback for
register-first accounts whose backend id differs.
"""

from uuid import uuid4

import pytest

from app.core.auth import AuthUser, get_current_auth_user
from app.main import app

pytestmark = pytest.mark.asyncio

REGISTERED = {"email": "deleteme@example.com", "username": "deleteme"}


async def _register(client, email="deleteme@example.com", username="deleteme"):
    resp = await client.post(
        "/api/v1/auth/register",
        json={
            "email": email,
            "username": username,
            "password": "TestPass#2026x",
            "display_name": "Delete Me",
        },
    )
    assert resp.status_code == 201
    return resp.json()


def _override_as(app, user_row):
    """Authenticate all requests as the given backend user row."""

    async def _fake_auth():
        return AuthUser(
            id=str(getattr(user_row, "supabase_uid", None) or user_row.id),
            email=user_row.email,
            role="authenticated",
            is_admin=False,
            raw_claims={"sub": str(user_row.id), "email": user_row.email},
        )

    app.dependency_overrides[get_current_auth_user] = _fake_auth


async def test_account_endpoints_reject_missing_token(client, db_session_factory):
    """Regression: these endpoints used cookie auth that prod never sets.

    Browsers on a different origin do not send the backend session cookie
    cross-site, so the client must look cookie-less even after registering.
    """
    await _register(client)
    client.cookies.clear()
    for method, path in [
        ("GET", "/api/v1/auth/me"),
        ("PATCH", "/api/v1/users/me/notification-preferences"),
        ("POST", "/api/v1/auth/verify-email/request"),
        ("POST", "/api/v1/users/me/delete"),
    ]:
        body = {"email_notifications_enabled": True}
        if path.endswith("delete"):
            body = {"password": "TestPass#2026x", "confirmation": "DELETE"}
        r = await client.request(method, path, json=body)
        assert r.status_code == 401, (method, path, r.status_code)


async def test_identity_resolves_by_supabase_uid(client, db_session_factory):
    """Account provisioned with the Supabase uid preserved as primary key."""
    await _register(client)
    async with db_session_factory() as session:
        from sqlalchemy import select

        from app.models.user import User

        row = await session.scalar(select(User).where(User.email == REGISTERED["email"]))
        assert row is not None
        _override_as(app, row)
        r = await client.get("/api/v1/auth/me")
        assert r.status_code == 200
        assert r.json()["user"]["email"] == REGISTERED["email"]


async def test_identity_resolves_by_email_fallback(client, db_session_factory):
    """Register-first accounts: backend id differs from the Supabase uid."""
    await _register(client)
    async with db_session_factory() as session:
        from sqlalchemy import select

        from app.models.user import User

        row = await session.scalar(select(User).where(User.email == REGISTERED["email"]))
        assert row is not None

        class Wrapper:
            """Expose a *different* id so only the email fallback can match."""

            email = row.email
            id = uuid4()
            username = row.username

        _override_as(app, Wrapper())
        r = await client.get("/api/v1/auth/me")
        assert r.status_code == 200
        assert r.json()["user"]["email"] == REGISTERED["email"]


async def test_unknown_identity_is_unauthorized(client, db_session_factory):
    """No backend row for the token's identity -> 401, never a 500."""

    class Ghost:
        email = "ghost@example.com"
        id = uuid4()
        username = "ghost"

    _override_as(app, Ghost())
    r = await client.get("/api/v1/auth/me")
    assert r.status_code == 401


async def test_delete_account_requires_password_and_confirmation(client):
    await _register(client)

    # Reuse the registered identity via email fallback.
    class Me:
        email = REGISTERED["email"]
        id = uuid4()
        username = REGISTERED["username"]

    _override_as(app, Me())

    # wrong password
    r = await client.post(
        "/api/v1/users/me/delete",
        json={"password": "WrongPass#999", "confirmation": "DELETE"},
    )
    assert r.status_code == 401

    # missing confirmation literal
    r = await client.post(
        "/api/v1/users/me/delete",
        json={"password": "TestPass#2026x", "confirmation": "KEEP"},
    )
    assert r.status_code == 422

    # correct
    r = await client.post(
        "/api/v1/users/me/delete",
        json={"password": "TestPass#2026x", "confirmation": "DELETE"},
    )
    assert r.status_code == 204

    # token still valid but account row gone -> 401
    r = await client.get("/api/v1/auth/me")
    assert r.status_code == 401


async def test_notification_preferences_roundtrip(client):
    await _register(client, email="prefs@example.com", username="prefuser")

    class Me:
        email = "prefs@example.com"
        id = uuid4()
        username = "prefuser"

    _override_as(app, Me())

    r = await client.patch(
        "/api/v1/users/me/notification-preferences",
        json={"email_notifications_enabled": False},
    )
    assert r.status_code == 200
    assert r.json()["email_notifications_enabled"] is False

    r = await client.patch(
        "/api/v1/users/me/notification-preferences",
        json={"email_notifications_enabled": True},
    )
    assert r.status_code == 200
    assert r.json()["email_notifications_enabled"] is True


async def test_email_verification_flow(client):
    await _register(client, email="verify@example.com", username="verifyuser")

    class Me:
        email = "verify@example.com"
        id = uuid4()
        username = "verifyuser"

    _override_as(app, Me())

    # request verification
    r = await client.post("/api/v1/auth/verify-email/request")
    assert r.status_code == 202

    # confirm with garbage token -> 401
    r = await client.post(
        "/api/v1/auth/verify-email/confirm", json={"token": "x" * 32}
    )
    assert r.status_code == 401


async def test_notification_preference_requires_auth(client):
    r = await client.patch(
        "/api/v1/users/me/notification-preferences",
        json={"email_notifications_enabled": False},
    )
    assert r.status_code == 401
