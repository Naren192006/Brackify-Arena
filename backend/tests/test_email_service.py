"""Email Service Tests (PROMPT 3 Verification).

Tests:
1. Tournament created email generation & dispatch
2. Match starting email dispatch
3. Match result uploaded email dispatch
4. Tournament completed email dispatch
5. Payment confirmation email dispatch
6. Background task dispatch integration
"""

import asyncio
import sys

sys.path.insert(0, ".")

from fastapi import BackgroundTasks
from app.services.email_service import (
    enqueue_email,
    send_email,
    send_match_result_email,
    send_match_starting_email,
    send_payment_confirmation_email,
    send_tournament_completed_email,
    send_tournament_created_email,
)


def test_all_five_email_types():
    """Verify all 5 email types construct correctly and dispatch via sandbox."""
    async def _run():
        # 1. Tournament Created
        ok1 = await send_tournament_created_email(
            to_email="player@brackify.gg",
            tournament_name="Valorant Spring Open 2026",
            game="Valorant",
            entry_fee="₹250",
            join_link="https://brackify.gg/tournaments/valorant-spring-2026",
            deadline="Tomorrow at 6:00 PM IST",
        )
        assert ok1 is True

        # 2. Match Starting Soon
        ok2 = await send_match_starting_email(
            to_email="captain@sentinels.gg",
            tournament_name="Valorant Spring Open 2026",
            opponent_team="Fnatic",
            match_time="7:00 PM IST",
            discord_link="https://discord.gg/brackify-lobby-4",
            checkin_deadline="6:45 PM IST",
        )
        assert ok2 is True

        # 3. Match Result Uploaded
        ok3 = await send_match_result_email(
            to_email="player@brackify.gg",
            tournament_name="Valorant Spring Open 2026",
            winner_name="Team Liquid",
            score="13 - 11",
            next_match_info="Semifinals vs Paper Rex at 8:30 PM",
        )
        assert ok3 is True

        # 4. Tournament Completed
        ok4 = await send_tournament_completed_email(
            to_email="player@brackify.gg",
            tournament_name="Valorant Spring Open 2026",
            champion_name="Team Liquid",
            leaderboard_link="https://brackify.gg/leaderboard",
            rp_earned="+100 RP",
        )
        assert ok4 is True

        # 5. Payment Confirmation
        ok5 = await send_payment_confirmation_email(
            to_email="captain@team.gg",
            player_name="Alex 'Viper' Miller",
            tournament_name="Valorant Spring Open 2026",
            team_name="Cloud9 Elite",
            amount_paid="250",
            payment_id="pay_RzP123456789",
        )
        assert ok5 is True

    asyncio.run(_run())


def test_background_task_enqueue():
    """Verify background task enqueues email dispatch without error."""
    bg = BackgroundTasks()
    enqueue_email(
        bg,
        send_payment_confirmation_email,
        "captain@team.gg",
        "Alex Miller",
        "Valorant Open",
        "Cloud9",
        "250",
        "pay_123",
    )
    assert len(bg.tasks) == 1


if __name__ == "__main__":
    test_all_five_email_types()
    print("[OK] All 5 email types generated and dispatched successfully.")

    test_background_task_enqueue()
    print("[OK] Background task enqueueing verified.")

    print("\n[PASS] All PROMPT 3 Email Notification tests passed successfully!")

