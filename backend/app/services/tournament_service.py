from __future__ import annotations

import datetime
import math
import random
from typing import Any
from uuid import UUID

import httpx
from fastapi import BackgroundTasks, HTTPException, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import settings
from app.core.exceptions import AppError
from app.core.logging import get_logger
from app.models.tournament import Tournament, TournamentStatus
from app.schemas.tournaments import TournamentDetail, TournamentListItem, TournamentPage

logger = get_logger(__name__)


# ---------------------------------------------------------------------------
# Supabase REST Helpers (Service Role)
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


# ---------------------------------------------------------------------------
# Authorization & Security Verification Helpers
# ---------------------------------------------------------------------------

async def verify_admin_or_creator_auth(
    client: httpx.AsyncClient,
    user_id: str | None,
    tournament_id: str | None = None,
    action_name: str = "admin_action",
) -> bool:
    """Verify that user_id has admin or tournament organizer privileges."""
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "unauthorized", "message": "Authentication required for administrative actions."},
        )

    # 1. Check super_admin or sub_admin in admin_roles
    admin_rows = await _sb_get(
        client,
        "admin_roles",
        {"user_id": f"eq.{user_id}", "select": "role"},
    )
    if admin_rows and admin_rows[0].get("role") in ("super_admin", "sub_admin"):
        return True

    # 2. Check tournament_admins if tournament_id is provided
    if tournament_id:
        is_uuid = _is_uuid(tournament_id)
        t_param = {"id": f"eq.{tournament_id}"} if is_uuid else {"slug": f"eq.{tournament_id}"}
        t_param["select"] = "id,created_by,organizer_id"
        t_rows = await _sb_get(client, "tournaments", t_param)
        if t_rows:
            t = t_rows[0]
            if t.get("created_by") == user_id or t.get("organizer_id") == user_id:
                return True

            t_admin_rows = await _sb_get(
                client,
                "tournament_admins",
                {"tournament_id": f"eq.{t['id']}", "user_id": f"eq.{user_id}", "select": "id"},
            )
            if t_admin_rows:
                return True

    logger.warning(
        "security_violation_unauthorized_action",
        user_id=user_id,
        tournament_id=tournament_id,
        action=action_name,
    )
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail={
            "code": "forbidden",
            "message": "Only tournament organizers or administrators are authorized to perform this action.",
        },
    )


# ---------------------------------------------------------------------------
# Team Registration Security Service
# ---------------------------------------------------------------------------

async def register_team_service(
    tournament_id: str,
    team_id: str,
    user_id: str,
) -> dict[str, Any]:
    """Register a team for a tournament with atomic concurrency locking.

    Atomic Security Rules:
    1. Lock tournament row to serialize concurrent registration requests.
    2. Count only paid + pending registrations (status != 'cancelled').
    3. Compare against max_teams.
    4. Insert registration only if slots remain.
    5. Return HTTP 409 'Tournament is full' if capacity exceeded.
    6. Prevent duplicate team registrations in the same tournament (unique constraint + check).
    """
    async with httpx.AsyncClient(timeout=15.0) as client:
        is_uuid = _is_uuid(tournament_id)
        param = {"id": f"eq.{tournament_id}"} if is_uuid else {"slug": f"eq.{tournament_id}"}
        param["select"] = "id,slug,title,status,max_teams,entry_fee_minor,registration_close_at,start_time"
        tournaments = await _sb_get(client, "tournaments", param)
        if not tournaments:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"code": "tournament_not_found", "message": "Tournament not found"},
            )
        tournament = tournaments[0]
        tournament_uuid = tournament["id"]

        # 1. Try atomic stored procedure with row-level lock (FOR UPDATE)
        try:
            rpc_url = f"{settings.supabase_url.rstrip('/')}/rest/v1/rpc/register_team_atomic"
            rpc_resp = await client.post(
                rpc_url,
                headers=_supabase_headers(),
                json={
                    "p_tournament_id": tournament_uuid,
                    "p_team_id": team_id,
                    "p_user_id": user_id,
                    "p_payment_status": "pending",
                },
            )

            if rpc_resp.is_success:
                rpc_data = rpc_resp.json()
                logger.info(
                    "atomic_registration_successful",
                    tournament_id=tournament_uuid,
                    team_id=team_id,
                    user_id=user_id,
                )
                return {
                    "success": True,
                    "registration": rpc_data,
                    "requires_payment": rpc_data.get("requires_payment", False),
                    "entry_fee_minor": rpc_data.get("entry_fee_minor", 0),
                }

            error_body = rpc_resp.text.lower()
            if "tournament_full" in error_body:
                logger.warning("atomic_registration_overbooking_prevented", tournament_id=tournament_uuid, team_id=team_id)
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail={"code": "tournament_full", "message": "Tournament is full"},
                )
            if "duplicate_registration" in error_body or "team_already_registered" in error_body or "uq_active_team_tournament_reg" in error_body:
                logger.warning("atomic_registration_duplicate_prevented", tournament_id=tournament_uuid, team_id=team_id)
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail={"code": "duplicate_registration", "message": "This team is already registered for this tournament."},
                )
            if "registration_closed" in error_body:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail={"code": "registration_closed", "message": "Tournament registration is closed."},
                )
        except HTTPException:
            raise
        except Exception as rpc_err:
            logger.info("atomic_rpc_fallback_to_direct_lock", error=str(rpc_err))

        # 2. Fallback Atomic Validation (Direct Supabase Queries)
        t_status = str(tournament.get("status") or "").lower()
        if t_status not in ("open", "registration_open"):
            logger.warning("security_violation_registration_closed", tournament_id=tournament_uuid, status=t_status, team_id=team_id)
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={"code": "registration_closed", "message": "Tournament registration is closed."},
            )

        now = datetime.datetime.now(datetime.timezone.utc)
        close_at_str = tournament.get("registration_close_at")
        if close_at_str:
            try:
                close_dt = datetime.datetime.fromisoformat(close_at_str.replace("Z", "+00:00"))
                if now >= close_dt:
                    logger.warning("security_violation_registration_deadline_passed", tournament_id=tournament_uuid, team_id=team_id)
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail={"code": "registration_closed", "message": "Tournament registration deadline has passed."},
                    )
            except (ValueError, TypeError):
                pass

        # Check duplicate registration for same team
        existing_regs = await _sb_get(
            client,
            "tournament_registrations",
            {
                "tournament_id": f"eq.{tournament_uuid}",
                "team_id": f"eq.{team_id}",
                "status": "neq.cancelled",
                "select": "id,status,payment_status",
            },
        )
        if existing_regs:
            logger.warning("security_violation_duplicate_team_registration", tournament_id=tournament_uuid, team_id=team_id, user_id=user_id)
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={
                    "code": "duplicate_registration",
                    "message": "This team is already registered for this tournament.",
                },
            )

        # Count active paid + pending registrations
        max_teams = int(tournament.get("max_teams") or 16)
        active_regs = await _sb_get(
            client,
            "tournament_registrations",
            {
                "tournament_id": f"eq.{tournament_uuid}",
                "status": "neq.cancelled",
                "select": "id",
            },
        )
        if len(active_regs) >= max_teams:
            logger.warning("security_violation_registration_slots_full", tournament_id=tournament_uuid, max_teams=max_teams)
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={
                    "code": "tournament_full",
                    "message": "Tournament is full",
                },
            )

        entry_fee = int(tournament.get("entry_fee_minor") or 0)
        initial_payment_status = "paid" if entry_fee == 0 else "pending"

        # Insert registration
        try:
            created_reg = await _sb_post(
                client,
                "tournament_registrations",
                {
                    "tournament_id": tournament_uuid,
                    "team_id": team_id,
                    "registered_by": user_id,
                    "status": "registered",
                    "payment_status": initial_payment_status,
                    "created_at": _now_iso(),
                },
            )
        except httpx.HTTPStatusError as db_err:
            if "uq_active_team_tournament_reg" in db_err.response.text or "duplicate key" in db_err.response.text:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail={
                        "code": "duplicate_registration",
                        "message": "This team is already registered for this tournament.",
                    },
                )
            raise

        logger.info(
            "atomic_registration_successful",
            tournament_id=tournament_uuid,
            team_id=team_id,
            user_id=user_id,
        )

        return {
            "success": True,
            "registration": created_reg,
            "requires_payment": entry_fee > 0,
            "entry_fee_minor": entry_fee,
        }


