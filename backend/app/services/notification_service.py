from __future__ import annotations

import datetime
from typing import Any
try:
    import httpx
except ImportError:
    httpx = None  # type: ignore[assignment]

from app.config import settings
from app.core.exceptions import AppError
from app.core.logging import get_logger

logger = get_logger(__name__)


def _supabase_headers(prefer: str | None = None) -> dict[str, str]:
    if not settings.supabase_url or not settings.supabase_service_role_key:
        raise AppError("Supabase service role is not configured.", "service_not_configured")
    headers = {
        "apikey": settings.supabase_service_role_key,
        "Authorization": f"Bearer {settings.supabase_service_role_key}",
        "Content-Type": "application/json",
    }
    if prefer:
        headers["Prefer"] = prefer
    return headers


def _sb_url(table: str) -> str:
    rest_base = f"{settings.supabase_url.rstrip('/')}/rest/v1"
    return f"{rest_base}/{table}"


def _now_iso() -> str:
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


async def send_notification(
    *,
    user_id: str,
    title: str,
    body: str,
    notification_type: str = "info",
) -> None:
    """Send a notification to a specific user via Supabase service role."""
    if not user_id:
        return
    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            await client.post(
                _sb_url("notifications"),
                headers=_supabase_headers(prefer="return=minimal"),
                json={
                    "user_id": user_id,
                    "title": title,
                    "body": body,
                    "type": notification_type,
                    "is_read": False,
                    "created_at": _now_iso(),
                },
            )
        except Exception as exc:
            logger.warning("failed_to_send_notification", user_id=user_id, error=str(exc))


async def send_notification_to_team(
    team_id: str,
    title: str,
    body: str,
    notification_type: str = "info",
) -> None:
    """Send a notification to all members of a team."""
    if not team_id:
        return
    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            # 1. Fetch team members
            r = await client.get(
                _sb_url("team_members"),
                headers=_supabase_headers(),
                params={"team_id": f"eq.{team_id}", "select": "user_id"},
            )
            members = r.json() if r.status_code == 200 and isinstance(r.json(), list) else []
            user_ids = list(set([m["user_id"] for m in members if m.get("user_id")]))

            # 2. Also fetch captain if not in members
            r_team = await client.get(
                _sb_url("teams"),
                headers=_supabase_headers(),
                params={"id": f"eq.{team_id}", "select": "captain_id"},
            )
            if r_team.status_code == 200 and r_team.json():
                c_id = r_team.json()[0].get("captain_id")
                if c_id and c_id not in user_ids:
                    user_ids.append(c_id)

            if not user_ids:
                return

            # 3. Batch insert notifications
            notifications = [
                {
                    "user_id": uid,
                    "title": title,
                    "body": body,
                    "type": notification_type,
                    "is_read": False,
                    "created_at": _now_iso(),
                }
                for uid in user_ids
            ]
            await client.post(
                _sb_url("notifications"),
                headers=_supabase_headers(prefer="return=minimal"),
                json=notifications,
            )
        except Exception as exc:
            logger.warning("failed_to_send_team_notifications", team_id=team_id, error=str(exc))


async def send_notification_to_tournament(
    tournament_id: str,
    title: str,
    body: str,
    notification_type: str = "info",
) -> None:
    """Send a notification to all registered captains/members of a tournament."""
    if not tournament_id:
        return
    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            r = await client.get(
                _sb_url("tournament_registrations"),
                headers=_supabase_headers(),
                params={
                    "tournament_id": f"eq.{tournament_id}",
                    "status": "neq.cancelled",
                    "select": "registered_by,team_id",
                },
            )
            regs = r.json() if r.status_code == 200 and isinstance(r.json(), list) else []
            user_ids: set[str] = set()
            team_ids: set[str] = set()

            for reg in regs:
                if reg.get("registered_by"):
                    user_ids.add(reg["registered_by"])
                if reg.get("team_id"):
                    team_ids.add(reg["team_id"])

            if team_ids:
                r_members = await client.get(
                    _sb_url("team_members"),
                    headers=_supabase_headers(),
                    params={"team_id": f"in.({','.join(team_ids)})", "select": "user_id"},
                )
                if r_members.status_code == 200 and isinstance(r_members.json(), list):
                    for m in r_members.json():
                        if m.get("user_id"):
                            user_ids.add(m["user_id"])

            if not user_ids:
                return

            notifications = [
                {
                    "user_id": uid,
                    "title": title,
                    "body": body,
                    "type": notification_type,
                    "is_read": False,
                    "created_at": _now_iso(),
                }
                for uid in user_ids
            ]
            await client.post(
                _sb_url("notifications"),
                headers=_supabase_headers(prefer="return=minimal"),
                json=notifications,
            )
        except Exception as exc:
            logger.warning("failed_to_send_tournament_notifications", tournament_id=tournament_id, error=str(exc))

