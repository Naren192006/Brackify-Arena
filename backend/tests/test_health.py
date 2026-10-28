import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_health_check(client: AsyncClient):
    response = await client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    


@pytest.mark.asyncio
async def test_metrics_endpoint_disabled_by_default(client: AsyncClient):
    """SECURITY: /metrics must 404 unless METRICS_ENABLED is explicitly set,
    so internal traffic statistics are not exposed publicly."""
    response = await client.get("/metrics")
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_metrics_endpoint_enabled_with_flag(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
):
    """Setting METRICS_ENABLED=true exposes the Prometheus scrape endpoint."""
    from app.config import settings

    monkeypatch.setattr(settings, "metrics_enabled", True)
    response = await client.get("/metrics")
    assert response.status_code == 200
    assert "http_requests_total" in response.text