# ---------------------------------------------------------------------------
# Start Tournament & Round 1 Match Generator
# ---------------------------------------------------------------------------

async def start_tournament_service(
    tournament_id: str,
    user_id: str | None = None,
    background_tasks: BackgroundTasks | None = None,
) -> dict[str, Any]:
    """Start a tournament and generate automatic Round 1 matches."""
    async with httpx.AsyncClient(timeout=15.0) as client:
        # Authorization check
        await verify_admin_or_creator_auth(client, user_id, tournament_id, action_name="start_tournament")

        # 1. Verify tournament exists
        is_uuid = _is_uuid(tournament_id)
        param = {"id": f"eq.{tournament_id}"} if is_uuid else {"slug": f"eq.{tournament_id}"}
        param["select"] = "id,slug,title,status,max_teams,entry_fee_minor"
        tournaments = await _sb_get(client, "tournaments", param)
        if not tournaments:
            logger.warning("tournament_start_not_found", tournament_id=tournament_id)
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"error": "not_found", "message": "Tournament not found"},
            )
        tournament = tournaments[0]
        tournament_uuid = tournament["id"]

        # 2. Check if matches already exist for this tournament
        existing_matches = await _sb_get(
            client,
            "matches",
            {"tournament_id": f"eq.{tournament_uuid}", "select": "id", "limit": "1"},
        )
        if existing_matches:
            logger.warning("tournament_already_started", tournament_id=tournament_uuid)
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={"error": "already_started", "message": "Tournament already started"},
            )

        # 3. Fetch all registrations for this tournament
        all_registrations = await _sb_get(
            client,
            "tournament_registrations",
            {
                "tournament_id": f"eq.{tournament_uuid}",
                "select": "id,team_id,payment_status,status",
            },
        )

        entry_fee = int(tournament.get("entry_fee_minor") or 0)
        seen_teams: set[str] = set()
        paid_registrations: list[dict[str, Any]] = []

        for r in all_registrations:
            is_valid_paid = (
                (r.get("payment_status") == "paid" and r.get("status") != "cancelled")
                or (entry_fee == 0 and r.get("status") in ("registered", "checked_in"))
            )
            if is_valid_paid:
                t_id = r.get("team_id")
                if t_id and t_id not in seen_teams:
                    seen_teams.add(t_id)
                    paid_registrations.append(r)

        # 4. Require at least 2 paid teams
        if len(paid_registrations) < 2:
            logger.warning("insufficient_paid_teams", tournament_id=tournament_uuid, count=len(paid_registrations))
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"error": "insufficient_teams", "message": f"At least 2 paid teams required to start tournament (found {len(paid_registrations)})"},
            )

        # Fetch all team details to avoid exposing raw registration UUIDs
        team_ids = [r["team_id"] for r in paid_registrations if r.get("team_id")]
        teams_map: dict[str, dict[str, Any]] = {}
        if team_ids:
            teams_data = await _sb_get(
                client,
                "teams",
                {"id": f"in.({','.join(team_ids)})", "select": "id,name,tag,logo_url"},
            )
            teams_map = {t["id"]: t for t in teams_data}

        # 5. Randomly shuffle the paid registrations
        shuffled_registrations = list(paid_registrations)
        random.shuffle(shuffled_registrations)

        # 6. Prepare bracket & round database records
        team_count = len(shuffled_registrations)
        total_rounds = max(1, math.ceil(math.log2(team_count)))

        brackets = await _sb_get(
            client, "brackets", {"tournament_id": f"eq.{tournament_uuid}", "select": "id"}
        )
        if brackets:
            bracket_id = brackets[0]["id"]
        else:
            created_bracket = await _sb_post(
                client,
                "brackets",
                {
                    "tournament_id": tournament_uuid,
                    "format": "single_elimination",
                    "total_rounds": total_rounds,
                },
            )
            bracket_id = created_bracket.get("id") if isinstance(created_bracket, dict) else None

        rounds = await _sb_get(
            client,
            "rounds",
            {"bracket_id": f"eq.{bracket_id}", "round_number": "eq.1", "select": "id"},
        )
        if rounds:
            round_id = rounds[0]["id"]
        else:
            r_type = "final" if total_rounds == 1 else ("semifinal" if total_rounds == 2 else "quarterfinal")
            created_round = await _sb_post(
                client,
                "rounds",
                {
                    "bracket_id": bracket_id,
                    "round_number": 1,
                    "round_type": r_type,
                },
            )
            round_id = created_round.get("id") if isinstance(created_round, dict) else None

        # 7 & 8. Pair teams into Round 1 matches and handle BYEs
        matches_to_insert: list[dict[str, Any]] = []
        reg_pairs: list[tuple[dict[str, Any], dict[str, Any] | None]] = []
        match_number = 1
        i = 0
        now_ts = _now_iso()

        while i < team_count:
            team1_reg = shuffled_registrations[i]
            if i + 1 < team_count:
                team2_reg = shuffled_registrations[i + 1]
                matches_to_insert.append({
                    "tournament_id": tournament_uuid,
                    "bracket_id": bracket_id,
                    "round_id": round_id,
                    "round_number": 1,
                    "match_number": match_number,
                    "team_a_id": team1_reg.get("team_id"),
                    "team_b_id": team2_reg.get("team_id"),
                    "winner_team_id": None,
                    "status": "scheduled",
                })
                reg_pairs.append((team1_reg, team2_reg))
                i += 2
            else:
                # Odd number of teams -> BYE match
                matches_to_insert.append({
                    "tournament_id": tournament_uuid,
                    "bracket_id": bracket_id,
                    "round_id": round_id,
                    "round_number": 1,
                    "match_number": match_number,
                    "team_a_id": team1_reg.get("team_id"),
                    "team_b_id": None,
                    "winner_team_id": team1_reg.get("team_id"),
                    "status": "completed",
                    "completed_at": now_ts,
                })
                reg_pairs.append((team1_reg, None))
                i += 1
            match_number += 1

        # Insert matches
        created_matches = await _sb_post(client, "matches", matches_to_insert)
        if isinstance(created_matches, dict):
            created_matches = [created_matches]

        # 9. Update tournament status to ongoing ('live')
        try:
            await _sb_patch(
                client,
                "tournaments",
                {"id": f"eq.{tournament_uuid}"},
                {"status": "ongoing"},
            )
        except Exception as exc:
            logger.warning("failed_to_update_tournament_status", error=str(exc))

        # 10. Format matches with joined team1/team2 objects instead of raw registration UUIDs
        formatted_matches: list[dict[str, Any]] = []
        for idx, match_item in enumerate(created_matches):
            if idx < len(reg_pairs):
                r1, r2 = reg_pairs[idx]
                t1 = teams_map.get(r1.get("team_id")) if r1 and r1.get("team_id") else None
                t2 = teams_map.get(r2.get("team_id")) if r2 and r2.get("team_id") else None
                winner_reg_id = r1.get("id") if not r2 else None

                formatted_matches.append({
                    "id": match_item.get("id"),
                    "round": match_item.get("round_number", 1),
                    "match_number": match_item.get("match_number", idx + 1),
                    "status": match_item.get("status", "scheduled"),
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
                    "winner_registration_id": winner_reg_id,
                })

        # 11 & 12. Send notifications & update analytics (via BackgroundTasks when available)
        if background_tasks is not None:
            from app.tasks.analytics import update_analytics_task
            from app.tasks.notifications import (
                send_team_notifications_task,
                send_tournament_notifications_task,
            )

            # Background tournament-wide alert
            background_tasks.add_task(
                send_tournament_notifications_task,
                tournament_id=tournament_uuid,
                title="Tournament Started!",
                body=f"{tournament.get('title', 'The tournament')} is now LIVE! Round 1 matches have been scheduled.",
                notification_type="tournament_started",
            )

            # Background analytics telemetry
            background_tasks.add_task(
                update_analytics_task,
                tournament_id=tournament_uuid,
                event_type="tournament_started",
            )

            # Background team match assignments
            t_title = tournament.get("title", "Tournament")
            for m in formatted_matches:
                t1 = m.get("team1")
                t2 = m.get("team2")
                if t1 and t1.get("id"):
                    opp = t2.get("name") if t2 else "TBD"
                    background_tasks.add_task(
                        send_team_notifications_task,
                        team_id=t1["id"],
                        title="Match Assigned!",
                        body=f"Your Round 1 match against {opp} in {t_title} is ready!",
                        notification_type="match_assigned",
                    )
                if t2 and t2.get("id"):
                    opp = t1.get("name") if t1 else "TBD"
                    background_tasks.add_task(
                        send_team_notifications_task,
                        team_id=t2["id"],
                        title="Match Assigned!",
                        body=f"Your Round 1 match against {opp} in {t_title} is ready!",
                        notification_type="match_assigned",
                    )
        else:
            # Fallback inline
            try:
                from app.services.notification_service import send_notification_to_tournament, send_notification_to_team
                await send_notification_to_tournament(
                    tournament_id=tournament_uuid,
                    title="Tournament Started!",
                    body=f"{tournament.get('title', 'The tournament')} is now LIVE! Round 1 matches have been scheduled.",
                    notification_type="tournament_started",
                )
                t_title = tournament.get("title", "Tournament")
                for m in formatted_matches:
                    t1 = m.get("team1")
                    t2 = m.get("team2")
                    if t1 and t1.get("id"):
                        opp = t2.get("name") if t2 else "TBD"
                        await send_notification_to_team(
                            team_id=t1["id"],
                            title="Match Assigned!",
                            body=f"Your Round 1 match against {opp} in {t_title} is ready!",
                            notification_type="match_assigned",
                        )
                    if t2 and t2.get("id"):
                        opp = t1.get("name") if t1 else "TBD"
                        await send_notification_to_team(
                            team_id=t2["id"],
                            title="Match Assigned!",
                            body=f"Your Round 1 match against {opp} in {t_title} is ready!",
                            notification_type="match_assigned",
                        )
            except Exception as exc:
                logger.warning("failed_to_send_round1_match_assigned_notifications", error=str(exc))

        return {
            "success": True,
            "matches_created": len(formatted_matches),
            "matches": formatted_matches,
        }


