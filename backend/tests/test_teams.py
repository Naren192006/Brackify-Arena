"""Tests for /api/v1/teams endpoints including team deletion."""

import os
import sys
from unittest.mock import AsyncMock, patch, MagicMock
import pytest

sys.path.insert(0, ".")

os.environ["DATABASE_URL"] = "sqlite+aiosqlite:///load_tests/benchmark_store.db"
os.environ["REDIS_ENABLED"] = "false"
os.environ["SECRET_KEY"] = "test-secret-key-team-deletion-testing-12345"
os.environ["SUPABASE_URL"] = "https://test.supabase.co"
os.environ["SUPABASE_SERVICE_ROLE_KEY"] = "test-service-role-key-teams"
os.environ["ENVIRONMENT"] = "test"

from app.config import settings
settings.supabase_url = "https://test.supabase.co"
settings.supabase_service_role_key = "test-service-role-key-teams"

from fastapi.testclient import TestClient
from app.main import app
from app.core.auth import AuthUser, get_current_auth_user

client = TestClient(app)

CAPTAIN_USER_ID = "11111111-1111-1111-1111-111111111111"
MEMBER_USER_ID = "22222222-2222-2222-2222-222222222222"
TEAM_ID = "33333333-3333-3333-3333-333333333333"


def override_captain():
    return AuthUser(
        id=CAPTAIN_USER_ID,
        email="captain@test.com",
        role="player",
        is_admin=False,
    )


def override_member():
    return AuthUser(
        id=MEMBER_USER_ID,
        email="member@test.com",
        role="player",
        is_admin=False,
    )


@pytest.mark.asyncio
async def test_delete_team_success_as_captain():
    """Captain can successfully delete their own team."""
    app.dependency_overrides[get_current_auth_user] = override_captain

    mock_team_row = {
        "id": TEAM_ID,
        "name": "Team Liquidators",
        "tag": "LIQ",
        "captain_id": CAPTAIN_USER_ID,
    }

    with patch("httpx.AsyncClient.get") as mock_get, \
         patch("httpx.AsyncClient.delete") as mock_delete:
        
        mock_get_team_resp = MagicMock(status_code=200, json=lambda: [mock_team_row])
        mock_get_reg_resp = MagicMock(status_code=200, json=lambda: [])
        mock_get.side_effect = [mock_get_team_resp, mock_get_reg_resp]

        mock_delete_resp = MagicMock(status_code=200, json=lambda: [mock_team_row])
        mock_delete.return_value = mock_delete_resp

        resp = client.delete(f"/api/v1/teams/{TEAM_ID}")
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert "Team deleted successfully" in data["message"]

    app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_delete_team_forbidden_for_non_captain():
    """Non-captain cannot delete team and receives 403 Forbidden."""
    app.dependency_overrides[get_current_auth_user] = override_member

    mock_team_row = {
        "id": TEAM_ID,
        "name": "Team Liquidators",
        "tag": "LIQ",
        "captain_id": CAPTAIN_USER_ID,  # Different from member
    }

    with patch("httpx.AsyncClient.get") as mock_get:
        mock_get_team_resp = MagicMock(status_code=200, json=lambda: [mock_team_row])
        mock_get.return_value = mock_get_team_resp

        resp = client.delete(f"/api/v1/teams/{TEAM_ID}")
        assert resp.status_code == 403
        data = resp.json()
        assert data["detail"]["code"] == "forbidden"
        assert "Only the team captain can delete this team" in data["detail"]["message"]

    app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_delete_team_blocked_when_in_active_tournament():
    """Team registered in an active tournament cannot be deleted (400)."""
    app.dependency_overrides[get_current_auth_user] = override_captain

    mock_team_row = {
        "id": TEAM_ID,
        "name": "Team Liquidators",
        "tag": "LIQ",
        "captain_id": CAPTAIN_USER_ID,
    }

    mock_reg_row = {
        "id": "reg-1",
        "tournament_id": "tourn-1",
    }

    mock_tourn_row = {
        "id": "tourn-1",
        "status": "ongoing",
        "title": "Brackify Championship",
    }

    with patch("httpx.AsyncClient.get") as mock_get:
        mock_get_team_resp = MagicMock(status_code=200, json=lambda: [mock_team_row])
        mock_get_reg_resp = MagicMock(status_code=200, json=lambda: [mock_reg_row])
        mock_get_tourn_resp = MagicMock(status_code=200, json=lambda: [mock_tourn_row])
        mock_get.side_effect = [mock_get_team_resp, mock_get_reg_resp, mock_get_tourn_resp]

        resp = client.delete(f"/api/v1/teams/{TEAM_ID}")
        assert resp.status_code == 400
        data = resp.json()
        assert data["detail"]["code"] == "team_in_active_tournament"
        assert "Cannot delete a team that is registered in an active tournament" in data["detail"]["message"]

    app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_delete_team_not_found():
    """Deleting a non-existent team returns 404."""
    app.dependency_overrides[get_current_auth_user] = override_captain

    with patch("httpx.AsyncClient.get") as mock_get:
        mock_get_team_resp = MagicMock(status_code=200, json=lambda: [])
        mock_get.return_value = mock_get_team_resp

        resp = client.delete(f"/api/v1/teams/{TEAM_ID}")
        assert resp.status_code == 404
        data = resp.json()
        assert data["detail"]["code"] == "team_not_found"

    app.dependency_overrides.clear()

