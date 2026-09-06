from __future__ import annotations

import datetime
import math
from typing import Any
from uuid import UUID

import httpx
from fastapi import HTTPException, status

from app.config import settings
from app.core.exceptions import AppError
from app.core.logging import get_logger

logger = get_logger(__name__)


# ---------------------------------------------------------------------------
# Supabase REST Helpers
# ---------------------------------------------------------------------------

def _supabase_headers(prefer: str | None = None) -> dict[str, str]:
    if not settings.supabase_url or not settings.supabase_service_role_key:
        raise AppError("Supabase service role is not configured.", "service_not_configured")
    headers = {
        "apikey": settings.supabase_service_role_key,
        "Authorization": f"Bearer {settings.supabase_service_role_key}",
        "Content-Type": "application/json",
    }
    if prefer:
        headers["Prefer"] = prefer
    return headers


def _sb_url(table: str) -> str:
    rest_base = f"{settings.supabase_url.rstrip('/')}/rest/v1"
    return f"{rest_base}/{table}"


def _now_iso() -> str:
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def _is_uuid(val: str) -> bool:
    try:
        UUID(val)
        return True
    except (ValueError, TypeError):
        return False


async def _sb_get(
    client: httpx.AsyncClient,
    table: str,
    params: dict[str, str],
) -> list[dict[str, Any]]:
    url = _sb_url(table)
    headers = _supabase_headers(prefer="return=representation")
    try:
        r = await client.get(url, headers=headers, params=params)
        r.raise_for_status()
        data: Any = r.json()
        return data if isinstance(data, list) else []
    except httpx.HTTPStatusError as exc:
        logger.error(
            "supabase_error",
            status=exc.response.status_code,
            body=exc.response.text,
            url=str(exc.request.url),
        )
        raise


async def _sb_post(
    client: httpx.AsyncClient,
    table: str,
    body: dict[str, Any] | list[dict[str, Any]],
) -> list[dict[str, Any]] | dict[str, Any]:
    url = _sb_url(table)
    headers = _supabase_headers(prefer="return=representation")
    try:
        r = await client.post(url, headers=headers, json=body)
        r.raise_for_status()
        data: Any = r.json()
        if isinstance(body, list):
            return data if isinstance(data, list) else []
        return data[0] if isinstance(data, list) and data else {}
    except httpx.HTTPStatusError as exc:
        logger.error(
            "supabase_error",
            status=exc.response.status_code,
            body=exc.response.text,
            url=str(exc.request.url),
        )
        raise


async def _sb_patch(
    client: httpx.AsyncClient,
    table: str,
    params: dict[str, str],
    body: dict[str, Any],
) -> None:
    url = _sb_url(table)
    headers = _supabase_headers(prefer="return=minimal")
    try:
        r = await client.patch(url, headers=headers, params=params, json=body)
        r.raise_for_status()
    except httpx.HTTPStatusError as exc:
        logger.error(
            "supabase_error",
            status=exc.response.status_code,
            body=exc.response.text,
            url=str(exc.request.url),
        )
        raise


# ---------------------------------------------------------------------------
# Match Operations Service
# ---------------------------------------------------------------------------