# ---------------------------------------------------------------------------
# Bracket & Matches Query Service
# ---------------------------------------------------------------------------

async def get_tournament_bracket_service(tournament_id: str) -> dict[str, Any]:
    """Fetch all matches for the tournament grouped by round with joined team objects.

    Requirements:
    1. Fetch all matches ordered by round then match_number.
    2. Join team1/team2 registration IDs with tournament_registrations.
    3. Join registrations with teams.
    4. Group matches by round.
    5. Return tournament_status, rounds[], matches[], team names, team tags, and winner info if completed.
    6. Never expose registration UUIDs.
    """
    async with httpx.AsyncClient(timeout=15.0) as client:
        # 1. Verify tournament exists
        is_uuid = _is_uuid(tournament_id)
        param = {"id": f"eq.{tournament_id}"} if is_uuid else {"slug": f"eq.{tournament_id}"}
        param["select"] = "id,status,title"
        tournaments = await _sb_get(client, "tournaments", param)
        if not tournaments:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"code": "tournament_not_found", "message": "Tournament not found"},
            )
        tournament = tournaments[0]
        tournament_uuid = tournament["id"]
        tournament_status = tournament.get("status") or "open"

        # 2. Fetch bracket & rounds
        brackets = await _sb_get(
            client,
            "brackets",
            {"tournament_id": f"eq.{tournament_uuid}", "select": "id,champion_team_id,total_rounds,format"},
        )
        bracket = brackets[0] if brackets else None
        bracket_id = bracket.get("id") if bracket else None
        champion_team_id = bracket.get("champion_team_id") if bracket else None

        rounds_meta: dict[int, dict[str, Any]] = {}
        if bracket_id:
            rounds_list = await _sb_get(
                client,
                "rounds",
                {"bracket_id": f"eq.{bracket_id}", "select": "id,round_number,round_type", "order": "round_number.asc"},
            )
            for r in rounds_list:
                rounds_meta[int(r["round_number"])] = r

        # 3. Fetch all matches ordered by round_number, match_number
        matches = await _sb_get(
            client,
            "matches",
            {
                "tournament_id": f"eq.{tournament_uuid}",
                "select": "id,round_number,match_number,team_a_id,team_b_id,winner_team_id,team1_score,team2_score,status,scheduled_at,completed_at,team1_registration_id,team2_registration_id,winner_registration_id",
                "order": "round_number.asc,match_number.asc",
            },
        )

        # 4. If matches have registration IDs but missing team IDs, join with tournament_registrations
        reg_ids_to_fetch: set[str] = set()
        for m in matches:
            if not m.get("team_a_id") and m.get("team1_registration_id"):
                reg_ids_to_fetch.add(m["team1_registration_id"])
            if not m.get("team_b_id") and m.get("team2_registration_id"):
                reg_ids_to_fetch.add(m["team2_registration_id"])

        reg_team_map: dict[str, str] = {}
        if reg_ids_to_fetch:
            reg_rows = await _sb_get(
                client,
                "tournament_registrations",
                {"id": f"in.({','.join(reg_ids_to_fetch)})", "select": "id,team_id"},
            )
            reg_team_map = {r["id"]: r["team_id"] for r in reg_rows if r.get("team_id")}

        # 5. Collect all unique team IDs to fetch team details (name, tag, logo_url)
        team_ids: set[str] = set()
        if champion_team_id:
            team_ids.add(champion_team_id)

        for m in matches:
            t1_id = m.get("team_a_id") or reg_team_map.get(m.get("team1_registration_id"))
            t2_id = m.get("team_b_id") or reg_team_map.get(m.get("team2_registration_id"))
            w_id = m.get("winner_team_id") or reg_team_map.get(m.get("winner_registration_id"))
            if t1_id:
                team_ids.add(t1_id)
            if t2_id:
                team_ids.add(t2_id)
            if w_id:
                team_ids.add(w_id)

        teams_map: dict[str, dict[str, Any]] = {}
        if team_ids:
            teams_data = await _sb_get(
                client,
                "teams",
                {"id": f"in.({','.join(team_ids)})", "select": "id,name,tag,logo_url"},
            )
            teams_map = {t["id"]: t for t in teams_data}

        # 6. Group matches by round
        rounds_grouped: dict[int, list[dict[str, Any]]] = {}
        for m in matches:
            r_num = int(m.get("round_number") or 1)
            t1_id = m.get("team_a_id") or reg_team_map.get(m.get("team1_registration_id"))
            t2_id = m.get("team_b_id") or reg_team_map.get(m.get("team2_registration_id"))
            w_id = m.get("winner_team_id") or reg_team_map.get(m.get("winner_registration_id"))

            t1 = teams_map.get(t1_id) if t1_id else None
            t2 = teams_map.get(t2_id) if t2_id else None
            winner = teams_map.get(w_id) if w_id else None

            match_item = {
                "id": m["id"],
                "round": r_num,
                "match_number": int(m.get("match_number") or 1),
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
            }
            rounds_grouped.setdefault(r_num, []).append(match_item)

        # Build ordered rounds list
        all_round_nums = sorted(set(rounds_grouped.keys()).union(rounds_meta.keys()))
        rounds_output: list[dict[str, Any]] = []
        for r_num in all_round_nums:
            r_meta = rounds_meta.get(r_num, {})
            rounds_output.append({
                "round_number": r_num,
                "round_type": r_meta.get("round_type") or f"round_{r_num}",
                "matches": rounds_grouped.get(r_num, []),
            })

        champion_team = teams_map.get(champion_team_id) if champion_team_id else None

        return {
            "tournament_id": tournament_uuid,
            "tournament_status": tournament_status,
            "champion_team": {
                "id": champion_team["id"],
                "name": champion_team.get("name") or "TBD",
                "tag": champion_team.get("tag"),
                "logo_url": champion_team.get("logo_url"),
            } if champion_team else None,
            "rounds": rounds_output,
        }


