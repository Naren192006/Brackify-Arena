"""Tests for CloudOps Sentinel AWS CloudWatch Publisher (Phase 2).

All AWS interaction is mocked — tests never require real credentials and
never touch the real CloudWatch API (no AWS charges possible).

Covers:
- Honest status lifecycle: `unconfigured` before any publish attempt, `ok`
  only after a real successful PutMetricData call, never healthy on
  credentials alone.
- `degraded` after transient failures, `unconfigured` after credential /
  access-denied / no-region failures.
- No fabricated metrics: when no HTTP requests were recorded, nothing is
  published (no `TotalHttpRequests=0` invention).
- Metric payloads restricted to the permitted namespace with an Environment
  dimension, built from real Prometheus-derived data.
- Disabled configuration: get_cloudwatch_publisher() is None and the
  monitoring summary reports `disabled` without attempting any AWS call.
- AWS failures never affect the monitoring summary's overall status or the
  request/response flow.
"""

import asyncio
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import boto3
import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.core.admin_auth import AdminUser, create_admin_token
from app.main import app
from app.services.cloudwatch_publisher import CloudWatchPublisher, get_cloudwatch_publisher

client = TestClient(app)


def _publisher() -> CloudWatchPublisher:
    return CloudWatchPublisher(
        namespace=settings.aws_cloudwatch_namespace,
        interval_seconds=300,
    )


def _metrics() -> dict:
    """A realistic payload exactly as produced by collect_http_metrics()."""
    return {
        "total_requests": 12,
        "errors_5xx": 2,
        "status_breakdown": {"200": 9, "404": 1, "500": 2},
        "top_paths": [{"path": "/health", "requests": 6, "errors": 2}],
    }


def _admin() -> AdminUser:
    return AdminUser(
        id=str(uuid.uuid4()),
        email="sentinel@brackify.com",
        role="super_admin",
        permissions=["all"],
    )


def _get_summary():
    admin = _admin()
    token = create_admin_token(admin)
    with (
        patch(
            "app.core.admin_auth.fetch_admin_user_by_id",
            new=AsyncMock(return_value=admin),
        ),
        patch(
            "app.services.monitoring_service.check_database_ready",
            new=AsyncMock(return_value=(True, None)),
        ),
        patch(
            "app.services.monitoring_service.collect_http_metrics",
            return_value=None,
        ),
    ):
        return client.get(
            "/api/v1/admin/monitoring/summary",
            cookies={"admin_session": token},
        )


# ---------------------------------------------------------------------------
# 1. Disabled configuration: no AWS calls, no publisher, honest summary
# ---------------------------------------------------------------------------


async def test_publisher_is_none_when_disabled(monkeypatch):
    """AWS_CLOUDWATCH_ENABLED=false must suppress everything.

    Forced explicitly (not relied on from .env): developer machines enable the
    flag, and the disabled path must be verified regardless of local config.
    """
    monkeypatch.setattr(settings, "aws_cloudwatch_enabled", False)
    assert get_cloudwatch_publisher() is None


def test_summary_reports_disabled_without_aws_calls(monkeypatch):
    """Summary says `disabled` and contains an AWS explanation."""
    monkeypatch.setattr(settings, "aws_cloudwatch_enabled", False)
    resp = _get_summary()
    assert resp.status_code == 200
    aws = resp.json()["components"]["aws_cloudwatch"]
    assert aws["status"] == "disabled"
    assert "AWS_CLOUDWATCH_ENABLED" in (aws["detail"] or "")
    assert "AWS" in (aws["detail"] or "")


def test_aws_failure_never_degrades_overall_status():
    """A degraded CloudWatch publisher must not flip overall_status."""
    fake = _publisher()
    fake.last_status = "degraded"
    fake.last_detail = "TimeoutError during CloudWatch publish."
    fake.last_publish_at = None
    with (
        patch("app.services.monitoring_service.collect_http_metrics", return_value=None),
        patch(
            "app.services.cloudwatch_publisher.get_cloudwatch_publisher",
            return_value=fake,
        ),
    ):
        resp = _get_summary()
    assert resp.status_code == 200
    data = resp.json()
    assert data["components"]["aws_cloudwatch"]["status"] == "degraded"
    # CloudWatch problems are not an outage of the app itself.
    assert data["overall_status"] == "operational"
    assert data["components"]["database"]["status"] == "ok"


