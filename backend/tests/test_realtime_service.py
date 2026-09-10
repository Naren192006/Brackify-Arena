"""Test suite for Brackify Arena — Realtime Backend Event Engine (Phase 10.1).

Verifies:
- Standardized payload generator for all 8 supported event types.
- Deduplication & idempotency window.
- Supabase Realtime broadcast dispatcher with auth headers and topic channel.
- 1-time retry on network / 5xx failures.
- Non-blocking graceful degradation when Supabase is unconfigured or unreachable.
- Broadcast trigger integration with match_service, match_report_service, tournament_service, and admin_tournament_service.
"""

import os
import sys
import uuid
import time
from unittest.mock import AsyncMock, patch, MagicMock
import pytest
import httpx

sys.path.insert(0, ".")

os.environ["DATABASE_URL"] = "sqlite+aiosqlite:///load_tests/benchmark_store.db"
os.environ["REDIS_ENABLED"] = "false"
os.environ["SECRET_KEY"] = "test-secret-key-realtime-engine-testing-12345"
os.environ["ADMIN_JWT_SECRET"] = "test-dedicated-admin-jwt-secret-testing-2026"
os.environ["SUPABASE_JWT_SECRET"] = "test-supabase-jwt-secret-testing-realtime-32bytes"
os.environ["SUPABASE_URL"] = "https://test.supabase.co"
os.environ["SUPABASE_SERVICE_ROLE_KEY"] = "test-service-role-key-realtime"
os.environ["ENVIRONMENT"] = "test"

from app.config import settings
from app.services.realtime_service import (
    SUPPORTED_REALTIME_EVENTS,
    generate_realtime_payload,
    broadcast_tournament_event,
    broadcast_match_event,
    _clear_dedup_cache,
    _get_event_dedup_key,
    _is_duplicate_broadcast,
)


@pytest.fixture(autouse=True)
def clean_realtime_dedup():
    """Clear in-memory deduplication cache before each test."""
    _clear_dedup_cache()
    yield
    _clear_dedup_cache()


# ---------------------------------------------------------------------------
# 1. Payload Generator Tests
# ---------------------------------------------------------------------------

def test_supported_realtime_events_list():
    """Verify all 8 required event types are supported."""
    expected_events = {
        "match_created",
        "match_started",
        "score_submitted",
        "score_verified",
        "match_completed",
        "bracket_updated",
        "tournament_status_updated",
        "registration_updated",
    }
    assert expected_events.issubset(SUPPORTED_REALTIME_EVENTS)


def test_generate_realtime_payload_all_fields():
    """Verify full payload structure with all parameters populated."""
    t_id = str(uuid.uuid4())
    m_id = str(uuid.uuid4())
    team_a = {"id": "team-1", "name": "Alpha", "score": 2}
    team_b = {"id": "team-2", "name": "Beta", "score": 1}
    winner = {"id": "team-1", "name": "Alpha"}
    extra_data = {"round_type": "quarter_finals", "stream_url": "https://twitch.tv/test"}

    payload = generate_realtime_payload(
        tournament_id=t_id,
        event="score_verified",
        match_id=m_id,
        round=2,
        team_a=team_a,
        team_b=team_b,
        score="2 - 1",
        winner=winner,
        status="completed",
        updated_at="2026-09-07T14:00:00Z",
        extra=extra_data,
    )

    assert payload["tournament_id"] == t_id
    assert payload["match_id"] == m_id
    assert payload["event"] == "score_verified"
    assert payload["round"] == 2
    assert payload["team_a"] == team_a
    assert payload["team_b"] == team_b
    assert payload["score"] == "2 - 1"
    assert payload["winner"] == winner
    assert payload["status"] == "completed"
    assert payload["updated_at"] == "2026-09-07T14:00:00Z"
    assert payload["extra"] == extra_data


def test_generate_realtime_payload_defaults():
    """Verify default values when minimal parameters are provided."""
    t_id = str(uuid.uuid4())
    payload = generate_realtime_payload(tournament_id=t_id, event="tournament_status_updated", status="live")

    assert payload["tournament_id"] == t_id
    assert payload["match_id"] is None
    assert payload["event"] == "tournament_status_updated"
    assert payload["round"] is None
    assert payload["team_a"] is None
    assert payload["team_b"] is None
    assert payload["score"] is None
    assert payload["winner"] is None
    assert payload["status"] == "live"
    assert "updated_at" in payload
    assert isinstance(payload["updated_at"], str)
    assert "extra" not in payload


