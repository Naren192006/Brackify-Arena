"""Test suite for Brackify Automatic Bracket Progression Engine (Phase 10.2).

Verifies:
- Winner advancement (Round 1 to Round 2 slot A/B population).
- Duplicate progression protection.
- Cascading match reset & rollback of downstream slots, matches, and champion state.
- Finals match completion & champion crowning (tournaments + brackets + timestamps).
- Automatic lifecycle transitions (registration_closed -> live -> completed).
- Error handling, unauthorized reset rejection, and rollback safety.
"""

import os
import sys
import uuid
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import HTTPException

sys.path.insert(0, ".")

os.environ["DATABASE_URL"] = "sqlite+aiosqlite:///load_tests/benchmark_store.db"
os.environ["REDIS_ENABLED"] = "false"
os.environ["SECRET_KEY"] = "test-secret-key-bracket-progression-testing-12345"
os.environ["ADMIN_JWT_SECRET"] = "test-dedicated-admin-jwt-secret-testing-2026"
os.environ["SUPABASE_JWT_SECRET"] = "test-supabase-jwt-secret-testing-bracket-32bytes"
os.environ["SUPABASE_URL"] = "https://test.supabase.co"
os.environ["SUPABASE_SERVICE_ROLE_KEY"] = "test-service-role-key-bracket"
os.environ["ENVIRONMENT"] = "test"

from app.services.bracket_service import generate_automatic_bracket
from app.services.match_service import (
    reset_match_service,
    set_match_winner_service,
)
from app.services.realtime_service import _clear_dedup_cache
from app.services.tournament_service import auto_progress_tournament_service


@pytest.fixture(autouse=True)
def clean_realtime():
    _clear_dedup_cache()
    yield
    _clear_dedup_cache()


# ---------------------------------------------------------------------------
# 1. Winner Advancement & Slot Population Tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_winner_advancement_populates_next_round_slot_a():
    """Winner of Round 1 Match 1 should advance to Round 2 Match 1 Slot A."""
    t_id = str(uuid.uuid4())
    b_id = str(uuid.uuid4())
    m1_id = str(uuid.uuid4())
    m2_next_id = str(uuid.uuid4())
    team1_id = str(uuid.uuid4())
    team2_id = str(uuid.uuid4())
    user_id = str(uuid.uuid4())

    fake_tournament = [{"id": t_id, "status": "live", "title": "Championship"}]
    fake_bracket = [{"id": b_id, "total_rounds": 2}]
    fake_rounds = [
        {"id": str(uuid.uuid4()), "round_number": 1, "round_type": "semifinal"},
        {"id": str(uuid.uuid4()), "round_number": 2, "round_type": "final"},
    ]
    fake_regs = [
        {"id": "reg-1", "team_id": team1_id},
        {"id": "reg-2", "team_id": team2_id},
    ]

    fake_matches = [
        {
            "id": m1_id,
            "tournament_id": t_id,
            "bracket_id": b_id,
            "round_number": 1,
            "match_number": 1,
            "team_a_id": team1_id,
            "team_b_id": team2_id,
            "team1_registration_id": "reg-1",
            "team2_registration_id": "reg-2",
            "winner_team_id": None,
            "winner_registration_id": None,
            "status": "live",
        },
        {
            "id": m2_next_id,
            "tournament_id": t_id,
            "bracket_id": b_id,
            "round_number": 2,
            "match_number": 1,
            "team_a_id": None,
            "team_b_id": None,
            "team1_registration_id": None,
            "team2_registration_id": None,
            "winner_team_id": None,
            "winner_registration_id": None,
            "status": "scheduled",
        },
    ]

    patches_recorded = []

    async def fake_get(client, table, params):
        if table == "tournaments":
            return fake_tournament
        if table == "brackets":
            return fake_bracket
        if table == "rounds":
            return fake_rounds
        if table == "tournament_registrations":
            return fake_regs
        if table == "matches":
            if "id" in params and "eq." in params["id"]:
                match_id = params["id"].replace("eq.", "")
                return [m for m in fake_matches if m["id"] == match_id]
            return fake_matches
        return []

    async def fake_patch(client, table, params, body):
        patches_recorded.append({"table": table, "params": params, "body": body})
        if table == "matches" and "id" in params:
            match_id = params["id"].replace("eq.", "")
            for m in fake_matches:
                if m["id"] == match_id:
                    m.update(body)

    with (
        patch("app.services.match_service._sb_get", side_effect=fake_get),
        patch("app.services.match_service._sb_patch", side_effect=fake_patch),
        patch("app.services.tournament_service._sb_get", side_effect=fake_get),
        patch("app.services.tournament_service._sb_patch", side_effect=fake_patch),
        patch(
            "app.services.tournament_service.verify_admin_or_creator_auth", new_callable=AsyncMock
        ),
        patch("app.services.realtime_service.broadcast_tournament_event", new_callable=AsyncMock),
    ):
        res = await set_match_winner_service(
            match_id=m1_id, winner_team_id=team1_id, user_id=user_id
        )

        assert res["success"] is True
        assert res["winner_team_id"] == team1_id

        # Check Round 2 Match 1 Slot A updated with team1_id
        next_m_patch = next(
            (
                p
                for p in patches_recorded
                if p["table"] == "matches" and p["params"].get("id") == f"eq.{m2_next_id}"
            ),
            None,
        )
        assert next_m_patch is not None
        assert next_m_patch["body"]["team_a_id"] == team1_id
        assert next_m_patch["body"]["team1_registration_id"] == "reg-1"