async def list_tournament_matches(tournament_id: str) -> list[dict[str, Any]]:
    """Fetch all matches for a tournament ordered by round then match_number with joined team metadata."""
    async with httpx.AsyncClient(timeout=15.0) as client:
        is_uuid = _is_uuid(tournament_id)
        param = {"id": f"eq.{tournament_id}"} if is_uuid else {"slug": f"eq.{tournament_id}"}
        param["select"] = "id"
        tournaments = await _sb_get(client, "tournaments", param)
        if not tournaments:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"code": "tournament_not_found", "message": "Tournament not found"},
            )
        tournament_uuid = tournaments[0]["id"]

        matches = await _sb_get(
            client,
            "matches",
            {
                "tournament_id": f"eq.{tournament_uuid}",
                "select": "id,tournament_id,bracket_id,round_id,round_number,match_number,team_a_id,team_b_id,winner_team_id,team1_score,team2_score,status,scheduled_at,completed_at,team1_registration_id,team2_registration_id,winner_registration_id",
                "order": "round_number.asc,match_number.asc",
            },
        )

        team_ids: set[str] = set()
        for m in matches:
            if m.get("team_a_id"):
                team_ids.add(m["team_a_id"])
            if m.get("team_b_id"):
                team_ids.add(m["team_b_id"])
            if m.get("winner_team_id"):
                team_ids.add(m["winner_team_id"])

        teams_map: dict[str, dict[str, Any]] = {}
        if team_ids:
            teams_data = await _sb_get(
                client,
                "teams",
                {"id": f"in.({','.join(team_ids)})", "select": "id,name,tag,logo_url"},
            )
            teams_map = {t["id"]: t for t in teams_data}

        result: list[dict[str, Any]] = []
        for m in matches:
            t1 = teams_map.get(m["team_a_id"]) if m.get("team_a_id") else None
            t2 = teams_map.get(m["team_b_id"]) if m.get("team_b_id") else None
            winner = teams_map.get(m["winner_team_id"]) if m.get("winner_team_id") else None

            result.append({
                "id": m["id"],
                "tournament_id": m["tournament_id"],
                "bracket_id": m.get("bracket_id"),
                "round": m.get("round_number", 1),
                "round_number": m.get("round_number", 1),
                "match_number": m.get("match_number", 1),
                "status": m.get("status", "scheduled"),
                "team1": {
                    "id": t1["id"],
                    "name": t1.get("name") or "TBD",
                    "tag": t1.get("tag"),
                    "logo_url": t1.get("logo_url"),
                } if t1 else None,
                "team2": {
                    "id": t2["id"],
                    "name": t2.get("name") or "TBD",
                    "tag": t2.get("tag"),
                    "logo_url": t2.get("logo_url"),
                } if t2 else None,
                "winner": {
                    "id": winner["id"],
                    "name": winner.get("name") or "TBD",
                    "tag": winner.get("tag"),
                    "logo_url": winner.get("logo_url"),
                } if winner else None,
                "team1_score": m.get("team1_score"),
                "team2_score": m.get("team2_score"),
                "scheduled_at": m.get("scheduled_at"),
                "completed_at": m.get("completed_at"),
            })

        return result