# ---------------------------------------------------------------------------
# 2. Deduplication & Idempotency Tests
# ---------------------------------------------------------------------------

def test_deduplication_detection():
    """Verify identical events within deduplication window are caught."""
    t_id = str(uuid.uuid4())
    m_id = str(uuid.uuid4())

    key1 = _get_event_dedup_key(t_id, "score_submitted", m_id, "awaiting_approval", "2 - 1")
    assert _is_duplicate_broadcast(key1) is False  # 1st call records it
    assert _is_duplicate_broadcast(key1) is True   # 2nd call flags it as duplicate

    # Different event with same tournament and match should NOT be duplicate
    key2 = _get_event_dedup_key(t_id, "score_verified", m_id, "completed", "2 - 1")
    assert _is_duplicate_broadcast(key2) is False


@pytest.mark.asyncio
async def test_broadcast_deduplication_skips_network():
    """broadcast_tournament_event should return True and skip network request on duplicates."""
    t_id = str(uuid.uuid4())
    m_id = str(uuid.uuid4())
    payload = generate_realtime_payload(tournament_id=t_id, event="match_started", match_id=m_id, status="live")

    mock_client = AsyncMock(spec=httpx.AsyncClient)
    mock_resp = MagicMock(status_code=200)
    mock_client.post.return_value = mock_resp

    # First call dispatches HTTP
    res1 = await broadcast_tournament_event(t_id, "match_started", payload, client=mock_client)
    assert res1 is True
    assert mock_client.post.call_count == 1

    # Second identical call within dedup window returns True immediately without extra HTTP call
    res2 = await broadcast_tournament_event(t_id, "match_started", payload, client=mock_client)
    assert res2 is True
    assert mock_client.post.call_count == 1


# ---------------------------------------------------------------------------
# 3. HTTP Broadcast Dispatcher & Retry Tests
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_broadcast_success_payload_format():
    """Verify headers, endpoint, and json structure sent to Supabase Realtime."""
    t_id = str(uuid.uuid4())
    payload = generate_realtime_payload(tournament_id=t_id, event="bracket_updated", round=3, status="live")

    mock_client = AsyncMock(spec=httpx.AsyncClient)
    mock_resp = MagicMock(status_code=200)
    mock_client.post.return_value = mock_resp

    res = await broadcast_tournament_event(t_id, "bracket_updated", payload, client=mock_client)
    assert res is True

    mock_client.post.assert_called_once()
    called_url, called_kwargs = mock_client.post.call_args
    expected_url = f"{settings.supabase_url.rstrip('/')}/realtime/v1/api/broadcast"
    assert called_url[0] == expected_url
    assert called_kwargs["headers"]["apikey"] == settings.supabase_service_role_key
    assert called_kwargs["headers"]["Authorization"] == f"Bearer {settings.supabase_service_role_key}"
    
    body = called_kwargs["json"]
    assert "messages" in body
    assert len(body["messages"]) == 1
    msg = body["messages"][0]
    assert msg["topic"] == f"tournament:{t_id}"
    assert msg["event"] == "bracket_updated"
    assert msg["payload"] == payload


@pytest.mark.asyncio
async def test_broadcast_retry_on_server_error_and_succeeds():
    """Verify 1-time retry on 500 error when second attempt returns 200."""
    t_id = str(uuid.uuid4())
    payload = generate_realtime_payload(tournament_id=t_id, event="tournament_status_updated", status="live")

    mock_client = AsyncMock(spec=httpx.AsyncClient)
    resp_500 = MagicMock(status_code=500, text="Internal Server Error")
    resp_200 = MagicMock(status_code=200, text="OK")
    mock_client.post.side_effect = [resp_500, resp_200]

    res = await broadcast_tournament_event(t_id, "tournament_status_updated", payload, max_retries=1, client=mock_client)
    assert res is True
    assert mock_client.post.call_count == 2


@pytest.mark.asyncio
async def test_broadcast_handles_all_retries_exhausted_gracefully():
    """Verify returns False when all retry attempts fail with 500 without raising exceptions."""
    t_id = str(uuid.uuid4())
    payload = generate_realtime_payload(tournament_id=t_id, event="tournament_status_updated", status="live")

    mock_client = AsyncMock(spec=httpx.AsyncClient)
    resp_500 = MagicMock(status_code=500, text="Internal Server Error")
    mock_client.post.return_value = resp_500

    res = await broadcast_tournament_event(t_id, "tournament_status_updated", payload, max_retries=1, client=mock_client)
    assert res is False
    assert mock_client.post.call_count == 2


