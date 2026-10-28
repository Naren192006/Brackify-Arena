"""Brackify Arena — CloudOps Sentinel Monitoring Schemas (Phase 1).

Read-only response models for the admin monitoring summary endpoint.
All statuses are explicit: when a data source is not configured or not yet
recorded, the API reports `unconfigured` / `unavailable` — it never fabricates
metrics.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

MonitoringStatus = Literal[
    "ok",
    "degraded",
    "unavailable",
    "unconfigured",
    "disabled",
]


class MonitoringComponentResponse(BaseModel):
    """Health/enrichment status of a single monitoring component."""

    status: MonitoringStatus
    detail: str | None = None


class MonitoringPathCount(BaseModel):
    """Per-path HTTP request aggregate recorded by PrometheusMiddleware."""

    path: str
    requests: int
    errors: int = 0


class MonitoringMetricsResponse(BaseModel):
    """Aggregated HTTP request counts from the Prometheus middleware registry.

    `status` is `ok` only when real counters exist; otherwise `unavailable`
    and every metric field stays null/empty.
    """

    status: MonitoringStatus
    total_requests: int | None = None
    errors_5xx: int | None = None
    status_breakdown: dict[str, int] = Field(default_factory=dict)
    top_paths: list[MonitoringPathCount] = Field(default_factory=list)


class MonitoringSummaryResponse(BaseModel):
    """CloudOps Sentinel Phase 1 monitoring snapshot (read-only)."""

    generated_at: str
    overall_status: Literal["operational", "degraded"]
    environment: str
    components: dict[str, MonitoringComponentResponse]
    metrics: MonitoringMetricsResponse
