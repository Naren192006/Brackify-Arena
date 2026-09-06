"""Backwards-compatible bridge for background tasks."""

from __future__ import annotations

from app.tasks.analytics import update_analytics_task
from app.tasks.matches import generate_match_history_task
from app.tasks.notifications import (
    send_notification_task,
    send_team_notifications_task,
    send_tournament_notifications_task,
)
from app.tasks.tournaments import cleanup_tournament_task

__all__ = [
    "cleanup_tournament_task",
    "generate_match_history_task",
    "send_notification_task",
    "send_team_notifications_task",
    "send_tournament_notifications_task",
    "update_analytics_task",
]
