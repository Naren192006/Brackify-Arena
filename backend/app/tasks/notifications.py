"""Notifications background task module."""

from __future__ import annotations

from typing import Any

from app.core.logging import get_logger

logger = get_logger(__name__)


async def send_notification_task(
    *,
    user_id: str,
    title: str,
    body: str,
    notification_type: str = "info",
) -> None:
    """Send an asynchronous notification to a user without blocking the response.

    Supported notification_types:
      - payment_success
      - registration_confirmed
      - tournament_started
      - match_assigned
      - winner_advanced
      - tournament_completed
    """
    logger.info(
        "notification_task_started",
        user_id=user_id,
        notification_type=notification_type,
        title=title,
    )
    try:
        from app.services.notification_service import send_notification
        await send_notification(
            user_id=user_id,
            title=title,
            body=body,
            notification_type=notification_type,
        )
        logger.info(
            "notification_task_completed",
            user_id=user_id,
            notification_type=notification_type,
        )
    except Exception as exc:
        logger.warning(
            "notification_task_failed",
            user_id=user_id,
            notification_type=notification_type,
            error=str(exc),
        )


async def send_team_notifications_task(
    *,
    team_id: str,
    title: str,
    body: str,
    notification_type: str = "general",
) -> None:
    """Send an asynchronous notification to all members of a team."""
    logger.info(
        "notification_task_started",
        team_id=team_id,
        notification_type=notification_type,
        title=title,
    )
    try:
        from app.services.notification_service import send_notification_to_team
        await send_notification_to_team(
            team_id=team_id,
            title=title,
            body=body,
            notification_type=notification_type,
        )
        logger.info(
            "notification_task_completed",
            team_id=team_id,
            notification_type=notification_type,
        )
    except Exception as exc:
        logger.warning(
            "notification_task_failed",
            team_id=team_id,
            notification_type=notification_type,
            error=str(exc),
        )


async def send_tournament_notifications_task(
    *,
    tournament_id: str,
    title: str,
    body: str,
    notification_type: str = "tournament_update",
) -> None:
    """Send an asynchronous notification to all participants of a tournament."""
    logger.info(
        "notification_task_started",
        tournament_id=tournament_id,
        notification_type=notification_type,
        title=title,
    )
    try:
        from app.services.notification_service import send_notification_to_tournament
        await send_notification_to_tournament(
            tournament_id=tournament_id,
            title=title,
            body=body,
            notification_type=notification_type,
        )
        logger.info(
            "notification_task_completed",
            tournament_id=tournament_id,
            notification_type=notification_type,
        )
    except Exception as exc:
        logger.warning(
            "notification_task_failed",
            tournament_id=tournament_id,
            notification_type=notification_type,
            error=str(exc),
        )

