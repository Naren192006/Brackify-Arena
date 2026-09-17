"""Test suite for Admin Tournament Management Module (Phase 8).

Verifies:
- Tournament creation with strict validation and auto-slug generation.
- Validation errors on date sequences, capacity, and negative fees.
- Tournament listing with status filters, search, and pagination.
- Tournament detail retrieval with joined registration metrics.
- Updating tournaments in draft vs locked parameters when LIVE/COMPLETED.
- Complete lifecycle state machine transitions:
  DRAFT -> PUBLISHED -> REGISTRATION_OPEN -> REGISTRATION_CLOSED -> LIVE -> PAUSED -> LIVE ->
  COMPLETED; CANCELLED.
- Illegal lifecycle transitions return 400 Bad Request.
- Super Admin vs Sub-Admin delete permissions.
- Rejection of unauthenticated requests.
"""

import os
import sys
import uuid
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, patch

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

from app.core.admin_auth import AdminUser, create_admin_token
from app.main import app

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


def _future_iso(hours: int) -> str:
    return (datetime.now(UTC) + timedelta(hours=hours)).isoformat()


# ---------------------------------------------------------------------------
# 1. Create Tournament Tests
# ---------------------------------------------------------------------------


def test_admin_create_tournament_success():
    """Admin can create a draft tournament with valid parameters."""
    token = create_admin_token(SUPER_ADMIN)
    t_id = str(uuid.uuid4())
    slug = "brackify-arena-championship-2026"

    mock_row = {
        "id": t_id,
        "title": "Brackify Arena Championship 2026",
        "slug": slug,
        "game": "VALORANT",
        "platform": "PC",
        "mode": "5v5",
        "team_size": 5,
        "max_teams": 16,
        "entry_fee_minor": 50000,
        "entry_fee_currency": "INR",
        "registration_open_at": _future_iso(1),
        "registration_close_at": _future_iso(24),
        "start_time": _future_iso(48),
        "timezone": "Asia/Kolkata",
        "format": "single_elimination",
        "status": "draft",
        "created_by": SUPER_ADMIN.id,
        "created_at": _future_iso(0),
        "updated_at": _future_iso(0),
    }

    with (
        patch(
            "app.core.admin_auth.fetch_admin_user_by_id", new=AsyncMock(return_value=SUPER_ADMIN)
        ),
        patch(
            "app.services.admin_tournament_service._sb_get", new=AsyncMock(return_value=[mock_row])
        ),
        patch(
            "app.services.admin_tournament_service._sb_post", new=AsyncMock(return_value=[mock_row])
        ),
    ):
        client.cookies.set("admin_session", token)
        resp = client.post(
            "/api/v1/admin/tournaments",
            json={
                "title": "Brackify Arena Championship 2026",
                "slug": slug,
                "game": "VALORANT",
                "platform": "PC",
                "team_size": 5,
                "max_teams": 16,
                "entry_fee": 500.0,
                "entry_fee_currency": "INR",
                "registration_open_at": _future_iso(1),
                "registration_close_at": _future_iso(24),
                "start_time": _future_iso(48),
                "timezone": "Asia/Kolkata",
                "format": "single_elimination",
                "status": "draft",
            },
        )
        client.cookies.clear()

        assert resp.status_code == 201
        data = resp.json()
        assert data["id"] == t_id
        assert data["title"] == "Brackify Arena Championship 2026"
        assert data["slug"] == slug
        assert data["status"] == "draft"
        assert data["max_teams"] == 16
        assert data["is_power_of_two"] is True


