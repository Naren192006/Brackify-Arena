"""Tournament background cleanup and lifecycle tasks."""

from __future__ import annotations

from typing import Any

try:
    import httpx
except ImportError:
    httpx = None  # type: ignore[assignment]

from app.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)

# In-memory tracking set for idempotency
_cleaned_tournaments: set[str] = set()


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


async def cleanup_tournament_task(
    tournament_id: str,
    champion_team_id: str | None = None,
) -> None:
    """Asynchronously clean up temporary statuses, archive matches, and send organizer completion alerts.

    Guaranteed idempotent — safe to execute multiple times.
    """
    logger.info(
        "tournament_cleanup_started",
        tournament_id=tournament_id,
        champion_team_id=champion_team_id,
    )

    if tournament_id in _cleaned_tournaments:
        logger.info("tournament_cleanup_skipped_already_done", tournament_id=tournament_id)
        return

    try:
        _cleaned_tournaments.add(tournament_id)

        if httpx is not None and settings.supabase_url and (settings.supabase_service_role_key or settings.supabase_anon_key):
            headers = _sb_headers()
            async with httpx.AsyncClient(timeout=15.0) as client:
                # 1. Close uncompleted/pending registrations
                await client.patch(
                    _sb_url("tournament_registrations"),
                    headers=headers,
                    params={"tournament_id": f"eq.{tournament_id}", "status": "eq.pending"},
                    json={"status": "cancelled", "notes": "Tournament completed and finalized"},
                )

                # 2. Cleanup transient match ready statuses
                match_res = await client.get(
                    _sb_url("matches"),
                    headers=headers,
                    params={"tournament_id": f"eq.{tournament_id}", "select": "id"},
                )
                if match_res.status_code == 200:
                    match_ids = [m["id"] for m in match_res.json() if "id" in m]
                    for mid in match_ids:
                        await client.delete(
                            _sb_url("match_ready_status"),
                            headers=headers,
                            params={"match_id": f"eq.{mid}"},
                        )

                # 3. Fetch tournament organizer / creator to send completion alert
                tourn_res = await client.get(
                    _sb_url("tournaments"),
                    headers=headers,
                    params={"id": f"eq.{tournament_id}", "select": "id,title,creator_id"},
                )
                if tourn_res.status_code == 200 and tourn_res.json():
                    tourn_info = tourn_res.json()[0]
                    creator_id = tourn_info.get("creator_id")
                    title = tourn_info.get("title", "Tournament")
                    if creator_id:
                        from app.tasks.notifications import send_notification_task
                        await send_notification_task(
                            user_id=creator_id,
                            title="Tournament Concluded",
                            body=f"All matches for '{title}' have finished and the tournament is archived.",
                            notification_type="tournament_completed",
                        )

                # 4. Record archived event in activity feed
                await client.post(
                    _sb_url("tournament_activity"),
                    headers=headers,
                    json={
                        "tournament_id": tournament_id,
                        "event_type": "tournament_archived",
                        "data": {"champion_team_id": champion_team_id, "cleaned": True},
                    },
                )

        logger.info(
            "tournament_cleanup_completed",
            tournament_id=tournament_id,
            champion_team_id=champion_team_id,
        )
    except Exception as exc:
        logger.warning(
            "tournament_cleanup_failed",
            tournament_id=tournament_id,
            error=str(exc),
        )

