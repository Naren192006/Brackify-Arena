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

from fastapi import HTTPException
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
            raise AppError("This registration has already been paid.", "already_paid")

        tournament_id: str = reg["tournament_id"]

        # 2. Fetch the linked tournament
        t_rows = await _sb_get(
            client,
            "tournaments",
            params={
                "id": f"eq.{tournament_id}",
                "select": "id,entry_fee_minor,entry_fee_currency,registration_open_at,registration_close_at,max_teams,status",
            },
        )
        if not t_rows:
            raise AppError("Tournament not found.", "tournament_not_found")

        tournament = t_rows[0]
        entry_fee_minor = int(tournament.get("entry_fee_minor") or 0)
        currency = str(tournament.get("entry_fee_currency") or "INR")

        # Check registration window
        close_at_str = tournament.get("registration_close_at")
        if close_at_str:
            try:
                close_dt = datetime.datetime.fromisoformat(close_at_str.replace("Z", "+00:00"))
                if datetime.datetime.now(datetime.timezone.utc) >= close_dt:
                    raise HTTPException(
                        status_code=400,
                        detail={
                            "code": "registration_closed",
                            "message": "Registration is closed for this tournament.",
                        },
                    )
            except (ValueError, TypeError):
                pass

        # Check paid slot capacity
        max_teams = int(tournament.get("max_teams") or 16)
        paid_rows = await _sb_get(
            client,
            "tournament_registrations",
            params={
                "tournament_id": f"eq.{tournament_id}",
                "payment_status": "eq.paid",
                "select": "id",
            },
        )
        if len(paid_rows) >= max_teams:
            raise HTTPException(
                status_code=400,
                detail={
                    "code": "tournament_full",
                    "message": "Tournament is already full.",
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
            raise HTTPException(
                status_code=400,
                detail={
                    "code": "amount_mismatch",
                    "message": "Requested amount does not match tournament entry fee.",
                },
            )

        # 4. Create Razorpay order (only for entry_fee_minor > 0)
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

        # 3. Insert payment record (service role — bypasses RLS revoke)
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

        # 4. Stamp registration payment_status
        await _sb_patch(
            client,
            "tournament_registrations",
            params={"id": f"eq.{registration_id}"},
            body={"payment_status": "created", "razorpay_order_id": razorpay_order_id},
        )

        logger.info("razorpay_order_created", order_id=razorpay_order_id, registration_id=registration_id)

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
) -> None:
    """Verify Razorpay HMAC-SHA256 signature and mark the payment as paid.

    Uses ``hmac.compare_digest`` for constant-time comparison to prevent
    timing-based attacks.
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
        raise AppError("Payment signature verification failed.", "invalid_signature")

    async with httpx.AsyncClient(timeout=15) as client:
        # 2. Find payment record
        rows = await _sb_get(
            client,
            "payments",
            params={
                "registration_id": f"eq.{registration_id}",
                "razorpay_order_id": f"eq.{razorpay_order_id}",
                "select": "id,user_id,status",
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


async def handle_webhook(payload_bytes: bytes, signature: str) -> None:
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
                "select": "id,registration_id,status",
            },
        )
        if not rows or rows[0].get("status") == "paid":
            return  # not found or already processed

        payment = rows[0]
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
            params={"id": f"eq.{payment['registration_id']}"},
            body={"payment_status": "paid", "razorpay_payment_id": payment_id, "paid_at": paid_at},
        )

        logger.info("webhook_payment_captured", payment_id=payment_id, order_id=order_id)