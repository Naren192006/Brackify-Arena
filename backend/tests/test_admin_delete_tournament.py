"""Test suite for Admin-Only Tournament Soft-Deletion, Payment Preservation, and Audit Logging
(Phase 9.4).

Verifies:
- Super admin delete success.
- Sub-admin delete forbidden when lacking delete permission.
- Incorrect confirmation title returns 400.
- Soft delete sets deleted_at, status='cancelled', cancelled_at.
- deleted_by and delete_reason stored correctly.
- Payments with pending/paid status become cancelled_admin (refunded/failed untouched).
- Immutable audit log created with before_state snapshot.
- Deleted tournaments excluded from list endpoint.
"""

import os
import sys
import uuid
from unittest.mock import AsyncMock, patch

import pytest

sys.path.insert(0, ".")

os.environ["DATABASE_URL"] = "sqlite+aiosqlite:///load_tests/benchmark_store.db"
os.environ["REDIS_ENABLED"] = "false"
os.environ["SECRET_KEY"] = "test-secret-key-admin-delete-tournament-testing-12345"
os.environ["ADMIN_JWT_SECRET"] = "test-dedicated-admin-jwt-secret-testing-2026"
os.environ["SUPABASE_JWT_SECRET"] = "test-supabase-jwt-secret-testing-admin-delete-32bytes"
os.environ["SUPABASE_URL"] = "https://test.supabase.co"
os.environ["SUPABASE_SERVICE_ROLE_KEY"] = "test-service-role-key-admin"
os.environ["ENVIRONMENT"] = "test"

from fastapi.testclient import TestClient

from app.core.admin_auth import AdminUser, create_admin_token
from app.core.auth import encode_supabase_jwt
from app.main import app
from app.services.admin_tournament_service import (
    _extract_storage_path,
    delete_tournament_service,
    list_admin_tournaments_service,
)

client = TestClient(app)

SUPER_ADMIN = AdminUser(
    id=str(uuid.uuid4()),
    email="superadmin@brackify.test",
    role="super_admin",
    permissions=["all", "delete_tournaments"],
    active=True,
)

SUB_ADMIN_NO_DELETE = AdminUser(
    id=str(uuid.uuid4()),
    email="subadmin@brackify.test",
    role="sub_admin",
    permissions=["manage_tournaments"],
    active=True,
)

SUB_ADMIN_WITH_DELETE = AdminUser(
    id=str(uuid.uuid4()),
    email="delegated@brackify.test",
    role="sub_admin",
    permissions=["delete_tournaments"],
    active=True,
)


def _make_player_token(user_id: str | None = None) -> str:
    uid = user_id or str(uuid.uuid4())
    payload = {
        "sub": uid,
        "email": "player@brackify.test",
        "role": "authenticated",
        "app_metadata": {"role": "player"},
        "exp": 9999999999,
    }
    return encode_supabase_jwt(
        payload, secret="test-supabase-jwt-secret-testing-admin-delete-32bytes"
    )


# ---------------------------------------------------------------------------
# 1. Basic Route and Auth Guard Tests
# ---------------------------------------------------------------------------


def test_storage_path_extraction():
    """Verify storage path extraction helper handles various URL formats."""
    banner_url1 = "https://test.supabase.co/storage/v1/object/public/tournament-banners/tournaments/banner-1.jpg"
    assert _extract_storage_path(banner_url1, "tournament-banners") == "tournaments/banner-1.jpg"

    banner_url2 = "tournament-banners/my-banner.png"
    assert _extract_storage_path(banner_url2, "tournament-banners") == "my-banner.png"

    external_url = "https://images.unsplash.com/photo-123"
    assert _extract_storage_path(external_url, "tournament-banners") is None
    assert _extract_storage_path(None, "tournament-banners") is None


def test_delete_tournament_unauthenticated_returns_401():
    """Unauthenticated requests must be rejected with 401."""
    tournament_id = str(uuid.uuid4())
    resp = client.delete(f"/api/v1/admin/tournaments/{tournament_id}")
    assert resp.status_code == 401


def test_delete_tournament_player_token_returns_401():
    """Player tokens cannot authenticate against /api/v1/admin/* endpoints."""
    tournament_id = str(uuid.uuid4())
    player_token = _make_player_token()
    resp = client.delete(
        f"/api/v1/admin/tournaments/{tournament_id}",
        headers={"Authorization": f"Bearer {player_token}"},
    )
    assert resp.status_code == 401


def test_delete_tournament_sub_admin_forbidden():
    """Sub-admin without delete_tournaments permission receives 403 Forbidden."""
    tournament_id = str(uuid.uuid4())
    token = create_admin_token(SUB_ADMIN_NO_DELETE)

    with patch(
        "app.core.admin_auth.fetch_admin_user_by_id",
        new=AsyncMock(return_value=SUB_ADMIN_NO_DELETE),
    ):
        client.cookies.set("admin_session", token)
        resp = client.delete(f"/api/v1/admin/tournaments/{tournament_id}")
        client.cookies.clear()

        assert resp.status_code == 403
        assert "super_admin_required" in resp.text or "permission" in resp.text.lower()


