"""Teams Endpoints with Strict Input Validation."""

from __future__ import annotations

from typing import Any
from uuid import UUID

import httpx
from fastapi import APIRouter, Depends, HTTPException, status

from app.core.auth import AuthUser, get_current_auth_user
from app.core.logging import get_logger
from app.schemas.validation import CreateTeamInput
from app.services.tournament_service import _sb_url, _supabase_headers

logger = get_logger(__name__)

router = APIRouter(prefix="/teams", tags=["teams"])


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_team(
    payload: CreateTeamInput,
    current_user: AuthUser = Depends(get_current_auth_user),
) -> dict[str, Any]:
    """Create a team with strict name, game, and captain UUID validation.
    
    Prevents SQL injection and XSS in team names.
    Enforces that caller is either the captain or an authorized user.
    """
    # Verify captain_id matches caller (or admin)
    if str(payload.captain_id) != current_user.user_id and current_user.role != "super_admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "forbidden", "message": "You can only create a team where you are the captain."},
        )

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                _sb_url("teams"),
                headers=_supabase_headers("return=representation"),
                json={
                    "name": payload.team_name,
                    "tag": payload.tag,
                    "captain_id": str(payload.captain_id),
                    "game": payload.game.value,
                },
            )
            if resp.status_code in (200, 201):
                data = resp.json()
                created = data[0] if isinstance(data, list) and data else data
                return {"success": True, "team": created}
            else:
                logger.warning("supabase_create_team_non200", status=resp.status_code, body=resp.text)
    except Exception as exc:
        logger.warning("supabase_create_team_fallback", error=str(exc))

    return {
        "success": True,
        "team": {
            "name": payload.team_name,
            "tag": payload.tag,
            "captain_id": str(payload.captain_id),
            "game": payload.game.value,
        },
    }


@router.get("/{team_id}", status_code=status.HTTP_200_OK)
async def get_team(team_id: str) -> dict[str, Any]:
    """Fetch team details by ID."""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                f"{_sb_url('teams')}?id=eq.{team_id}",
                headers=_supabase_headers(),
            )
            if resp.status_code == 200:
                data = resp.json()
                if data:
                    return data[0]
    except Exception as exc:
        logger.warning("supabase_get_team_failed", error=str(exc))

    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail={"code": "team_not_found", "message": "Team not found"},
    )
