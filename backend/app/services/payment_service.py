"""Payment service: Razorpay order creation and signature verification.

All writes to the ``payments`` and ``tournament_registrations`` tables are done
through the Supabase REST API using the service-role key so that they bypass
RLS (which revokes INSERT/UPDATE/DELETE from the ``authenticated`` role).
Razorpay API calls are made directly via httpx using Basic auth
(key_id:key_secret).
"""

from __future__ import annotations

import datetime
import hashlib
import hmac
import json
from typing import Any

from fastapi import BackgroundTasks, HTTPException
import httpx

from app.config import settings
from app.core.exceptions import AppError
from app.core.logging import get_logger

logger = get_logger(__name__)

# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _razorpay_auth() -> httpx.BasicAuth:
    if not settings.razorpay_key_id or not settings.razorpay_key_secret:
        raise AppError("Razorpay is not configured on this server.", "payment_not_configured")
    if settings.is_production and not settings.razorpay_key_id.startswith("rzp_live_"):
        raise AppError("Production payments must use Razorpay live keys (rzp_live_).", "invalid_key_mode")
    return httpx.BasicAuth(settings.razorpay_key_id, settings.razorpay_key_secret)


def _supabase_headers(prefer: str | None = None) -> dict[str, str]:
    if not settings.supabase_url or not settings.supabase_service_role_key:
        raise AppError("Supabase service role is not configured.", "payment_not_configured")
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


async def _sb_get(
    client: httpx.AsyncClient,
    table: str,
    params: dict[str, str],
) -> list[dict[str, Any]]:
    url = _sb_url(table)
    headers = _supabase_headers(prefer="return=representation")
    logger.info(
        "supabase_request",
        method="GET",
        url=url,
        has_service_role=bool(settings.supabase_service_role_key),
    )
    try:
        r = await client.get(url, headers=headers, params=params)
        r.raise_for_status()
        data: Any = r.json()
        return data if isinstance(data, list) else []
    except httpx.HTTPStatusError as exc:
        logger.error(
            "supabase_error",
            status=exc.response.status_code,
            body=exc.response.text,
            url=str(exc.request.url),
        )
        raise


async def _sb_post(
    client: httpx.AsyncClient,
    table: str,
    body: dict[str, Any],
) -> dict[str, Any]:
    url = _sb_url(table)
    headers = _supabase_headers(prefer="return=representation")
    logger.info(
        "supabase_request",
        method="POST",
        url=url,
        has_service_role=bool(settings.supabase_service_role_key),
    )
    try:
        r = await client.post(url, headers=headers, json=body)
        r.raise_for_status()
        data: Any = r.json()
        return data[0] if isinstance(data, list) and data else {}
    except httpx.HTTPStatusError as exc:
        logger.error(
            "supabase_error",
            status=exc.response.status_code,
            body=exc.response.text,
            url=str(exc.request.url),
        )
        raise


async def _sb_patch(
    client: httpx.AsyncClient,
    table: str,
    params: dict[str, str],
    body: dict[str, Any],
) -> None:
    url = _sb_url(table)
    headers = _supabase_headers(prefer="return=minimal")
    logger.info(
        "supabase_request",
        method="PATCH",
        url=url,
        has_service_role=bool(settings.supabase_service_role_key),
    )
    try:
        r = await client.patch(url, headers=headers, params=params, json=body)
        r.raise_for_status()
    except httpx.HTTPStatusError as exc:
        logger.error(
            "supabase_error",
            status=exc.response.status_code,
            body=exc.response.text,
            url=str(exc.request.url),
        )
        raise


def _now_iso() -> str:
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


# ---------------------------------------------------------------------------
# Public service functions
# ---------------------------------------------------------------------------

