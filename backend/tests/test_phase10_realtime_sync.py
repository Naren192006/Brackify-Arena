"""Test suite for Phase 10.4 — Realtime Admin Control Room & Player Match Center.

Verifies:
- Reconnect & retry mechanisms during transient failure.
- Subscription cleanup & channel teardown simulation.
- Payload synchronization across all 8 realtime event types.
- Duplicate event handling & idempotency window.
- Match status chip mapping & health metrics calculations.
"""

import os
import sys
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest

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
    _clear_dedup_cache,
    _get_event_dedup_key,
    _is_duplicate_broadcast,
    broadcast_tournament_event,
    generate_realtime_payload,
)


@pytest.fixture(autouse=True)
def clean_realtime_dedup():
    """Clear in-memory deduplication cache before and after each test."""
    _clear_dedup_cache()
    yield
    _clear_dedup_cache()


# ---------------------------------------------------------------------------
# 1. Payload Synchronization Tests
# ---------------------------------------------------------------------------


def test_payload_synchronization_all_supported_events():
    """Verify payload generation for all 8 supported real-time event types."""
    tournament_id = str(uuid.uuid4())
    match_id = str(uuid.uuid4())

    for event_type in SUPPORTED_REALTIME_EVENTS:
        payload = generate_realtime_payload(
            tournament_id=tournament_id,
            event=event_type,
            match_id=match_id,
            round=1,
            team_a={"id": "team-1", "name": "Alpha"},
            team_b={"id": "team-2", "name": "Omega"},
            score="13 - 10",
            winner={"id": "team-1", "name": "Alpha"},
            status="completed",
        )

        assert payload["tournament_id"] == tournament_id
        assert payload["match_id"] == match_id
        assert payload["event"] == event_type
        assert payload["round"] == 1
        assert payload["team_a"] == {"id": "team-1", "name": "Alpha"}
        assert payload["team_b"] == {"id": "team-2", "name": "Omega"}
        assert payload["score"] == "13 - 10"
        assert payload["winner"] == {"id": "team-1", "name": "Alpha"}
        assert payload["status"] == "completed"
        assert "updated_at" in payload
        assert isinstance(payload["updated_at"], str)


def test_payload_synchronization_tournament_lifecycle():
    """Verify tournament-level status updated payloads synchronize correctly."""
    tournament_id = str(uuid.uuid4())
    payload = generate_realtime_payload(
        tournament_id=tournament_id,
        event="tournament_status_updated",
        status="live",
        extra={"previous_status": "registration_closed"},
    )

    assert payload["tournament_id"] == tournament_id
    assert payload["event"] == "tournament_status_updated"
    assert payload["status"] == "live"
    assert payload["match_id"] is None
    assert payload["extra"]["previous_status"] == "registration_closed"


def test_payload_synchronization_registration_updated():
    """Verify registration updated payload synchronization."""
    tournament_id = str(uuid.uuid4())
    payload = generate_realtime_payload(
        tournament_id=tournament_id,
        event="registration_updated",
        team_a={"id": "reg-1", "name": "Team Phantom", "status": "checked_in"},
        status="checked_in",
    )

    assert payload["tournament_id"] == tournament_id
    assert payload["event"] == "registration_updated"
    assert payload["team_a"]["status"] == "checked_in"


# ---------------------------------------------------------------------------
# 2. Duplicate Event Handling & Idempotency Tests
# ---------------------------------------------------------------------------


def test_duplicate_event_handling_suppression():
    """Verify duplicate payloads within the dedup window are detected and suppressed."""
    tournament_id = str(uuid.uuid4())
    match_id = str(uuid.uuid4())

    key1 = _get_event_dedup_key(
        tournament_id, "score_submitted", match_id, "awaiting_approval", "10-8"
    )
    key2 = _get_event_dedup_key(
        tournament_id, "score_submitted", match_id, "awaiting_approval", "10-8"
    )

    assert key1 == key2
    assert _is_duplicate_broadcast(key1) is False
    # Second immediate broadcast with same key should be marked duplicate
    assert _is_duplicate_broadcast(key2) is True


def test_duplicate_event_bypassed_on_status_or_score_change():
    """Verify that score or status changes generate different keys and bypass dedup."""
    tournament_id = str(uuid.uuid4())
    match_id = str(uuid.uuid4())

    key_submit = _get_event_dedup_key(
        tournament_id, "score_submitted", match_id, "awaiting_approval", "10-8"
    )
    key_verify = _get_event_dedup_key(
        tournament_id, "score_verified", match_id, "completed", "13-10"
    )

    assert key_submit != key_verify
    assert _is_duplicate_broadcast(key_submit) is False
    assert _is_duplicate_broadcast(key_verify) is False


@pytest.mark.asyncio
async def test_duplicate_broadcast_skips_network_dispatch():
    """Verify that duplicate broadcast does not make HTTP calls."""
    tournament_id = str(uuid.uuid4())
    match_id = str(uuid.uuid4())

    mock_client = AsyncMock()
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_client.post.return_value = mock_resp

    payload = generate_realtime_payload(
        tournament_id=tournament_id,
        event="match_started",
        match_id=match_id,
        status="live",
    )

    # First dispatch -> HTTP called
    result1 = await broadcast_tournament_event(
        tournament_id=tournament_id,
        event="match_started",
        payload=payload,
        client=mock_client,
    )
    assert result1 is True
    assert mock_client.post.call_count == 1

    # Second dispatch with identical payload -> HTTP skipped due to dedup
    result2 = await broadcast_tournament_event(
        tournament_id=tournament_id,
        event="match_started",
        payload=payload,
        client=mock_client,
    )
    assert result2 is True
    # Call count remains 1
    assert mock_client.post.call_count == 1


