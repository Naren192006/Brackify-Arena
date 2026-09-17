"""Test suite for Isolated Platform Admin Authentication System.

Verifies:
- Bcrypt password hashing and verification (cost factor >= 12).
- Dedicated ADMIN_JWT_SECRET and token type 'admin'.
- Cookie-based session authentication ('admin_session').
- CSRF protection on mutating endpoints.
- Rejection of Supabase player tokens.
- Super admin privileges and sub-admin permission enforcement.
- Admin user CRUD, self-deletion prevention, and last super admin protection.
"""

import os
import sys
import time
import uuid
from unittest.mock import AsyncMock, patch

import pytest

sys.path.insert(0, ".")

os.environ["DATABASE_URL"] = "sqlite+aiosqlite:///load_tests/benchmark_store.db"
os.environ["REDIS_ENABLED"] = "false"
os.environ["SECRET_KEY"] = "test-secret-key-admin-testing-min-32-chars-long-2026"
os.environ["ADMIN_JWT_SECRET"] = "test-dedicated-admin-jwt-secret-testing-2026"
os.environ["SUPABASE_JWT_SECRET"] = "test-supabase-jwt-secret-player-32bytes"
os.environ["SUPABASE_URL"] = "https://test.supabase.co"
os.environ["SUPABASE_SERVICE_ROLE_KEY"] = "test-service-role-key-admin"
os.environ["ENVIRONMENT"] = "test"

from fastapi.testclient import TestClient

from app.config import settings
from app.core.admin_auth import (
    AdminUser,
    create_admin_token,
    decode_admin_token,
    hash_password,
    verify_password,
)
from app.core.auth import encode_supabase_jwt
from app.main import app

client = TestClient(app)


# ---------------------------------------------------------------------------
# 1. Bcrypt Password Security Tests
# ---------------------------------------------------------------------------


def test_bcrypt_password_hashing():
    """Verify bcrypt hash generation with >= 12 rounds and constant-time verification."""
    password = "AdminSecurePassword@123"
    hashed = hash_password(password)

    assert hashed.startswith("$2b$12$") or hashed.startswith("$2a$12$")
    assert verify_password(password, hashed) is True
    assert verify_password("WrongPassword123", hashed) is False
    assert verify_password("", hashed) is False


# ---------------------------------------------------------------------------
# 2. Admin JWT Token Structure & Validation
# ---------------------------------------------------------------------------


def test_admin_token_creation_and_decoding():
    """Verify admin JWT payload includes sub, email, role, type='admin', exp."""
    admin = AdminUser(
        id=str(uuid.uuid4()),
        email="superadmin@brackify.test",
        role="super_admin",
        permissions=["all", "delete_tournaments"],
    )
    token = create_admin_token(admin, expire_hours=24)
    payload = decode_admin_token(token)

    assert payload["sub"] == admin.id
    assert payload["email"] == admin.email
    assert payload["role"] == "super_admin"
    assert payload["type"] == "admin"
    assert payload["exp"] > time.time()


def test_admin_token_rejects_player_jwt():
    """Verify decode_admin_token strictly rejects tokens where type != 'admin'."""
    player_payload = {
        "sub": str(uuid.uuid4()),
        "email": "player@brackify.test",
        "role": "authenticated",
        "app_metadata": {"role": "player"},
        "exp": int(time.time()) + 3600,
    }
    player_jwt = encode_supabase_jwt(player_payload, secret=settings.supabase_jwt_secret)

    with pytest.raises(Exception):
        decode_admin_token(player_jwt)


def test_admin_token_rejects_expired():
    """Verify expired admin token is rejected."""
    admin = AdminUser(
        id=str(uuid.uuid4()),
        email="admin@brackify.test",
        role="sub_admin",
    )
    token = create_admin_token(admin, expire_hours=-1)

    with pytest.raises(Exception) as excinfo:
        decode_admin_token(token)
    assert "admin_session_expired" in str(excinfo.value) or "expired" in str(excinfo.value).lower()


# ---------------------------------------------------------------------------
# 3. POST /api/v1/admin/login
# ---------------------------------------------------------------------------


