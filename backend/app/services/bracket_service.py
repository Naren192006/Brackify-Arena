"""Bracket generation and tournament match scheduling service."""

from __future__ import annotations

import random
from typing import Any

import httpx
from fastapi import HTTPException, status

from app.config import settings
from app.core.exceptions import AppError
from app.core.logging import get_logger

logger = get_logger(__name__)


def _supabase_headers(prefer: str | None = None) -> dict[str, str]:
    if not settings.supabase_url or not settings.supabase_service_role_key:
        raise AppError("Supabase service role is not configured.", "bracket_not_configured")
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


async def _sb_get(
    client: httpx.AsyncClient,
    table: str,
    params: dict[str, str],
) -> list[dict[str, Any]]:
    url = _sb_url(table)
    headers = _supabase_headers(prefer="return=representation")
    logger.info("supabase_request", method="GET", url=url)
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
    logger.info("supabase_request", method="POST", url=url)
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


async def _sb_delete(
    client: httpx.AsyncClient,
    table: str,
    params: dict[str, str],
) -> None:
    url = _sb_url(table)
    headers = _supabase_headers(prefer="return=minimal")
    logger.info("supabase_request", method="DELETE", url=url)
    try:
        r = await client.delete(url, headers=headers, params=params)
        r.raise_for_status()
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
    logger.info("supabase_request", method="PATCH", url=url)
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


async def generate_automatic_bracket(tournament_id: str) -> list[dict[str, Any]]:
    """Generate a single-elimination tournament bracket and insert scheduled matches.
    
    1. Fetch tournament.
    2. Fetch all registrations with payment_status = 'paid' (or registered status for free tournaments).
    3. Fetch corresponding teams.
    4. Randomly shuffle teams.
    5. Support single elimination.
    6. Pair teams into Round 1 matches.
    7. Insert matches into `matches` table with round_number = 1, match_number = sequential, status = 'scheduled'.
    8. Return created matches.
    """
    async with httpx.AsyncClient(timeout=15.0) as client:
        # 1. Fetch tournament
        tournaments = await _sb_get(
            client,
            "tournaments",
            {"id": f"eq.{tournament_id}", "select": "id,entry_fee_minor,max_teams,status,title"},
        )
        if not tournaments:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"code": "tournament_not_found", "message": "Tournament not found."},
            )
        tournament = tournaments[0]
        entry_fee_minor = int(tournament.get("entry_fee_minor") or 0)

        # 2. Fetch registrations
        if entry_fee_minor > 0:
            registrations = await _sb_get(
                client,
                "tournament_registrations",
                {
                    "tournament_id": f"eq.{tournament_id}",
                    "payment_status": "eq.paid",
                    "select": "id,team_id,payment_status,status",
                },
            )
        else:
            registrations = await _sb_get(
                client,
                "tournament_registrations",
                {
                    "tournament_id": f"eq.{tournament_id}",
                    "status": "in.(registered,checked_in)",
                    "select": "id,team_id,payment_status,status",
                },
            )

        team_ids = [r["team_id"] for r in registrations if r.get("team_id")]
        # Deduplicate while preserving order
        unique_team_ids = list(dict.fromkeys(team_ids))

        if len(unique_team_ids) < 2:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    "code": "insufficient_teams",
                    "message": f"At least 2 paid/registered teams are required to generate a bracket (found {len(unique_team_ids)}).",
                },
            )

        # 3. Fetch corresponding teams
        team_id_in = ",".join(unique_team_ids)
        teams_data = await _sb_get(
            client,
            "teams",
            {"id": f"in.({team_id_in})", "select": "id,name,tag"},
        )
        teams_map = {t["id"]: t for t in teams_data}

        # 4. Randomly shuffle teams
        shuffled_team_ids = list(unique_team_ids)
        random.shuffle(shuffled_team_ids)

        # 5. Single elimination calculation
        team_count = len(shuffled_team_ids)
        slot_count = 1
        total_rounds = 0
        while slot_count < team_count:
            slot_count *= 2
        while (1 << total_rounds) < slot_count:
            total_rounds += 1

        # Delete any existing bracket for this tournament to cleanly regenerate
        await _sb_delete(client, "brackets", {"tournament_id": f"eq.{tournament_id}"})

        # Insert new bracket
        bracket_payload = {
            "tournament_id": tournament_id,
            "format": "single_elimination",
            "total_rounds": total_rounds,
        }
        created_bracket = await _sb_post(client, "brackets", bracket_payload)
        bracket_id = created_bracket.get("id") if isinstance(created_bracket, dict) else None
        if not bracket_id:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail={"code": "bracket_creation_failed", "message": "Failed to create bracket record."},
            )

        # Insert rounds
        round_ids: dict[int, str] = {}
        for r_num in range(1, total_rounds + 1):
            if r_num == total_rounds:
                r_type = "final"
            elif r_num == total_rounds - 1:
                r_type = "semifinal"
            else:
                r_type = "quarterfinal"

            round_payload = {
                "bracket_id": bracket_id,
                "round_number": r_num,
                "round_type": r_type,
            }
            created_round = await _sb_post(client, "rounds", round_payload)
            if isinstance(created_round, dict) and "id" in created_round:
                round_ids[r_num] = created_round["id"]
            else:
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail={"code": "round_creation_failed", "message": f"Failed to create round {r_num}."},
                )

        # 6. Pair teams into Round 1 and prepare all bracket matches
        matches_to_create: list[dict[str, Any]] = []

        # Round 1 matches
        round_1_match_count = slot_count // 2
        for match_no in range(1, round_1_match_count + 1):
            idx_a = 2 * (match_no - 1)
            idx_b = 2 * (match_no - 1) + 1
            team_a_id = shuffled_team_ids[idx_a] if idx_a < team_count else None
            team_b_id = shuffled_team_ids[idx_b] if idx_b < team_count else None

            matches_to_create.append({
                "tournament_id": tournament_id,
                "bracket_id": bracket_id,
                "round_id": round_ids[1],
                "round_number": 1,
                "match_number": match_no,
                "team_a_id": team_a_id,
                "team_b_id": team_b_id,
                "status": "scheduled",
            })

        # Subsequent rounds matches
        for r_num in range(2, total_rounds + 1):
            r_match_count = slot_count // (1 << r_num)
            for match_no in range(1, r_match_count + 1):
                matches_to_create.append({
                    "tournament_id": tournament_id,
                    "bracket_id": bracket_id,
                    "round_id": round_ids[r_num],
                    "round_number": r_num,
                    "match_number": match_no,
                    "team_a_id": None,
                    "team_b_id": None,
                    "status": "scheduled",
                })

        # 7. Insert matches into `matches` table
        created_matches = await _sb_post(client, "matches", matches_to_create)
        if isinstance(created_matches, dict):
            created_matches = [created_matches]

        # 8. Update tournament status to ongoing
        try:
            await _sb_patch(
                client,
                "tournaments",
                {"id": f"eq.{tournament_id}"},
                {"status": "ongoing"},
            )
        except Exception as exc:
            logger.warning("tournament_status_update_failed", error=str(exc))

        # Attach team details for convenience
        for m in created_matches:
            if m.get("team_a_id") and m["team_a_id"] in teams_map:
                m["team_a"] = teams_map[m["team_a_id"]]
            if m.get("team_b_id") and m["team_b_id"] in teams_map:
                m["team_b"] = teams_map[m["team_b_id"]]

        return created_matches