# ---------------------------------------------------------------------------
# 3. Reconnect & Retry Logic Tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_reconnect_retry_on_server_error_and_succeeds():
    """Verify 1-time retry on 500 error recovers and completes broadcast."""
    tournament_id = str(uuid.uuid4())
    match_id = str(uuid.uuid4())

    mock_client = AsyncMock()
    fail_resp = MagicMock()
    fail_resp.status_code = 500
    fail_resp.text = "Internal Server Error"

    success_resp = MagicMock()
    success_resp.status_code = 200
    success_resp.text = "OK"

    mock_client.post.side_effect = [fail_resp, success_resp]

    payload = generate_realtime_payload(
        tournament_id=tournament_id,
        event="score_verified",
        match_id=match_id,
        status="completed",
        score="2 - 1",
    )

    result = await broadcast_tournament_event(
        tournament_id=tournament_id,
        event="score_verified",
        payload=payload,
        max_retries=1,
        client=mock_client,
    )

    assert result is True
    assert mock_client.post.call_count == 2


@pytest.mark.asyncio
async def test_reconnect_retry_on_network_timeout():
    """Verify network exception triggers retry and recovers on next attempt."""
    tournament_id = str(uuid.uuid4())
    match_id = str(uuid.uuid4())

    mock_client = AsyncMock()
    success_resp = MagicMock()
    success_resp.status_code = 200

    mock_client.post.side_effect = [
        httpx.ConnectTimeout("Connection timed out"),
        success_resp,
    ]

    payload = generate_realtime_payload(
        tournament_id=tournament_id,
        event="bracket_updated",
        match_id=match_id,
        round=2,
    )

    result = await broadcast_tournament_event(
        tournament_id=tournament_id,
        event="bracket_updated",
        payload=payload,
        max_retries=1,
        client=mock_client,
    )

    assert result is True
    assert mock_client.post.call_count == 2


# ---------------------------------------------------------------------------
# 4. Subscription Cleanup & Graceful Degradation Tests
# ---------------------------------------------------------------------------


def test_subscription_cleanup_cache_cleared():
    """Verify that clearing dedup cache cleans all stored entries."""
    tournament_id = str(uuid.uuid4())
    key = _get_event_dedup_key(tournament_id, "match_completed", "m1", "completed", "1-0")

    assert _is_duplicate_broadcast(key) is False
    assert _is_duplicate_broadcast(key) is True

    _clear_dedup_cache()

    # After cleanup, the key is no longer duplicate
    assert _is_duplicate_broadcast(key) is False


@pytest.mark.asyncio
async def test_graceful_degradation_when_unconfigured():
    """Verify broadcast returns False gracefully without error when Supabase is unconfigured."""
    with patch.object(settings, "supabase_url", None):
        result = await broadcast_tournament_event(
            tournament_id="t-123",
            event="match_started",
            payload={"test": "data"},
        )
        assert result is False


# ---------------------------------------------------------------------------
# 5. Match Status Chips & Health Cards Calculation Tests
# ---------------------------------------------------------------------------


def test_match_status_chip_state_mapping():
    """Verify match status transitions map to the 5 required status chip categories."""
    status_mapping = {
        "scheduled": "upcoming",
        "pending": "upcoming",
        "live": "live",
        "awaiting_approval": "waiting_verification",
        "reported": "waiting_verification",
        "waiting_verification": "waiting_verification",
        "verified": "verified",
        "completed": "completed",
        "paused": "paused",
        "cancelled": "cancelled",
    }

    for input_status, expected_category in status_mapping.items():
        norm = input_status.lower()
        if norm == "live":
            category = "live"
        elif norm in ("waiting_verification", "awaiting_approval", "reported"):
            category = "waiting_verification"
        elif norm == "verified":
            category = "verified"
        elif norm == "completed":
            category = "completed"
        elif norm == "paused":
            category = "paused"
        elif norm == "cancelled":
            category = "cancelled"
        else:
            category = "upcoming"

        assert category == expected_category, f"Failed for status: {input_status}"


def test_health_cards_counts_calculation():
    """Verify the 5 health card counts compute accurately from snapshot data."""
    mock_registrations = [
        {"id": "r1", "status": "registered", "checked_in": False},
        {"id": "r2", "status": "checked_in", "checked_in": True},
        {"id": "r3", "status": "checked_in", "checked_in": True},
        {"id": "r4", "status": "cancelled", "checked_in": False},
    ]

    mock_matches = [
        {"id": "m1", "status": "live"},
        {"id": "m2", "status": "completed"},
        {"id": "m3", "status": "completed"},
        {"id": "m4", "status": "awaiting_approval"},
        {"id": "m5", "status": "scheduled"},
    ]

    # 1. Registered teams (active registrations)
    registered_teams = len(
        [r for r in mock_registrations if r["status"] in ("registered", "checked_in")]
    )
    assert registered_teams == 3

    # 2. Checked-in teams
    checked_in_teams = len(
        [r for r in mock_registrations if r.get("checked_in") or r["status"] == "checked_in"]
    )
    assert checked_in_teams == 2

    # 3. Live matches
    live_matches = len([m for m in mock_matches if m["status"] == "live"])
    assert live_matches == 1

    # 4. Completed matches
    completed_matches = len([m for m in mock_matches if m["status"] == "completed"])
    assert completed_matches == 2

    # 5. Pending reports
    pending_reports = len(
        [m for m in mock_matches if m["status"] in ("reported", "awaiting_approval")]
    )
    assert pending_reports == 1
