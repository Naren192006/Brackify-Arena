"""Brackify Arena — CloudOps Sentinel AWS CloudWatch Publisher (Phase 2).

Optional, interval-based publisher that forwards real Prometheus-derived HTTP
metrics (from the same counters `collect_http_metrics()` reads) to AWS
CloudWatch via `PutMetricData`, restricted to the permitted
`BrackifyArena/Monitoring` namespace.

Honesty rules:
- Metrics come only from the Prometheus registry — nothing is invented.
- When AWS_CLOUDWATCH_ENABLED is false, boto3 is missing, or no publish has
  succeeded, the summary must NOT report healthy. A status only becomes `ok`
  after a successful PutMetricData call.
- AWS failures never block health endpoints, admin login, or request serving:
  every failure is recorded on the singleton and swallowed by the loop.

Security:
- Region resolves from application settings (AWS_DEFAULT_REGION via
  Settings); credentials resolve exclusively through boto3's standard
  environment/IAM chain (AWS_ACCESS_KEY_ID, instance role). No access key or
  region is hardcoded, stored, or logged.
- The publisher holds no other IAM permissions beyond PutMetricData in the
  configured namespace (enforced by the BrackifyCloudWatchMetricsPublisher
  IAM policy).
"""

from __future__ import annotations

import asyncio
from datetime import UTC, datetime
from typing import Any

from app.config import settings
from app.core.logging import get_logger
from app.schemas.monitoring import MonitoringStatus
from app.services.monitoring_service import collect_http_metrics

# no_implicit_reexport: monitoring_service reads `boto3` to detect install state.
__all__ = [
    "ENVIRONMENT_DIMENSION",
    "CloudWatchPublisher",
    "boto3",
    "get_cloudwatch_publisher",
    "start_cloudwatch_publisher",
    "stop_cloudwatch_publisher",
]

try:  # boto3 is intentionally optional: local dev must work without AWS.
    import boto3
    from botocore.exceptions import ClientError, NoCredentialsError
except ImportError:  # pragma: no cover - boto3 missing in slim environments
    boto3 = None
    ClientError = NoCredentialsError = None

logger = get_logger(__name__)

# Dimension attached to every published metric so CloudWatch can slice by env.
ENVIRONMENT_DIMENSION = "Environment"