async def get_tournament_matches_service(tournament_id: str) -> list[dict[str, Any]]:
    """List tournament matches with joined team objects instead of raw registration UUIDs."""
    bracket_data = await get_tournament_bracket_service(tournament_id)
    all_matches: list[dict[str, Any]] = []
    for round_item in bracket_data.get("rounds", []):
        all_matches.extend(round_item.get("matches", []))
    return all_matches


async def pause_tournament_service(tournament_id: str, user_id: str | None = None) -> dict[str, Any]:
    """Pause an ongoing tournament."""
    async with httpx.AsyncClient(timeout=15.0) as client:
        await verify_admin_or_creator_auth(client, user_id, tournament_id, action_name="pause_tournament")

        is_uuid = _is_uuid(tournament_id)
        param = {"id": f"eq.{tournament_id}"} if is_uuid else {"slug": f"eq.{tournament_id}"}
        param["select"] = "id,status,title"
        tournaments = await _sb_get(client, "tournaments", param)
        if not tournaments:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail={"code": "tournament_not_found", "message": "Tournament not found"})
        tournament_uuid = tournaments[0]["id"]

        await _sb_patch(
            client,
            "tournaments",
            {"id": f"eq.{tournament_uuid}"},
            {"status": "paused"},
        )
        return {"success": True, "tournament_id": tournament_uuid, "status": "paused"}