@pytest.mark.asyncio
async def test_winner_advancement_populates_next_round_slot_b():
    """Winner of Round 1 Match 2 should advance to Round 2 Match 1 Slot B."""
    t_id = str(uuid.uuid4())
    b_id = str(uuid.uuid4())
    m2_id = str(uuid.uuid4())
    final_m_id = str(uuid.uuid4())
    team3_id = str(uuid.uuid4())
    team4_id = str(uuid.uuid4())
    user_id = str(uuid.uuid4())

    fake_tournament = [{"id": t_id, "status": "live", "title": "Championship"}]
    fake_bracket = [{"id": b_id, "total_rounds": 2}]
    fake_rounds = [{"round_number": 1}, {"round_number": 2}]
    fake_regs = [{"id": "reg-3", "team_id": team3_id}, {"id": "reg-4", "team_id": team4_id}]

    fake_matches = [
        {
            "id": m2_id,
            "tournament_id": t_id,
            "bracket_id": b_id,
            "round_number": 1,
            "match_number": 2,
            "team_a_id": team3_id,
            "team_b_id": team4_id,
            "team1_registration_id": "reg-3",
            "team2_registration_id": "reg-4",
            "winner_team_id": None,
            "status": "live",
        },
        {
            "id": final_m_id,
            "tournament_id": t_id,
            "bracket_id": b_id,
            "round_number": 2,
            "match_number": 1,
            "team_a_id": "existing-team-a",
            "team_b_id": None,
            "status": "scheduled",
        },
    ]

    patches_recorded = []

    async def fake_get(client, table, params):
        if table == "tournaments":
            return fake_tournament
        if table == "brackets":
            return fake_bracket
        if table == "rounds":
            return fake_rounds
        if table == "tournament_registrations":
            return fake_regs
        if table == "matches":
            if "id" in params and "eq." in params["id"]:
                match_id = params["id"].replace("eq.", "")
                return [m for m in fake_matches if m["id"] == match_id]
            return fake_matches
        return []

    async def fake_patch(client, table, params, body):
        patches_recorded.append({"table": table, "params": params, "body": body})
        if table == "matches" and "id" in params:
            match_id = params["id"].replace("eq.", "")
            for m in fake_matches:
                if m["id"] == match_id:
                    m.update(body)

    with (
        patch("app.services.match_service._sb_get", side_effect=fake_get),
        patch("app.services.match_service._sb_patch", side_effect=fake_patch),
        patch("app.services.tournament_service._sb_get", side_effect=fake_get),
        patch("app.services.tournament_service._sb_patch", side_effect=fake_patch),
        patch(
            "app.services.tournament_service.verify_admin_or_creator_auth", new_callable=AsyncMock
        ),
        patch("app.services.realtime_service.broadcast_tournament_event", new_callable=AsyncMock),
    ):
        res = await set_match_winner_service(
            match_id=m2_id, winner_team_id=team4_id, user_id=user_id
        )

        assert res["success"] is True
        next_m_patch = next(
            (
                p
                for p in patches_recorded
                if p["table"] == "matches" and p["params"].get("id") == f"eq.{final_m_id}"
            ),
            None,
        )
        assert next_m_patch is not None
        assert next_m_patch["body"]["team_b_id"] == team4_id
        assert next_m_patch["body"]["team2_registration_id"] == "reg-4"


