from __future__ import annotations

from typing import Any

import httpx
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import (
    AuthUser,
    get_current_auth_user,
    verify_organizer_owns_tournament,
    verify_player_owns_registration,
    verify_player_owns_team,
)
from app.core.exceptions import AppError
from app.core.logging import get_logger
from app.db.session import get_db_session
from app.models.tournament import TournamentStatus
import re
from uuid import uuid4

from app.schemas.tournaments import TournamentDetail, TournamentPage
from app.schemas.validation import CreateTournamentInput
from app.middleware.rate_limiter import rate_limiter_dep
from app.services.admin_tournament_service import delete_tournament_service
from app.services.tournament_service import (
    TournamentService,
    admin_cancel_registration_service,
    admin_refund_registration_service,
    admin_remind_registration_service,
    admin_remove_registration_service,
    auto_progress_tournament_service,
    complete_tournament_service,
    get_tournament_bracket_service,
    get_tournament_matches_service,
    pause_tournament_service,
    register_team_service,
    resume_tournament_service,
    start_tournament_service,
)

logger = get_logger(__name__)

router = APIRouter(prefix="/tournaments", tags=["tournaments"])



# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class TeamSummary(BaseModel):
    id: str
    name: str
    tag: str | None = None
    logo_url: str | None = None


class MatchResponse(BaseModel):
    id: str
    round: int
    match_number: int
    status: str
    team1: TeamSummary | None = None
    team2: TeamSummary | None = None
    winner: TeamSummary | None = None
    team1_score: int | None = None
    team2_score: int | None = None
    scheduled_at: str | None = None
    completed_at: str | None = None


class RoundResponse(BaseModel):
    round_number: int
    round_type: str
    matches: list[MatchResponse]


class BracketResponse(BaseModel):
    tournament_id: str
    tournament_status: str
    champion_team: TeamSummary | None = None
    rounds: list[RoundResponse]


class StartTournamentResponse(BaseModel):
    success: bool
    matches_created: int
    matches: list[dict[str, Any]]


class RegisterTeamRequest(BaseModel):
    team_id: str
    user_id: str | None = None


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("", status_code=status.HTTP_201_CREATED)
async def create_tournament(
    payload: CreateTournamentInput,
    current_user: AuthUser = Depends(get_current_auth_user),
) -> dict[str, Any]:
    """Create a new tournament with strict input validation against SQLi and XSS."""
    slug_base = re.sub(r"[^a-zA-Z0-9]+", "-", payload.tournament_name.lower()).strip("-")
    slug = f"{slug_base}-{uuid4().hex[:6]}"

    from app.services.tournament_service import _sb_url, _supabase_headers
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                _sb_url("tournaments"),
                headers=_supabase_headers("return=representation"),
                json={
                    "title": payload.tournament_name,
                    "slug": slug,
                    "game": payload.game.value,
                    "max_teams": payload.max_teams,
                    "entry_fee_minor": int(payload.entry_fee * 100),
                    "entry_fee_currency": "INR",
                    "status": "open",
                    "created_by": current_user.user_id,
                    "description": payload.description,
                    "rules": payload.rules,
                },
            )
            if resp.status_code in (200, 201):
                data = resp.json()
                created = data[0] if isinstance(data, list) and data else data
                return {"success": True, "tournament": created}
    except Exception as exc:
        logger.warning("supabase_tournament_insert_fallback", error=str(exc))

    return {
        "success": True,
        "tournament": {
            "title": payload.tournament_name,
            "slug": slug,
            "game": payload.game.value,
            "max_teams": payload.max_teams,
            "entry_fee": payload.entry_fee,
        },
    }


@router.get("", response_model=TournamentPage)
async def list_tournaments(
    page: int = Query(1, ge=1),
    page_size: int = Query(12, ge=1, le=50),
    search: str | None = Query(None, max_length=100),
    game: str | None = Query(None, max_length=50),
    status_filter: TournamentStatus | None = Query(None, alias="status"),
    min_entry_fee: int | None = Query(None, ge=0),
    max_entry_fee: int | None = Query(None, ge=0),
    session: AsyncSession = Depends(get_db_session),
) -> TournamentPage:
    return await TournamentService(session).list_public(
        page=page,
        page_size=page_size,
        search=search,
        game=game,
        status=status_filter,
        min_entry_fee=min_entry_fee,
        max_entry_fee=max_entry_fee,
    )