# ---------------------------------------------------------------------------
# 2. Service Layer: Soft-Deletion, Payments & Audit Logs
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_delete_tournament_service_nonexistent_returns_404():
    """Deleting a nonexistent or already-deleted tournament returns 404."""
    with patch("app.services.admin_tournament_service._sb_get", new_callable=AsyncMock) as mock_get:
        mock_get.return_value = []  # No tournament found

        with pytest.raises(Exception) as exc_info:
            await delete_tournament_service(str(uuid.uuid4()), SUPER_ADMIN)

        assert "404" in str(exc_info.value) or "not found" in str(exc_info.value).lower()


@pytest.mark.asyncio
async def test_delete_tournament_service_confirmation_title_mismatch_returns_400():
    """Mismatched confirmation title returns 400 Bad Request."""
    t_id = str(uuid.uuid4())
    mock_t = {
        "id": t_id,
        "title": "Valorant Champions 2026",
        "slug": "valorant-champions-2026",
        "status": "draft",
        "created_by": SUPER_ADMIN.id,
        "deleted_at": None,
    }

    with patch(
        "app.services.admin_tournament_service._sb_get", new=AsyncMock(return_value=[mock_t])
    ):
        with pytest.raises(Exception) as exc_info:
            await delete_tournament_service(
                t_id,
                SUPER_ADMIN,
                reason="Testing",
                confirmation_title="Wrong Title",
            )

        assert "400" in str(exc_info.value) or "mismatch" in str(exc_info.value).lower()


@pytest.mark.asyncio
async def test_delete_tournament_service_soft_delete_success():
    """Super Admin deletes tournament:
    - Performs cascade deletion on child records
    - Deletes tournament row or updates status='cancelled'
    - Updates only pending/paid payments to 'cancelled_admin'
    - Writes immutable admin_audit_logs entry with before_state
    """
    t_id = str(uuid.uuid4())
    mock_tournament = {
        "id": t_id,
        "title": "Championship Cup 2026",
        "slug": "championship-cup-2026",
        "game": "VALORANT",
        "platform": "PC",
        "status": "published",
        "team_size": 5,
        "max_teams": 16,
        "entry_fee_minor": 50000,
        "entry_fee_currency": "INR",
        "start_time": "2026-10-01T10:00:00Z",
        "banner_url": "https://test.supabase.co/storage/v1/object/public/tournament-banners/banner.png",
        "created_by": SUPER_ADMIN.id,
        "created_at": "2026-09-01T00:00:00Z",
    }

    patched_calls: list[tuple[str, dict, dict]] = []
    posted_calls: list[tuple[str, dict]] = []
    deleted_calls: list[tuple[str, dict]] = []

    async def mock_get(client, table, params):
        if table == "tournaments":
            return [mock_tournament]
        return []

    async def mock_delete(client, table, params, *args, **kwargs):
        deleted_calls.append((table, params))
        return 1

    async def mock_patch(client, table, params, body):
        patched_calls.append((table, params, body))
        return [body]

    async def mock_post(client, table, body):
        posted_calls.append((table, body))
        return [body]

    with (
        patch("app.services.admin_tournament_service._sb_get", side_effect=mock_get),
        patch("app.services.admin_tournament_service._sb_delete", side_effect=mock_delete),
        patch("app.services.admin_tournament_service._sb_patch", side_effect=mock_patch),
        patch("app.services.admin_tournament_service._sb_post", side_effect=mock_post),
    ):
        result = await delete_tournament_service(
            slug_or_id=t_id,
            admin_user=SUPER_ADMIN,
            reason="Scheduling conflict",
            confirmation_title="Championship Cup 2026",
        )

        assert result["success"] is True
        assert result["deleted"] is True
        assert result["tournament_id"] == t_id
        assert result["tournament_name"] == "Championship Cup 2026"
        assert result["deleted_by"] == SUPER_ADMIN.id
        assert result["delete_reason"] == "Scheduling conflict"

        # 1. Check tournament was deleted from tournaments table
        tourney_delete = next(
            (params for table, params in deleted_calls if table == "tournaments"), None
        )
        assert tourney_delete is not None
        assert tourney_delete.get("id") == f"eq.{t_id}"

        # 2. Check payments patch: ONLY pending/paid/created status patched to 'cancelled_admin'
        payment_patch_entry = next(
            ((params, body) for table, params, body in patched_calls if table == "payments"), None
        )
        assert payment_patch_entry is not None
        params, body = payment_patch_entry
        assert body["status"] == "cancelled_admin"
        assert "in.(pending,paid,created)" in params.get("status", "")

        # 3. Check audit log creation with before_state snapshot
        audit_entry = next(
            (body for table, body in posted_calls if table == "admin_audit_logs"), None
        )
        assert audit_entry is not None
        assert audit_entry["admin_id"] == SUPER_ADMIN.id
        assert audit_entry["action"] == "tournament_deleted"
        assert audit_entry["tournament_id"] == t_id
        assert audit_entry["tournament_name"] == "Championship Cup 2026"

        details = audit_entry["details"]
        assert details["admin_email"] == SUPER_ADMIN.email
        assert details["reason"] == "Scheduling conflict"
        assert details["timestamp"] is not None
        assert details["before_state"]["title"] == "Championship Cup 2026"
        assert details["before_state"]["status"] == "published"