class CloudWatchPublisher:
    """Interval-based CloudWatch PutMetricData publisher (singleton per process)."""

    def __init__(self, namespace: str, interval_seconds: int) -> None:
        self.namespace = namespace
        self.interval_seconds = max(10, interval_seconds)  # sanity floor
        self._client = None

        # Publishing state surfaced (read-only) through the monitoring summary.
        self.last_publish_at: str | None = None
        self.last_status: MonitoringStatus = "unconfigured"
        self.last_detail: str | None = "No publish attempt has been made yet."
        self.successful_publishes = 0
        self.failed_publishes = 0

    # ------------------------------------------------------------------
    # Client handling (lazy; never logs or stores credentials)
    # ------------------------------------------------------------------

    def _get_client(self) -> Any:
        """Create the CloudWatch client on first use.

        Region comes from the application settings (`AWS_DEFAULT_REGION` as
        loaded into Settings from backend/.env — which pydantic-settings does
        NOT export to os.environ, so boto3's own chain cannot see it there and
        must be told explicitly). When the field is unset, None falls back to
        boto3's standard region-resolution chain (shell env, config file, IAM
        role).

        Credentials: when BOTH AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY
        are present in Settings (e.g. loaded from backend/.env, which the
        standard chain cannot see), they are passed explicitly to the client;
        otherwise no credential arguments are passed at all and boto3 resolves
        credentials through its standard chain (shell env, shared credentials
        file, IAM role). Client creation performs no network calls; failures
        surface at publish time. Credential values are never logged, stored,
        or included in any error detail.
        """
        if self._client is None:
            if (
                settings.aws_access_key_id
                and settings.aws_secret_access_key
            ):
                self._client = boto3.client(
                    "cloudwatch",
                    region_name=settings.aws_default_region,
                    aws_access_key_id=settings.aws_access_key_id,
                    aws_secret_access_key=settings.aws_secret_access_key,
                )
            else:
                self._client = boto3.client(
                    "cloudwatch", region_name=settings.aws_default_region
                )
        return self._client

    def reset_for_tests(self) -> None:
        """Forget the cached client (test isolation only)."""
        self._client = None

    # ------------------------------------------------------------------
    # Metric construction — real data only
    # ------------------------------------------------------------------

    def _build_metric_data(self, metrics: dict[str, Any]) -> list[dict[str, Any]]:
        """Translate a Prometheus-derived metrics dict into PutMetricData entries.

        Publishes totals plus a compact per-status-code breakdown; per-path
        sums are intentionally not sent to keep each PutMetricData payload
        small (limit is 1,000 datapoints / 150kB).
        """
        # CloudWatch Dimension shape requires explicit Name/Value keys.
        dimensions = [
            {"Name": ENVIRONMENT_DIMENSION, "Value": settings.environment}
        ]
        metric_data: list[dict[str, Any]] = [
            {
                "MetricName": "TotalHttpRequests",
                "Dimensions": dimensions,
                "Value": metrics["total_requests"],
                "Unit": "Count",
            },
            {
                "MetricName": "Http5xxErrors",
                "Dimensions": dimensions,
                "Value": metrics["errors_5xx"],
                "Unit": "Count",
            },
        ]
        for status_code, count in sorted(metrics["status_breakdown"].items()):
            if not str(status_code).isdigit():
                continue
            metric_data.append(
                {
                    "MetricName": f"HttpStatus{status_code}",
                    "Dimensions": dimensions,
                    "Value": count,
                    "Unit": "Count",
                }
            )
        return metric_data

    # ------------------------------------------------------------------
    # Publishing
    # ------------------------------------------------------------------

    def _put_metric_data_sync(self, metric_data: list[dict[str, Any]]) -> None:
        self._get_client().put_metric_data(
            Namespace=self.namespace, MetricData=metric_data
        )

    async def publish_http_metrics(self, metrics: dict[str, Any] | None) -> None:
        """Publish one snapshot of real HTTP metrics.

        `metrics is None` (no traffic recorded yet) publishes nothing — never a
        fabricated zero. boto3 is synchronous, so the AWS call runs in a thread
        to keep the event loop responsive.
        """
        if boto3 is None:
            self._record_failure(
                Exception("boto3 is not installed"),
                configured_hint=True,
            )
            return
        if metrics is None:
            self.last_detail = (
                "No HTTP requests recorded yet; nothing to publish (no "
                "fabricated data sent to CloudWatch)."
            )
            return

        try:
            metric_data = self._build_metric_data(metrics)
        except Exception as exc:
            self._record_failure(exc, configured_hint=False)
            return

        try:
            await asyncio.to_thread(self._put_metric_data_sync, metric_data)
        except Exception as exc:
            self._record_failure(exc)
            return

        self.successful_publishes += 1
        self.last_status = "ok"
        self.last_detail = (
            f"Published {len(metric_data)} datapoints to namespace "
            f"{self.namespace!r}."
        )
        self.last_publish_at = datetime.now(UTC).isoformat()
        logger.info(
            "cloudwatch_publish_succeeded",
            namespace=self.namespace,
            datapoints=len(metric_data),
        )

    def _record_failure(self, exc: Exception, *, configured_hint: bool = False) -> None:
        """Record a publish failure without ever blocking request handling.

        Classifies failures so the summary can honestly separate
        `unconfigured` (credentials/permission problems) from `degraded`
        (transient/unknown). Only the exception type and a brief message are
        kept — never credentials or full SDK internals.
        """
        self.failed_publishes += 1

        unconfigured = configured_hint
        if NoCredentialsError is not None and isinstance(exc, NoCredentialsError):
            unconfigured = True
        elif ClientError is not None and isinstance(exc, ClientError):
            code = exc.response.get("Error", {}).get("Code", "")
            if code in ("AccessDenied", "InvalidClientTokenId", "SignatureDoesNotMatch"):
                unconfigured = True
        elif type(exc).__name__ in ("NoRegionError",):
            unconfigured = True

        self.last_status = "unconfigured" if unconfigured else "degraded"
        self.last_detail = (
            f"{type(exc).__name__} during CloudWatch publish. "
            + (
                "Check AWS credentials / region / "
                "BrackifyCloudWatchMetricsPublisher permissions."
                if unconfigured
                else "Publishing will retry on the next interval."
            )
        )
        self.last_publish_at = datetime.now(UTC).isoformat()
        logger.warning("cloudwatch_publish_failed", error_type=type(exc).__name__)

    def get_status(self) -> tuple[MonitoringStatus, str | None]:
        """Current honest publishing status for the monitoring summary.

        Healthy (`ok`) is only ever reported after a real successful
        PutMetricData call — never merely because the feature is enabled or
        credentials exist.
        """
        return self.last_status, self.last_detail

    # ------------------------------------------------------------------
    # Background loop
    # ------------------------------------------------------------------

    async def run(self) -> None:
        """Publish on the configured interval until cancelled.

        The loop itself is failure-proof: ANY exception is logged and skipped
        so AWS problems can never take the backend down.
        """
        while True:
            try:
                await self.publish_http_metrics(collect_http_metrics())
            except Exception as exc:  # pragma: no cover - belt & braces
                logger.warning(
                    "cloudwatch_publisher_loop_error", error_type=type(exc).__name__
                )
            await asyncio.sleep(self.interval_seconds)


# ---------------------------------------------------------------------------
# Process-wide singleton + async task management
# ---------------------------------------------------------------------------

_publisher: CloudWatchPublisher | None = None
_publisher_task: asyncio.Task[None] | None = None


def get_cloudwatch_publisher() -> CloudWatchPublisher | None:
    """Return the publisher singleton, or None when CloudWatch is disabled.

    None is the contract for "CloudWatch publishing is off" — the monitoring
    summary then reports `disabled` (or `unconfigured` when boto3 is missing).
    """
    global _publisher
    if not settings.aws_cloudwatch_enabled:
        return None
    if _publisher is None:
        _publisher = CloudWatchPublisher(
            namespace=settings.aws_cloudwatch_namespace,
            interval_seconds=settings.aws_cloudwatch_publish_interval_seconds,
        )
    return _publisher


async def start_cloudwatch_publisher() -> None:
    """Start the background publishing task if enabled and not already running.

    Started inside FastAPI's lifespan so publish failures can never delay
    startup, degrade /health, or affect admin authentication.
    """
    global _publisher_task
    publisher = get_cloudwatch_publisher()
    if publisher is None or _publisher_task is not None:
        return
    _publisher_task = asyncio.create_task(publisher.run(), name="cloudwatch-publisher")
    logger.info(
        "cloudwatch_publisher_started",
        namespace=publisher.namespace,
        interval_seconds=publisher.interval_seconds,
    )


async def stop_cloudwatch_publisher() -> None:
    """Cancel the background task on shutdown (best-effort)."""
    global _publisher_task, _publisher
    task = _publisher_task
    _publisher_task = None
    if task is not None:
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass
    _publisher = None
