"""Email Notification Service for Brackify Arena (PROMPT 3).

Supports:
- Resend / SendGrid API or local dev sandbox logging
- 5 responsive dark-mode esports HTML templates
- Asynchronous dispatch via FastAPI BackgroundTasks
- Graceful error handling and failure logging
"""

from __future__ import annotations

import os
from datetime import UTC, datetime
from typing import Any

import httpx
from fastapi import BackgroundTasks
from sqlalchemy import select

from app.core.logging import get_logger

logger = get_logger(__name__)

DASHBOARD_URL = "https://brackify-arena-self.vercel.app/"

RESEND_API_KEY = os.environ.get("RESEND_API_KEY", "")
EMAIL_SENDER = os.environ.get("EMAIL_SENDER", "Brackify Arena <notifications@brackify.gg>")


# ---------------------------------------------------------------------------
# Base HTML Template Wrapper
# ---------------------------------------------------------------------------


def _email_base(title: str, content_html: str) -> str:
    return f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>{title}</title>
  <style>
    body {{
      margin: 0;
      padding: 0;
      background-color: #070b14;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto,
        Helvetica, Arial, sans-serif;
      color: #e2e8f0;
    }}
    .container {{ max-width: 600px; margin: 0 auto; padding: 32px 20px; }}
    .card {{
      background-color: #0d1527;
      border: 1px solid #1e293b;
      border-radius: 12px;
      padding: 32px;
    }}
    .header {{ text-align: center; margin-bottom: 28px; }}
    .logo {{
      font-size: 24px;
      font-weight: 800;
      color: #00e5ff;
      letter-spacing: 1px;
      text-transform: uppercase;
    }}
    .title {{
      font-size: 20px;
      font-weight: 700;
      color: #ffffff;
      margin-top: 12px;
      margin-bottom: 8px;
    }}
    .text {{ font-size: 15px; line-height: 1.6; color: #94a3b8; margin-bottom: 20px; }}
    .info-box {{
      background-color: #070b14;
      border: 1px solid #22d3ee20;
      border-radius: 8px;
      padding: 18px;
      margin: 20px 0;
    }}
    .info-row {{
      display: flex;
      justify-content: space-between;
      margin-bottom: 8px;
      font-size: 14px;
    }}
    .info-label {{ color: #64748b; }}
    .info-value {{ color: #ffffff; font-weight: 600; }}
    .btn {{
      display: inline-block;
      background-color: #00e5ff;
      color: #070b14 !important;
      font-weight: 700;
      font-size: 15px;
      text-decoration: none;
      padding: 12px 28px;
      border-radius: 6px;
      text-align: center;
      margin-top: 12px;
    }}
    .footer {{ text-align: center; margin-top: 28px; font-size: 12px; color: #475569; }}
  </style>
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="header">
        <div class="logo">BRACKIFY ARENA</div>
        <div class="title">{title}</div>
      </div>
      {content_html}
    </div>
    <div class="footer">
      &copy; 2026 Brackify Arena. Competitive Esports Tournaments.<br>
      You are receiving this email because you registered for tournaments or
      enabled match notifications on Brackify Arena.<br>
      Manage preferences in your
      <a href="{DASHBOARD_URL}dashboard" style="color: #22d3ee;">dashboard settings</a> ·
      <a href="{DASHBOARD_URL}data-deletion" style="color: #22d3ee;">
        delete account &amp; data
      </a><br>
      Automated notifications — do not reply directly to this email.
      Contact: privacy@brackify.gg
    </div>
  </div>
</body>
</html>"""


# ---------------------------------------------------------------------------
# Core Sender Dispatcher
# ---------------------------------------------------------------------------


async def send_email(to_email: str, subject: str, html_body: str) -> bool:
    """Send transactional email via Resend API or sandbox logger."""
    return await _deliver(to_email, subject, html_body, respect_preferences=True)


async def send_email_raw(to_email: str, subject: str, html_body: str) -> bool:
    """Send security-critical email (password reset, verification) that the
    user must receive even with notification emails disabled."""
    return await _deliver(to_email, subject, html_body, respect_preferences=False)


async def _deliver(
    to_email: str, subject: str, html_body: str, *, respect_preferences: bool
) -> bool:
    """Send transactional email via Resend API or sandbox logger."""
    if not to_email:
        logger.warning("email_send_aborted_no_recipient")
        return False

    # Honour the user's notification preference (privacy policy commitment),
    # except for account-security mail which must always get through.
    if respect_preferences:
        try:
            from app.db.session import async_session_factory
            from app.models.user import User as UserModel

            async with async_session_factory() as session:
                enabled = await session.scalar(
                    select(UserModel.email_notifications_enabled).where(
                        UserModel.email == to_email
                    )
                )
            if enabled is False:
                logger.info("email_suppressed_user_preference", to=to_email, subject=subject)
                return False
        except Exception as exc:  # never block transactional mail on lookup issues
            logger.warning("email_preference_lookup_failed", error=str(exc))

    api_key = RESEND_API_KEY or os.environ.get("RESEND_API_KEY", "")

    # 1. Production / Live mode via Resend
    if api_key and not api_key.startswith("sandbox"):
        try:
            async with httpx.AsyncClient(timeout=8.0) as client:
                resp = await client.post(
                    "https://api.resend.com/emails",
                    headers={
                        "Authorization": f"Bearer {api_key}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "from": EMAIL_SENDER,
                        "to": [to_email],
                        "subject": subject,
                        "html": html_body,
                    },
                )
                if resp.status_code in (200, 201):
                    logger.info("email_sent_resend_success", to=to_email, subject=subject)
                    return True
                else:
                    logger.warning("resend_api_failed", status=resp.status_code, body=resp.text)
        except Exception as exc:
            logger.warning("resend_exception_caught", error=str(exc), to=to_email)

    # 2. Local Development & Sandbox Mode (logs email safely without blocking)
    logger.info(
        "email_dispatched_sandbox",
        to=to_email,
        subject=subject,
        provider="sandbox_logger",
    )
    return True


# ---------------------------------------------------------------------------
# Account Security Emails (password reset / email verification)
# ---------------------------------------------------------------------------


async def send_password_reset_email(to_email: str, reset_link: str) -> bool:
    """Password reset — transactional security email. Never suppressed by the
    notification preference: users locked out of their account must still be
    able to regain access."""
    subject = "Reset your Brackify Arena password"
    content = f"""
      <p class="text">
        We received a request to reset the password for your Brackify Arena account.
      </p>
      <div class="info-box">
        <div class="info-row">
          <span class="info-label">Request time:</span>
          <span class="info-value">{datetime.now(UTC).strftime("%d %b %Y, %H:%M UTC")}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Expires:</span>
          <span class="info-value">In 1 hour</span>
        </div>
      </div>
      <center><a href="{reset_link}" class="btn">Choose a new password</a></center>
      <p class="text" style="font-size: 13px; color: #94a3b8;">
        Didn&apos;t request this? You can safely ignore this email — your password
        stays unchanged.
      </p>
    """
    return await send_email_raw(to_email, subject, _email_base(subject, content))


async def send_email_verification_email(to_email: str, verify_link: str) -> bool:
    subject = "Verify your Brackify Arena email"
    content = f"""
      <p class="text">
        Confirm this address to finish securing your Brackify Arena account.
      </p>
      <center><a href="{verify_link}" class="btn">Verify my email</a></center>
      <p class="text" style="font-size: 13px; color: #94a3b8;">
        Link valid for 48 hours. Didn&apos;t sign up? Ignore this email.
      </p>
    """
    return await send_email_raw(to_email, subject, _email_base(subject, content))


# 1. Tournament Created
async def send_tournament_created_email(
    to_email: str,
    tournament_name: str,
    game: str,
    entry_fee: str,
    join_link: str,
    deadline: str,
) -> bool:
    content = f"""
      <p class="text">
        A new competitive tournament has just opened for registration on Brackify Arena!
      </p>
      <div class="info-box">
        <div class="info-row">
          <span class="info-label">Tournament:</span>
          <span class="info-value">{tournament_name}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Game:</span>
          <span class="info-value">{game}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Entry Fee:</span>
          <span class="info-value">{entry_fee}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Registration Deadline:</span>
          <span class="info-value">{deadline}</span>
        </div>
      </div>
      <center><a href="{join_link}" class="btn">Register Team Now</a></center>
    """
    subject = f"New tournament: {tournament_name} is open!"
    return await send_email(to_email, subject, _email_base(subject, content))


# 2. Match Starting Soon
async def send_match_starting_email(
    to_email: str,
    tournament_name: str,
    opponent_team: str,
    match_time: str,
    discord_link: str,
    checkin_deadline: str,
) -> bool:
    content = f"""
      <p class="text">
        Your upcoming match in <strong>{tournament_name}</strong> begins in 30 minutes!
        Please report to the lobby.
      </p>
      <div class="info-box">
        <div class="info-row">
          <span class="info-label">Opponent:</span>
          <span class="info-value">{opponent_team}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Scheduled Time:</span>
          <span class="info-value">{match_time}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Check-in Deadline:</span>
          <span class="info-value">{checkin_deadline}</span>
        </div>
      </div>
      <center><a href="{discord_link}" class="btn">Join Discord Match Room</a></center>
    """
    subject = f"Your match in {tournament_name} starts in 30 minutes!"
    return await send_email(to_email, subject, _email_base(subject, content))


# 3. Match Result Uploaded
async def send_match_result_email(
    to_email: str,
    tournament_name: str,
    winner_name: str,
    score: str,
    next_match_info: str,
) -> bool:
    content = f"""
      <p class="text">
        Match results have been submitted and verified for <strong>{tournament_name}</strong>.
      </p>
      <div class="info-box">
        <div class="info-row">
          <span class="info-label">Match Winner:</span>
          <span class="info-value" style="color: #00e5ff;">{winner_name}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Score:</span>
          <span class="info-value">{score}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Next Match:</span>
          <span class="info-value">{next_match_info}</span>
        </div>
      </div>
    """
    subject = f"Match result: {winner_name} advanced!"
    return await send_email(to_email, subject, _email_base(subject, content))


# 4. Tournament Completed
async def send_tournament_completed_email(
    to_email: str,
    tournament_name: str,
    champion_name: str,
    leaderboard_link: str,
    rp_earned: str = "+50 RP",
) -> bool:
    content = f"""
      <p class="text">
        The tournament <strong>{tournament_name}</strong> has concluded!
        Congratulations to the champions.
      </p>
      <div class="info-box">
        <div class="info-row">
          <span class="info-label">Champion:</span>
          <span class="info-value" style="color: #00e5ff;">🏆 {champion_name}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Rank Points:</span>
          <span class="info-value">{rp_earned}</span>
        </div>
      </div>
      <center><a href="{leaderboard_link}" class="btn">View Final Standings</a></center>
    """
    subject = f"Tournament complete! {champion_name} is champion!"
    return await send_email(to_email, subject, _email_base(subject, content))


# 5. Payment Confirmation
async def send_payment_confirmation_email(
    to_email: str,
    player_name: str,
    tournament_name: str,
    team_name: str,
    amount_paid: str,
    payment_id: str,
) -> bool:
    content = f"""
      <p class="text">
        Hello <strong>{player_name}</strong>, your tournament registration fee
        has been received and confirmed.
      </p>
      <div class="info-box">
        <div class="info-row">
          <span class="info-label">Tournament:</span>
          <span class="info-value">{tournament_name}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Team:</span>
          <span class="info-value">{team_name}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Amount Paid:</span>
          <span class="info-value">₹{amount_paid}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Transaction ID:</span>
          <span class="info-value">{payment_id}</span>
        </div>
      </div>
      <p class="text">
        Your seed and match bracket will be automatically assigned once registration closes.
      </p>
    """
    subject = "Payment confirmed - registration complete!"
    return await send_email(to_email, subject, _email_base(subject, content))


# ---------------------------------------------------------------------------
# Background Task Helper
# ---------------------------------------------------------------------------


def enqueue_email(
    background_tasks: BackgroundTasks,
    fn: Any,
    *args: Any,
    **kwargs: Any,
) -> None:
    """Safely enqueue an email to be sent asynchronously in the background."""
    background_tasks.add_task(fn, *args, **kwargs)
