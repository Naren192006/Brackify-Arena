"""Tests for account deletion, notification preferences, and email verification."""

from tests.conftest import *

pytestmark = pytest.mark.asyncio


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


async def test_delete_account_requires_password_and_confirmation(client):
    await _register(client)
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

    # session is gone — me() must now 401
    r = await client.get("/api/v1/auth/me")
    assert r.status_code == 401


async def test_delete_is_idempotent_safe(client):
    await _register(client, email="once@example.com", username="onceonly")
    r = await client.post(
        "/api/v1/users/me/delete",
        json={"password": "TestPass#2026x", "confirmation": "DELETE"},
    )
    assert r.status_code == 204
    # second call without a session -> 401, not 500
    r = await client.post(
        "/api/v1/users/me/delete",
        json={"password": "TestPass#2026x", "confirmation": "DELETE"},
    )
    assert r.status_code == 401


async def test_notification_preferences_roundtrip(client):
    await _register(client, email="prefs@example.com", username="prefuser")
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