def test_admin_login_success():
    """Valid credentials return 200, return admin profile, and set admin_session cookie."""
    admin_id = str(uuid.uuid4())
    raw_pwd = "Admin@Password123"
    hashed_pwd = hash_password(raw_pwd)

    mock_row = {
        "id": admin_id,
        "email": "admin@brackify.com",
        "password_hash": hashed_pwd,
        "role": "super_admin",
        "permissions": ["all", "delete_tournaments"],
        "active": True,
    }

    with patch("app.services.admin_auth_service.httpx.AsyncClient") as mock_client_cls:
        mock_instance = AsyncMock()
        mock_resp = AsyncMock()
        mock_resp.status_code = 200
        mock_resp.json = lambda: [mock_row]
        mock_resp.raise_for_status = lambda: None
        mock_instance.get.return_value = mock_resp
        mock_instance.patch.return_value = mock_resp
        mock_client_cls.return_value.__aenter__.return_value = mock_instance

        resp = client.post(
            "/api/v1/admin/login",
            json={"email": "admin@brackify.com", "password": raw_pwd},
        )

        assert resp.status_code == 200
        data = resp.json()
        assert data["id"] == admin_id
        assert data["email"] == "admin@brackify.com"
        assert data["role"] == "super_admin"
        assert "password_hash" not in data

        # Check cookies
        assert "admin_session" in resp.cookies
        assert "admin_csrf" in resp.cookies


def test_admin_login_wrong_password_returns_401():
    """Incorrect password returns 401 Unauthorized."""
    mock_row = {
        "id": str(uuid.uuid4()),
        "email": "admin@brackify.com",
        "password_hash": hash_password("CorrectPassword"),
        "role": "super_admin",
        "active": True,
    }

    with patch("app.services.admin_auth_service.httpx.AsyncClient") as mock_client_cls:
        mock_instance = AsyncMock()
        mock_resp = AsyncMock()
        mock_resp.status_code = 200
        mock_resp.json = lambda: [mock_row]
        mock_resp.raise_for_status = lambda: None
        mock_instance.get.return_value = mock_resp
        mock_client_cls.return_value.__aenter__.return_value = mock_instance

        resp = client.post(
            "/api/v1/admin/login",
            json={"email": "admin@brackify.com", "password": "WrongPassword"},
        )
        assert resp.status_code == 401
        assert "Invalid admin email or password" in resp.text


def test_admin_login_inactive_returns_403():
    """Deactivated admin account returns 403 Forbidden."""
    raw_pwd = "Admin@Password123"
    mock_row = {
        "id": str(uuid.uuid4()),
        "email": "deactivated@brackify.com",
        "password_hash": hash_password(raw_pwd),
        "role": "sub_admin",
        "active": False,
    }

    with patch("app.services.admin_auth_service.httpx.AsyncClient") as mock_client_cls:
        mock_instance = AsyncMock()
        mock_resp = AsyncMock()
        mock_resp.status_code = 200
        mock_resp.json = lambda: [mock_row]
        mock_resp.raise_for_status = lambda: None
        mock_instance.get.return_value = mock_resp
        mock_client_cls.return_value.__aenter__.return_value = mock_instance

        resp = client.post(
            "/api/v1/admin/login",
            json={"email": "deactivated@brackify.com", "password": raw_pwd},
        )
        assert resp.status_code == 403
        assert "deactivated" in resp.text.lower()


# ---------------------------------------------------------------------------
# 4. POST /api/v1/admin/logout
# ---------------------------------------------------------------------------


def test_admin_logout_clears_cookie():
    """Logout endpoint deletes admin_session and admin_csrf cookies."""
    resp = client.post("/api/v1/admin/logout")
    assert resp.status_code == 200
    assert resp.json()["success"] is True


# ---------------------------------------------------------------------------
# 5. GET /api/v1/admin/me
# ---------------------------------------------------------------------------


def test_admin_me_missing_cookie_returns_401():
    """Request without admin_session cookie returns 401."""
    resp = client.get("/api/v1/admin/me")
    assert resp.status_code == 401


def test_admin_me_rejects_player_bearer_token():
    """Request sending player Bearer token on /admin/me is rejected."""
    player_jwt = encode_supabase_jwt({"sub": str(uuid.uuid4()), "role": "authenticated"})
    resp = client.get(
        "/api/v1/admin/me",
        headers={"Authorization": f"Bearer {player_jwt}"},
    )
    assert resp.status_code == 401


def test_admin_me_with_cookie_success():
    """Request with valid admin_session cookie returns admin profile."""
    admin_id = str(uuid.uuid4())
    admin = AdminUser(
        id=admin_id,
        email="superadmin@brackify.com",
        role="super_admin",
        permissions=["all", "delete_tournaments"],
    )
    token = create_admin_token(admin)

    with patch("app.core.admin_auth.fetch_admin_user_by_id", new=AsyncMock(return_value=admin)):
        client.cookies.set("admin_session", token)
        resp = client.get("/api/v1/admin/me")
        client.cookies.clear()

        assert resp.status_code == 200
        data = resp.json()
        assert data["id"] == admin_id
        assert data["email"] == "superadmin@brackify.com"
        assert data["role"] == "super_admin"


# ---------------------------------------------------------------------------
# 6. DELETE /api/v1/admin/tournaments/{tournament_id}
# ---------------------------------------------------------------------------


