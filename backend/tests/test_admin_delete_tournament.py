"""Test suite for Admin-Only Tournament Deletion, Cascade Cleanup, Payment Preservation, and Audit Logging."""

import os
import sys
import uuid
import pytest
from unittest.mock import AsyncMock, patch, MagicMock

sys.path.insert(0, ".")

os.environ["DATABASE_URL"] = "sqlite+aiosqlite:///load_tests/benchmark_store.db"
os.environ["REDIS_ENABLED"] = "false"
os.environ["SECRET_KEY"] = "test-secret-key-admin-delete-tournament-testing-12345"
os.environ["SUPABASE_JWT_SECRET"] = "test-supabase-jwt-secret-testing-admin-delete-32bytes"
os.environ["SUPABASE_URL"] = "https://test.supabase.co"
os.environ["SUPABASE_SERVICE_ROLE_KEY"] = "test-service-role-key-admin"
os.environ["ENVIRONMENT"] = "test"

from app.config import settings
from fastapi.testclient import TestClient
from app.main import app
from app.core.auth import encode_supabase_jwt, AuthUser
from app.services.admin_tournament_service import (
    delete_tournament_service,
    _extract_storage_path,
)

client = TestClient(app)


def _get_signing_secret() -> str:
    return settings.supabase_jwt_secret or settings.secret_key or settings.supabase_service_role_key or "default-secret"


def _make_admin_token(user_id: str | None = None) -> str:
    uid = user_id or str(uuid.uuid4())
    payload = {
        "sub": uid,
        "email": "admin@brackify.test",
        "role": "authenticated",
        "app_metadata": {"role": "super_admin"},
        "exp": 9999999999,
    }
    return encode_supabase_jwt(payload, secret=_get_signing_secret())


def _make_player_token(user_id: str | None = None) -> str:
    uid = user_id or str(uuid.uuid4())
    payload = {
        "sub": uid,
        "email": "player@brackify.test",
        "role": "authenticated",
        "app_metadata": {"role": "player"},
        "exp": 9999999999,
    }
    return encode_supabase_jwt(payload, secret=_get_signing_secret())



def test_storage_path_extraction():
    """Verify storage path extraction helper handles various URL formats."""
    banner_url1 = "https://test.supabase.co/storage/v1/object/public/tournament-banners/tournaments/banner-1.jpg"
    assert _extract_storage_path(banner_url1, "tournament-banners") == "tournaments/banner-1.jpg"

    banner_url2 = "tournament-banners/my-banner.png"
    assert _extract_storage_path(banner_url2, "tournament-banners") == "my-banner.png"

    external_url = "https://images.unsplash.com/photo-123"
    assert _extract_storage_path(external_url, "tournament-banners") is None

    assert _extract_storage_path(None, "tournament-banners") is None


def test_routes_registered():
    """Verify DELETE routes are registered in FastAPI OpenAPI schema."""
    paths = app.openapi()["paths"]
    assert "/api/v1/tournaments/{tournament_id}" in paths
    assert "delete" in paths["/api/v1/tournaments/{tournament_id}"]

    assert "/api/v1/admin/tournaments/{tournament_id}" in paths
    assert "delete" in paths["/api/v1/admin/tournaments/{tournament_id}"]


def test_delete_tournament_unauthenticated_returns_401():
    """Unauthenticated requests must be rejected with 401."""
    tournament_id = str(uuid.uuid4())
    resp = client.delete(f"/api/v1/tournaments/{tournament_id}")
    assert resp.status_code == 401

    resp_admin_route = client.delete(f"/api/v1/admin/tournaments/{tournament_id}")
    assert resp_admin_route.status_code == 401


def test_delete_tournament_non_admin_returns_403():
    """Non-admin users (e.g. regular player/organizer) must be rejected with 403."""
    tournament_id = str(uuid.uuid4())
    player_token = _make_player_token()
    headers = {"Authorization": f"Bearer {player_token}"}

    resp = client.delete(f"/api/v1/tournaments/{tournament_id}", headers=headers)
    assert resp.status_code == 403
    data = resp.json()
    assert "admin" in str(data).lower()



@pytest.mark.asyncio
async def test_delete_tournament_service_nonexistent_returns_404():
    """Deleting a nonexistent tournament returns 404."""
    admin_user = AuthUser(
        id=str(uuid.uuid4()),
        email="admin@test.com",
        role="authenticated",
        is_admin=True,
    )

    with patch("app.services.admin_tournament_service._sb_get", new_callable=AsyncMock) as mock_get:
        mock_get.return_value = []  # No tournament found

        with pytest.raises(Exception) as exc_info:
            await delete_tournament_service(str(uuid.uuid4()), admin_user)

        assert "404" in str(exc_info.value) or "not found" in str(exc_info.value).lower()