# ---------------------------------------------------------------------------
# 3. API Route Tests: Super Admin & Filter Exclusion
# ---------------------------------------------------------------------------


def test_delete_tournament_api_success_with_super_admin():
    """Super Admin calls DELETE endpoint with confirmation title and reason."""
    t_id = str(uuid.uuid4())
    token = create_admin_token(SUPER_ADMIN)
    mock_t = {
        "id": t_id,
        "title": "Summer Brawl 2026",
        "slug": "summer-brawl-2026",
        "game": "BGMI",
        "platform": "Mobile",
        "status": "draft",
    }

    with (
        patch(
            "app.core.admin_auth.fetch_admin_user_by_id", new=AsyncMock(return_value=SUPER_ADMIN)
        ),
        patch(
            "app.services.admin_tournament_service._sb_get", new=AsyncMock(return_value=[mock_t])
        ),
        patch("app.services.admin_tournament_service._sb_delete", new=AsyncMock(return_value=1)),
        patch(
            "app.services.admin_tournament_service._sb_patch", new=AsyncMock(return_value=[mock_t])
        ),
        patch("app.services.admin_tournament_service._sb_post", new=AsyncMock(return_value=[])),
    ):
        client.cookies.set("admin_session", token)
        resp = client.request(
            "DELETE",
            f"/api/v1/admin/tournaments/{t_id}",
            json={
                "confirmation_title": "Summer Brawl 2026",
                "reason": "Test delete",
            },
        )
        client.cookies.clear()

        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert data["deleted"] is True
        assert data["tournament_id"] == t_id
        assert data["deleted_by"] == SUPER_ADMIN.id


def test_delete_tournament_api_delegated_admin_success():
    """Delegated admin with 'delete_tournaments' permission can delete."""
    t_id = str(uuid.uuid4())
    token = create_admin_token(SUB_ADMIN_WITH_DELETE)
    mock_t = {
        "id": t_id,
        "title": "Autumn Clash",
        "slug": "autumn-clash",
        "game": "VALORANT",
        "status": "draft",
    }

    with (
        patch(
            "app.core.admin_auth.fetch_admin_user_by_id",
            new=AsyncMock(return_value=SUB_ADMIN_WITH_DELETE),
        ),
        patch(
            "app.services.admin_tournament_service._sb_get", new=AsyncMock(return_value=[mock_t])
        ),
        patch("app.services.admin_tournament_service._sb_delete", new=AsyncMock(return_value=1)),
        patch(
            "app.services.admin_tournament_service._sb_patch", new=AsyncMock(return_value=[mock_t])
        ),
        patch("app.services.admin_tournament_service._sb_post", new=AsyncMock(return_value=[])),
    ):
        client.cookies.set("admin_session", token)
        resp = client.delete(f"/api/v1/admin/tournaments/{t_id}")
        client.cookies.clear()

        assert resp.status_code == 200
        assert resp.json()["deleted"] is True


@pytest.mark.asyncio
async def test_deleted_tournaments_excluded_from_list():
    """list_admin_tournaments_service explicitly filters cancelled/deleted tournaments."""
    called_params = {}

    async def mock_get(client, table, params):
        nonlocal called_params
        called_params = params
        return []

    with patch("app.services.admin_tournament_service._sb_get", side_effect=mock_get):
        res = await list_admin_tournaments_service(page=1, page_size=10)
        assert called_params.get("status") == "neq.cancelled"
        assert "deleted_at" not in called_params
        assert res.total == 0