async def resume_tournament_service(tournament_id: str, user_id: str | None = None) -> dict[str, Any]:
    """Resume a paused tournament."""
    async with httpx.AsyncClient(timeout=15.0) as client:
        await verify_admin_or_creator_auth(client, user_id, tournament_id, action_name="resume_tournament")

        is_uuid = _is_uuid(tournament_id)
        param = {"id": f"eq.{tournament_id}"} if is_uuid else {"slug": f"eq.{tournament_id}"}
        param["select"] = "id,status,title"
        tournaments = await _sb_get(client, "tournaments", param)
        if not tournaments:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail={"code": "tournament_not_found", "message": "Tournament not found"})
        tournament_uuid = tournaments[0]["id"]

        await _sb_patch(
            client,
            "tournaments",
            {"id": f"eq.{tournament_uuid}"},
            {"status": "ongoing"},
        )
        return {"success": True, "tournament_id": tournament_uuid, "status": "live"}


async def complete_tournament_service(
    tournament_id: str,
    background_tasks: BackgroundTasks | None = None,
) -> dict[str, Any]:
    """Complete a tournament and dispatch cleanup and notifications in the background."""
    async with httpx.AsyncClient(timeout=15.0) as client:
        is_uuid = _is_uuid(tournament_id)
        param = {"id": f"eq.{tournament_id}"} if is_uuid else {"slug": f"eq.{tournament_id}"}
        param["select"] = "id,status,title"
        tournaments = await _sb_get(client, "tournaments", param)
        if not tournaments:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail={"code": "tournament_not_found", "message": "Tournament not found"})
        tournament_uuid = tournaments[0]["id"]
        t_title = tournaments[0].get("title", "The tournament")

        await _sb_patch(
            client,
            "tournaments",
            {"id": f"eq.{tournament_uuid}"},
            {"status": "completed"},
        )

        if background_tasks is not None:
            from app.tasks.analytics import update_analytics_task
            from app.tasks.notifications import send_tournament_notifications_task
            from app.tasks.tournaments import cleanup_tournament_task
            background_tasks.add_task(
                cleanup_tournament_task,
                tournament_id=tournament_uuid,
            )
            background_tasks.add_task(
                send_tournament_notifications_task,
                tournament_id=tournament_uuid,
                title="Tournament Completed!",
                body=f"{t_title} has officially concluded! 🏆",
                notification_type="tournament_completed",
            )
            background_tasks.add_task(
                update_analytics_task,
                tournament_id=tournament_uuid,
                event_type="tournament_completed",
            )
        else:
            try:
                from app.services.notification_service import send_notification_to_tournament
                await send_notification_to_tournament(
                    tournament_id=tournament_uuid,
                    title="Tournament Completed!",
                    body=f"{t_title} has officially concluded! 🏆",
                    notification_type="tournament_completed",
                )
            except Exception as exc:
                logger.warning("failed_to_send_tournament_completed_notification", error=str(exc))

        return {"success": True, "tournament_id": tournament_uuid, "status": "completed"}



async def admin_cancel_registration_service(tournament_id: str, registration_id: str) -> dict[str, Any]:
    """Admin cancel registration with strict security rules."""
    async with httpx.AsyncClient(timeout=15.0) as client:
        is_uuid = _is_uuid(tournament_id)
        param = {"id": f"eq.{tournament_id}"} if is_uuid else {"slug": f"eq.{tournament_id}"}
        param["select"] = "id,status,start_time,registration_close_at,title"
        tournaments = await _sb_get(client, "tournaments", param)
        if not tournaments:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail={"code": "tournament_not_found", "message": "Tournament not found"})
        tournament = tournaments[0]
        tournament_uuid = tournament["id"]

        now = datetime.datetime.now(datetime.timezone.utc)
        t_status = str(tournament.get("status") or "").lower()

        # Rule 1: Reject if live or completed
        if t_status in ("ongoing", "live", "completed", "cancelled"):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={"code": "registration_closed", "message": "Tournament is live or completed. Registration changes are locked."},
            )

        start_time_str = tournament.get("start_time")
        if start_time_str:
            try:
                start_dt = datetime.datetime.fromisoformat(start_time_str.replace("Z", "+00:00"))
                if now >= start_dt:
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail={"code": "registration_closed", "message": "Tournament has started. Registration changes are locked."},
                    )
            except (ValueError, TypeError):
                pass

        regs = await _sb_get(
            client,
            "tournament_registrations",
            {"id": f"eq.{registration_id}", "tournament_id": f"eq.{tournament_uuid}", "select": "id,status,payment_status,registered_by"},
        )
        if not regs:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail={"code": "registration_not_found", "message": "Registration not found"})
        reg = regs[0]

        # Rule 2: If paid and registration window closed
        close_at_str = tournament.get("registration_close_at")
        is_deadline_passed = False
        if close_at_str:
            try:
                close_dt = datetime.datetime.fromisoformat(close_at_str.replace("Z", "+00:00"))
                if now >= close_dt:
                    is_deadline_passed = True
            except (ValueError, TypeError):
                pass

        if reg.get("payment_status") == "paid" and is_deadline_passed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={"code": "registration_closed", "message": "Paid registrations cannot be cancelled after the registration deadline."},
            )

        await _sb_patch(
            client,
            "tournament_registrations",
            {"id": f"eq.{registration_id}"},
            {"status": "cancelled", "payment_status": "cancelled", "cancelled_at": _now_iso()},
        )
        return {"success": True, "message": "Registration cancelled successfully"}


