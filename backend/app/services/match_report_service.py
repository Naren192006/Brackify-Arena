"""Match report service for storing, validating, and updating tournament match scores."""

from __future__ import annotations

import datetime
from typing import Any

import httpx
from fastapi import HTTPException, status

from app.config import settings
from app.core.exceptions import AppError
from app.core.logging import get_logger

logger = get_logger(__name__)


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
    return datetime.datetime.now(datetime.UTC).isoformat()


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
) -> dict[str, Any]:
    url = _sb_url(table)
    headers = _supabase_headers(prefer="return=representation")
    try:
        r = await client.post(url, headers=headers, json=body)
        r.raise_for_status()
        data: Any = r.json()
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
) -> dict[str, Any]:
    url = _sb_url(table)
    headers = _supabase_headers(prefer="return=representation")
    try:
        r = await client.patch(url, headers=headers, params=params, json=body)
        r.raise_for_status()
        data: Any = r.json()
        return data[0] if isinstance(data, list) and data else {}
    except httpx.HTTPStatusError as exc:
        logger.error(
            "supabase_error",
            status=exc.response.status_code,
            body=exc.response.text,
            url=str(exc.request.url),
        )
        raise


async def submit_match_report(
    match_id: str,
    team1_score: int,
    team2_score: int,
    user_id: str,
    notes: str | None = None,
    evidence_url: str | None = None,
) -> dict[str, Any]:
    """Submit a match report for a live/scheduled match.

    Validates captain/admin authorization.
    """
    if team1_score < 0 or team2_score < 0 or team1_score == team2_score:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "invalid_score",
                "message": "Scores must be non-negative whole numbers and cannot be tied.",
            },
        )

    async with httpx.AsyncClient(timeout=15.0) as client:
        matches = await _sb_get(
            client,
            "matches",
            {
                "id": f"eq.{match_id}",
                "select": "id,tournament_id,status,team_a_id,team_b_id,round_id",
            },
        )
        if not matches:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"code": "match_not_found", "message": "Match not found."},
            )
        match_record = matches[0]

        if match_record.get("status") in ("completed", "cancelled"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    "code": "match_not_reportable",
                    "message": "Cannot submit report for completed or cancelled match.",
                },
            )

        team_a_id = match_record.get("team_a_id")
        team_b_id = match_record.get("team_b_id")
        tournament_id = match_record.get("tournament_id")

        if not isinstance(team_a_id, str) or not isinstance(team_b_id, str):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    "code": "teams_not_ready",
                    "message": "Both teams must be assigned before reporting score.",
                },
            )
        if not isinstance(tournament_id, str):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    "code": "invalid_match",
                    "message": "Match tournament ID is missing or invalid.",
                },
            )

        # 2. Check authorization: captain of team A, captain of team B, or tournament admin
        is_authorized = False

        # Check captaincy
        captains = await _sb_get(
            client,
            "teams",
            {"id": f"in.({team_a_id},{team_b_id})", "captain_id": f"eq.{user_id}", "select": "id"},
        )
        if captains:
            is_authorized = True

        if not is_authorized and tournament_id:
            # Check tournament admin
            admins = await _sb_get(
                client,
                "tournament_admins",
                {
                    "tournament_id": f"eq.{tournament_id}",
                    "user_id": f"eq.{user_id}",
                    "select": "user_id",
                },
            )
            if admins:
                is_authorized = True

        if not is_authorized:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "code": "unauthorized",
                    "message": (
                        "Only participating team captains or tournament admins can submit reports."
                    ),
                },
            )

        winner_team_id = team_a_id if team1_score > team2_score else team_b_id

        # 3. Create report in match_reports table
        report_payload = {
            "match_id": match_id,
            "team1_score": team1_score,
            "team2_score": team2_score,
            "winner_team_id": winner_team_id,
            "reported_by": user_id,
            "status": "submitted",
            "notes": notes,
            "evidence_url": evidence_url,
        }
        created_report = await _sb_post(client, "match_reports", report_payload)

        # 4. Update match status to awaiting_approval and update scores
        await _sb_patch(
            client,
            "matches",
            {"id": f"eq.{match_id}"},
            {
                "team1_score": team1_score,
                "team2_score": team2_score,
                "winner_team_id": winner_team_id,
                "reported_by": user_id,
                "reported_at": _now_iso(),
                "status": "awaiting_approval",
            },
        )

        # Broadcast realtime score_submitted event
        try:
            from app.services.realtime_service import broadcast_match_event

            await broadcast_match_event(
                tournament_id=tournament_id,
                event="score_submitted",
                match_id=match_id,
                team_a={"id": team_a_id, "score": team1_score},
                team_b={"id": team_b_id, "score": team2_score},
                score=f"{team1_score} - {team2_score}",
                winner={"id": winner_team_id},
                status="awaiting_approval",
                client=client,
            )
        except Exception as exc:
            logger.debug("realtime_score_submitted_broadcast_failed", error=str(exc))

        return created_report