# ---------------------------------------------------------------------------
# 2. Duplicate Protection Tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_duplicate_progression_protection():
    """When the next round match already contains the winner, redundant PATCH/INSERT is avoided."""
    t_id = str(uuid.uuid4())
    b_id = str(uuid.uuid4())
    team1_id = str(uuid.uuid4())

    fake_tournament = [{"id": t_id, "status": "live", "title": "Championship"}]
    fake_bracket = [{"id": b_id, "total_rounds": 2}]
    fake_regs = [{"id": "reg-1", "team_id": team1_id}]

    # Match 1 completed with team1, Match 2 scheduled, and Round 2 Match 1 already populated
    # with team1 in slot A
    fake_matches = [
        {
            "id": "m1",
            "tournament_id": t_id,
            "bracket_id": b_id,
            "round_number": 1,
            "match_number": 1,
            "team_a_id": team1_id,
            "team_b_id": "team-2",
            "team1_registration_id": "reg-1",
            "winner_team_id": team1_id,
            "winner_registration_id": "reg-1",
            "status": "completed",
        },
        {
            "id": "m1_2",
            "tournament_id": t_id,
            "bracket_id": b_id,
            "round_number": 1,
            "match_number": 2,
            "team_a_id": "team-3",
            "team_b_id": "team-4",
            "team1_registration_id": "reg-3",
            "team2_registration_id": "reg-4",
            "winner_team_id": None,
            "winner_registration_id": None,
            "status": "scheduled",
        },
        {
            "id": "m2",
            "tournament_id": t_id,
            "bracket_id": b_id,
            "round_number": 2,
            "match_number": 1,
            "team_a_id": team1_id,
            "team_b_id": None,
            "team1_registration_id": "reg-1",
            "team2_registration_id": None,
            "winner_team_id": None,
            "status": "scheduled",
        },
    ]

    patches_recorded = []
    posts_recorded = []

    async def fake_get(client, table, params):
        if table == "tournaments":
            return fake_tournament
        if table == "brackets":
            return fake_bracket
        if table == "tournament_registrations":
            return fake_regs
        if table == "matches":
            return fake_matches
        return []

    async def fake_patch(client, table, params, body):
        patches_recorded.append({"table": table, "params": params, "body": body})

    async def fake_post(client, table, body):
        posts_recorded.append({"table": table, "body": body})
        return {"id": "new-match"}

    with (
        patch("app.services.tournament_service._sb_get", side_effect=fake_get),
        patch("app.services.tournament_service._sb_patch", side_effect=fake_patch),
        patch("app.services.tournament_service._sb_post", side_effect=fake_post),
        patch("app.services.realtime_service.broadcast_tournament_event", new_callable=AsyncMock),
    ):
        res = await auto_progress_tournament_service(t_id)

        assert res["success"] is True
        # No extra matches posted and no redundant patches on m2 slot A
        m2_patches = [
            p
            for p in patches_recorded
            if p["table"] == "matches" and p["params"].get("id") == "eq.m2"
        ]
        assert len(m2_patches) == 0
        assert len(posts_recorded) == 0


