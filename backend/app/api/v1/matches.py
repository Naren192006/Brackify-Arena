from __future__ import annotations

from typing import Any

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from pydantic import BaseModel

from app.core.auth import AuthUser, get_current_auth_user, verify_admin_only_for_winner
from app.core.logging import get_logger
from app.services.match_service import (
    advance_winner,
    finish_match_service,
    get_match_detail_service,
    list_tournament_matches,
    pause_match_service,
    reset_match_service,
    set_match_winner_service,
    start_match_service,
)

logger = get_logger(__name__)

router = APIRouter(prefix="/matches", tags=["matches"])


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class SetWinnerRequest(BaseModel):
    winner_team_id: str | None = None
    winner_choice: str | None = None  # "team1" | "team2"
    user_id: str | None = None


class MatchActionResponse(BaseModel):
    success: bool
    match_id: str
    status: str
    winner_team_id: str | None = None
    advanced_to_round: int | None = None
    advanced_to_match: int | None = None
    is_final: bool | None = None
    champion_crowned: bool | None = None


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("", status_code=status.HTTP_200_OK)
async def get_matches(tournament_id: str = Query(..., description="Tournament UUID or slug")) -> list[dict[str, Any]]:
    """Fetch all matches for a tournament with joined team objects."""
    try:
        return await list_tournament_matches(tournament_id)
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("get_matches_failed", error=str(exc))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"error": "internal_server_error", "message": str(exc)},
        ) from exc


@router.get("/{match_id}", status_code=status.HTTP_200_OK)
async def get_match_detail(match_id: str) -> dict[str, Any]:
    """Fetch complete match details for player match experience."""
    try:
        return await get_match_detail_service(match_id)
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("get_match_detail_failed", error=str(exc))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"error": "internal_server_error", "message": str(exc)},
        ) from exc


@router.patch("/{match_id}/start", status_code=status.HTTP_200_OK)
@router.post("/{match_id}/start", status_code=status.HTTP_200_OK)
async def start_match(
    match_id: str,
    background_tasks: BackgroundTasks,
    current_user: AuthUser = Depends(get_current_auth_user),
) -> dict[str, Any]:
    """Start a match (status -> live). Validates JWT and requires admin/organizer."""
    try:
        await verify_admin_only_for_winner(match_id, current_user)
        result = await start_match_service(match_id, user_id=current_user.id)
        from app.tasks.analytics import update_analytics_task
        background_tasks.add_task(
            update_analytics_task,
            tournament_id=result.get("tournament_id", ""),
            event_type="match_started",
            payload={"match_id": match_id},
        )
        return result
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("start_match_failed", error=str(exc))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"error": "internal_server_error", "message": str(exc)},
        ) from exc


@router.post("/{match_id}/pause", status_code=status.HTTP_200_OK)
@router.patch("/{match_id}/pause", status_code=status.HTTP_200_OK)
async def pause_match(
    match_id: str,
    current_user: AuthUser = Depends(get_current_auth_user),
) -> dict[str, Any]:
    """Pause a match (status -> scheduled/paused). Validates JWT and requires admin/organizer."""
    try:
        await verify_admin_only_for_winner(match_id, current_user)
        return await pause_match_service(match_id, user_id=current_user.id)
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("pause_match_failed", error=str(exc))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"error": "internal_server_error", "message": str(exc)},
        ) from exc


@router.patch("/{match_id}/complete", status_code=status.HTTP_200_OK)
@router.post("/{match_id}/finish", status_code=status.HTTP_200_OK)
async def complete_match(
    match_id: str,
    background_tasks: BackgroundTasks,
    current_user: AuthUser = Depends(get_current_auth_user),
) -> dict[str, Any]:
    """Complete/finish a match (status -> completed). Validates JWT and requires admin/organizer."""
    try:
        await verify_admin_only_for_winner(match_id, current_user)
        result = await finish_match_service(match_id, user_id=current_user.id)
        from app.tasks.matches import generate_match_history_task
        background_tasks.add_task(
            generate_match_history_task,
            match_id=match_id,
            winner_team_id=result.get("winner_team_id"),
        )
        return result
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("finish_match_failed", error=str(exc))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"error": "internal_server_error", "message": str(exc)},
        ) from exc


@router.patch("/{match_id}/reset", status_code=status.HTTP_200_OK)
async def reset_match(
    match_id: str,
    current_user: AuthUser = Depends(get_current_auth_user),
) -> dict[str, Any]:
    """Reset a match (Admin only). Clears winner, timestamps, scores, and resets downstream slot."""
    try:
        await verify_admin_only_for_winner(match_id, current_user)
        return await reset_match_service(match_id, user_id=current_user.id)
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("reset_match_failed", error=str(exc))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"error": "internal_server_error", "message": str(exc)},
        ) from exc


@router.patch("/{match_id}/winner", status_code=status.HTTP_200_OK)
async def set_match_winner(
    match_id: str,
    payload: SetWinnerRequest,
    background_tasks: BackgroundTasks,
    current_user: AuthUser = Depends(get_current_auth_user),
) -> dict[str, Any]:
    """Set match winner, mark match completed, and automatically advance winner to the next round match.

    Security:
    - Validates Supabase JWT (HTTP 401 if missing/invalid).
    - Enforces Admin / Organizer only can update winners (HTTP 403 if unauthorized).
    - Never trusts frontend user_id — uses auth.uid() from verified JWT.
    """
    try:
        # Admin only can update winners
        await verify_admin_only_for_winner(match_id, current_user)

        result = await set_match_winner_service(
            match_id=match_id,
            winner_team_id=payload.winner_team_id,
            winner_choice=payload.winner_choice,
            user_id=current_user.id,
        )

        from app.tasks.analytics import update_analytics_task
        from app.tasks.matches import generate_match_history_task
        from app.tasks.notifications import send_team_notifications_task
        from app.tasks.tournaments import cleanup_tournament_task

        winner_id = result.get("winner_team_id") or payload.winner_team_id
        tournament_id = result.get("tournament_id")

        # 1. Asynchronously generate player match history (win/loss, RP change)
        background_tasks.add_task(
            generate_match_history_task,
            match_id=match_id,
            winner_team_id=winner_id,
        )

        # 2. Asynchronously notify winning team
        if winner_id:
            background_tasks.add_task(
                send_team_notifications_task,
                team_id=winner_id,
                title="Match Victory!",
                body="Your team won the match and has advanced to the next round!",
                notification_type="match_victory",
            )

        # 3. Asynchronously update tournament analytics
        if tournament_id:
            background_tasks.add_task(
                update_analytics_task,
                tournament_id=tournament_id,
                event_type="match_winner_decided",
                payload={"match_id": match_id, "winner_team_id": winner_id},
            )

            # 4. If champion crowned, run background tournament cleanup
            if result.get("champion_crowned") or result.get("is_final"):
                background_tasks.add_task(
                    cleanup_tournament_task,
                    tournament_id=tournament_id,
                    champion_team_id=winner_id,
                )

        return result
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("set_match_winner_failed", error=str(exc))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"error": "internal_server_error", "message": str(exc)},
        ) from exc