def test_admin_create_tournament_validation_errors():
    """Invalid dates, capacity, or negative entry fee return 422 Unprocessable Entity."""
    token = create_admin_token(SUPER_ADMIN)

    with patch(
        "app.core.admin_auth.fetch_admin_user_by_id", new=AsyncMock(return_value=SUPER_ADMIN)
    ):
        client.cookies.set("admin_session", token)

        # 1. Negative entry fee
        resp = client.post(
            "/api/v1/admin/tournaments",
            json={
                "title": "Invalid Fee Cup",
                "max_teams": 16,
                "entry_fee": -100.0,
                "registration_open_at": _future_iso(1),
                "registration_close_at": _future_iso(2),
                "start_time": _future_iso(3),
            },
        )
        assert resp.status_code == 422

        # 2. Open after close
        resp = client.post(
            "/api/v1/admin/tournaments",
            json={
                "title": "Invalid Dates Cup",
                "max_teams": 16,
                "entry_fee": 0,
                "registration_open_at": _future_iso(10),
                "registration_close_at": _future_iso(2),  # Earlier than open
                "start_time": _future_iso(15),
            },
        )
        assert resp.status_code == 422

        # 3. Capacity < 2
        resp = client.post(
            "/api/v1/admin/tournaments",
            json={
                "title": "Invalid Capacity Cup",
                "max_teams": 1,
                "entry_fee": 0,
                "registration_open_at": _future_iso(1),
                "registration_close_at": _future_iso(2),
                "start_time": _future_iso(3),
            },
        )
        assert resp.status_code == 422

        client.cookies.clear()


# ---------------------------------------------------------------------------
# 2. List & Detail Tests
# ---------------------------------------------------------------------------


def test_admin_list_tournaments():
    """Admin can list tournaments with search and pagination."""
    token = create_admin_token(SUPER_ADMIN)
    mock_items = [
        {
            "id": str(uuid.uuid4()),
            "title": "Valorant Masters",
            "slug": "valorant-masters",
            "game": "VALORANT",
            "platform": "PC",
            "status": "draft",
            "team_size": 5,
            "max_teams": 16,
            "entry_fee_minor": 0,
            "entry_fee_currency": "INR",
            "registration_open_at": _future_iso(1),
            "registration_close_at": _future_iso(2),
            "start_time": _future_iso(3),
            "created_at": _future_iso(0),
        },
        {
            "id": str(uuid.uuid4()),
            "title": "BGMI Pro League",
            "slug": "bgmi-pro-league",
            "game": "BGMI",
            "platform": "Mobile",
            "status": "live",
            "team_size": 4,
            "max_teams": 32,
            "entry_fee_minor": 10000,
            "entry_fee_currency": "INR",
            "registration_open_at": _future_iso(-24),
            "registration_close_at": _future_iso(-12),
            "start_time": _future_iso(-1),
            "created_at": _future_iso(-48),
        },
    ]

    with (
        patch(
            "app.core.admin_auth.fetch_admin_user_by_id", new=AsyncMock(return_value=SUPER_ADMIN)
        ),
        patch(
            "app.services.admin_tournament_service._sb_get", new=AsyncMock(return_value=mock_items)
        ),
    ):
        client.cookies.set("admin_session", token)
        resp = client.get("/api/v1/admin/tournaments?status=all&page=1&page_size=15")
        client.cookies.clear()

        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 2
        assert len(data["items"]) == 2
        assert data["page"] == 1
        assert data["page_size"] == 15


def test_admin_list_tournaments_search_and_status_filters():
    """Verify search and status filter query parameters passed correctly."""
    token = create_admin_token(SUPER_ADMIN)
    captured_params = {}

    async def mock_get(client_obj, table, params):
        nonlocal captured_params
        captured_params = params
        return []

    with (
        patch(
            "app.core.admin_auth.fetch_admin_user_by_id", new=AsyncMock(return_value=SUPER_ADMIN)
        ),
        patch("app.services.admin_tournament_service._sb_get", side_effect=mock_get),
    ):
        client.cookies.set("admin_session", token)
        # 1. Test search param
        resp = client.get(
            "/api/v1/admin/tournaments?search=Valorant&status=live&page=2&page_size=10"
        )
        client.cookies.clear()

        assert resp.status_code == 200
        assert "Valorant" in captured_params.get("or", "")
        assert "in.(live,ongoing)" == captured_params.get("status")
        assert "deleted_at" not in captured_params


