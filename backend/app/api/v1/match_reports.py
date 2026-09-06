"""Match reports API endpoints.

Routes:
  POST /api/v1/match-reports/submit      — submit a score report for a match
  GET  /api/v1/match-reports/match/{id}  — get all score reports for a match
  PATCH /api/v1/match-reports/{id}       — update a pending score report
"""

from __future__ import annotations

import traceback
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.core.auth import AuthUser, get_current_auth_user
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
    team1_score: int = Field(default=0, ge=0, description="Score for Team 1")
    team2_score: int = Field(default=0, ge=0, description="Score for Team 2")
    user_id: str | None = Field(default=None, description="Optional caller user ID; verified auth.uid() is enforced")
    notes: str | None = Field(default=None, description="Optional match notes or context")
    evidence_url: str | None = Field(default=None, description="Optional link to screenshot/VOD")
    screenshot_urls: list[str] | None = Field(default=None, description="List of uploaded screenshot URLs")
    reporter_registration_id: str | None = Field(default=None, description="Registration ID of the reporting captain")


class ReviewReportActionRequest(BaseModel):
    reason: str | None = None
    notes: str | None = None


class UpdateMatchReportRequest(BaseModel):
    user_id: str | None = Field(default=None, description="Optional caller user ID; verified auth.uid() is enforced")
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


@router.post("", status_code=status.HTTP_201_CREATED)
@router.post("/submit", status_code=status.HTTP_201_CREATED)
async def submit_report(
    body: SubmitMatchReportRequest,
    current_user: AuthUser = Depends(get_current_auth_user),
) -> dict[str, Any]:
    """Submit a match score report. Validates Supabase JWT and enforces auth.uid()."""
    try:
        # Merge screenshot_urls into evidence_url if provided
        final_evidence = body.evidence_url
        if not final_evidence and body.screenshot_urls:
            final_evidence = ",".join(body.screenshot_urls)

        result = await match_report_service.submit_match_report(
            match_id=body.match_id,
            team1_score=body.team1_score,
            team2_score=body.team2_score,
            user_id=current_user.id,
            notes=body.notes,
            evidence_url=final_evidence,
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


@router.patch("/{report_id}/approve", status_code=status.HTTP_200_OK)
@router.post("/{report_id}/approve", status_code=status.HTTP_200_OK)
async def approve_report(
    report_id: str,
    current_user: AuthUser = Depends(get_current_auth_user),
) -> dict[str, Any]:
    """Approve match report (Admin only). Sets winner, completes match, and advances bracket."""
    try:
        return await match_report_service.approve_match_report(
            report_id=report_id,
            admin_user_id=current_user.id,
        )
    except AppError as exc:
        raise _handle_app_error(exc) from exc
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("approve_report_failed", error=str(exc))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"code": "internal_error", "message": "Failed to approve report."},
        )


@router.patch("/{report_id}/reject", status_code=status.HTTP_200_OK)
@router.post("/{report_id}/reject", status_code=status.HTTP_200_OK)
async def reject_report(
    report_id: str,
    body: ReviewReportActionRequest | None = None,
    current_user: AuthUser = Depends(get_current_auth_user),
) -> dict[str, Any]:
    """Reject match report (Admin only). Keeps match pending."""
    try:
        reason = body.reason if body else None
        return await match_report_service.reject_match_report(
            report_id=report_id,
            admin_user_id=current_user.id,
            reason=reason,
        )
    except AppError as exc:
        raise _handle_app_error(exc) from exc
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("reject_report_failed", error=str(exc))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"code": "internal_error", "message": "Failed to reject report."},
        )


@router.patch("/{report_id}/resubmit", status_code=status.HTTP_200_OK)
@router.post("/{report_id}/resubmit", status_code=status.HTTP_200_OK)
async def resubmit_report(
    report_id: str,
    body: ReviewReportActionRequest | None = None,
    current_user: AuthUser = Depends(get_current_auth_user),
) -> dict[str, Any]:
    """Request resubmission of match report (Admin only)."""
    try:
        notes = body.notes if body else (body.reason if body else None)
        return await match_report_service.request_resubmission(
            report_id=report_id,
            admin_user_id=current_user.id,
            notes=notes,
        )
    except AppError as exc:
        raise _handle_app_error(exc) from exc
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("resubmit_report_failed", error=str(exc))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"code": "internal_error", "message": "Failed to request resubmission."},
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
async def update_report(
    report_id: str,
    body: UpdateMatchReportRequest,
    current_user: AuthUser = Depends(get_current_auth_user),
) -> dict[str, Any]:
    """Update a pending match score report. Validates Supabase JWT and enforces auth.uid()."""
    try:
        return await match_report_service.update_match_report(
            report_id=report_id,
            user_id=current_user.id,
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