async def create_razorpay_order(
    *,
    registration_id: str,
    amount_paise: int,
    user_id: str,
) -> dict[str, Any]:
    """Create a Razorpay order for a tournament registration.

    1. Verifies the registration belongs to *user_id* and is not already paid.
    2. Creates a Razorpay order.
    3. Inserts a record into the ``payments`` table.
    4. Stamps ``tournament_registrations.payment_status = 'created'``.

    Returns the order details plus the publishable ``key_id`` so the browser
    can open Razorpay Checkout.
    """
    async with httpx.AsyncClient(timeout=15) as client:
        # 1. Fetch the registration (service role bypasses RLS)
        rows = await _sb_get(
            client,
            "tournament_registrations",
            params={
                "id": f"eq.{registration_id}",
                "select": "id,tournament_id,registered_by,payment_status",
            },
        )
        if not rows:
            raise AppError("Registration not found.", "registration_not_found")

        reg = rows[0]

        if reg.get("registered_by") != user_id:
            raise AppError("This registration does not belong to you.", "forbidden")

        if reg.get("payment_status") == "paid":
            raise HTTPException(
                status_code=403,
                detail={
                    "code": "already_paid",
                    "message": "This registration has already been paid.",
                },
            )

        tournament_id: str = reg["tournament_id"]

        # 2. Fetch the linked tournament
        t_rows = await _sb_get(
            client,
            "tournaments",
            params={
                "id": f"eq.{tournament_id}",
                "select": "id,entry_fee_minor,entry_fee_currency,registration_open_at,registration_close_at,start_time,max_teams,status",
            },
        )
        if not t_rows:
            raise AppError("Tournament not found.", "tournament_not_found")

        tournament = t_rows[0]
        entry_fee_minor = int(tournament.get("entry_fee_minor") or 0)
        currency = str(tournament.get("entry_fee_currency") or "INR")

        # Check if tournament registration is open
        max_teams = int(tournament.get("max_teams") or 16)
        active_rows = await _sb_get(
            client,
            "tournament_registrations",
            params={
                "tournament_id": f"eq.{tournament_id}",
                "status": "neq.cancelled",
                "select": "id",
            },
        )

        now_utc = datetime.datetime.now(datetime.timezone.utc)
        t_status = str(tournament.get("status") or "").lower()

        # Registration is OPEN when status is published/open/registration_open, window is valid, and slots remain
        is_status_valid = t_status in ("published", "open", "registration_open")
        
        is_window_valid = True
        open_at_str = tournament.get("registration_open_at")
        if open_at_str:
            try:
                open_dt = datetime.datetime.fromisoformat(open_at_str.replace("Z", "+00:00"))
                if open_dt.tzinfo is None:
                    open_dt = open_dt.replace(tzinfo=datetime.timezone.utc)
                if now_utc < open_dt:
                    is_window_valid = False
            except (ValueError, TypeError):
                pass

        close_at_str = tournament.get("registration_close_at")
        if close_at_str:
            try:
                close_dt = datetime.datetime.fromisoformat(close_at_str.replace("Z", "+00:00"))
                if close_dt.tzinfo is None:
                    close_dt = close_dt.replace(tzinfo=datetime.timezone.utc)
                if now_utc >= close_dt:
                    is_window_valid = False
            except (ValueError, TypeError):
                pass

        start_time_str = tournament.get("start_time")
        if start_time_str:
            try:
                start_dt = datetime.datetime.fromisoformat(start_time_str.replace("Z", "+00:00"))
                if start_dt.tzinfo is None:
                    start_dt = start_dt.replace(tzinfo=datetime.timezone.utc)
                if now_utc >= start_dt:
                    is_window_valid = False
            except (ValueError, TypeError):
                pass

        if not is_status_valid or not is_window_valid:
            logger.warning(
                "payment_rejected_registration_closed",
                tournament_id=tournament_id,
                status=t_status,
                user_id=user_id,
                registration_id=registration_id,
            )
            raise HTTPException(
                status_code=400,
                detail={
                    "code": "registration_closed",
                    "message": "Tournament registration is currently closed for payments.",
                },
            )

        if len(active_rows) >= max_teams:
            logger.warning("security_violation_payment_slots_full", tournament_id=tournament_id, max_teams=max_teams)
            raise HTTPException(
                status_code=400,
                detail={
                    "code": "tournament_full",
                    "message": "Tournament is full.",
                },
            )

        # 3. Read and validate entry fee
        if entry_fee_minor == 0:
            raise HTTPException(
                status_code=400,
                detail={
                    "code": "free_tournament",
                    "message": "This tournament does not require payment.",
                },
            )

        if amount_paise != entry_fee_minor:
            logger.warning("security_violation_amount_mismatch", expected=entry_fee_minor, received=amount_paise, user_id=user_id)
            raise HTTPException(
                status_code=400,
                detail={
                    "code": "amount_mismatch",
                    "message": "Requested amount does not match tournament entry fee.",
                },
            )

        # 4. Idempotency: Check if an active Razorpay order already exists for this registration
        existing_orders = await _sb_get(
            client,
            "payments",
            params={
                "registration_id": f"eq.{registration_id}",
                "select": "id,razorpay_order_id,amount_paise,currency,status",
            },
        )
        if existing_orders:
            existing = existing_orders[0]
            if existing.get("status") == "paid":
                raise HTTPException(
                    status_code=403,
                    detail={
                        "code": "already_paid",
                        "message": "This registration has already been paid.",
                    },
                )
            if existing.get("razorpay_order_id"):
                logger.info("reusing_existing_razorpay_order", order_id=existing["razorpay_order_id"], registration_id=registration_id)
                return {
                    "orderId": existing["razorpay_order_id"],
                    "amount": existing["amount_paise"],
                    "currency": existing.get("currency") or "INR",
                    "keyId": settings.razorpay_key_id,
                }

        # 5. Create Razorpay order (only for entry_fee_minor > 0)
        rz_resp = await client.post(
            "https://api.razorpay.com/v1/orders",
            auth=_razorpay_auth(),
            json={
                "amount": amount_paise,
                "currency": currency,
                "receipt": f"reg_{registration_id[:16]}",
                "notes": {"registration_id": registration_id, "user_id": user_id},
            },
        )
        if not rz_resp.is_success:
            logger.error("razorpay_order_failed", status=rz_resp.status_code, body=rz_resp.text)
            raise AppError(
                "Could not create payment order. Please try again.",
                "payment_gateway_error",
            )

        order: dict[str, Any] = rz_resp.json()
        razorpay_order_id: str = order["id"]

        # Insert payment record with idempotency handling
        try:
            await _sb_post(
                client,
                "payments",
                {
                    "registration_id": registration_id,
                    "user_id": user_id,
                    "tournament_id": tournament_id,
                    "amount_paise": amount_paise,
                    "currency": "INR",
                    "status": "created",
                    "razorpay_order_id": razorpay_order_id,
                },
            )
        except httpx.HTTPStatusError as db_err:
            if "payments_registration_id_key" in db_err.response.text or "duplicate key" in db_err.response.text:
                # Concurrent click already created row; fetch and return existing order
                existing_after_race = await _sb_get(
                    client,
                    "payments",
                    params={"registration_id": f"eq.{registration_id}", "select": "razorpay_order_id,amount_paise,currency"},
                )
                if existing_after_race and existing_after_race[0].get("razorpay_order_id"):
                    race_row = existing_after_race[0]
                    logger.info("reusing_order_after_concurrent_creation", order_id=race_row["razorpay_order_id"], registration_id=registration_id)
                    return {
                        "orderId": race_row["razorpay_order_id"],
                        "amount": race_row["amount_paise"],
                        "currency": race_row.get("currency") or "INR",
                        "keyId": settings.razorpay_key_id,
                    }
            raise

        # Stamp registration payment_status
        await _sb_patch(
            client,
            "tournament_registrations",
            params={"id": f"eq.{registration_id}"},
            body={"payment_status": "created", "razorpay_order_id": razorpay_order_id},
        )

        logger.info("security_payment_order_created", order_id=razorpay_order_id, registration_id=registration_id, user_id=user_id)

        return {
            "orderId": razorpay_order_id,
            "amount": order["amount"],
            "currency": order["currency"],
            "keyId": settings.razorpay_key_id,
        }