async def get_reports_for_match(match_id: str) -> list[dict[str, Any]]:
    """Retrieve all reports submitted for a match."""
    async with httpx.AsyncClient(timeout=15.0) as client:
        reports = await _sb_get(
            client,
            "match_reports",
            {
                "match_id": f"eq.{match_id}",
                "order": "created_at.desc",
                "select": (
                    "id,match_id,reported_by,team1_score,team2_score,"
                    "winner_team_id,notes,evidence_url,status,created_at,updated_at"
                ),
            },
        )

        if not reports:
            return []

        # Enrich winner team details and reporter profile if possible
        team_ids = [r["winner_team_id"] for r in reports if r.get("winner_team_id")]
        teams_map: dict[str, dict[str, Any]] = {}
        if team_ids:
            teams = await _sb_get(
                client,
                "teams",
                {"id": f"in.({','.join(set(team_ids))})", "select": "id,name,tag"},
            )
            teams_map = {t["id"]: t for t in teams}

        for r in reports:
            if r.get("winner_team_id") in teams_map:
                r["winner_team"] = teams_map[r["winner_team_id"]]

        return reports


async def update_match_report(
    report_id: str,
    user_id: str,
    team1_score: int | None = None,
    team2_score: int | None = None,
    notes: str | None = None,
    evidence_url: str | None = None,
) -> dict[str, Any]:
    """Update a pending match report if caller is the original reporter or tournament admin."""
    async with httpx.AsyncClient(timeout=15.0) as client:
        reports = await _sb_get(
            client,
            "match_reports",
            {
                "id": f"eq.{report_id}",
                "select": (
                    "id,match_id,reported_by,status,team1_score,team2_score,notes,evidence_url"
                ),
            },
        )
        if not reports:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"code": "report_not_found", "message": "Match report not found."},
            )
        report = reports[0]

        if report.get("status") != "submitted":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    "code": "report_already_reviewed",
                    "message": "Cannot modify a report that has already been reviewed.",
                },
            )

        match_id = report.get("match_id")
        matches = await _sb_get(
            client,
            "matches",
            {"id": f"eq.{match_id}", "select": "id,tournament_id,status"},
        )
        if not matches:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"code": "match_not_found", "message": "Match not found."},
            )
        match_record = matches[0]

        # Permission check
        is_authorized = report.get("reported_by") == user_id
        if not is_authorized and match_record.get("tournament_id"):
            admins = await _sb_get(
                client,
                "tournament_admins",
                {
                    "tournament_id": f"eq.{match_record['tournament_id']}",
                    "user_id": f"eq.{user_id}",
                    "select": "user_id",
                },
            )
            if admins:
                is_authorized = True

        if not is_authorized:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "code": "unauthorized",
                    "message": "You are not authorized to modify this report.",
                },
            )

        update_payload: dict[str, Any] = {"updated_at": _now_iso()}
        if notes is not None:
            update_payload["notes"] = notes
        if evidence_url is not None:
            update_payload["evidence_url"] = evidence_url

        if team1_score is not None and team2_score is not None:
            if team1_score < 0 or team2_score < 0 or team1_score == team2_score:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail={
                        "code": "invalid_score",
                        "message": "Scores must be non-negative whole numbers and cannot be tied.",
                    },
                )
            team_a_id = match_record.get("team_a_id")
            team_b_id = match_record.get("team_b_id")
            winner_team_id = team_a_id if team1_score > team2_score else team_b_id

            update_payload["team1_score"] = team1_score
            update_payload["team2_score"] = team2_score
            update_payload["winner_team_id"] = winner_team_id

            # Sync match
            await _sb_patch(
                client,
                "matches",
                {"id": f"eq.{match_id}"},
                {
                    "team1_score": team1_score,
                    "team2_score": team2_score,
                    "winner_team_id": winner_team_id,
                },
            )

        updated_report = await _sb_patch(
            client,
            "match_reports",
            {"id": f"eq.{report_id}"},
            update_payload,
        )

        return updated_report


