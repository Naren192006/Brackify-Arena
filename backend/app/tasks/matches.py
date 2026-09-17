"""Match background tasks module."""

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
    key = settings.supabase_service_role_key
    return {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }


async def generate_match_history_task(
    match_id: str,
    winner_team_id: str | None = None,
) -> None:
    """Asynchronously generate player_match_history rows for all players on the competing teams.

    Computes win/loss results and RP rating changes (+25 win / -15 loss).
    Guaranteed idempotent — skips duplicate history records.
    """
    logger.info(
        "match_history_started",
        match_id=match_id,
        winner_team_id=winner_team_id,
    )
    try:
        if (
            httpx is None
            or not settings.supabase_url
            or not (settings.supabase_service_role_key or settings.supabase_anon_key)
        ):
            logger.info("match_history_skipped_no_client", match_id=match_id)
            return

        headers = _sb_headers()
        async with httpx.AsyncClient(timeout=15.0) as client:
            # 1. Fetch match details
            match_res = await client.get(
                _sb_url("matches"),
                headers=headers,
                params={"id": f"eq.{match_id}", "select": "id,team_a_id,team_b_id,winner_team_id"},
            )
            if match_res.status_code != 200 or not match_res.json():
                logger.warning("match_history_failed", match_id=match_id, reason="match_not_found")
                return

            match_data = match_res.json()[0]
            team_a_id = match_data.get("team_a_id")
            team_b_id = match_data.get("team_b_id")
            actual_winner = winner_team_id or match_data.get("winner_team_id")

            if not team_a_id or not team_b_id or not actual_winner:
                logger.info(
                    "match_history_skipped_incomplete",
                    match_id=match_id,
                    team_a=team_a_id,
                    team_b=team_b_id,
                    winner=actual_winner,
                )
                return

            # 2. Fetch members of Team A
            res_a = await client.get(
                _sb_url("team_members"),
                headers=headers,
                params={"team_id": f"eq.{team_a_id}", "select": "user_id"},
            )
            members_a = res_a.json() if res_a.status_code == 200 else []

            # 3. Fetch members of Team B
            res_b = await client.get(
                _sb_url("team_members"),
                headers=headers,
                params={"team_id": f"eq.{team_b_id}", "select": "user_id"},
            )
            members_b = res_b.json() if res_b.status_code == 200 else []

            history_rows: list[dict[str, Any]] = []

            for m in members_a:
                uid = m.get("user_id")
                if not uid:
                    continue
                is_win = team_a_id == actual_winner
                history_rows.append(
                    {
                        "match_id": match_id,
                        "user_id": uid,
                        "team_id": team_a_id,
                        "result": "win" if is_win else "loss",
                        "rp_change": 25 if is_win else -15,
                    }
                )

            for m in members_b:
                uid = m.get("user_id")
                if not uid:
                    continue
                is_win = team_b_id == actual_winner
                history_rows.append(
                    {
                        "match_id": match_id,
                        "user_id": uid,
                        "team_id": team_b_id,
                        "result": "win" if is_win else "loss",
                        "rp_change": 25 if is_win else -15,
                    }
                )

            if history_rows:
                # Upsert / ignore duplicate entries
                insert_headers = dict(headers)
                insert_headers["Prefer"] = "resolution=ignore-duplicates"
                insert_res = await client.post(
                    _sb_url("player_match_history"),
                    headers=insert_headers,
                    json=history_rows,
                )
                logger.info(
                    "match_history_generated",
                    match_id=match_id,
                    records_count=len(history_rows),
                    status_code=insert_res.status_code,
                )
    except Exception as exc:
        logger.warning(
            "match_history_failed",
            match_id=match_id,
            error=str(exc),
        )