async def verify_razorpay_payment(
    *,
    registration_id: str,
    razorpay_order_id: str,
    razorpay_payment_id: str,
    razorpay_signature: str,
    user_id: str,
    background_tasks: BackgroundTasks | None = None,
) -> None:
    """Verify Razorpay HMAC-SHA256 signature and mark the payment as paid.

    Uses ``hmac.compare_digest`` for constant-time comparison to prevent
    timing-based attacks. Returns immediately while dispatching notifications
    and analytics to FastAPI BackgroundTasks.
    """
    if not settings.razorpay_key_secret:
        raise AppError("Razorpay is not configured on this server.", "payment_not_configured")

    # 1. Constant-time HMAC-SHA256 verification
    expected = hmac.new(
        settings.razorpay_key_secret.encode(),
        f"{razorpay_order_id}|{razorpay_payment_id}".encode(),
        hashlib.sha256,
    ).hexdigest()

    if not hmac.compare_digest(expected, razorpay_signature):
        logger.warning(
            "security_violation_invalid_razorpay_signature",
            registration_id=registration_id,
            razorpay_order_id=razorpay_order_id,
            user_id=user_id,
        )
        raise HTTPException(
            status_code=400,
            detail={"code": "invalid_signature", "message": "Payment signature verification failed."},
        )

    async with httpx.AsyncClient(timeout=15) as client:
        # 2. Find payment record
        rows = await _sb_get(
            client,
            "payments",
            params={
                "registration_id": f"eq.{registration_id}",
                "razorpay_order_id": f"eq.{razorpay_order_id}",
                "select": "id,user_id,status,tournament_id,amount_paise",
            },
        )
        if not rows:
            raise AppError("Payment record not found.", "payment_not_found")

        payment = rows[0]

        if payment.get("user_id") != user_id:
            raise AppError("Payment does not belong to this user.", "forbidden")

        # 3. Idempotent — already marked paid
        if payment.get("status") == "paid":
            return

        paid_at = _now_iso()
        tournament_id = payment.get("tournament_id")

        # 4. Update payment record
        await _sb_patch(
            client,
            "payments",
            params={"id": f"eq.{payment['id']}"},
            body={
                "status": "paid",
                "razorpay_payment_id": razorpay_payment_id,
                "razorpay_signature": razorpay_signature,
                "paid_at": paid_at,
                "updated_at": paid_at,
            },
        )

        # 5. Update registration payment_status
        await _sb_patch(
            client,
            "tournament_registrations",
            params={"id": f"eq.{registration_id}"},
            body={
                "payment_status": "paid",
                "razorpay_payment_id": razorpay_payment_id,
                "razorpay_signature": razorpay_signature,
                "paid_at": paid_at,
            },
        )

        logger.info("payment_verified", payment_id=razorpay_payment_id, registration_id=registration_id)

        # 6. Asynchronously send notifications and update analytics without blocking
        from app.tasks.background import send_notification_task, update_analytics_task

        if background_tasks is not None:
            background_tasks.add_task(
                send_notification_task,
                user_id=user_id,
                title="Payment Confirmed",
                body="Your entry fee payment has been verified. Your team registration is confirmed!",
                notification_type="payment_success",
            )
            background_tasks.add_task(
                send_notification_task,
                user_id=user_id,
                title="Registration Confirmed",
                body="Your team is officially registered and confirmed for the tournament.",
                notification_type="registration_confirmed",
            )
            if tournament_id:
                background_tasks.add_task(
                    update_analytics_task,
                    tournament_id=tournament_id,
                    event_type="payment_verified",
                    payload={"amount_paise": payment.get("amount_paise"), "registration_id": registration_id},
                )
        else:
            try:
                from app.services.notification_service import send_notification
                await send_notification(
                    user_id=user_id,
                    title="Payment Confirmed",
                    body="Your entry fee payment has been verified. Your team registration is confirmed!",
                    notification_type="payment_success",
                )
                await send_notification(
                    user_id=user_id,
                    title="Registration Confirmed",
                    body="Your team is officially registered and confirmed for the tournament.",
                    notification_type="registration_confirmed",
                )
            except Exception as exc:
                logger.warning("failed_to_trigger_payment_notification", error=str(exc))