async def get_match_detail_service(match_id: str) -> dict[str, Any]:
    """Fetch complete match details including tournament info, teams, round name, scores, and winner/loser."""
    async with httpx.AsyncClient(timeout=15.0) as client:
        matches = await _sb_get(
            client,
            "matches",
            {
                "id": f"eq.{match_id}",
                "select": "id,tournament_id,bracket_id,round_id,round_number,match_number,team_a_id,team_b_id,winner_team_id,team1_score,team2_score,status,scheduled_at,completed_at,team1_registration_id,team2_registration_id,winner_registration_id",
            },
        )
        if not matches:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"code": "match_not_found", "message": "Match not found"},
            )
        match = matches[0]
        tournament_id = match["tournament_id"]

        # Fetch tournament
        tournaments = await _sb_get(
            client,
            "tournaments",
            {
                "id": f"eq.{tournament_id}",
                "select": "id,title,slug,game,mode,status,start_time,banner_url",
            },
        )
        tournament = tournaments[0] if tournaments else {
            "id": tournament_id,
            "title": "Tournament",
            "slug": "",
            "game": "Esports",
            "mode": "5v5",
            "status": "ongoing",
            "start_time": None,
            "banner_url": None,
        }

        # Fetch round info
        round_name = f"Round {match.get('round_number', 1)}"
        if match.get("round_id"):
            rounds = await _sb_get(
                client,
                "rounds",
                {"id": f"eq.{match['round_id']}", "select": "round_number,round_type"},
            )
            if rounds and rounds[0].get("round_type"):
                round_name = str(rounds[0]["round_type"]).replace("_", " ").title()

        # Fetch teams
        team_ids: list[str] = [tid for tid in [match.get("team_a_id"), match.get("team_b_id"), match.get("winner_team_id")] if tid]
        teams_map: dict[str, dict[str, Any]] = {}
        if team_ids:
            teams_data = await _sb_get(
                client,
                "teams",
                {"id": f"in.({','.join(team_ids)})", "select": "id,name,tag,logo_url,captain_id"},
            )
            teams_map = {t["id"]: t for t in teams_data}

        t1 = teams_map.get(match.get("team_a_id")) if match.get("team_a_id") else None
        t2 = teams_map.get(match.get("team_b_id")) if match.get("team_b_id") else None
        winner_id = match.get("winner_team_id")
        winner = teams_map.get(winner_id) if winner_id else None

        loser = None
        if winner_id:
            if match.get("team_a_id") == winner_id and t2:
                loser = t2
            elif match.get("team_b_id") == winner_id and t1:
                loser = t1

        # Default placeholder map name based on game
        game_name = str(tournament.get("game") or "").lower()
        default_map = "Ascent" if "valorant" in game_name else ("Mirage" if "cs" in game_name or "counter" in game_name else "Arena Coliseum")

        return {
            "id": match["id"],
            "tournament_id": tournament["id"],
            "tournament_title": tournament.get("title") or "Tournament",
            "tournament_slug": tournament.get("slug") or "",
            "tournament_game": tournament.get("game") or "Esports",
            "tournament_mode": tournament.get("mode") or "5v5",
            "tournament_status": tournament.get("status") or "ongoing",
            "tournament_banner_url": tournament.get("banner_url"),
            "round": match.get("round_number", 1),
            "round_number": match.get("round_number", 1),
            "round_name": round_name,
            "match_number": match.get("match_number", 1),
            "status": match.get("status", "scheduled"),
            "scheduled_at": match.get("scheduled_at") or tournament.get("start_time"),
            "completed_at": match.get("completed_at"),
            "map_name": default_map,
            "team1": {
                "id": t1["id"],
                "name": t1.get("name") or "TBD",
                "tag": t1.get("tag"),
                "logo_url": t1.get("logo_url"),
            } if t1 else None,
            "team2": {
                "id": t2["id"],
                "name": t2.get("name") or "TBD",
                "tag": t2.get("tag"),
                "logo_url": t2.get("logo_url"),
            } if t2 else None,
            "winner": {
                "id": winner["id"],
                "name": winner.get("name") or "TBD",
                "tag": winner.get("tag"),
                "logo_url": winner.get("logo_url"),
            } if winner else None,
            "loser": {
                "id": loser["id"],
                "name": loser.get("name") or "TBD",
                "tag": loser.get("tag"),
                "logo_url": loser.get("logo_url"),
            } if loser else None,
            "team1_score": match.get("team1_score"),
            "team2_score": match.get("team2_score"),
        }


async def start_match_service(match_id: str, user_id: str | None = None) -> dict[str, Any]:
    """Start a match by setting status = 'live' and scheduled_at = now()."""
    async with httpx.AsyncClient(timeout=15.0) as client:
        matches = await _sb_get(
            client,
            "matches",
            {"id": f"eq.{match_id}", "select": "id,status,tournament_id"},
        )
        if not matches:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"code": "match_not_found", "message": "Match not found"},
            )
        match = matches[0]

        # Cannot start an already completed match
        if match.get("status") == "completed":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"code": "cannot_start_completed", "message": "Cannot start an already completed match."},
            )

        from app.services.tournament_service import verify_admin_or_creator_auth
        await verify_admin_or_creator_auth(client, user_id, match["tournament_id"], action_name="start_match")

        await _sb_patch(
            client,
            "matches",
            {"id": f"eq.{match_id}"},
            {"status": "live", "scheduled_at": _now_iso()},
        )
        logger.info("security_match_started", match_id=match_id, user_id=user_id)
        return {"success": True, "match_id": match_id, "status": "live"}