# ---------------------------------------------------------------------------
# 2. Region resolution: Settings field is passed explicitly to boto3
# ---------------------------------------------------------------------------


async def test_configured_region_is_passed_to_boto3_client():
    """Regression: the region must come from Settings (backend/.env), not be
    left to boto3's OS-environment chain — pydantic-settings does not export
    backend/.env into os.environ, and PowerShell shells also lack the var,
    which previously caused NoRegionError. Settings is fully mocked so the
    developer machine's real .env credentials can never enter the assertion
    output."""
    with (
        patch("app.services.cloudwatch_publisher.boto3") as mock_boto3,
        patch("app.services.cloudwatch_publisher.settings") as mock_settings,
    ):
        mock_boto3.client.return_value = "sentinel-client"
        mock_settings.aws_default_region = settings.aws_default_region
        mock_settings.aws_access_key_id = None
        mock_settings.aws_secret_access_key = None
        publisher = _publisher()
        client_obj = publisher._get_client()  # noqa: SLF001 - verified via double

    assert client_obj == "sentinel-client"
    mock_boto3.client.assert_called_once_with(
        "cloudwatch", region_name=settings.aws_default_region
    )


async def test_unset_region_falls_back_to_boto3_chain():
    """No configured region -> region_name=None -> boto3's standard chain.

    Passing None explicitly is identical to boto3's own default resolution
    (shell env / config file / IAM role); production needs either the settings
    field or the standard chain, never a hardcoded region.
    """
    with (
        patch("app.services.cloudwatch_publisher.boto3") as mock_boto3,
        patch(
            "app.services.cloudwatch_publisher.settings",
        ) as mock_settings,
    ):
        mock_settings.aws_default_region = None
        mock_settings.aws_access_key_id = None
        mock_settings.aws_secret_access_key = None
        publisher = _publisher()
        publisher._get_client()  # noqa: SLF001

    mock_boto3.client.assert_called_once_with("cloudwatch", region_name=None)


async def test_region_from_env_file_value_is_forwarded():
    """A region like ap-southeast-2 in backend/.env reaches boto3 verbatim."""
    with (
        patch("app.services.cloudwatch_publisher.boto3") as mock_boto3,
        patch("app.services.cloudwatch_publisher.settings") as mock_settings,
    ):
        mock_settings.aws_default_region = "ap-southeast-2"
        mock_settings.aws_access_key_id = None
        mock_settings.aws_secret_access_key = None
        publisher = _publisher()
        publisher._get_client()  # noqa: SLF001

    mock_boto3.client.assert_called_once_with(
        "cloudwatch", region_name="ap-southeast-2"
    )


# ---------------------------------------------------------------------------
# 2b. Credential resolution: Settings fields pass through when present
# ---------------------------------------------------------------------------


async def test_configured_credentials_are_passed_to_boto3_client():
    """Regression: pydantic-settings does NOT export backend/.env into
    os.environ, so boto3's own chain cannot see credentials written there.
    When Settings carries both fields, they must be passed to the client —
    (values below are fake; nothing real is ever used or printed)."""
    with (
        patch("app.services.cloudwatch_publisher.boto3") as mock_boto3,
        patch("app.services.cloudwatch_publisher.settings") as mock_settings,
    ):
        mock_settings.aws_default_region = "ap-southeast-2"
        mock_settings.aws_access_key_id = "FAKE-ACCESS-KEY-ID-FOR-TESTS"
        mock_settings.aws_secret_access_key = "FAKE-SECRET-KEY-FOR-TESTS"
        publisher = _publisher()
        publisher._get_client()  # noqa: SLF001

    mock_boto3.client.assert_called_once_with(
        "cloudwatch",
        region_name="ap-southeast-2",
        aws_access_key_id="FAKE-ACCESS-KEY-ID-FOR-TESTS",
        aws_secret_access_key="FAKE-SECRET-KEY-FOR-TESTS",
    )