@pytest.mark.asyncio
async def test_broadcast_handles_network_exception_gracefully():
    """Verify network exceptions are caught and do not raise exceptions."""
    t_id = str(uuid.uuid4())
    payload = generate_realtime_payload(tournament_id=t_id, event="tournament_status_updated", status="live")

    mock_client = AsyncMock(spec=httpx.AsyncClient)
    mock_client.post.side_effect = httpx.ConnectError("Connection refused")

    res = await broadcast_tournament_event(t_id, "tournament_status_updated", payload, max_retries=1, client=mock_client)
    assert res is False
    assert mock_client.post.call_count == 2


@pytest.mark.asyncio
async def test_broadcast_skips_when_supabase_unconfigured():
    """Verify skips network dispatch if Supabase URL is empty."""
    t_id = str(uuid.uuid4())
    payload = generate_realtime_payload(tournament_id=t_id, event="tournament_status_updated", status="live")

    with patch.object(settings, "supabase_url", ""):
        res = await broadcast_tournament_event(t_id, "tournament_status_updated", payload)
        assert res is False


@pytest.mark.asyncio
async def test_broadcast_match_event_helper():
    """Verify broadcast_match_event convenience helper formats payload and broadcasts."""
    t_id = str(uuid.uuid4())
    m_id = str(uuid.uuid4())

    mock_client = AsyncMock(spec=httpx.AsyncClient)
    mock_resp = MagicMock(status_code=200)
    mock_client.post.return_value = mock_resp

    res = await broadcast_match_event(
        tournament_id=t_id,
        event="match_started",
        match_id=m_id,
        round_number=1,
        status="live",
        client=mock_client,
    )

    assert res is True
    assert mock_client.post.call_count == 1
    body = mock_client.post.call_args[1]["json"]
    assert body["messages"][0]["event"] == "match_started"
    assert body["messages"][0]["payload"]["match_id"] == m_id
    assert body["messages"][0]["payload"]["status"] == "live"


# ---------------------------------------------------------------------------
# 4. Service Integration Verification
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_match_start_triggers_realtime_broadcast():
    """Verify start_match_service triggers broadcast_match_event with event='match_started'."""
    from app.services.match_service import start_match_service

    match_id = str(uuid.uuid4())
    t_id = str(uuid.uuid4())

    fake_match = [{"id": match_id, "tournament_id": t_id, "status": "scheduled"}]

    with patch("app.services.match_service._sb_get", new_callable=AsyncMock) as mock_get, \
         patch("app.services.match_service._sb_patch", new_callable=AsyncMock) as mock_patch, \
         patch("app.services.tournament_service.verify_admin_or_creator_auth", new_callable=AsyncMock) as mock_auth, \
         patch("app.services.realtime_service.broadcast_tournament_event", new_callable=AsyncMock) as mock_broadcast:

        mock_get.return_value = fake_match
        mock_broadcast.return_value = True

        result = await start_match_service(match_id=match_id, user_id=str(uuid.uuid4()))

        assert result["success"] is True
        assert result["status"] == "live"
        mock_broadcast.assert_called_once()
        c_args, c_kwargs = mock_broadcast.call_args
        b_tid = c_kwargs.get("tournament_id") or (c_args[0] if len(c_args) > 0 else None)
        b_event = c_kwargs.get("event") or (c_args[1] if len(c_args) > 1 else None)
        b_payload = c_kwargs.get("payload") or (c_args[2] if len(c_args) > 2 else None)
        assert b_tid == t_id
        assert b_event == "match_started"
        assert b_payload["match_id"] == match_id
        assert b_payload["status"] == "live"