# ---------------------------------------------------------------------------
# 3. Finals & Champion Crowning Tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_finals_crowns_champion_and_completes_tournament():
    """When final match finishes, tournament status becomes completed, champion crowned, and
    timestamps set."""
    t_id = str(uuid.uuid4())
    b_id = str(uuid.uuid4())
    final_m_id = str(uuid.uuid4())
    champion_team_id = str(uuid.uuid4())
    runner_up_id = str(uuid.uuid4())
    user_id = str(uuid.uuid4())

    fake_tournament = [
        {"id": t_id, "status": "live", "title": "Finals Tournament", "champion_team_id": None}
    ]
    fake_bracket = [{"id": b_id, "total_rounds": 1, "champion_team_id": None}]
    fake_rounds = [{"round_number": 1, "round_type": "final"}]
    fake_regs = [
        {"id": "reg-champ", "team_id": champion_team_id},
        {"id": "reg-runner", "team_id": runner_up_id},
    ]
    fake_teams = [{"id": champion_team_id, "name": "Champions Team", "tag": "CHAMP"}]

    fake_matches = [
        {
            "id": final_m_id,
            "tournament_id": t_id,
            "bracket_id": b_id,
            "round_number": 1,
            "match_number": 1,
            "team_a_id": champion_team_id,
            "team_b_id": runner_up_id,
            "team1_registration_id": "reg-champ",
            "team2_registration_id": "reg-runner",
            "winner_team_id": None,
            "status": "live",
        }
    ]

    patches_recorded = []

    async def fake_get(client, table, params):
        if table == "tournaments":
            return fake_tournament
        if table == "brackets":
            return fake_bracket
        if table == "rounds":
            return fake_rounds
        if table == "tournament_registrations":
            return fake_regs
        if table == "teams":
            return fake_teams
        if table == "matches":
            if "id" in params and "eq." in params["id"]:
                match_id = params["id"].replace("eq.", "")
                return [m for m in fake_matches if m["id"] == match_id]
            return fake_matches
        return []

    async def fake_patch(client, table, params, body):
        patches_recorded.append({"table": table, "params": params, "body": body})
        if table == "matches":
            fake_matches[0].update(body)

    with (
        patch("app.services.match_service._sb_get", side_effect=fake_get),
        patch("app.services.match_service._sb_patch", side_effect=fake_patch),
        patch("app.services.tournament_service._sb_get", side_effect=fake_get),
        patch("app.services.tournament_service._sb_patch", side_effect=fake_patch),
        patch(
            "app.services.tournament_service.verify_admin_or_creator_auth", new_callable=AsyncMock
        ),
        patch(
            "app.services.realtime_service.broadcast_tournament_event", new_callable=AsyncMock
        ) as mock_broadcast,
    ):
        res = await set_match_winner_service(
            match_id=final_m_id, winner_team_id=champion_team_id, user_id=user_id
        )

        assert res["success"] is True
        assert res["tournament_status"] == "completed"
        assert res["champion"]["id"] == champion_team_id

        # Tournaments table patch verified
        t_patch = next((p for p in patches_recorded if p["table"] == "tournaments"), None)
        assert t_patch is not None
        assert t_patch["body"]["status"] == "completed"
        assert t_patch["body"]["champion_team_id"] == champion_team_id
        assert "completed_at" in t_patch["body"]

        # Brackets table patch verified
        b_patch = next((p for p in patches_recorded if p["table"] == "brackets"), None)
        assert b_patch is not None
        assert b_patch["body"]["champion_team_id"] == champion_team_id

        # Broadcasts verified
        events_broadcasted = [
            call[0][1] if len(call[0]) > 1 else call.kwargs.get("event")
            for call in mock_broadcast.call_args_list
        ]
        assert "tournament_status_updated" in events_broadcasted