async def test_absent_credentials_fall_back_to_aws_chain():
    """No credential fields in Settings -> client gets NO credential kwargs,
    leaving boto3's standard chain (shell env, shared file, IAM role) intact."""
    with (
        patch("app.services.cloudwatch_publisher.boto3") as mock_boto3,
        patch("app.services.cloudwatch_publisher.settings") as mock_settings,
    ):
        mock_settings.aws_default_region = None
        mock_settings.aws_access_key_id = None
        mock_settings.aws_secret_access_key = None
        publisher = _publisher()
        publisher._get_client()  # noqa: SLF001

    mock_boto3.client.assert_called_once_with("cloudwatch", region_name=None)


async def test_half_configured_credentials_fall_back_to_aws_chain():
    """Only one of the two credential fields set -> no credential kwargs.
    A lone access-key-id would produce a broken signature chain; boto3's
    standard chain is the safer fallback than mixing sources."""
    with (
        patch("app.services.cloudwatch_publisher.boto3") as mock_boto3,
        patch("app.services.cloudwatch_publisher.settings") as mock_settings,
    ):
        mock_settings.aws_default_region = "ap-southeast-2"
        mock_settings.aws_access_key_id = "FAKE-ACCESS-KEY-ID-FOR-TESTS"
        mock_settings.aws_secret_access_key = None
        publisher = _publisher()
        publisher._get_client()  # noqa: SLF001

    mock_boto3.client.assert_called_once_with(
        "cloudwatch", region_name="ap-southeast-2"
    )


# ---------------------------------------------------------------------------
# 3. Publishing real metrics with a mocked AWS client
# ---------------------------------------------------------------------------


async def test_publish_success_with_mocked_client_marks_ok():
    """A successful PutMetricData call is the ONLY road to healthy status."""
    publisher = _publisher()

    # Honest baseline: enabled but nothing published -> not healthy.
    assert publisher.get_status() == ("unconfigured", publisher.last_detail)
    assert "No publish attempt" in (publisher.last_detail or "")

    mock_client = MagicMock()
    publisher._client = mock_client  # noqa: SLF001 - injecting the test double

    await publisher.publish_http_metrics(_metrics())

    mock_client.put_metric_data.assert_called_once()
    kwargs = mock_client.put_metric_data.call_args.kwargs
    # Namespace must stay within the permitted scope.
    assert kwargs["Namespace"] == "BrackifyArena/Monitoring"
    names = {entry["MetricName"]: entry for entry in kwargs["MetricData"]}
    assert names["TotalHttpRequests"]["Value"] == 12
    assert names["Http5xxErrors"]["Value"] == 2
    assert names["HttpStatus500"]["Value"] == 2
    for entry in kwargs["MetricData"]:
        # Exact CloudWatch Dimension shape (regression: botocore rejects the
        # shorthand {"Environment": ...} with ParamValidationError).
        assert entry["Dimensions"] == [
            {"Name": "Environment", "Value": settings.environment}
        ]
        assert entry["Unit"] == "Count"

    status, detail = publisher.get_status()
    assert status == "ok"
    assert publisher.successful_publishes == 1
    assert publisher.last_publish_at is not None
    assert "BrackifyArena/Monitoring" in (detail or "")


async def test_publish_sends_nothing_when_no_traffic_recorded():
    """No recorded requests -> publish nothing, never fabricate a zero."""
    publisher = _publisher()
    mock_client = MagicMock()
    publisher._client = mock_client  # noqa: SLF001

    await publisher.publish_http_metrics(None)

    mock_client.put_metric_data.assert_not_called()
    # An un-published empty snapshot is not a failure either.
    assert publisher.failed_publishes == 0
    assert "no fabricated data" in (publisher.last_detail or "")


async def test_real_botocore_validation_accepts_metric_shape():
    """Regression: REAL botocore parameter validation must accept the payload.

    A MagicMock client bypasses botocore's validator, which previously let an
    invalid Dimension shape (`{"Environment": ...}` instead of
    `{"Name": ..., "Value": ...}`) ship and fail in production with
    ParamValidationError. botocore's Stubber runs the genuine parameter
    validator on `before-parameter-build` while stubbing the HTTP send —
    no network egress and no credentials are involved at any point.
    """
    from botocore.stub import Stubber

    # Clearly-fake credentials: signing happens before the stubbed send, and
    # the request is never transmitted (Stubber intercepts at before-send),
    # so nothing real is used and no network egress occurs.
    real_client = boto3.client(
        "cloudwatch",
        region_name="ap-southeast-2",
        aws_access_key_id="testing-not-a-credential",
        aws_secret_access_key="testing-not-a-credential",
    )
    stubber = Stubber(real_client)
    stubber.add_response("put_metric_data", {})

    publisher = _publisher()
    publisher._client = real_client  # noqa: SLF001 - real validator, stubbed send

    with stubber:
        await publisher.publish_http_metrics(_metrics())

    stubber.assert_no_pending_responses()
    assert publisher.get_status()[0] == "ok"


