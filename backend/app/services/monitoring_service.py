"""Brackify Arena — CloudOps Sentinel Monitoring Service (Phase 1).

Read-only aggregation of backend health, dependency readiness, and live HTTP
request counters from the Prometheus middleware registry (the same counters
`GET /metrics` exposes).

Explicit honesty rules:
- No recorded HTTP metrics yet -> request metrics are `unavailable`, never
  fabricated.
- AWS CloudWatch / SageMaker / S3 integrations are intentionally NOT wired in
  Phase 1 and are reported as `unconfigured`.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any, Literal

from prometheus_client import REGISTRY
from sqlalchemy import text

from app.cache.redis_client import ping_redis
from app.config import settings
from app.core.logging import get_logger
from app.db.session import get_db_session
from app.schemas.monitoring import MonitoringStatus

logger = get_logger(__name__)


def _aws_cloudwatch_component() -> tuple[MonitoringStatus, str | None]:
    """Honest CloudWatch publisher status for the monitoring summary (Phase 2).

    Reporting contract:
    - `disabled` — AWS_CLOUDWATCH_ENABLED=false (local dev never touches AWS).
    - `unconfigured` — boto3 missing, or enabled but credentials/region/permission
      problems prevented any successful publish.
    - `degraded` — enabled but the last publish attempt failed transiently.
    - `ok` — ONLY after a real, successful PutMetricData call. Credentials
      merely existing are never enough to report healthy.

    Lazy import: the publisher imports collect_http_metrics from this module.
    AWS availability never affects overall_status, health endpoints, or login.
    """
    from app.services import cloudwatch_publisher as cwp

    if cwp.boto3 is None:
        return (
            "unconfigured",
            "AWS CloudWatch integration is enabled but boto3 is not installed.",
        )
    publisher = cwp.get_cloudwatch_publisher()
    if publisher is None:
        return (
            "disabled",
            (
                "AWS CloudWatch publishing is off (AWS_CLOUDWATCH_ENABLED=false). "
                "Phase 1 telemetry still exposes real local Prometheus counters."
            ),
        )
    return publisher.get_status()


async def check_database_ready() -> tuple[bool, str | None]:
    """Verify primary database connectivity via lightweight query.

    Mirrors the readiness logic in app.main (_check_db_health) so monitoring
    never diverges from what the health endpoints report.
    """
    try:
        async for session in get_db_session():
            await session.execute(text("SELECT 1"))
        return True, None
    except Exception as exc:
        logger.warning("monitoring_db_check_failed", error=str(exc))
        return False, str(exc)


def collect_http_metrics() -> dict[str, Any] | None:
    """Collect real HTTP request counters recorded by PrometheusMiddleware.

    Counters are cumulative since process start — this is an honest aggregate
    view, not a time series. Returns None when no requests have been recorded
    yet or when the collector fails; never returns invented numbers.
    """
    total = 0
    errors_5xx = 0
    status_counts: dict[str, int] = {}
    path_counts: dict[str, int] = {}
    path_errors: dict[str, int] = {}

    # NOTE: prometheus_client strips the `_total` suffix from a Counter's
    # FAMILY name — the middleware Counter registered as "http_requests_total"
    # is collected under family name "http_requests". The samples keep the
    # "http_requests_total" name. Matching the family by "http_requests_total"
    # therefore never matched and reported `unavailable` forever.
    try:
        for metric in REGISTRY.collect():
            if metric.name != "http_requests":
                continue
            for sample in metric.samples:
                if sample.name != "http_requests_total":
                    continue
                labels = sample.labels
                value = int(sample.value)
                code = str(labels.get("status", "unknown"))
                path = str(labels.get("path", "unknown"))
                total += value
                status_counts[code] = status_counts.get(code, 0) + value
                path_counts[path] = path_counts.get(path, 0) + value
                if code.startswith("5"):
                    errors_5xx += value
                    path_errors[path] = path_errors.get(path, 0) + value
    except Exception as exc:
        logger.warning("monitoring_metrics_collection_failed", error=str(exc))
        return None

    if total <= 0:
        return None

    top_paths = sorted(path_counts.items(), key=lambda item: item[1], reverse=True)[:10]
    return {
        "total_requests": total,
        "errors_5xx": errors_5xx,
        "status_breakdown": status_counts,
        "top_paths": [
            {
                "path": path,
                "requests": count,
                "errors": path_errors.get(path, 0),
            }
            for path, count in top_paths
        ],
    }


async def get_monitoring_summary_service() -> dict[str, Any]:
    """Build the read-only CloudOps Sentinel Phase 1 summary."""
    db_ok, db_error = await check_database_ready()

    redis_status: MonitoringStatus
    redis_detail: str | None
    if settings.redis_enabled:
        redis_ok = await ping_redis()
        redis_status = "ok" if redis_ok else "degraded"
        redis_detail = (
            None if redis_ok else "Redis is enabled but did not answer PING."
        )
    else:
        redis_status = "disabled"
        redis_detail = "Redis cache disabled by configuration (REDIS_ENABLED=false)."

    raw_metrics = collect_http_metrics()
    aws_status, aws_detail = _aws_cloudwatch_component()

    components: dict[str, dict[str, str | None]] = {
        "app": {
            "status": "ok",
            "detail": f"{settings.app_name} API is serving responses.",
        },
        "database": {
            "status": "ok" if db_ok else "unavailable",
            "detail": (
                "SELECT 1 ping succeeded."
                if db_ok
                else f"Database ping failed: {db_error}"
            ),
        },
        "redis": {"status": redis_status, "detail": redis_detail},
        "request_metrics": {
            "status": "ok" if raw_metrics else "unavailable",
            "detail": (
                None
                if raw_metrics
                else "No HTTP requests recorded yet (or Prometheus collector "
                "unavailable). Cumulative requests-by-status will appear once "
                "traffic flows."
            ),
        },
        "aws_cloudwatch": {"status": aws_status, "detail": aws_detail},
    }

    overall: Literal["operational", "degraded"] = (
        "operational"
        if db_ok and redis_status in ("ok", "disabled")
        else "degraded"
    )

    if raw_metrics:
        metrics_payload: dict[str, Any] = {
            "status": "ok",
            "total_requests": raw_metrics["total_requests"],
            "errors_5xx": raw_metrics["errors_5xx"],
            "status_breakdown": raw_metrics["status_breakdown"],
            "top_paths": raw_metrics["top_paths"],
        }
    else:
        metrics_payload = {"status": "unavailable"}

    return {
        "generated_at": datetime.now(UTC).isoformat(),
        "overall_status": overall,
        "environment": settings.environment,
        "components": components,
        "metrics": metrics_payload,
    }