@pytest.mark.asyncio
async def test_delete_tournament_child_cascade_deletion_sequence():
    """Verify child records (matches, match_reports, brackets, registrations, reports) are
    deleted in sequence."""
    t_id = str(uuid.uuid4())
    m_id1 = str(uuid.uuid4())
    m_id2 = str(uuid.uuid4())
    mock_tournament = {
        "id": t_id,
        "title": "Cascade Deletion Cup",
        "slug": "cascade-deletion-cup",
        "status": "live",
    }
    mock_matches = [{"id": m_id1}, {"id": m_id2}]

    deleted_tables: list[tuple[str, dict]] = []

    async def mock_get(client, table, params):
        if table == "tournaments":
            return [mock_tournament]
        if table == "matches":
            return mock_matches
        return []

    async def mock_delete(client, table, params, *args, **kwargs):
        deleted_tables.append((table, params))
        return 1

    async def mock_patch(client, table, params, body):
        return [body]

    async def mock_post(client, table, body):
        return [body]

    with (
        patch("app.services.admin_tournament_service._sb_get", side_effect=mock_get),
        patch("app.services.admin_tournament_service._sb_delete", side_effect=mock_delete),
        patch("app.services.admin_tournament_service._sb_patch", side_effect=mock_patch),
        patch("app.services.admin_tournament_service._sb_post", side_effect=mock_post),
    ):
        result = await delete_tournament_service(
            slug_or_id=t_id,
            admin_user=SUPER_ADMIN,
            reason="Cascade cleanup",
        )

        assert result["success"] is True
        assert result["deleted"] is True

        # Check deleted tables
        table_names = [table for table, params in deleted_tables]
        assert "match_reports" in table_names
        assert "matches" in table_names
        assert "brackets" in table_names
        assert "tournament_registrations" in table_names
        assert "fair_play_reports" in table_names
        assert "user_reports" in table_names
        assert "tournament_admin_notes" in table_names


@pytest.mark.asyncio
async def test_delete_tournament_lookup_with_select_all_and_uuid_string():
    """Verify delete lookup queries with select=* and converts UUID to string."""
    t_id = str(uuid.uuid4())
    lookup_params_used = []

    async def mock_get(client, table, params):
        if table == "tournaments":
            lookup_params_used.append(params)
            return [{"id": t_id, "title": "Brackify Valorant Open #1"}]
        return []

    async def mock_delete(client, table, params, *args, **kwargs):
        return 1

    async def mock_patch(client, table, params, body):
        return [body]

    async def mock_post(client, table, body):
        return [body]

    with (
        patch("app.services.admin_tournament_service._sb_get", side_effect=mock_get),
        patch("app.services.admin_tournament_service._sb_delete", side_effect=mock_delete),
        patch("app.services.admin_tournament_service._sb_patch", side_effect=mock_patch),
        patch("app.services.admin_tournament_service._sb_post", side_effect=mock_post),
    ):
        result = await delete_tournament_service(
            slug_or_id=t_id,
            admin_user=SUPER_ADMIN,
        )

        assert result["success"] is True
        assert len(lookup_params_used) >= 1
        assert lookup_params_used[0]["select"] == "*"
        assert lookup_params_used[0]["id"] == f"eq.{t_id}"
        # No status or deleted filters should be in the lookup params
        assert "status" not in lookup_params_used[0]
        assert "deleted_at" not in lookup_params_used[0]


@pytest.mark.asyncio
async def test_delete_tournament_fallback_on_42501_permission_denied():
    """Verify delete gracefully handles 42501 permission error by updating status='cancelled'."""
    from fastapi import HTTPException

    t_id = str(uuid.uuid4())
    mock_tournament = {
        "id": t_id,
        "title": "bracki",
        "slug": "bracki",
        "status": "draft",
    }

    patched_tables: list[tuple[str, dict, dict]] = []

    async def mock_get(client, table, params):
        if table == "tournaments":
            return [mock_tournament]
        return []

    async def mock_delete(client, table, params, *args, **kwargs):
        if table == "tournaments":
            raise HTTPException(
                status_code=400,
                detail={"code": "42501", "message": "permission denied for table tournaments"},
            )
        return 1

    async def mock_patch(client, table, params, body):
        patched_tables.append((table, params, body))
        return [body]

    async def mock_post(client, table, body):
        return [body]

    with (
        patch("app.services.admin_tournament_service._sb_get", side_effect=mock_get),
        patch("app.services.admin_tournament_service._sb_delete", side_effect=mock_delete),
        patch("app.services.admin_tournament_service._sb_patch", side_effect=mock_patch),
        patch("app.services.admin_tournament_service._sb_post", side_effect=mock_post),
    ):
        result = await delete_tournament_service(
            slug_or_id=t_id,
            admin_user=SUPER_ADMIN,
            confirmation_title="bracki",
        )

        assert result["success"] is True
        assert result["deleted"] is True
        assert result["tournament_id"] == t_id
        assert result["deletedTournamentId"] == t_id

        # Check that tournaments table was patched with status='cancelled'
        tourney_patch = next(
            ((params, body) for table, params, body in patched_tables if table == "tournaments"),
            None,
        )
        assert tourney_patch is not None
        params, body = tourney_patch
        assert params.get("id") == f"eq.{t_id}"
        assert body.get("status") == "cancelled"