async def approve_match_report(
    report_id: str,
    admin_user_id: str,
) -> dict[str, Any]:
    """Approve a match report (Admin only).

    Sets report status to 'approved', syncs scores, sets match status
    to 'completed', and advances bracket!
    """
    async with httpx.AsyncClient(timeout=15.0) as client:
        reports = await _sb_get(
            client,
            "match_reports",
            {
                "id": f"eq.{report_id}",
                "select": "id,match_id,team1_score,team2_score,winner_team_id,notes",
            },
        )
        if not reports:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"code": "report_not_found", "message": "Match report not found."},
            )
        report = reports[0]
        match_id = report["match_id"]

        matches = await _sb_get(
            client,
            "matches",
            {"id": f"eq.{match_id}", "select": "id,tournament_id,team_a_id,team_b_id,status"},
        )
        if not matches:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"code": "match_not_found", "message": "Match not found."},
            )
        match_record = matches[0]

        from app.services.tournament_service import verify_admin_or_creator_auth

        await verify_admin_or_creator_auth(
            client, admin_user_id, match_record["tournament_id"], action_name="approve_match_report"
        )

        winner_id = report.get("winner_team_id")
        if not winner_id:
            s1 = report.get("team1_score") or 0
            s2 = report.get("team2_score") or 0
            winner_id = match_record.get("team_a_id") if s1 > s2 else match_record.get("team_b_id")

        now_ts = _now_iso()
        # 1. Mark report approved
        await _sb_patch(
            client,
            "match_reports",
            {"id": f"eq.{report_id}"},
            {"status": "approved", "reviewed_by": admin_user_id, "reviewed_at": now_ts},
        )

        # 2. Advance winner & complete match
        from app.services.match_service import advance_winner

        result = await advance_winner(
            match_id=match_id, winner_team_id=winner_id, user_id=admin_user_id
        )

        # 3. Update scores on match
        if report.get("team1_score") is not None and report.get("team2_score") is not None:
            await _sb_patch(
                client,
                "matches",
                {"id": f"eq.{match_id}"},
                {"team1_score": report["team1_score"], "team2_score": report["team2_score"]},
            )

        # Broadcast realtime score_verified event
        try:
            from app.services.realtime_service import broadcast_match_event

            await broadcast_match_event(
                tournament_id=match_record.get("tournament_id", ""),
                event="score_verified",
                match_id=match_id,
                team_a={"id": match_record.get("team_a_id"), "score": report.get("team1_score")},
                team_b={"id": match_record.get("team_b_id"), "score": report.get("team2_score")},
                score=f"{report.get('team1_score')} - {report.get('team2_score')}",
                winner={"id": winner_id},
                status="completed",
                client=client,
            )
        except Exception as exc:
            logger.debug("realtime_score_verified_broadcast_failed", error=str(exc))

        logger.info(
            "match_report_approved", report_id=report_id, match_id=match_id, winner_id=winner_id
        )
        return {
            "success": True,
            "report_id": report_id,
            "match_id": match_id,
            "status": "approved",
            **result,
        }


async def reject_match_report(
    report_id: str,
    admin_user_id: str,
    reason: str | None = None,
) -> dict[str, Any]:
    """Reject a match report (Admin only). Keeps match pending/live."""
    async with httpx.AsyncClient(timeout=15.0) as client:
        reports = await _sb_get(
            client,
            "match_reports",
            {"id": f"eq.{report_id}", "select": "id,match_id"},
        )
        if not reports:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"code": "report_not_found", "message": "Match report not found."},
            )
        report = reports[0]

        matches = await _sb_get(
            client,
            "matches",
            {"id": f"eq.{report['match_id']}", "select": "id,tournament_id"},
        )
        if matches:
            from app.services.tournament_service import verify_admin_or_creator_auth

            await verify_admin_or_creator_auth(
                client,
                admin_user_id,
                matches[0]["tournament_id"],
                action_name="reject_match_report",
            )

        await _sb_patch(
            client,
            "match_reports",
            {"id": f"eq.{report_id}"},
            {
                "status": "rejected",
                "reviewed_by": admin_user_id,
                "reviewed_at": _now_iso(),
                "admin_notes": reason or "Report rejected by administrator.",
            },
        )
        logger.info("match_report_rejected", report_id=report_id, admin_user_id=admin_user_id)
        return {"success": True, "report_id": report_id, "status": "rejected"}


async def request_resubmission(
    report_id: str,
    admin_user_id: str,
    notes: str | None = None,
) -> dict[str, Any]:
    """Request resubmission of match report (Admin only)."""
    async with httpx.AsyncClient(timeout=15.0) as client:
        reports = await _sb_get(
            client,
            "match_reports",
            {"id": f"eq.{report_id}", "select": "id,match_id"},
        )
        if not reports:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"code": "report_not_found", "message": "Match report not found."},
            )
        report = reports[0]

        matches = await _sb_get(
            client,
            "matches",
            {"id": f"eq.{report['match_id']}", "select": "id,tournament_id"},
        )
        if matches:
            from app.services.tournament_service import verify_admin_or_creator_auth

            await verify_admin_or_creator_auth(
                client,
                admin_user_id,
                matches[0]["tournament_id"],
                action_name="request_resubmission",
            )

        await _sb_patch(
            client,
            "match_reports",
            {"id": f"eq.{report_id}"},
            {
                "status": "resubmission_requested",
                "reviewed_by": admin_user_id,
                "reviewed_at": _now_iso(),
                "admin_notes": notes or "Please resubmit with clear scoreboard screenshots.",
            },
        )
        logger.info(
            "match_report_resubmit_requested", report_id=report_id, admin_user_id=admin_user_id
        )
        return {"success": True, "report_id": report_id, "status": "resubmission_requested"}