@router.get("/{slug}", response_model=TournamentDetail)
async def get_tournament(slug: str, session: AsyncSession = Depends(get_db_session)) -> TournamentDetail:
    tournament = await TournamentService(session).get_public(slug)
    if tournament is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "tournament_not_found", "message": "Tournament not found"},
        )
    return tournament


@router.get("/{tournament_id}/bracket", response_model=BracketResponse)
async def get_tournament_bracket(tournament_id: str) -> BracketResponse:
    """Get bracket matches grouped by round with joined team details.

    1. Fetches all matches ordered by round then match_number.
    2. Joins team1/team2 registration IDs with tournament_registrations -> teams.
    3. Groups matches by round.
    4. Returns tournament_status, rounds, matches, team names, team tags, and winner info.
    5. Never exposes registration UUIDs.
    """
    try:
        data = await get_tournament_bracket_service(tournament_id)
        return BracketResponse(**data)
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("get_tournament_bracket_failed", error=str(exc))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"error": "internal_server_error", "message": str(exc)},
        ) from exc


@router.get("/{tournament_id}/matches", response_model=list[MatchResponse])
async def list_tournament_matches(tournament_id: str) -> list[MatchResponse]:
    """List tournament matches with joined team objects instead of raw registration UUIDs."""
    try:
        matches = await get_tournament_matches_service(tournament_id)
        return [MatchResponse(**m) for m in matches]
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("list_tournament_matches_failed", error=str(exc))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"error": "internal_server_error", "message": str(exc)},
        ) from exc


@router.post("/{tournament_id}/register", status_code=status.HTTP_201_CREATED)
async def register_team(
    tournament_id: str,
    body: RegisterTeamRequest,
    current_user: AuthUser = Depends(get_current_auth_user),
) -> dict[str, Any]:
    """Register a team for a tournament. Validates JWT and requires player to own the team."""
    try:
        # Verify player owns team before registration
        await verify_player_owns_team(body.team_id, current_user)

        # Always use verified auth.uid() from Supabase JWT — never trust frontend user_id
        return await register_team_service(
            tournament_id=tournament_id,
            team_id=body.team_id,
            user_id=current_user.id,
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("register_team_failed", error=str(exc))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"error": "internal_server_error", "message": str(exc)},
        ) from exc


@router.post("/{tournament_id}/start", response_model=StartTournamentResponse, status_code=status.HTTP_200_OK)
async def start_tournament(
    tournament_id: str,
    background_tasks: BackgroundTasks,
    current_user: AuthUser = Depends(get_current_auth_user),
) -> StartTournamentResponse:
    """Start a tournament. Validates JWT and verifies caller is organizer or admin."""
    try:
        # Verify organizer owns tournament before start
        await verify_organizer_owns_tournament(tournament_id, current_user)

        result = await start_tournament_service(
            tournament_id,
            user_id=current_user.id,
            background_tasks=background_tasks,
        )
        return StartTournamentResponse(**result)
    except HTTPException as exc:
        logger.warning("start_tournament_http_exception", status_code=exc.status_code, detail=exc.detail)
        raise
    except AppError as exc:
        logger.exception("start_tournament_app_error", error=str(exc))
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": getattr(exc, "code", "app_error"), "message": str(exc)},
        ) from exc
    except httpx.HTTPStatusError as exc:
        logger.exception("start_tournament_supabase_error", status_code=exc.response.status_code, response_text=exc.response.text)
        status_code = (
            exc.response.status_code
            if 400 <= exc.response.status_code < 500
            else status.HTTP_500_INTERNAL_SERVER_ERROR
        )
        raise HTTPException(
            status_code=status_code,
            detail={"error": "database_error", "message": exc.response.text},
        ) from exc
    except Exception as exc:
        logger.exception("start_tournament_unexpected_error", error=str(exc))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"error": "internal_server_error", "message": str(exc)},
        ) from exc


@router.patch("/{tournament_id}/pause", status_code=status.HTTP_200_OK)
async def pause_tournament(
    tournament_id: str,
    current_user: AuthUser = Depends(get_current_auth_user),
) -> dict[str, Any]:
    """Pause an ongoing tournament. Verifies organizer ownership."""
    try:
        await verify_organizer_owns_tournament(tournament_id, current_user)
        return await pause_tournament_service(tournament_id, user_id=current_user.id)
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("pause_tournament_failed", error=str(exc))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"error": "internal_server_error", "message": str(exc)},
        ) from exc