async def pause_match_service(match_id: str, user_id: str | None = None) -> dict[str, Any]:
    """Pause a match by setting status back to 'scheduled' or paused state."""
    async with httpx.AsyncClient(timeout=15.0) as client:
        matches = await _sb_get(
            client,
            "matches",
            {"id": f"eq.{match_id}", "select": "id,status,tournament_id"},
        )
        if not matches:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"code": "match_not_found", "message": "Match not found"},
            )
        match = matches[0]

        from app.services.tournament_service import verify_admin_or_creator_auth
        await verify_admin_or_creator_auth(client, user_id, match["tournament_id"], action_name="pause_match")

        await _sb_patch(
            client,
            "matches",
            {"id": f"eq.{match_id}"},
            {"status": "scheduled"},
        )
        logger.info("security_match_paused", match_id=match_id, user_id=user_id)
        return {"success": True, "match_id": match_id, "status": "paused"}


async def finish_match_service(match_id: str, user_id: str | None = None) -> dict[str, Any]:
    """Finish a match by marking status completed."""
    async with httpx.AsyncClient(timeout=15.0) as client:
        matches = await _sb_get(
            client,
            "matches",
            {"id": f"eq.{match_id}", "select": "id,status,tournament_id,winner_team_id,team_a_id,team_b_id,scheduled_at"},
        )
        if not matches:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"code": "match_not_found", "message": "Match not found"},
            )
        match = matches[0]

        # Cannot complete before start
        if match.get("status") not in ("live", "in_progress", "paused") and not match.get("scheduled_at"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"code": "cannot_complete_before_start", "message": "Cannot complete a match before it has started."},
            )

        from app.services.tournament_service import verify_admin_or_creator_auth
        await verify_admin_or_creator_auth(client, user_id, match["tournament_id"], action_name="finish_match")

        # If winner not explicitly chosen yet, select team_a if team_b is None, else require winner
        winner_id = match.get("winner_team_id")
        if not winner_id:
            if match.get("team_a_id") and not match.get("team_b_id"):
                winner_id = match["team_a_id"]
            else:
                winner_id = match.get("team_a_id")

        if winner_id:
            return await set_match_winner_service(match_id=match_id, winner_team_id=winner_id, user_id=user_id)

        await _sb_patch(
            client,
            "matches",
            {"id": f"eq.{match_id}"},
            {"status": "completed", "completed_at": _now_iso()},
        )
        logger.info("security_match_finished", match_id=match_id, user_id=user_id)
        return {"success": True, "match_id": match_id, "status": "completed"}


async def reset_match_service(match_id: str, user_id: str | None = None) -> dict[str, Any]:
    """Reset a match: removes winner, resets timestamps, sets status back to 'scheduled', and clears downstream advanced slots."""
    async with httpx.AsyncClient(timeout=15.0) as client:
        matches = await _sb_get(
            client,
            "matches",
            {"id": f"eq.{match_id}", "select": "id,tournament_id,bracket_id,round_number,match_number,team_a_id,team_b_id,winner_team_id,status"},
        )
        if not matches:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"code": "match_not_found", "message": "Match not found"},
            )
        match = matches[0]

        from app.services.tournament_service import verify_admin_or_creator_auth
        await verify_admin_or_creator_auth(client, user_id, match["tournament_id"], action_name="reset_match")

        prev_winner = match.get("winner_team_id")
        t_id = match["tournament_id"]
        r_num = int(match.get("round_number") or 1)
        m_num = int(match.get("match_number") or 1)

        # 1. Reset current match
        await _sb_patch(
            client,
            "matches",
            {"id": f"eq.{match_id}"},
            {
                "winner_team_id": None,
                "winner_registration_id": None,
                "status": "scheduled",
                "completed_at": None,
                "team1_score": None,
                "team2_score": None,
            },
        )

        # 2. Clear advanced winner from downstream next round match slot if exists
        if prev_winner:
            next_r_num = r_num + 1
            next_m_num = (m_num + 1) // 2
            is_slot_a = (m_num % 2 == 1)

            next_matches = await _sb_get(
                client,
                "matches",
                {
                    "tournament_id": f"eq.{t_id}",
                    "round_number": f"eq.{next_r_num}",
                    "match_number": f"eq.{next_m_num}",
                    "select": "id,team_a_id,team_b_id",
                },
            )
            if next_matches:
                next_m = next_matches[0]
                clear_patch: dict[str, Any] = {}
                if is_slot_a and next_m.get("team_a_id") == prev_winner:
                    clear_patch["team_a_id"] = None
                    clear_patch["team1_registration_id"] = None
                elif not is_slot_a and next_m.get("team_b_id") == prev_winner:
                    clear_patch["team_b_id"] = None
                    clear_patch["team2_registration_id"] = None
                if clear_patch:
                    await _sb_patch(client, "matches", {"id": f"eq.{next_m['id']}"}, clear_patch)

        # 3. If tournament was marked completed, revert back to live
        tournaments = await _sb_get(client, "tournaments", {"id": f"eq.{t_id}", "select": "id,status"})
        if tournaments and tournaments[0].get("status") == "completed":
            await _sb_patch(
                client,
                "tournaments",
                {"id": f"eq.{t_id}"},
                {"status": "live", "champion_team_id": None, "champion_team_registration_id": None},
            )

        logger.info("security_match_reset", match_id=match_id, user_id=user_id)
        return {"success": True, "match_id": match_id, "status": "scheduled"}


