"""Brackify Arena — CloudOps Sentinel Admin Monitoring API (Phase 1).

Read-only monitoring summary for platform administrators.

SECURITY: strictly protected by the existing isolated Admin session
authentication (`get_current_admin`) — no new authentication mechanism is
introduced, and Supabase player tokens are never accepted. The router carries
the same `verify_admin_csrf` dependency as the /admin operations router; this
Phase 1 router is strictly read-only (GET), so CSRF passes through untouched,
but any future mutating route here inherits the token requirement.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, status

from app.core.admin_auth import AdminUser, get_current_admin, verify_admin_csrf
from app.core.logging import get_logger
from app.schemas.monitoring import MonitoringSummaryResponse
from app.services.monitoring_service import get_monitoring_summary_service

logger = get_logger(__name__)

router = APIRouter(
    prefix="/admin/monitoring",
    tags=["admin-monitoring"],
    dependencies=[Depends(verify_admin_csrf)],
)


@router.get(
    "/summary",
    response_model=MonitoringSummaryResponse,
    status_code=status.HTTP_200_OK,
)
async def get_monitoring_summary_route(
    current_admin: AdminUser = Depends(get_current_admin),
) -> dict[str, Any]:
    """Return a read-only monitoring snapshot for authenticated admins.

    Aggregates backend health, database/Redis readiness, live Prometheus HTTP
    request counters, and the explicit Phase 1 AWS integration status. Never
    exposes raw logs, secrets, or non-admin data.
    """
    summary = await get_monitoring_summary_service()
    logger.info(
        "admin_monitoring_summary_request",
        admin_id=current_admin.id,
        overall_status=summary["overall_status"],
    )
    return summary