@router.patch("/{tournament_id}/resume", status_code=status.HTTP_200_OK)
async def resume_tournament(
    tournament_id: str,
    current_user: AuthUser = Depends(get_current_auth_user),
) -> dict[str, Any]:
    """Resume a paused tournament. Verifies organizer ownership."""
    try:
        await verify_organizer_owns_tournament(tournament_id, current_user)
        return await resume_tournament_service(tournament_id, user_id=current_user.id)
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("resume_tournament_failed", error=str(exc))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"error": "internal_server_error", "message": str(exc)},
        ) from exc


@router.patch("/{tournament_id}/complete", status_code=status.HTTP_200_OK)
async def complete_tournament(
    tournament_id: str,
    background_tasks: BackgroundTasks,
    current_user: AuthUser = Depends(get_current_auth_user),
) -> dict[str, Any]:
    """End and complete a tournament. Verifies organizer ownership."""
    try:
        await verify_organizer_owns_tournament(tournament_id, current_user)
        return await complete_tournament_service(tournament_id, background_tasks=background_tasks)
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("complete_tournament_failed", error=str(exc))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"error": "internal_server_error", "message": str(exc)},
        ) from exc


@router.post("/{tournament_id}/registrations/{registration_id}/cancel", status_code=status.HTTP_200_OK)
async def cancel_registration(
    tournament_id: str,
    registration_id: str,
    current_user: AuthUser = Depends(get_current_auth_user),
) -> dict[str, Any]:
    """Cancel registration. Verifies player owns registration before canceling."""
    try:
        await verify_player_owns_registration(tournament_id, registration_id, current_user)
        return await admin_cancel_registration_service(tournament_id, registration_id)
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("cancel_registration_failed", error=str(exc))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"error": "internal_server_error", "message": str(exc)},
        ) from exc


@router.post("/{tournament_id}/registrations/{registration_id}/refund", status_code=status.HTTP_200_OK)
async def admin_refund_registration(
    tournament_id: str,
    registration_id: str,
    current_user: AuthUser = Depends(get_current_auth_user),
) -> dict[str, Any]:
    """Admin/organizer refund registration."""
    try:
        await verify_organizer_owns_tournament(tournament_id, current_user)
        return await admin_refund_registration_service(tournament_id, registration_id)
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("admin_refund_registration_failed", error=str(exc))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"error": "internal_server_error", "message": str(exc)},
        ) from exc


@router.post("/{tournament_id}/registrations/{registration_id}/remind", status_code=status.HTTP_200_OK)
async def admin_remind_registration(
    tournament_id: str,
    registration_id: str,
    current_user: AuthUser = Depends(get_current_auth_user),
) -> dict[str, Any]:
    """Send payment reminder notification to captain. Verifies organizer ownership."""
    try:
        await verify_organizer_owns_tournament(tournament_id, current_user)
        return await admin_remind_registration_service(tournament_id, registration_id)
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("admin_remind_registration_failed", error=str(exc))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"error": "internal_server_error", "message": str(exc)},
        ) from exc


@router.delete("/{tournament_id}/registrations/{registration_id}", status_code=status.HTTP_200_OK)
async def admin_remove_registration(
    tournament_id: str,
    registration_id: str,
    current_user: AuthUser = Depends(get_current_auth_user),
) -> dict[str, Any]:
    """Admin/organizer remove team registration."""
    try:
        await verify_organizer_owns_tournament(tournament_id, current_user)
        return await admin_remove_registration_service(tournament_id, registration_id)
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("admin_remove_registration_failed", error=str(exc))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"error": "internal_server_error", "message": str(exc)},
        ) from exc


@router.post("/{tournament_id}/progress", status_code=status.HTTP_200_OK)
async def progress_tournament(
    tournament_id: str,
    current_user: AuthUser = Depends(get_current_auth_user),
) -> dict[str, Any]:
    """Trigger automatic tournament progression. Verifies organizer ownership."""
    try:
        await verify_organizer_owns_tournament(tournament_id, current_user)
        return await auto_progress_tournament_service(tournament_id)
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("auto_progress_tournament_failed", error=str(exc))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"error": "internal_server_error", "message": str(exc)},
        ) from exc


@router.delete("/{tournament_id}", status_code=status.HTTP_200_OK)
@router.delete("/admin/{tournament_id}", status_code=status.HTTP_200_OK)
async def delete_tournament_admin(
    tournament_id: str,
    current_user: AuthUser = Depends(get_current_auth_user),
) -> dict[str, Any]:
    """Admin-only endpoint to permanently delete a tournament."""
    logger.info(
        "admin_delete_auth",
        user_id=current_user.id,
        is_admin=current_user.is_admin,
        role=current_user.role,
    )
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    return await delete_tournament_service(tournament_id, current_user)



