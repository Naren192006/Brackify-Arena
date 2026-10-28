"""Tests for CloudOps Sentinel Admin Monitoring API (Phase 1).

Covers:
- Authentication: missing admin session and player tokens are rejected; the
  isolated admin session is required.
- Read-only behavior: GET works with the admin session cookie alone (no
  X-CSRF-Token needed, matching the mutating-methods-only CSRF policy).
- Explicit statuses: unavailable metrics and degraded database are reported
  honestly; AWS integrations are always `unconfigured` in Phase 1.
- Successful response shape with real-looking mocked Prometheus counters.
"""

import uuid
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from app.config import settings
from app.core.admin_auth import AdminUser, create_admin_token
from app.core.auth import encode_supabase_jwt
from app.main import app

client = TestClient(app)


def _admin(role: str = "super_admin") -> AdminUser:
    return AdminUser(
        id=str(uuid.uuid4()),
        email="sentinel@brackify.com",
        role=role,
        permissions=["all"],
    )


def _get_summary(admin: AdminUser):
    token = create_admin_token(admin)
    return client.get(
        "/api/v1/admin/monitoring/summary",
        cookies={"admin_session": token},
    )


# ---------------------------------------------------------------------------
# 1. Authentication (isolated admin session; CSRF not needed on GET)
# ---------------------------------------------------------------------------


def test_monitoring_route_registered_with_v1_prefix():
    """The route lives under the global /api/v1 prefix and is listed in OpenAPI.

    Guards against the exact local-vs-deployed prefix mismatch class of bug:
    the frontend client prefixes every path with /api/v1, so the FastAPI
    router must resolve at the same full path.
    """
    paths = set(app.openapi()["paths"].keys())
    assert "/api/v1/admin/monitoring/summary" in paths


def test_monitoring_summary_requires_admin_session():
    """/admin/monitoring/summary without any admin session returns 401."""
    resp = client.get("/api/v1/admin/monitoring/summary")
    assert resp.status_code == 401
    assert "admin_session_missing" in resp.text


def test_monitoring_summary_rejects_player_bearer_token():
    """Player Supabase tokens are never accepted by the monitoring API."""
    player_jwt = encode_supabase_jwt(
        {"sub": str(uuid.uuid4()), "role": "authenticated"}
    )
    resp = client.get(
        "/api/v1/admin/monitoring/summary",
        headers={"Authorization": f"Bearer {player_jwt}"},
    )
    assert resp.status_code == 401


def test_monitoring_summary_accessible_without_csrf_on_get():
    """GET is read-only: a valid admin session cookie alone is sufficient."""
    admin = _admin()
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
        resp = _get_summary(admin)

    assert resp.status_code == 200


def test_monitoring_summary_allows_sub_admin_read():
    """Sub admins may read the monitoring snapshot (read-only endpoint)."""
    sub_admin = _admin("sub_admin")
    with (
        patch(
            "app.core.admin_auth.fetch_admin_user_by_id",
            new=AsyncMock(return_value=sub_admin),
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
        resp = _get_summary(sub_admin)

    assert resp.status_code == 200


# ---------------------------------------------------------------------------
# 2. Successful summary with metrics available
# ---------------------------------------------------------------------------


def test_monitoring_summary_success_with_metrics(monkeypatch):
    """Full happy path: DB ok, metrics present, AWS explicitly unconfigured."""
    # Force the disabled path hermetically (dev machines enable the flag in
    # backend/.env; this test pins the AWS-disabled summary shape itself).
    monkeypatch.setattr(settings, "aws_cloudwatch_enabled", False)
    admin = _admin()
    metrics = {
        "total_requests": 42,
        "errors_5xx": 1,
        "status_breakdown": {"200": 40, "422": 1, "500": 1},
        "top_paths": [
            {"path": "/health", "requests": 10, "errors": 0},
            {"path": "/api/v1/tournaments", "requests": 8, "errors": 1},
        ],
    }
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
            return_value=metrics,
        ),
    ):
        resp = _get_summary(admin)

    assert resp.status_code == 200
    data = resp.json()

    assert data["overall_status"] == "operational"
    assert data["environment"] == "test"
    assert data["generated_at"]

    components = data["components"]
    assert components["app"]["status"] == "ok"
    assert components["database"]["status"] == "ok"
    assert components["redis"]["status"] == "disabled"  # REDIS_ENABLED=false in tests
    assert components["request_metrics"]["status"] == "ok"
    # AWS_CLOUDWATCH_ENABLED is forced false above, so the honest
    # answer is `disabled` — no publish attempt exists and none is implied.
    assert components["aws_cloudwatch"]["status"] == "disabled"
    assert "AWS" in components["aws_cloudwatch"]["detail"]

    metrics_data = data["metrics"]
    assert metrics_data["status"] == "ok"
    assert metrics_data["total_requests"] == 42
    assert metrics_data["errors_5xx"] == 1
    assert metrics_data["status_breakdown"]["500"] == 1
    assert metrics_data["top_paths"][0]["path"] == "/health"