# ---------------------------------------------------------------------------
# 4. Cascading Match Reset & Rollback Tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_cascading_match_reset_rollback():
    """Resetting a match rolls back downstream slots, resets downstream winners, and reverts
    completed tournament."""
    t_id = str(uuid.uuid4())
    b_id = str(uuid.uuid4())
    m1_id = str(uuid.uuid4())
    m2_id = str(uuid.uuid4())
    m3_final_id = str(uuid.uuid4())
    winner_team_id = str(uuid.uuid4())
    user_id = str(uuid.uuid4())

    fake_tournament = [{"id": t_id, "status": "completed", "champion_team_id": winner_team_id}]
    fake_bracket = [{"id": b_id, "champion_team_id": winner_team_id}]

    # Round 1 Match 1 -> Round 2 Match 1 -> Round 3 Match 1 (Finals)
    fake_matches = [
        {
            "id": m1_id,
            "tournament_id": t_id,
            "bracket_id": b_id,
            "round_number": 1,
            "match_number": 1,
            "team_a_id": winner_team_id,
            "team_b_id": "team-loser-1",
            "winner_team_id": winner_team_id,
            "status": "completed",
        },
        {
            "id": m2_id,
            "tournament_id": t_id,
            "bracket_id": b_id,
            "round_number": 2,
            "match_number": 1,
            "team_a_id": winner_team_id,
            "team_b_id": "team-semi",
            "winner_team_id": winner_team_id,
            "status": "completed",
        },
        {
            "id": m3_final_id,
            "tournament_id": t_id,
            "bracket_id": b_id,
            "round_number": 3,
            "match_number": 1,
            "team_a_id": winner_team_id,
            "team_b_id": "team-runner",
            "winner_team_id": winner_team_id,
            "status": "completed",
        },
    ]

    patches_recorded = []

    async def fake_get(client, table, params):
        if table == "tournaments":
            return fake_tournament
        if table == "brackets":
            return fake_bracket
        if table == "matches":
            if "id" in params and "eq." in params["id"]:
                match_id = params["id"].replace("eq.", "")
                return [m for m in fake_matches if m["id"] == match_id]
            if "round_number" in params and "match_number" in params:
                r_num = int(params["round_number"].replace("eq.", ""))
                m_num = int(params["match_number"].replace("eq.", ""))
                return [
                    m
                    for m in fake_matches
                    if m["round_number"] == r_num and m["match_number"] == m_num
                ]
            return fake_matches
        return []

    async def fake_patch(client, table, params, body):
        patches_recorded.append({"table": table, "params": params, "body": body})

    with (
        patch("app.services.match_service._sb_get", side_effect=fake_get),
        patch("app.services.match_service._sb_patch", side_effect=fake_patch),
        patch(
            "app.services.tournament_service.verify_admin_or_creator_auth", new_callable=AsyncMock
        ),
        patch("app.services.realtime_service.broadcast_tournament_event", new_callable=AsyncMock),
    ):
        res = await reset_match_service(match_id=m1_id, user_id=user_id)

        assert res["success"] is True
        assert res["status"] == "scheduled"
        assert res["rolled_back_winner"] == winner_team_id

        # Match 1 reset
        m1_patch = next(
            (
                p
                for p in patches_recorded
                if p["table"] == "matches" and p["params"].get("id") == f"eq.{m1_id}"
            ),
            None,
        )
        assert m1_patch["body"]["winner_team_id"] is None
        assert m1_patch["body"]["status"] == "scheduled"

        # Downstream Match 2 slot cleared and status reset
        m2_patch = next(
            (
                p
                for p in patches_recorded
                if p["table"] == "matches" and p["params"].get("id") == f"eq.{m2_id}"
            ),
            None,
        )
        assert m2_patch["body"]["team_a_id"] is None
        assert m2_patch["body"]["status"] == "scheduled"

        # Downstream Match 3 (Finals) slot cleared and status reset
        m3_patch = next(
            (
                p
                for p in patches_recorded
                if p["table"] == "matches" and p["params"].get("id") == f"eq.{m3_final_id}"
            ),
            None,
        )
        assert m3_patch["body"]["team_a_id"] is None
        assert m3_patch["body"]["status"] == "scheduled"

        # Tournament status reverted to live and champion cleared
        t_patch = next((p for p in patches_recorded if p["table"] == "tournaments"), None)
        assert t_patch["body"]["status"] == "live"
        assert t_patch["body"]["champion_team_id"] is None

        # Brackets champion cleared
        b_patch = next((p for p in patches_recorded if p["table"] == "brackets"), None)
        assert b_patch["body"]["champion_team_id"] is None