@pytest.mark.asyncio
async def test_match_report_submission_triggers_score_submitted():
    """Verify submit_match_report triggers broadcast_match_event with event='score_submitted'."""
    from app.services.match_report_service import submit_match_report

    match_id = str(uuid.uuid4())
    t_id = str(uuid.uuid4())
    team_a_id = str(uuid.uuid4())
    team_b_id = str(uuid.uuid4())
    user_id = str(uuid.uuid4())

    fake_match = [{
        "id": match_id,
        "tournament_id": t_id,
        "status": "live",
        "team_a_id": team_a_id,
        "team_b_id": team_b_id,
        "round_id": str(uuid.uuid4()),
    }]

    fake_captains = [{"id": team_a_id}]
    fake_report = {"id": str(uuid.uuid4()), "match_id": match_id, "team1_score": 13, "team2_score": 9}

    async def fake_get(client, table, params):
        if table == "matches":
            return fake_match
        if table == "teams":
            return fake_captains
        return []

    with patch("app.services.match_report_service._sb_get", side_effect=fake_get), \
         patch("app.services.match_report_service._sb_post", new_callable=AsyncMock, return_value=fake_report), \
         patch("app.services.match_report_service._sb_patch", new_callable=AsyncMock), \
         patch("app.services.realtime_service.broadcast_tournament_event", new_callable=AsyncMock) as mock_broadcast:

        mock_broadcast.return_value = True

        result = await submit_match_report(
            match_id=match_id,
            team1_score=13,
            team2_score=9,
            user_id=user_id,
        )

        assert result["id"] == fake_report["id"]
        mock_broadcast.assert_called_once()
        c_args, c_kwargs = mock_broadcast.call_args
        b_tid = c_kwargs.get("tournament_id") or (c_args[0] if len(c_args) > 0 else None)
        b_event = c_kwargs.get("event") or (c_args[1] if len(c_args) > 1 else None)
        b_payload = c_kwargs.get("payload") or (c_args[2] if len(c_args) > 2 else None)
        assert b_tid == t_id
        assert b_event == "score_submitted"
        assert b_payload["score"] == "13 - 9"
        assert b_payload["status"] == "awaiting_approval"


@pytest.mark.asyncio
async def test_admin_lifecycle_transition_triggers_status_updated():
    """Verify transition_tournament_lifecycle_service triggers realtime event."""
    from app.services.admin_tournament_service import transition_tournament_lifecycle_service
    from app.core.admin_auth import AdminUser

    t_id = str(uuid.uuid4())
    admin = AdminUser(id=str(uuid.uuid4()), email="admin@brackify.test", role="super_admin", permissions=["all"], active=True)

    fake_tournament = [{
        "id": t_id,
        "title": "Championship",
        "slug": "championship-2026",
        "status": "draft",
        "max_teams": 16,
    }]

    fake_detail_row = [{
        "id": t_id,
        "title": "Championship",
        "slug": "championship-2026",
        "game": "VALORANT",
        "platform": "PC",
        "status": "published",
        "team_size": 5,
        "max_teams": 16,
        "entry_fee_minor": 0,
        "entry_fee_currency": "INR",
        "registration_open_at": "2026-09-07T10:00:00Z",
        "registration_close_at": "2026-09-08T10:00:00Z",
        "start_time": "2026-09-09T10:00:00Z",
        "banner_url": None,
        "format": "single_elimination",
        "description": "Test",
        "rules": "Standard",
        "timezone": "UTC",
        "published_at": "2026-09-07T10:00:00Z",
        "paused_at": None,
        "resumed_at": None,
        "cancelled_at": None,
        "completed_at": None,
        "created_by": admin.id,
        "created_at": "2026-09-07T09:00:00Z",
        "updated_at": "2026-09-07T10:00:00Z",
        "deleted_at": None,
    }]

    async def fake_get(client, table, params):
        if table == "tournaments":
            return fake_tournament if len(params) <= 3 else fake_detail_row
        if table == "tournament_registrations":
            return []
        return []

    with patch("app.services.admin_tournament_service._sb_get", side_effect=fake_get), \
         patch("app.services.admin_tournament_service._sb_patch", new_callable=AsyncMock), \
         patch("app.services.admin_tournament_service._sb_post", new_callable=AsyncMock), \
         patch("app.services.realtime_service.broadcast_tournament_event", new_callable=AsyncMock) as mock_broadcast:

        mock_broadcast.return_value = True

        res = await transition_tournament_lifecycle_service(
            slug_or_id=t_id,
            action="publish",
            reason="Admin published tournament",
            current_admin=admin,
        )

        assert res.id == t_id
        mock_broadcast.assert_called_once()
        c_args, c_kwargs = mock_broadcast.call_args
        b_tid = c_kwargs.get("tournament_id") or (c_args[0] if len(c_args) > 0 else None)
        b_event = c_kwargs.get("event") or (c_args[1] if len(c_args) > 1 else None)
        b_payload = c_kwargs.get("payload") or (c_args[2] if len(c_args) > 2 else None)
        assert b_tid == t_id
        assert b_event == "tournament_status_updated"
        assert b_payload["status"] == "published"
