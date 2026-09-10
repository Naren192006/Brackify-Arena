"""Brackify Arena — Realtime Backend Event Engine (Phase 10.1).

Provides:
- Standardized Realtime Payload Generator.
- Supabase Realtime Channel & Broadcast Dispatcher.
- Idempotent Event Deduplication.
- Automatic 1-time Retry on Network Glitches.
- Graceful Degradation (non-blocking).
- Event Types:
  * match_created
  * match_started
  * score_submitted
  * score_verified
  * match_completed
  * bracket_updated
  * tournament_status_updated
  * registration_updated
"""

from __future__ import annotations

from datetime import datetime, timezone
import hashlib
import json
import time
from typing import Any
import httpx

from app.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)

# Supported Realtime Events
SUPPORTED_REALTIME_EVENTS = {
    "match_created",
    "match_started",
    "score_submitted",
    "score_verified",
    "match_completed",
    "bracket_updated",
    "tournament_status_updated",
    "registration_updated",
}

# In-memory deduplication cache: {hash_key: timestamp}
_RECENT_BROADCASTS: dict[str, float] = {}
_DEDUP_WINDOW_SECONDS = 3.0  # 3 second deduplication window


def _get_event_dedup_key(tournament_id: str, event: str, match_id: str | None, status: str | None, score: str | None) -> str:
    raw = f"{tournament_id}:{event}:{match_id}:{status}:{score}"
    return hashlib.md5(raw.encode("utf-8")).hexdigest()


def _is_duplicate_broadcast(dedup_key: str) -> bool:
    now = time.time()
    # Clean expired entries
    expired = [k for k, ts in _RECENT_BROADCASTS.items() if now - ts > _DEDUP_WINDOW_SECONDS]
    for k in expired:
        _RECENT_BROADCASTS.pop(k, None)

    if dedup_key in _RECENT_BROADCASTS:
        return True
    _RECENT_BROADCASTS[dedup_key] = now
    return False


def _clear_dedup_cache() -> None:
    """Clear deduplication cache (useful for test isolation)."""
    _RECENT_BROADCASTS.clear()


def generate_realtime_payload(
    tournament_id: str,
    event: str,
    match_id: str | None = None,
    round: int | None = None,
    team_a: dict[str, Any] | None = None,
    team_b: dict[str, Any] | None = None,
    score: str | None = None,
    winner: dict[str, Any] | None = None,
    status: str | None = None,
    updated_at: str | None = None,
    extra: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Generate a strictly typed, standardized real-time tournament payload."""
    if event not in SUPPORTED_REALTIME_EVENTS:
        logger.warning("unsupported_realtime_event_type", event_type=event)

    now_iso = updated_at or datetime.now(timezone.utc).isoformat()

    payload = {
        "tournament_id": str(tournament_id),
        "match_id": str(match_id) if match_id else None,
        "event": str(event),
        "round": round,
        "team_a": team_a,
        "team_b": team_b,
        "score": score,
        "winner": winner,
        "status": status,
        "updated_at": now_iso,
    }

    if extra:
        payload["extra"] = extra

    return payload


async def broadcast_tournament_event(
    tournament_id: str,
    event: str,
    payload: dict[str, Any],
    max_retries: int = 1,
    client: httpx.AsyncClient | None = None,
) -> bool:
    """Broadcast real-time event to Supabase Realtime channel for the tournament.

    Features:
    - Idempotency guard (prevents identical repeated dispatches).
    - Retries once on transient failure.
    - Gracefully handles missing config or network timeouts without raising exceptions.
    """
    if not tournament_id or not event:
        return False

    # Check deduplication
    match_id = payload.get("match_id")
    status_val = payload.get("status")
    score_val = payload.get("score")
    dedup_key = _get_event_dedup_key(tournament_id, event, match_id, status_val, score_val)

    if _is_duplicate_broadcast(dedup_key):
        logger.debug("realtime_broadcast_deduplicated", tournament_id=tournament_id, event_type=event)
        return True

    # Check Supabase configuration
    if not settings.supabase_url or not settings.supabase_service_role_key:
        logger.debug("supabase_realtime_not_configured_skipping", event_type=event, tournament_id=tournament_id)
        return False

    url = f"{settings.supabase_url.rstrip('/')}/realtime/v1/api/broadcast"
    headers = {
        "apikey": settings.supabase_service_role_key,
        "Authorization": f"Bearer {settings.supabase_service_role_key}",
        "Content-Type": "application/json",
    }
    body = {
        "messages": [
            {
                "topic": f"tournament:{tournament_id}",
                "event": event,
                "payload": payload,
            }
        ]
    }

    should_close_client = False
    http_client = client
    if http_client is None:
        http_client = httpx.AsyncClient(timeout=4.0)
        should_close_client = True

    success = False
    attempts = 0
    total_attempts = 1 + max(0, max_retries)

    try:
        while attempts < total_attempts:
            attempts += 1
            try:
                resp = await http_client.post(url, headers=headers, json=body)
                if resp.status_code in (200, 201, 202, 204):
                    logger.info(
                        "realtime_event_broadcast_success",
                        tournament_id=tournament_id,
                        event_type=event,
                        attempt=attempts,
                    )
                    success = True
                    break
                else:
                    logger.warning(
                        "realtime_broadcast_http_warning",
                        status_code=resp.status_code,
                        response=resp.text[:200],
                        event_type=event,
                        attempt=attempts,
                    )
            except Exception as net_exc:
                logger.warning(
                    "realtime_broadcast_attempt_failed",
                    error=str(net_exc),
                    event_type=event,
                    attempt=attempts,
                )
                if attempts >= total_attempts:
                    break
    finally:
        if should_close_client:
            await http_client.aclose()

    return success


async def broadcast_match_event(
    tournament_id: str,
    event: str,
    match_id: str,
    round_number: int | None = None,
    team_a: dict[str, Any] | None = None,
    team_b: dict[str, Any] | None = None,
    score: str | None = None,
    winner: dict[str, Any] | None = None,
    status: str | None = None,
    updated_at: str | None = None,
    extra: dict[str, Any] | None = None,
    client: httpx.AsyncClient | None = None,
) -> bool:
    """Helper to generate match payload and dispatch to tournament realtime channel."""
    payload = generate_realtime_payload(
        tournament_id=tournament_id,
        event=event,
        match_id=match_id,
        round=round_number,
        team_a=team_a,
        team_b=team_b,
        score=score,
        winner=winner,
        status=status,
        updated_at=updated_at,
        extra=extra,
    )
    return await broadcast_tournament_event(
        tournament_id=tournament_id,
        event=event,
        payload=payload,
        client=client,
    )
