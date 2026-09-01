"""Match reports API endpoints.

Routes:
  POST /api/v1/match-reports/submit      — submit a score report for a match
  GET  /api/v1/match-reports/match/{id}  — get all score reports for a match
  PATCH /api/v1/match-reports/{id}       — update a pending score report
"""

from __future__ import annotations

import traceback
from typing import Any

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

from app.core.exceptions import AppError, app_error_to_http
from app.core.logging import get_logger
from app.services import match_report_service

logger = get_logger(__name__)

router = APIRouter(prefix="/match-reports", tags=["match-reports"])


# ---------------------------------------------------------------------------
# Request / Response Schemas
# ---------------------------------------------------------------------------

class SubmitMatchReportRequest(BaseModel):
    match_id: str = Field(..., min_length=1, description="UUID of the match")
    team1_score: int = Field(..., ge=0, description="Score for Team 1")
    team2_score: int = Field(..., ge=0, description="Score for Team 2")
    user_id: str = Field(..., min_length=1, description="Supabase auth.uid() of the submitter")
    notes: str | None = Field(default=None, description="Optional match notes or context")
    evidence_url: str | None = Field(default=None, description="Optional link to screenshot/VOD")


class UpdateMatchReportRequest(BaseModel):
    user_id: str = Field(..., min_length=1, description="Supabase auth.uid() of the editor")
    team1_score: int | None = Field(default=None, ge=0, description="Updated score for Team 1")
    team2_score: int | None = Field(default=None, ge=0, description="Updated score for Team 2")
    notes: str | None = Field(default=None, description="Updated match notes")
    evidence_url: str | None = Field(default=None, description="Updated screenshot/VOD URL")


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

def _handle_app_error(exc: AppError) -> HTTPException:
    http_exc = app_error_to_http(exc)
    return HTTPException(status_code=http_exc.status_code, detail=http_exc.detail)


@router.post("/submit", status_code=status.HTTP_201_CREATED)
async def submit_report(body: SubmitMatchReportRequest) -> dict[str, Any]:
    """Submit a match score report."""
    try:
        result = await match_report_service.submit_match_report(
            match_id=body.match_id,
            team1_score=body.team1_score,
            team2_score=body.team2_score,
            user_id=body.user_id,
            notes=body.notes,
            evidence_url=body.evidence_url,
        )
        return result
    except AppError as exc:
        raise _handle_app_error(exc) from exc
    except HTTPException:
        raise
    except Exception as exc:
        traceback.print_exc()
        logger.exception("submit_match_report_failed", error=str(exc))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"code": "internal_error", "message": "Failed to submit match report."},
        )


@router.get("/match/{match_id}", status_code=status.HTTP_200_OK)
async def get_match_reports(match_id: str) -> list[dict[str, Any]]:
    """Retrieve all reports for a specific match."""
    try:
        return await match_report_service.get_reports_for_match(match_id)
    except AppError as exc:
        raise _handle_app_error(exc) from exc
    except HTTPException:
        raise
    except Exception as exc:
        traceback.print_exc()
        logger.exception("get_match_reports_failed", error=str(exc))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"code": "internal_error", "message": "Failed to load match reports."},
        )


@router.patch("/{report_id}", status_code=status.HTTP_200_OK)
async def update_report(report_id: str, body: UpdateMatchReportRequest) -> dict[str, Any]:
    """Update a pending match score report."""
    try:
        return await match_report_service.update_match_report(
            report_id=report_id,
            user_id=body.user_id,
            team1_score=body.team1_score,
            team2_score=body.team2_score,
            notes=body.notes,
            evidence_url=body.evidence_url,
        )
    except AppError as exc:
        raise _handle_app_error(exc) from exc
    except HTTPException:
        raise
    except Exception as exc:
        traceback.print_exc()
        logger.exception("update_match_report_failed", error=str(exc))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"code": "internal_error", "message": "Failed to update match report."},
        )