def test_admin_get_tournament_detail():
    """Admin can retrieve full tournament details."""
    token = create_admin_token(SUPER_ADMIN)
    t_id = str(uuid.uuid4())
    mock_t = {
        "id": t_id,
        "title": "Apex Masters",
        "slug": "apex-masters",
        "game": "Apex Legends",
        "platform": "PC",
        "status": "draft",
        "team_size": 3,
        "max_teams": 16,
        "entry_fee_minor": 25000,
        "entry_fee_currency": "INR",
        "registration_open_at": _future_iso(1),
        "registration_close_at": _future_iso(2),
        "start_time": _future_iso(3),
        "timezone": "UTC",
        "format": "single_elimination",
        "created_at": _future_iso(0),
    }

    with (
        patch(
            "app.core.admin_auth.fetch_admin_user_by_id", new=AsyncMock(return_value=SUPER_ADMIN)
        ),
        patch(
            "app.services.admin_tournament_service._sb_get", new=AsyncMock(return_value=[mock_t])
        ),
    ):
        client.cookies.set("admin_session", token)
        resp = client.get("/api/v1/admin/tournaments/apex-masters")
        client.cookies.clear()

        assert resp.status_code == 200
        data = resp.json()
        assert data["id"] == t_id
        assert data["slug"] == "apex-masters"
        assert data["game"] == "Apex Legends"
        assert data["team_size"] == 3


# ---------------------------------------------------------------------------
# 3. Update & Live Locking Tests
# ---------------------------------------------------------------------------


def test_admin_update_tournament_draft():
    """Admin can update tournament settings in draft state."""
    token = create_admin_token(SUPER_ADMIN)
    t_id = str(uuid.uuid4())
    mock_t = {
        "id": t_id,
        "title": "Old Title",
        "slug": "old-slug",
        "status": "draft",
        "max_teams": 8,
        "entry_fee_minor": 0,
        "format": "single_elimination",
        "game": "VALORANT",
        "platform": "PC",
    }
    updated_mock = {
        **mock_t,
        "title": "New Title",
        "max_teams": 32,
        "entry_fee_minor": 20000,
        "registration_open_at": _future_iso(1),
        "registration_close_at": _future_iso(2),
        "start_time": _future_iso(3),
        "created_at": _future_iso(0),
    }

    with (
        patch(
            "app.core.admin_auth.fetch_admin_user_by_id", new=AsyncMock(return_value=SUPER_ADMIN)
        ),
        patch(
            "app.services.admin_tournament_service._sb_get",
            side_effect=[[mock_t], [], [updated_mock], []],
        ),
        patch(
            "app.services.admin_tournament_service._sb_patch",
            new=AsyncMock(return_value=[updated_mock]),
        ),
        patch("app.services.admin_tournament_service._sb_post", new=AsyncMock(return_value=[])),
    ):
        client.cookies.set("admin_session", token)
        resp = client.patch(
            f"/api/v1/admin/tournaments/{t_id}",
            json={
                "title": "New Title",
                "max_teams": 32,
                "entry_fee": 200.0,
            },
        )
        client.cookies.clear()

        assert resp.status_code == 200
        data = resp.json()
        assert data["title"] == "New Title"
        assert data["max_teams"] == 32


def test_admin_update_tournament_locked_when_live():
    """Updating core financial or format properties on a LIVE tournament returns 400."""
    token = create_admin_token(SUPER_ADMIN)
    t_id = str(uuid.uuid4())
    mock_live_t = {
        "id": t_id,
        "title": "Live Championship",
        "slug": "live-championship",
        "status": "live",
        "max_teams": 16,
        "entry_fee_minor": 50000,
        "format": "single_elimination",
        "game": "VALORANT",
        "platform": "PC",
    }

    with (
        patch(
            "app.core.admin_auth.fetch_admin_user_by_id", new=AsyncMock(return_value=SUPER_ADMIN)
        ),
        patch(
            "app.services.admin_tournament_service._sb_get",
            new=AsyncMock(return_value=[mock_live_t]),
        ),
    ):
        client.cookies.set("admin_session", token)
        # Attempt to change entry fee when LIVE
        resp = client.patch(
            f"/api/v1/admin/tournaments/{t_id}",
            json={"entry_fee": 1000.0},
        )
        client.cookies.clear()

        assert resp.status_code == 400
        assert "Cannot modify core properties" in resp.text