# ---------------------------------------------------------------------------
# 3. Explicit unavailable / degraded states (no fabricated data)
# ---------------------------------------------------------------------------


def test_monitoring_summary_metrics_unavailable():
    """When no HTTP metrics exist, the endpoint says so instead of faking data."""
    admin = _admin()
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
        resp = _get_summary(admin)

    assert resp.status_code == 200
    data = resp.json()

    assert data["components"]["request_metrics"]["status"] == "unavailable"
    assert data["metrics"]["status"] == "unavailable"
    assert data["metrics"]["total_requests"] is None
    assert data["metrics"]["errors_5xx"] is None
    assert data["metrics"]["status_breakdown"] == {}
    assert data["metrics"]["top_paths"] == []
    # Still operational overall: metrics being absent is not an outage.
    assert data["overall_status"] == "operational"


def test_monitoring_summary_database_unavailable_is_degraded():
    """A failed database ping degrades the overall status without exploding."""
    admin = _admin()
    with (
        patch(
            "app.core.admin_auth.fetch_admin_user_by_id",
            new=AsyncMock(return_value=admin),
        ),
        patch(
            "app.services.monitoring_service.check_database_ready",
            new=AsyncMock(return_value=(False, "connection refused")),
        ),
        patch(
            "app.services.monitoring_service.collect_http_metrics",
            return_value=None,
        ),
    ):
        resp = _get_summary(admin)

    assert resp.status_code == 200
    data = resp.json()

    assert data["overall_status"] == "degraded"
    assert data["components"]["database"]["status"] == "unavailable"
    assert "connection refused" in data["components"]["database"]["detail"]


# ---------------------------------------------------------------------------
# 4. Real-registry regression: middleware counters must be visible to service
# ---------------------------------------------------------------------------


def test_collect_http_metrics_reads_real_prometheus_registry():
    """Regression: the service reads the counters the middleware writes.

    prometheus_client strips the `_total` suffix from a Counter's family name,
    so the middleware Counter registered as `http_requests_total` is collected
    under family name `http_requests`. A collector matching on
    `http_requests_total` at the family level saw nothing and always reported
    `unavailable` despite real traffic.

    Uses a unique label path so surrounding traffic cannot make this fuzzy.
    """
    from app.middleware.metrics import REQUEST_COUNT
    from app.services.monitoring_service import collect_http_metrics

    marker = "/__metrics_probe_" + uuid.uuid4().hex + "__"
    REQUEST_COUNT.labels(method="GET", path=marker, status="200").inc(3)
    REQUEST_COUNT.labels(method="GET", path=marker, status="500").inc(1)

    metrics = collect_http_metrics()

    assert metrics is not None
    assert metrics["total_requests"] >= 4
    assert metrics["errors_5xx"] >= 1
    assert metrics["status_breakdown"]["200"] >= 3
    assert metrics["status_breakdown"]["500"] >= 1
    hit = next(p for p in metrics["top_paths"] if p["path"] == marker)
    # top_paths counts are per-path totals across all statuses (3 + 1 = 4).
    assert hit["requests"] == 4
    assert hit["errors"] == 1
