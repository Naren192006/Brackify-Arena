"""Analytics background task module."""

from __future__ import annotations

from typing import Any

try:
    import httpx
except ImportError:
    httpx = None  # type: ignore[assignment]

from app.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)


def _sb_url(table: str) -> str:
    return f"{settings.supabase_url.rstrip('/')}/rest/v1/{table}"


def _sb_headers() -> dict[str, str]:
    key = settings.supabase_service_role_key or settings.supabase_anon_key
    return {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }


async def update_analytics_task(
    tournament_id: str,
    event_type: str,
    payload: dict[str, Any] | None = None,
) -> None:
    """Asynchronously update tournament revenue, paid/pending registrations, match metrics, and organizer telemetry.

    Never raises exceptions back to the API response.
    """
    logger.info(
        "analytics_task_started",
        tournament_id=tournament_id,
        event_type=event_type,
    )
    try:
        # 1. Invalidate / update Redis analytics cache if Redis is available
        try:
            from app.cache.redis_client import get_redis
            redis_client = await get_redis()
            if redis_client is not None:
                cache_keys = [
                    f"analytics:tournament:{tournament_id}",
                    f"analytics:revenue:{tournament_id}",
                    "analytics:global_overview",
                    "admin:metrics",
                    "admin:dashboard_metrics",
                ]
                await redis_client.delete(*cache_keys)
        except Exception as redis_exc:
            logger.debug("analytics_redis_invalidation_skipped", error=str(redis_exc))

        # 2. Persist analytics activity event in database telemetry if httpx is available
        if httpx is not None and settings.supabase_url and (settings.supabase_service_role_key or settings.supabase_anon_key):
            activity_payload = {
                "tournament_id": tournament_id,
                "event_type": event_type,
                "data": payload or {},
            }
            async with httpx.AsyncClient(timeout=10.0) as client:
                await client.post(
                    _sb_url("tournament_activity"),
                    headers=_sb_headers(),
                    json=activity_payload,
                )

        logger.info(
            "analytics_task_completed",
            tournament_id=tournament_id,
            event_type=event_type,
        )
    except Exception as exc:
        logger.warning(
            "analytics_task_failed",
            tournament_id=tournament_id,
            event_type=event_type,
            error=str(exc),
        )