async def set_match_winner_service(
    match_id: str,
    winner_team_id: str | None = None,
    winner_choice: str | None = None,
    user_id: str | None = None,
) -> dict[str, Any]:
    """Set match winner, complete the match, and automatically advance winner to the next round match.

    Winner logic:
    1. Update winner_team_id and mark match status = 'completed', completed_at = now().
    2. Identify next round: round_number = current_round + 1.
    3. Next match number: next_match_no = ceil(current_match.match_number / 2).
    4. Slot: if match_number % 2 == 1 -> team_a_id; if match_number % 2 == 0 -> team_b_id.
    5. If no next round exists, crown champion in `brackets` and set tournament status = 'completed'.
    6. If next match is a BYE slot (one team only), auto-advances.
    """
    async with httpx.AsyncClient(timeout=15.0) as client:
        # Fetch current match
        matches = await _sb_get(
            client,
            "matches",
            {
                "id": f"eq.{match_id}",
                "select": "id,tournament_id,bracket_id,round_id,round_number,match_number,team_a_id,team_b_id,winner_team_id,team1_registration_id,team2_registration_id,status",
            },
        )
        if not matches:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"code": "match_not_found", "message": "Match not found"},
            )
        current_match = matches[0]

        from app.services.tournament_service import verify_admin_or_creator_auth
        await verify_admin_or_creator_auth(client, user_id, current_match["tournament_id"], action_name="set_match_winner")

        # Determine winner team ID
        target_winner_id = winner_team_id
        if not target_winner_id and winner_choice:
            if winner_choice == "team1":
                target_winner_id = current_match.get("team_a_id")
            elif winner_choice == "team2":
                target_winner_id = current_match.get("team_b_id")

        if not target_winner_id:
            target_winner_id = current_match.get("team_a_id")

        if not target_winner_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"code": "invalid_winner", "message": "No valid team found to set as winner."},
            )

        # Winner must belong to participating teams
        valid_teams = [t for t in [current_match.get("team_a_id"), current_match.get("team_b_id")] if t]
        if valid_teams and target_winner_id not in valid_teams:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"code": "invalid_winner", "message": "Winner must belong to participating teams in this match."},
            )

        now_ts = _now_iso()
        tournament_id = current_match["tournament_id"]
        bracket_id = current_match.get("bracket_id")
        current_round_no = int(current_match.get("round_number") or 1)
        current_match_no = int(current_match.get("match_number") or 1)

        # 1. Update current match to completed with winner
        await _sb_patch(
            client,
            "matches",
            {"id": f"eq.{match_id}"},
            {
                "winner_team_id": target_winner_id,
                "status": "completed",
                "completed_at": now_ts,
            },
        )

        # 2. Run automatic progression across the tournament
        from app.services.tournament_service import auto_progress_tournament_service

        progression_result = await auto_progress_tournament_service(tournament_id)

        return {
            "success": True,
            "match_id": match_id,
            "tournament_id": tournament_id,
            "winner_team_id": target_winner_id,
            "status": "completed",
            **progression_result,
        }


# Standard tournament progression service alias
advance_winner = set_match_winner_service