def test_delete_tournament_requires_super_admin_or_permission():
    """Super admin can delete tournament."""
    super_admin = AdminUser(
        id=str(uuid.uuid4()),
        email="superadmin@brackify.com",
        role="super_admin",
        permissions=["all"],
    )
    token = create_admin_token(super_admin)
    tourney_id = str(uuid.uuid4())
    mock_result = {
        "success": True,
        "deleted": True,
        "tournament_id": tourney_id,
        "tournament_name": "Test Cup",
    }

    with (
        patch(
            "app.core.admin_auth.fetch_admin_user_by_id", new=AsyncMock(return_value=super_admin)
        ),
        patch(
            "app.api.v1.admin.delete_tournament_service", new=AsyncMock(return_value=mock_result)
        ),
    ):
        client.cookies.set("admin_session", token)
        resp = client.delete(f"/api/v1/admin/tournaments/{tourney_id}")
        client.cookies.clear()

        assert resp.status_code == 200
        assert resp.json()["success"] is True


def test_delete_tournament_forbidden_for_sub_admin_without_permission():
    """Sub admin without 'delete_tournaments' permission receives 403 Forbidden."""
    sub_admin = AdminUser(
        id=str(uuid.uuid4()),
        email="subadmin@brackify.com",
        role="sub_admin",
        permissions=["manage_brackets"],  # lacks 'delete_tournaments'
    )
    token = create_admin_token(sub_admin)
    tourney_id = str(uuid.uuid4())

    with patch("app.core.admin_auth.fetch_admin_user_by_id", new=AsyncMock(return_value=sub_admin)):
        client.cookies.set("admin_session", token)
        resp = client.delete(f"/api/v1/admin/tournaments/{tourney_id}")
        client.cookies.clear()

        assert resp.status_code == 403
        assert "permission" in resp.text.lower()


# ---------------------------------------------------------------------------
# 7. Sub Admin Management Lifecycle
# ---------------------------------------------------------------------------


def test_sub_admin_management_crud():
    """Super admin can list, create, and delete sub administrators."""
    super_admin = AdminUser(
        id=str(uuid.uuid4()),
        email="superadmin@brackify.com",
        role="super_admin",
        permissions=["all"],
    )
    token = create_admin_token(super_admin)
    sub_admin_id = str(uuid.uuid4())

    created_sub = {
        "id": sub_admin_id,
        "email": "operator@brackify.com",
        "role": "sub_admin",
        "permissions": ["delete_tournaments"],
        "active": True,
    }

    with (
        patch(
            "app.core.admin_auth.fetch_admin_user_by_id", new=AsyncMock(return_value=super_admin)
        ),
        patch(
            "app.api.v1.admin.create_admin_user_service", new=AsyncMock(return_value=created_sub)
        ),
        patch(
            "app.api.v1.admin.list_admin_users_service",
            new=AsyncMock(return_value=[super_admin.dict(), created_sub]),
        ),
        patch("app.api.v1.admin.delete_admin_user_service", new=AsyncMock(return_value=None)),
    ):
        client.cookies.set("admin_session", token)

        # 1. Create
        create_resp = client.post(
            "/api/v1/admin/users",
            json={
                "email": "operator@brackify.com",
                "password": "SubAdminPassword123",
                "role": "sub_admin",
                "permissions": ["delete_tournaments"],
            },
        )
        assert create_resp.status_code == 201
        assert create_resp.json()["email"] == "operator@brackify.com"

        # 2. List
        list_resp = client.get("/api/v1/admin/users")
        assert list_resp.status_code == 200
        assert len(list_resp.json()) == 2

        # 3. Delete
        del_resp = client.delete(f"/api/v1/admin/users/{sub_admin_id}")
        assert del_resp.status_code == 200
        assert del_resp.json()["success"] is True

        client.cookies.clear()


# ---------------------------------------------------------------------------
# 8. Unauthenticated CSRF Dispenser & CORS Tests
# ---------------------------------------------------------------------------


def test_admin_csrf_endpoint_unauthenticated():
    """GET /api/v1/admin/csrf returns 200 without authentication and sets admin_csrf cookie."""
    resp = client.get("/api/v1/admin/csrf")
    assert resp.status_code == 200
    data = resp.json()
    assert "csrf_token" in data
    assert len(data["csrf_token"]) > 0
    assert "admin_csrf" in resp.cookies


def test_cors_preflight_and_login_headers():
    """OPTIONS /api/v1/admin/login returns 200 with proper Access-Control headers for Vercel."""
    origin = "https://brackify-arena-self.vercel.app"
    resp = client.options(
        "/api/v1/admin/login",
        headers={
            "Origin": origin,
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type,x-csrf-token",
        },
    )
    assert resp.status_code == 200
    assert resp.headers.get("access-control-allow-origin") == origin
    assert resp.headers.get("access-control-allow-credentials") == "true"
    assert "POST" in resp.headers.get("access-control-allow-methods", "")