async def handle_webhook(
    payload_bytes: bytes,
    signature: str,
    background_tasks: BackgroundTasks | None = None,
) -> None:
    """Idempotent Razorpay webhook handler for ``payment.captured`` events."""
    if not settings.razorpay_webhook_secret:
        raise AppError("Webhook secret not configured.", "payment_not_configured")

    expected = hmac.new(
        settings.razorpay_webhook_secret.encode(),
        payload_bytes,
        hashlib.sha256,
    ).hexdigest()

    if not hmac.compare_digest(expected, signature):
        raise AppError("Webhook signature verification failed.", "invalid_signature")

    try:
        event: dict[str, Any] = json.loads(payload_bytes)
    except json.JSONDecodeError:
        return  # malformed body — silently ignore

    if event.get("event") != "payment.captured":
        return  # we only handle capture events

    entity = (event.get("payload") or {}).get("payment", {}).get("entity", {})
    payment_id = entity.get("id")
    order_id = entity.get("order_id")

    if not payment_id or not order_id:
        return

    async with httpx.AsyncClient(timeout=15) as client:
        rows = await _sb_get(
            client,
            "payments",
            params={
                "razorpay_order_id": f"eq.{order_id}",
                "select": "id,registration_id,status,tournament_id,user_id",
            },
        )
        if not rows:
            logger.info("webhook_order_not_found_ignored", order_id=order_id)
            return

        payment = rows[0]
        registration_id = payment["registration_id"]
        tournament_id = payment.get("tournament_id")
        user_id = payment.get("user_id")

        # Check if already processed
        if payment.get("status") == "paid":
            logger.info("webhook_already_processed_ignored", order_id=order_id, registration_id=registration_id)
            return

        reg_rows = await _sb_get(
            client,
            "tournament_registrations",
            params={"id": f"eq.{registration_id}", "select": "id,payment_status"},
        )
        if reg_rows and reg_rows[0].get("payment_status") == "paid":
            logger.info("webhook_registration_already_paid_ignored", order_id=order_id, registration_id=registration_id)
            return

        paid_at = _now_iso()

        await _sb_patch(
            client,
            "payments",
            params={"id": f"eq.{payment['id']}"},
            body={"status": "paid", "razorpay_payment_id": payment_id, "paid_at": paid_at, "updated_at": paid_at},
        )
        await _sb_patch(
            client,
            "tournament_registrations",
            params={"id": f"eq.{registration_id}"},
            body={"payment_status": "paid", "razorpay_payment_id": payment_id, "paid_at": paid_at},
        )

        logger.info("webhook_payment_captured", payment_id=payment_id, order_id=order_id, registration_id=registration_id)

        # Dispatch notification & analytics to BackgroundTasks
        from app.tasks.background import send_notification_task, update_analytics_task

        if background_tasks is not None:
            if user_id:
                background_tasks.add_task(
                    send_notification_task,
                    user_id=user_id,
                    title="Payment Confirmed",
                    body="Your payment has been successfully verified via webhook. Your registration is confirmed!",
                    notification_type="payment_success",
                )
            if tournament_id:
                background_tasks.add_task(
                    update_analytics_task,
                    tournament_id=tournament_id,
                    event_type="payment_webhook_captured",
                    payload={"payment_id": payment_id, "registration_id": registration_id},
                )
        else:
            try:
                from app.services.notification_service import send_notification
                if user_id:
                    await send_notification(
                        user_id=user_id,
                        title="Payment Confirmed",
                        body="Your payment has been successfully verified via webhook. Your registration is confirmed!",
                        notification_type="payment_success",
                    )
            except Exception as exc:
                logger.warning("failed_to_trigger_webhook_payment_notification", error=str(exc))