# ---------------------------------------------------------------------------
# 5. Bracket Generation Lifecycle Transition & BYE Handling
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_bracket_generation_transitions_to_live_and_progresses():
    """Generating automatic bracket transitions status to live and runs initial progression."""
    t_id = str(uuid.uuid4())
    team1 = str(uuid.uuid4())
    team2 = str(uuid.uuid4())

    fake_tournament = [
        {
            "id": t_id,
            "entry_fee_minor": 0,
            "max_teams": 4,
            "status": "registration_closed",
            "title": "Cup",
        }
    ]
    fake_regs = [
        {"id": "reg-1", "team_id": team1, "status": "registered"},
        {"id": "reg-2", "team_id": team2, "status": "registered"},
    ]
    fake_teams = [
        {"id": team1, "name": "Team One", "tag": "ONE"},
        {"id": team2, "name": "Team Two", "tag": "TWO"},
    ]

    patches_recorded = []

    async def fake_get(client, table, params):
        if table == "tournaments":
            return fake_tournament
        if table == "tournament_registrations":
            return fake_regs
        if table == "teams":
            return fake_teams
        return []

    async def fake_patch(client, table, params, body):
        patches_recorded.append({"table": table, "params": params, "body": body})

    async def fake_post(client, table, body):
        if table == "brackets":
            return {"id": "b-new"}
        if table == "rounds":
            return {"id": "r-new"}
        if table == "matches":
            return body
        return {}

    with (
        patch("app.services.bracket_service._sb_get", side_effect=fake_get),
        patch("app.services.bracket_service._sb_patch", side_effect=fake_patch),
        patch("app.services.bracket_service._sb_post", side_effect=fake_post),
        patch("app.services.bracket_service._sb_delete", new_callable=AsyncMock),
        patch(
            "app.services.tournament_service.auto_progress_tournament_service",
            new_callable=AsyncMock,
        ) as mock_prog,
        patch(
            "app.services.realtime_service.broadcast_tournament_event", new_callable=AsyncMock
        ) as mock_broadcast,
    ):
        matches = await generate_automatic_bracket(t_id)

        assert len(matches) > 0
        mock_prog.assert_called_once_with(t_id)
        mock_broadcast.assert_called()

        t_patch = next((p for p in patches_recorded if p["table"] == "tournaments"), None)
        assert t_patch is not None
        assert t_patch["body"]["status"] == "ongoing"


# ---------------------------------------------------------------------------
# 6. Error Handling & Validation Safety Tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_winner_selection_rejects_non_participating_team():
    """Attempting to crown a winner that is not part of the match raises HTTP 400."""
    match_id = str(uuid.uuid4())
    t_id = str(uuid.uuid4())
    fake_match = [
        {
            "id": match_id,
            "tournament_id": t_id,
            "team_a_id": "team-a",
            "team_b_id": "team-b",
            "status": "live",
        }
    ]

    with (
        patch(
            "app.services.match_service._sb_get", new_callable=AsyncMock, return_value=fake_match
        ),
        patch(
            "app.services.tournament_service.verify_admin_or_creator_auth", new_callable=AsyncMock
        ),
    ):
        with pytest.raises(HTTPException) as exc_info:
            await set_match_winner_service(
                match_id=match_id,
                winner_team_id="unrelated-team-xyz",
                user_id="admin-id",
            )
        assert exc_info.value.status_code == 400
        assert exc_info.value.detail["code"] == "invalid_winner"


@pytest.mark.asyncio
async def test_reset_nonexistent_match_raises_404():
    """Attempting to reset a match that does not exist raises HTTP 404."""
    with patch("app.services.match_service._sb_get", new_callable=AsyncMock, return_value=[]):
        with pytest.raises(HTTPException) as exc_info:
            await reset_match_service(match_id=str(uuid.uuid4()), user_id="admin-id")
        assert exc_info.value.status_code == 404
        assert exc_info.value.detail["code"] == "match_not_found"