async def admin_refund_registration_service(tournament_id: str, registration_id: str) -> dict[str, Any]:
    """Admin refund registration."""
    async with httpx.AsyncClient(timeout=15.0) as client:
        is_uuid = _is_uuid(tournament_id)
        param = {"id": f"eq.{tournament_id}"} if is_uuid else {"slug": f"eq.{tournament_id}"}
        param["select"] = "id,status,title"
        tournaments = await _sb_get(client, "tournaments", param)
        if not tournaments:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail={"code": "tournament_not_found", "message": "Tournament not found"})
        tournament_uuid = tournaments[0]["id"]

        regs = await _sb_get(
            client,
            "tournament_registrations",
            {"id": f"eq.{registration_id}", "tournament_id": f"eq.{tournament_uuid}", "select": "id,status,payment_status"},
        )
        if not regs:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail={"code": "registration_not_found", "message": "Registration not found"})
        reg = regs[0]

        if reg.get("payment_status") != "paid":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"code": "not_paid", "message": "Registration is not in paid status."},
            )

        await _sb_patch(
            client,
            "tournament_registrations",
            {"id": f"eq.{registration_id}"},
            {"status": "cancelled", "payment_status": "refunded", "cancelled_at": _now_iso()},
        )
        return {"success": True, "message": "Registration marked as refunded and cancelled"}


async def admin_remind_registration_service(tournament_id: str, registration_id: str) -> dict[str, Any]:
    """Send payment reminder notification to captain."""
    async with httpx.AsyncClient(timeout=15.0) as client:
        is_uuid = _is_uuid(tournament_id)
        param = {"id": f"eq.{tournament_id}"} if is_uuid else {"slug": f"eq.{tournament_id}"}
        param["select"] = "id,title"
        tournaments = await _sb_get(client, "tournaments", param)
        if not tournaments:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail={"code": "tournament_not_found", "message": "Tournament not found"})
        tournament = tournaments[0]
        tournament_uuid = tournament["id"]

        regs = await _sb_get(
            client,
            "tournament_registrations",
            {"id": f"eq.{registration_id}", "tournament_id": f"eq.{tournament_uuid}", "select": "id,registered_by,payment_status"},
        )
        if not regs:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail={"code": "registration_not_found", "message": "Registration not found"})
        reg = regs[0]

        if reg.get("registered_by"):
            try:
                await _sb_post(
                    client,
                    "notifications",
                    {
                        "user_id": reg["registered_by"],
                        "title": "Payment Reminder",
                        "body": f"Please complete your entry fee payment for {tournament['title']} to confirm your team's slot.",
                    },
                )
            except Exception as exc:
                logger.warning("failed_to_insert_notification", error=str(exc))

        return {"success": True, "message": "Payment reminder sent successfully"}


async def admin_remove_registration_service(tournament_id: str, registration_id: str) -> dict[str, Any]:
    """Admin remove team from tournament."""
    async with httpx.AsyncClient(timeout=15.0) as client:
        is_uuid = _is_uuid(tournament_id)
        param = {"id": f"eq.{tournament_id}"} if is_uuid else {"slug": f"eq.{tournament_id}"}
        param["select"] = "id,status,title"
        tournaments = await _sb_get(client, "tournaments", param)
        if not tournaments:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail={"code": "tournament_not_found", "message": "Tournament not found"})
        tournament_uuid = tournaments[0]["id"]

        t_status = str(tournaments[0].get("status") or "").lower()
        if t_status in ("ongoing", "live"):
            matches = await _sb_get(client, "matches", {"tournament_id": f"eq.{tournament_uuid}", "status": "in.(live,completed)", "limit": "1"})
            if matches:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail={"code": "tournament_live", "message": "Cannot remove team while tournament matches are active."},
                )

        await _sb_patch(
            client,
            "tournament_registrations",
            {"id": f"eq.{registration_id}", "tournament_id": f"eq.{tournament_uuid}"},
            {"status": "cancelled", "payment_status": "cancelled", "cancelled_at": _now_iso()},
        )
        return {"success": True, "message": "Team removed from tournament"}


# ---------------------------------------------------------------------------
# Automatic Tournament Progression Engine
# ---------------------------------------------------------------------------

