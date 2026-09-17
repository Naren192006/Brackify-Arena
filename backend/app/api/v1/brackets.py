"""Tournament bracket generation endpoints.

Routes:
  POST /api/v1/brackets/generate — generate a single elimination bracket for a tournament
"""

from __future__ import annotations

import traceback
from typing import Any

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

from app.core.exceptions import AppError, app_error_to_http
from app.core.logging import get_logger
from app.services import bracket_service

logger = get_logger(__name__)

router = APIRouter(prefix="/brackets", tags=["brackets"])


# ---------------------------------------------------------------------------
# Request / response schemas
# ---------------------------------------------------------------------------


class GenerateBracketRequest(BaseModel):
    tournament_id: str = Field(..., min_length=1, description="UUID of the tournament")


class GenerateBracketResponse(BaseModel):
    tournament_id: str
    matches_count: int
    matches: list[dict[str, Any]]


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


def _handle_app_error(exc: AppError) -> HTTPException:
    http_exc = app_error_to_http(exc)
    return HTTPException(status_code=http_exc.status_code, detail=http_exc.detail)


@router.post(
    "/generate", response_model=GenerateBracketResponse, status_code=status.HTTP_201_CREATED
)
async def generate_bracket(body: GenerateBracketRequest) -> GenerateBracketResponse:
    """Generate a single-elimination tournament bracket and scheduled matches.

    1. Accepts tournament_id.
    2. Fetches paid/registered teams.
    3. Randomly shuffles teams.
    4. Pairs teams into Round 1 matches (status='scheduled').
    5. Inserts matches into database and returns created matches.
    """
    try:
        created_matches = await bracket_service.generate_automatic_bracket(
            tournament_id=body.tournament_id,
        )
    except AppError as exc:
        raise _handle_app_error(exc) from exc
    except HTTPException:
        raise
    except Exception as exc:
        traceback.print_exc()
        logger.exception("bracket_generation_failed", error=str(exc))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "code": "internal_error",
                "type": type(exc).__name__,
                "message": str(exc),
            },
        )

    return GenerateBracketResponse(
        tournament_id=body.tournament_id,
        matches_count=len(created_matches),
        matches=created_matches,
    )