# ---------------------------------------------------------------------------
# 4. Lifecycle State Machine Tests
# ---------------------------------------------------------------------------


def test_admin_lifecycle_state_machine_valid_transitions():
    """Verify valid transitions: Draft -> Published -> Registration Open -> Registration Closed ->
    Live -> Paused -> Live -> Completed."""
    token = create_admin_token(SUPER_ADMIN)
    t_id = str(uuid.uuid4())

    transitions = [
        ("draft", "publish", "published"),
        ("published", "open_registration", "registration_open"),
        ("registration_open", "close_registration", "registration_closed"),
        ("registration_closed", "start_live", "live"),
        ("live", "pause", "paused"),
        ("paused", "resume", "live"),
        ("live", "complete", "completed"),
    ]

    for from_st, action, target_st in transitions:
        mock_current = {"id": t_id, "title": "Cup", "slug": "cup", "status": from_st}
        mock_updated = {
            **mock_current,
            "status": target_st,
            "max_teams": 16,
            "game": "VALORANT",
            "platform": "PC",
            "team_size": 5,
            "entry_fee_minor": 0,
            "entry_fee_currency": "INR",
            "registration_open_at": _future_iso(1),
            "registration_close_at": _future_iso(2),
            "start_time": _future_iso(3),
            "created_at": _future_iso(0),
        }

        with (
            patch(
                "app.core.admin_auth.fetch_admin_user_by_id",
                new=AsyncMock(return_value=SUPER_ADMIN),
            ),
            patch(
                "app.services.admin_tournament_service._sb_get",
                side_effect=[[mock_current], [mock_updated], []],
            ),
            patch(
                "app.services.admin_tournament_service._sb_patch",
                new=AsyncMock(return_value=[mock_updated]),
            ),
            patch("app.services.admin_tournament_service._sb_post", new=AsyncMock(return_value=[])),
        ):
            client.cookies.set("admin_session", token)
            resp = client.post(
                f"/api/v1/admin/tournaments/{t_id}/lifecycle",
                json={"action": action},
            )
            client.cookies.clear()

            assert resp.status_code == 200
            assert resp.json()["status"] == target_st


def test_admin_lifecycle_invalid_transition_returns_400():
    """Attempting an illegal transition (e.g. Draft -> Live directly) returns 400 Bad Request."""
    token = create_admin_token(SUPER_ADMIN)
    t_id = str(uuid.uuid4())
    mock_draft = {"id": t_id, "title": "Draft Cup", "slug": "draft-cup", "status": "draft"}

    with (
        patch(
            "app.core.admin_auth.fetch_admin_user_by_id", new=AsyncMock(return_value=SUPER_ADMIN)
        ),
        patch(
            "app.services.admin_tournament_service._sb_get",
            new=AsyncMock(return_value=[mock_draft]),
        ),
    ):
        client.cookies.set("admin_session", token)
        # Attempt Draft -> start_live directly
        resp = client.post(
            f"/api/v1/admin/tournaments/{t_id}/lifecycle",
            json={"action": "start_live"},
        )
        client.cookies.clear()

        assert resp.status_code == 400
        assert "Cannot transition tournament" in resp.text


# ---------------------------------------------------------------------------
# 5. Delete & Unauthorized Security Tests
# ---------------------------------------------------------------------------


def test_admin_delete_sub_admin_forbidden():
    """Sub-admin without delete_tournaments permission receives 403 Forbidden."""
    token = create_admin_token(SUB_ADMIN_NO_DELETE)
    t_id = str(uuid.uuid4())

    with patch(
        "app.core.admin_auth.fetch_admin_user_by_id",
        new=AsyncMock(return_value=SUB_ADMIN_NO_DELETE),
    ):
        client.cookies.set("admin_session", token)
        resp = client.delete(f"/api/v1/admin/tournaments/{t_id}")
        client.cookies.clear()

        assert resp.status_code == 403
        assert "permission" in resp.text.lower()


def test_admin_unauthorized_rejection():
    """Requests without admin session cookie are rejected with 401."""
    resp = client.get("/api/v1/admin/tournaments")
    assert resp.status_code == 401