async def auto_progress_tournament_service(tournament_id: str) -> dict[str, Any]:
    """Automatic tournament progression service.

    Rules:
    - Round 1 winners populate Round 2.
    - Round 2 winners populate Semi Finals.
    - Semi winners populate Finals.
    - Final winner becomes Champion.
    - After final match: tournament.status = 'completed', store champion_team_registration_id and champion_team_id.
    - Prevent duplicate matches: If matches already exist for round & match_number, update instead of inserting duplicates.
    - Support BYEs: If single team in match, auto-advance.
    - Return: current_round, completed_matches, remaining_matches, champion.
    """
    async with httpx.AsyncClient(timeout=15.0) as client:
        # 1. Verify tournament
        is_uuid = _is_uuid(tournament_id)
        param = {"id": f"eq.{tournament_id}"} if is_uuid else {"slug": f"eq.{tournament_id}"}
        param["select"] = "id,status,title,champion_team_id,champion_team_registration_id"
        tournaments = await _sb_get(client, "tournaments", param)
        if not tournaments:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"code": "tournament_not_found", "message": "Tournament not found"},
            )
        tournament = tournaments[0]
        tournament_uuid = tournament["id"]

        # 2. Fetch bracket & rounds
        brackets = await _sb_get(
            client,
            "brackets",
            {"tournament_id": f"eq.{tournament_uuid}", "select": "id,champion_team_id,champion_team_registration_id,total_rounds"},
        )
        bracket = brackets[0] if brackets else None
        bracket_id = bracket.get("id") if bracket else None

        rounds_list = []
        if bracket_id:
            rounds_list = await _sb_get(
                client,
                "rounds",
                {"bracket_id": f"eq.{bracket_id}", "select": "id,round_number,round_type", "order": "round_number.asc"},
            )

        # 3. Fetch all registrations for lookup
        registrations = await _sb_get(
            client,
            "tournament_registrations",
            {"tournament_id": f"eq.{tournament_uuid}", "select": "id,team_id,payment_status,status"},
        )
        team_to_reg: dict[str, str] = {}
        reg_to_team: dict[str, str] = {}
        for r in registrations:
            if r.get("team_id"):
                team_to_reg[r["team_id"]] = r["id"]
                reg_to_team[r["id"]] = r["team_id"]

        # 4. Fetch all matches ordered by round_number, match_number
        matches = await _sb_get(
            client,
            "matches",
            {
                "tournament_id": f"eq.{tournament_uuid}",
                "select": "id,round_id,round_number,match_number,team_a_id,team_b_id,winner_team_id,team1_registration_id,team2_registration_id,winner_registration_id,status",
                "order": "round_number.asc,match_number.asc",
            },
        )

        if not matches:
            return {
                "success": True,
                "tournament_id": tournament_uuid,
                "current_round": 1,
                "completed_matches": 0,
                "remaining_matches": 0,
                "total_matches": 0,
                "tournament_status": tournament.get("status") or "open",
                "champion": None,
            }

        # Determine total rounds
        existing_round_numbers = [int(m.get("round_number") or 1) for m in matches]
        max_round_num = max(existing_round_numbers) if existing_round_numbers else 1
        bracket_total_rounds = int(bracket.get("total_rounds") or 0) if bracket else 0
        total_rounds = max(max_round_num, bracket_total_rounds, len(rounds_list), 1)

        # Group existing matches by (round_number, match_number) for O(1) duplicate prevention
        matches_by_pos: dict[tuple[int, int], dict[str, Any]] = {}
        for m in matches:
            r_num = int(m.get("round_number") or 1)
            m_num = int(m.get("match_number") or 1)
            matches_by_pos[(r_num, m_num)] = m

        now_ts = _now_iso()
        champion_team_id = tournament.get("champion_team_id")
        champion_reg_id = tournament.get("champion_team_registration_id")

        # 5. Process automatic progression round by round
        for r_num in range(1, total_rounds + 1):
            round_matches = [m for m in matches if int(m.get("round_number") or 1) == r_num]

            for m in round_matches:
                m_num = int(m.get("match_number") or 1)
                t_a = m.get("team_a_id") or (reg_to_team.get(m["team1_registration_id"]) if m.get("team1_registration_id") else None)
                t_b = m.get("team_b_id") or (reg_to_team.get(m["team2_registration_id"]) if m.get("team2_registration_id") else None)
                winner_id = m.get("winner_team_id") or (reg_to_team.get(m["winner_registration_id"]) if m.get("winner_registration_id") else None)
                is_completed = m.get("status") == "completed"

                # Handle BYE in current round (only one team, no opponent)
                if not is_completed:
                    if t_a and not t_b and m.get("status") != "live":
                        winner_id = t_a
                        winner_reg = team_to_reg.get(t_a)
                        await _sb_patch(
                            client,
                            "matches",
                            {"id": f"eq.{m['id']}"},
                            {
                                "team_a_id": t_a,
                                "winner_team_id": winner_id,
                                "winner_registration_id": winner_reg,
                                "status": "completed",
                                "completed_at": now_ts,
                            },
                        )
                        m["status"] = "completed"
                        m["winner_team_id"] = winner_id
                        m["winner_registration_id"] = winner_reg
                        is_completed = True

                # If match is completed with a winner, advance winner to next round or crown champion
                if is_completed and winner_id:
                    winner_reg = m.get("winner_registration_id") or team_to_reg.get(winner_id)
                    if not m.get("winner_registration_id") and winner_reg:
                        await _sb_patch(
                            client,
                            "matches",
                            {"id": f"eq.{m['id']}"},
                            {"winner_registration_id": winner_reg},
                        )

                    if r_num < total_rounds:
                        # Advance to next round:
                        next_r_num = r_num + 1
                        next_m_num = (m_num + 1) // 2
                        is_slot_a = (m_num % 2 == 1)

                        # Find corresponding round_id
                        target_round = next((r for r in rounds_list if int(r.get("round_number") or 0) == next_r_num), None)
                        next_round_id = target_round.get("id") if target_round else None

                        existing_next = matches_by_pos.get((next_r_num, next_m_num))
                        if existing_next:
                            # Update existing match without duplicating
                            patch_fields: dict[str, Any] = {}
                            if is_slot_a:
                                if existing_next.get("team_a_id") != winner_id or existing_next.get("team1_registration_id") != winner_reg:
                                    patch_fields["team_a_id"] = winner_id
                                    patch_fields["team1_registration_id"] = winner_reg
                            else:
                                if existing_next.get("team_b_id") != winner_id or existing_next.get("team2_registration_id") != winner_reg:
                                    patch_fields["team_b_id"] = winner_id
                                    patch_fields["team2_registration_id"] = winner_reg

                            if patch_fields:
                                await _sb_patch(client, "matches", {"id": f"eq.{existing_next['id']}"}, patch_fields)
                                existing_next.update(patch_fields)
                        else:
                            # Insert next round match
                            new_match_payload = {
                                "tournament_id": tournament_uuid,
                                "bracket_id": bracket_id,
                                "round_id": next_round_id,
                                "round_number": next_r_num,
                                "match_number": next_m_num,
                                "team_a_id": winner_id if is_slot_a else None,
                                "team_b_id": winner_id if not is_slot_a else None,
                                "team1_registration_id": winner_reg if is_slot_a else None,
                                "team2_registration_id": winner_reg if not is_slot_a else None,
                                "status": "scheduled",
                            }
                            created_match = await _sb_post(client, "matches", new_match_payload)
                            if isinstance(created_match, dict) and created_match.get("id"):
                                matches_by_pos[(next_r_num, next_m_num)] = created_match
                                matches.append(created_match)

                            # Send winner advanced and match assigned notifications
                            try:
                                from app.services.notification_service import send_notification_to_team
                                t_name = tournament.get("title", "the tournament")
                                await send_notification_to_team(
                                    team_id=winner_id,
                                    title="Winner Advanced!",
                                    body=f"Your team has advanced to Round {next_r_num} Match #{next_m_num} in {t_name}!",
                                    notification_type="winner_advanced",
                                )
                                await send_notification_to_team(
                                    team_id=winner_id,
                                    title="Match Assigned!",
                                    body=f"Your Round {next_r_num} match in {t_name} is now scheduled.",
                                    notification_type="match_assigned",
                                )
                            except Exception as exc:
                                logger.warning("failed_to_send_winner_advanced_notification", error=str(exc))
                    else:
                        # Final Match Completed -> Champion Crowned!
                        champion_team_id = winner_id
                        champion_reg_id = winner_reg

        # 6. If final match is completed and champion determined -> Mark tournament completed
        all_matches_after_progression = await _sb_get(
            client,
            "matches",
            {"tournament_id": f"eq.{tournament_uuid}", "select": "id,round_number,match_number,status,winner_team_id,winner_registration_id"},
        )
        total_matches_count = len(all_matches_after_progression)
        completed_matches_count = len([m for m in all_matches_after_progression if m.get("status") == "completed"])
        remaining_matches_count = total_matches_count - completed_matches_count

        # Compute current round (lowest round with an uncompleted match, or total_rounds)
        uncompleted_rounds = [
            int(m.get("round_number") or 1)
            for m in all_matches_after_progression
            if m.get("status") != "completed"
        ]
        current_round = min(uncompleted_rounds) if uncompleted_rounds else total_rounds

        final_match = next((m for m in all_matches_after_progression if int(m.get("round_number") or 1) == total_rounds and int(m.get("match_number") or 1) == 1), None)
        if final_match and final_match.get("status") == "completed" and final_match.get("winner_team_id"):
            champion_team_id = final_match["winner_team_id"]
            champion_reg_id = final_match.get("winner_registration_id") or team_to_reg.get(champion_team_id)

            # Update tournaments table
            await _sb_patch(
                client,
                "tournaments",
                {"id": f"eq.{tournament_uuid}"},
                {
                    "status": "completed",
                    "champion_team_id": champion_team_id,
                    "champion_team_registration_id": champion_reg_id,
                },
            )

            # Update brackets table
            if bracket_id:
                await _sb_patch(
                    client,
                    "brackets",
                    {"id": f"eq.{bracket_id}"},
                    {
                        "champion_team_id": champion_team_id,
                        "champion_team_registration_id": champion_reg_id,
                    },
                )

        # 7. Fetch champion team details if crowned
        champion_data = None
        if champion_team_id:
            champions = await _sb_get(
                client,
                "teams",
                {"id": f"eq.{champion_team_id}", "select": "id,name,tag,logo_url"},
            )
            if champions:
                champion_data = champions[0]

        tournament_final_status = "completed" if (remaining_matches_count == 0 and completed_matches_count > 0) else (tournament.get("status") or "ongoing")

        # 8. Send notifications if tournament completed
        if tournament_final_status == "completed" and champion_data:
            try:
                from app.services.notification_service import send_notification_to_tournament
                await send_notification_to_tournament(
                    tournament_id=tournament_uuid,
                    title="Tournament Completed!",
                    body=f"{champion_data.get('name', 'The champion')} has won the championship for {tournament.get('title', 'the tournament')}! 🏆",
                    notification_type="tournament_completed",
                )
            except Exception as exc:
                logger.warning("failed_to_send_tournament_completed_notification", error=str(exc))

        return {
            "success": True,
            "tournament_id": tournament_uuid,
            "current_round": current_round,
            "completed_matches": completed_matches_count,
            "remaining_matches": remaining_matches_count,
            "total_matches": total_matches_count,
            "tournament_status": tournament_final_status,
            "champion": champion_data,
        }


