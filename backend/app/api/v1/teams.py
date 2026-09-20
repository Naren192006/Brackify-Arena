"""Teams Endpoints with Strict Input Validation."""

from __future__ import annotations

import re
import uuid
from typing import Any, cast

import httpx
from fastapi import APIRouter, Depends, HTTPException, status

from app.core.auth import AuthUser, get_current_auth_user
from app.core.logging import get_logger
from app.schemas.validation import CreateTeamInput
from app.services.tournament_service import _sb_url, _supabase_headers


def slugify(text: str) -> str:
    s = text.lower().strip()
    s = re.sub(r"[^\w\s-]", "", s)
    s = re.sub(r"[\s_-]+", "-", s)
    return s.strip("-")


logger = get_logger(__name__)

router = APIRouter(prefix="/teams", tags=["teams"])


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_team(
    payload: CreateTeamInput,
    current_user: AuthUser = Depends(get_current_auth_user),
) -> dict[str, Any]:
    """
    Create a team with strict validation.
    Generates a unique slug before inserting into Supabase.
    """

    # Allow only captain or super admin
    if str(payload.captain_id) != current_user.user_id and current_user.role != "super_admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "code": "forbidden",
                "message": "You can only create a team where you are the captain.",
            },
        )

    # Generate unique slug
    slug = f"{slugify(payload.team_name)}-{uuid.uuid4().hex[:6]}"

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                _sb_url("teams"),
                headers=_supabase_headers("return=representation"),
                json={
                    "name": payload.team_name,
                    "slug": slug,  # FIXED
                    "tag": payload.tag,
                    "captain_id": str(payload.captain_id),
                    "game": payload.game.value,
                },
            )

            if resp.status_code in (200, 201):
                data = resp.json()
                created = data[0] if isinstance(data, list) and data else data
                return {
                    "success": True,
                    "team": created,
                }

            logger.warning(
                "supabase_create_team_non200",
                status=resp.status_code,
                body=resp.text,
            )

            raise HTTPException(
                status_code=resp.status_code,
                detail=resp.text,
            )

    except HTTPException:
        raise

    except Exception as exc:
        logger.exception("supabase_create_team_failed", error=str(exc))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "code": "team_create_failed",
                "message": "Unable to create team.",
            },
        )


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
                    return cast(dict[str, Any], data[0])

    except Exception as exc:
        logger.warning("supabase_get_team_failed", error=str(exc))

    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail={
            "code": "team_not_found",
            "message": "Team not found",
        },
    )


@router.delete("/{team_id}", status_code=status.HTTP_200_OK)
async def delete_team(
    team_id: str,
    current_user: AuthUser = Depends(get_current_auth_user),
) -> dict[str, Any]:
    """Delete a team with captain verification and active tournament checks."""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                f"{_sb_url('teams')}?id=eq.{team_id}",
                headers=_supabase_headers(),
            )
            if resp.status_code != 200:
                raise HTTPException(
                    status_code=resp.status_code,
                    detail={"code": "team_not_found", "message": "Team not found"},
                )
            teams = resp.json()
            if not teams or not isinstance(teams, list) or len(teams) == 0:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail={"code": "team_not_found", "message": "Team not found"},
                )
            team = teams[0]

            if (
                str(team.get("captain_id")) != current_user.user_id
                and current_user.role != "super_admin"
            ):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail={
                        "code": "forbidden",
                        "message": "Only the team captain can delete this team",
                    },
                )

            reg_resp = await client.get(
                f"{_sb_url('tournament_registrations')}?team_id=eq.{team_id}",
                headers=_supabase_headers(),
            )
            if reg_resp.status_code == 200:
                registrations = reg_resp.json()
                for reg in registrations:
                    tourn_id = reg.get("tournament_id")
                    if tourn_id:
                        tourn_resp = await client.get(
                            f"{_sb_url('tournaments')}?id=eq.{tourn_id}",
                            headers=_supabase_headers(),
                        )
                        if tourn_resp.status_code == 200:
                            tourns = tourn_resp.json()
                            if tourns and isinstance(tourns, list) and len(tourns) > 0:
                                t = tourns[0]
                                s = str(t.get("status", "")).lower()
                                if s not in ("completed", "cancelled", "archived"):
                                    t_title = t.get("title")
                                    raise HTTPException(
                                        status_code=status.HTTP_400_BAD_REQUEST,
                                        detail={
                                            "code": "team_in_active_tournament",
                                            "message": (
                                                "Cannot delete a team that is registered in "
                                                f"an active tournament ('{t_title}')"
                                            ),
                                        },
                                    )

            del_resp = await client.delete(
                f"{_sb_url('teams')}?id=eq.{team_id}",
                headers=_supabase_headers("return=representation"),
            )
            if del_resp.status_code not in (200, 204):
                raise HTTPException(
                    status_code=del_resp.status_code,
                    detail=del_resp.text,
                )
            del_data = del_resp.json() if del_resp.content else [team]
            deleted_team = del_data[0] if isinstance(del_data, list) and del_data else team

            return {
                "success": True,
                "message": "Team deleted successfully",
                "team": deleted_team,
            }
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("supabase_delete_team_failed", error=str(exc))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "code": "team_delete_failed",
                "message": "Unable to delete team.",
            },
        )