@pytest.mark.asyncio
async def test_delete_tournament_service_cascade_success_and_preserves_payments():
    """Test successful tournament deletion:
    - Cascades across matches, match reports, brackets, registrations
    - Preserves payment rows by marking them 'cancelled_admin'
    - Cleans up storage files
    - Writes immutable audit log
    """
    tournament_id = str(uuid.uuid4())
    admin_id = str(uuid.uuid4())
    admin_user = AuthUser(
        id=admin_id,
        email="superadmin@brackify.test",
        role="authenticated",
        is_admin=True,
    )

    fake_tournament = {
        "id": tournament_id,
        "title": "Championship Cup 2026",
        "slug": "championship-cup-2026",
        "banner_url": "https://test.supabase.co/storage/v1/object/public/tournament-banners/tournaments/banner.png",
        "status": "ongoing",
        "created_by": str(uuid.uuid4()),
    }

    fake_matches = [{"id": str(uuid.uuid4())}, {"id": str(uuid.uuid4())}]
    fake_reports = [{"id": str(uuid.uuid4()), "evidence_url": "https://test.supabase.co/storage/v1/object/match-evidence/dispute.png"}]
    fake_registrations = [{"id": str(uuid.uuid4())}, {"id": str(uuid.uuid4())}, {"id": str(uuid.uuid4())}]

    deleted_tables = []
    patched_tables = []
    posted_tables = []
    storage_deleted = []

    async def mock_get(client, table, params):
        if table == "tournaments":
            return [fake_tournament]
        if table == "matches":
            return fake_matches
        if table == "match_reports":
            return fake_reports
        if table == "fair_play_reports":
            return []
        if table == "tournament_registrations":
            return fake_registrations
        return []

    async def mock_delete(client, table, params):
        deleted_tables.append(table)
        return 1

    async def mock_patch(client, table, params, body):
        patched_tables.append((table, body))

    async def mock_post(client, table, body):
        posted_tables.append((table, body))

    async def mock_delete_storage(client, bucket, path):
        storage_deleted.append((bucket, path))

    with patch("app.services.admin_tournament_service._sb_get", side_effect=mock_get), \
         patch("app.services.admin_tournament_service._sb_delete", side_effect=mock_delete), \
         patch("app.services.admin_tournament_service._sb_patch", side_effect=mock_patch), \
         patch("app.services.admin_tournament_service._sb_post", side_effect=mock_post), \
         patch("app.services.admin_tournament_service._delete_storage_file", side_effect=mock_delete_storage), \
         patch("app.services.admin_tournament_service._sb_rpc", side_effect=Exception("RPC not available")):

        result = await delete_tournament_service(tournament_id, admin_user)

        assert result["success"] is True
        assert result["deleted"] is True
        assert result["tournament_id"] == tournament_id
        assert result["tournament_name"] == "Championship Cup 2026"
        assert result["deleted_matches"] == 2
        assert result["deleted_registrations"] == 3

        # 1. Cascade cleanup check
        assert "matches" in deleted_tables
        assert "match_reports" in deleted_tables
        assert "brackets" in deleted_tables
        assert "tournament_registrations" in deleted_tables
        assert "tournaments" in deleted_tables

        # 2. Payments preservation check (Rule 4: Payments MUST NEVER be in deleted_tables)
        assert "payments" not in deleted_tables
        # Payments must have been updated to 'cancelled_admin'
        payment_patches = [body for table, body in patched_tables if table == "payments"]
        assert len(payment_patches) == 1
        assert payment_patches[0]["status"] == "cancelled_admin"

        # 3. Storage cleanup check (Rule 3)
        storage_buckets = [b for b, _ in storage_deleted]
        assert "tournament-banners" in storage_buckets

        # 4. Audit log check
        posted_table_names = [t for t, _ in posted_tables]
        assert "admin_audit_logs" in posted_table_names
        audit_log = next(body for table, body in posted_tables if table == "admin_audit_logs")
        assert audit_log["action"] == "tournament_deleted"
        assert audit_log["admin_id"] == admin_id
        assert audit_log["deleted_matches"] == 2
        assert audit_log["deleted_registrations"] == 3


def test_delete_tournament_api_endpoint_with_admin_token():
    """Test calling the API endpoint directly with an admin token."""
    tournament_id = str(uuid.uuid4())
    admin_token = _make_admin_token()
    headers = {"Authorization": f"Bearer {admin_token}"}

    with patch("app.services.admin_tournament_service._sb_get", new_callable=AsyncMock) as mock_get, \
         patch("app.services.admin_tournament_service._sb_rpc", new_callable=AsyncMock) as mock_rpc, \
         patch("app.services.admin_tournament_service._delete_storage_file", new_callable=AsyncMock):

        mock_get.return_value = [{"id": tournament_id, "title": "Summer Brawl", "banner_url": None}]
        mock_rpc.return_value = {
            "success": True,
            "deleted": True,
            "tournament_id": tournament_id,
            "tournament_name": "Summer Brawl",
            "deleted_registrations": 0,
            "deleted_matches": 0,
        }

        # 1. Test DELETE /api/v1/tournaments/{tournament_id}
        resp = client.delete(f"/api/v1/tournaments/{tournament_id}", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["deleted"] is True
        assert data["tournament_name"] == "Summer Brawl"

        # 2. Test DELETE /api/v1/admin/tournaments/{tournament_id} with admin session cookie
        from app.core.admin_auth import AdminUser, create_admin_token
        adm = AdminUser(id=str(uuid.uuid4()), email="super@brackify.test", role="super_admin", permissions=["all"])
        adm_token = create_admin_token(adm)
        client.cookies.set("admin_session", adm_token)
        with patch("app.core.admin_auth.fetch_admin_user_by_id", new=AsyncMock(return_value=adm)):
            resp_admin = client.delete(f"/api/v1/admin/tournaments/{tournament_id}")
            assert resp_admin.status_code == 200
            data_admin = resp_admin.json()
            assert data_admin["deleted"] is True
        client.cookies.clear()