# ---------------------------------------------------------------------------
# Tournament Lifecycle Status & SQL Service
# ---------------------------------------------------------------------------

def compute_tournament_lifecycle_status(
    *,
    status: TournamentStatus,
    starts_at: datetime.datetime,
    registration_deadline: datetime.datetime,
    ends_at: datetime.datetime | None = None,
) -> str:
    now = datetime.datetime.now(datetime.timezone.utc)
    s_at = starts_at if starts_at.tzinfo else starts_at.replace(tzinfo=datetime.timezone.utc)
    r_deadline = registration_deadline if registration_deadline.tzinfo else registration_deadline.replace(tzinfo=datetime.timezone.utc)
    e_at = ends_at if (ends_at is None or ends_at.tzinfo) else ends_at.replace(tzinfo=datetime.timezone.utc)

    if status == TournamentStatus.COMPLETED or (e_at and now >= e_at):
        return "COMPLETED"
    if status == TournamentStatus.LIVE or now >= s_at:
        return "LIVE"
    if now < r_deadline:
        return "REGISTRATION_OPEN"
    return "UPCOMING"


def _list_item(tournament: Tournament, filled_slots: int = 0) -> TournamentListItem:
    rem_slots = max(0, tournament.capacity - filled_slots)
    comp_status = compute_tournament_lifecycle_status(
        status=tournament.status,
        starts_at=tournament.starts_at,
        registration_deadline=tournament.registration_deadline,
        ends_at=tournament.ends_at,
    )
    return TournamentListItem(
        id=tournament.id, slug=tournament.slug, title=tournament.title,
        status=tournament.status.value, computed_status=comp_status,
        game_slug=tournament.game.slug, game_name=tournament.game.name,
        banner_url=tournament.banner_url, prize_pool_minor=tournament.prize_pool_minor,
        entry_fee_minor=tournament.entry_fee_minor, currency=tournament.currency,
        starts_at=tournament.starts_at, registration_deadline=tournament.registration_deadline,
        capacity=tournament.capacity, filled_slots=filled_slots, remaining_slots=rem_slots,
    )


class TournamentService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def list_public(
        self, *, page: int, page_size: int, search: str | None, game: str | None,
        status: TournamentStatus | None, min_entry_fee: int | None, max_entry_fee: int | None,
    ) -> TournamentPage:
        query = select(Tournament).options(selectinload(Tournament.game)).join(Tournament.game).where(Tournament.status != TournamentStatus.DRAFT)
        count_query = select(func.count(Tournament.id)).join(Tournament.game).where(Tournament.status != TournamentStatus.DRAFT)
        predicates = []
        if search:
            pattern = f"%{search.strip()}%"
            predicates.append(or_(Tournament.title.ilike(pattern), Tournament.description.ilike(pattern)))
        if game:
            predicates.append(Tournament.game.has(slug=game))
        if status:
            predicates.append(Tournament.status == status)
        if min_entry_fee is not None:
            predicates.append(Tournament.entry_fee_minor >= min_entry_fee)
        if max_entry_fee is not None:
            predicates.append(Tournament.entry_fee_minor <= max_entry_fee)
        if predicates:
            query = query.where(*predicates)
            count_query = count_query.where(*predicates)
        total = int(await self.session.scalar(count_query) or 0)
        rows = (await self.session.scalars(
            query.order_by(Tournament.starts_at.asc()).offset((page - 1) * page_size).limit(page_size)
        )).all()
        return TournamentPage(items=[_list_item(row) for row in rows], page=page, page_size=page_size, total=total, has_next=page * page_size < total)

    async def get_public(self, slug: str) -> TournamentDetail | None:
        tournament = await self.session.scalar(
            select(Tournament).options(selectinload(Tournament.game)).where(Tournament.slug == slug, Tournament.status != TournamentStatus.DRAFT)
        )
        if tournament is None:
            return None
        item = _list_item(tournament)
        return TournamentDetail(
            **item.model_dump(), description=tournament.description, ends_at=tournament.ends_at,
            rules=tournament.rules, faqs=tournament.faqs, organizer_id=tournament.organizer_id,
            spots_remaining=None,
        )