# ---------------------------------------------------------------------------
# 4. Honest failure classification (never logs credentials)
# ---------------------------------------------------------------------------


async def test_credential_failure_reports_unconfigured():
    """Missing credentials/region never become healthy nor crash the loop."""
    from botocore.exceptions import NoCredentialsError

    publisher = _publisher()
    mock_client = MagicMock()
    mock_client.put_metric_data.side_effect = NoCredentialsError()
    publisher._client = mock_client  # noqa: SLF001

    await publisher.publish_http_metrics(_metrics())

    status, detail = publisher.get_status()
    assert status == "unconfigured"
    assert "credentials" in (detail or "").lower()
    assert "region" in (detail or "").lower() or "permissions" in (detail or "").lower()
    assert publisher.failed_publishes == 1
    assert publisher.successful_publishes == 0
    # Failure detail must not contain anything secret-looking.
    assert "aws_access_key" not in (detail or "").lower()


async def test_access_denied_reports_unconfigured():
    from botocore.exceptions import ClientError

    publisher = _publisher()
    mock_client = MagicMock()
    mock_client.put_metric_data.side_effect = ClientError(
        {"Error": {"Code": "AccessDenied", "Message": "User not authorized"}},
        "PutMetricData",
    )
    publisher._client = mock_client  # noqa: SLF001

    await publisher.publish_http_metrics(_metrics())

    status, _ = publisher.get_status()
    assert status == "unconfigured"


async def test_transient_failure_reports_degraded():
    """A timeout-like error is degraded, not unconfigured, and stays alive."""
    publisher = _publisher()
    mock_client = MagicMock()
    mock_client.put_metric_data.side_effect = ConnectionError("temporary")
    publisher._client = mock_client  # noqa: SLF001

    await publisher.publish_http_metrics(_metrics())

    status, detail = publisher.get_status()
    assert status == "degraded"
    assert "retry" in (detail or "").lower()
    assert publisher.failed_publishes == 1


async def test_recovery_after_failure_returns_to_ok():
    """After a failure + success, the last snapshot is healthy again."""
    publisher = _publisher()
    mock_client = MagicMock()
    publisher._client = mock_client  # noqa: SLF001
    mock_client.put_metric_data.side_effect = [RuntimeError("boom"), None]

    await publisher.publish_http_metrics(_metrics())
    assert publisher.get_status()[0] == "degraded"

    await publisher.publish_http_metrics(_metrics())
    assert publisher.get_status()[0] == "ok"
    assert publisher.successful_publishes == 1
    assert publisher.failed_publishes == 1


# ---------------------------------------------------------------------------
# 5. Background loop resilience
# ---------------------------------------------------------------------------


async def test_background_loop_survives_publish_failures():
    """run() must not die on publish failures (isolated from request serving)."""
    publisher = _publisher()
    publisher.interval_seconds = 0.01  # fast loop for the test
    publishing_calls: list[dict | None] = []

    async def fake_publish(metrics):
        publishing_calls.append(metrics)
        raise RuntimeError("aws down")  # simulate failure INSIDE the loop body

    with (
        patch.object(publisher, "publish_http_metrics", new=fake_publish),
        patch(
            "app.services.cloudwatch_publisher.collect_http_metrics",
            return_value=_metrics(),
        ),
        pytest.raises(asyncio.CancelledError),
    ):
        task = asyncio.create_task(publisher.run())
        await asyncio.sleep(0.05)  # several loop iterations despite failures
        task.cancel()
        await task

    # Multiple iterations survived and each attempted a real-looking snapshot.
    assert len(publishing_calls) >= 2
    assert all(call == _metrics() for call in publishing_calls)
