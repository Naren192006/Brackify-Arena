"""Razorpay payment endpoints.

Three routes:
  POST /api/v1/payments/create-order   — create a Razorpay order for a registration
  POST /api/v1/payments/verify         — verify HMAC signature; mark payment paid
  POST /api/v1/payments/webhook        — idempotent Razorpay webhook receiver

Auth strategy
-------------
The frontend authenticates with Supabase (not FastAPI cookies), so we cannot
use ``get_current_user``.  Instead each request carries the caller's Supabase
UID in the JSON body.  The service layer cross-checks it against
``tournament_registrations.registered_by`` before doing anything, so a wrong
UID causes a 403.  The ``/verify`` endpoint is additionally protected by
HMAC-SHA256, making payment fraud cryptographically impossible.
"""

from __future__ import annotations

import traceback

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field

from app.core.auth import AuthUser, get_current_auth_user
from app.core.exceptions import AppError, app_error_to_http
from app.core.logging import get_logger
from app.schemas.validation import CreatePaymentOrderInput
from app.services import payment_service

logger = get_logger(__name__)

router = APIRouter(prefix="/payments", tags=["payments"])


# ---------------------------------------------------------------------------
# Request / response schemas
# ---------------------------------------------------------------------------


class CreateOrderRequest(BaseModel):
    registration_id: str = Field(..., min_length=1)
    amount_paise: int = Field(..., gt=0, description="Amount in smallest currency unit (paise)")
    user_id: str | None = Field(
        default=None, description="Optional caller user ID; verified auth.uid() is enforced"
    )


class CreateOrderResponse(BaseModel):
    order_id: str
    amount: int
    currency: str
    key_id: str


class VerifyPaymentRequest(BaseModel):
    registration_id: str = Field(..., min_length=1)
    razorpay_order_id: str = Field(..., min_length=1)
    razorpay_payment_id: str = Field(..., min_length=1)
    razorpay_signature: str = Field(..., min_length=1)
    user_id: str | None = Field(
        default=None, description="Optional caller user ID; verified auth.uid() is enforced"
    )


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


def _handle_app_error(exc: AppError) -> HTTPException:
    http_exc = app_error_to_http(exc)
    return HTTPException(status_code=http_exc.status_code, detail=http_exc.detail)


@router.post("/order", response_model=CreateOrderResponse, status_code=status.HTTP_201_CREATED)
async def create_payment_order(
    body: CreatePaymentOrderInput,
    current_user: AuthUser = Depends(get_current_auth_user),
) -> CreateOrderResponse:
    """Create a payment order with strict tournament_id, amount (1-100,000 INR),
    and user_id validation.
    """
    if str(body.user_id) != current_user.user_id and current_user.role != "super_admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "code": "forbidden",
                "message": "Payer user_id does not match authenticated token identity.",
            },
        )

    try:
        # Convert INR amount to paise
        amount_paise = int(round(body.amount * 100))
        result = await payment_service.create_razorpay_order(
            registration_id=str(body.tournament_id),
            amount_paise=amount_paise,
            user_id=current_user.id,
        )
    except AppError as exc:
        raise _handle_app_error(exc) from exc
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("create_payment_order_failed")
        raise HTTPException(
            status_code=500,
            detail={"code": "internal_error", "message": "Failed to create payment order."},
        ) from e

    return CreateOrderResponse(
        order_id=result["orderId"],
        amount=result["amount"],
        currency=result["currency"],
        key_id=result["keyId"],
    )


@router.post(
    "/create-order", response_model=CreateOrderResponse, status_code=status.HTTP_201_CREATED
)
async def create_order(
    body: CreateOrderRequest,
    current_user: AuthUser = Depends(get_current_auth_user),
) -> CreateOrderResponse:
    """Create a Razorpay order for a pending tournament registration.

    Validates Supabase JWT and enforces auth.uid() identity.
    """
    try:
        # Use verified auth.uid() from Supabase JWT — never trust frontend user_id
        result = await payment_service.create_razorpay_order(
            registration_id=body.registration_id,
            amount_paise=body.amount_paise,
            user_id=current_user.id,
        )
    except AppError as exc:
        raise _handle_app_error(exc) from exc
    except HTTPException:
        raise
    except Exception as e:
        traceback.print_exc()
        logger.exception("create_order_failed")
        raise HTTPException(
            status_code=500,
            detail={
                "code": "internal_error",
                "type": type(e).__name__,
                "message": str(e),
            },
        )

    return CreateOrderResponse(
        order_id=result["orderId"],
        amount=result["amount"],
        currency=result["currency"],
        key_id=result["keyId"],
    )


@router.post("/verify", status_code=status.HTTP_200_OK)
async def verify_payment(
    body: VerifyPaymentRequest,
    background_tasks: BackgroundTasks,
    current_user: AuthUser = Depends(get_current_auth_user),
) -> dict[str, bool]:
    """Verify the Razorpay HMAC-SHA256 signature and mark the payment paid.

    Validates Supabase JWT and enforces auth.uid() identity.
    Returns immediately while sending confirmation notifications and
    updating analytics in the background.
    """
    try:
        # Use verified auth.uid() from Supabase JWT — never trust frontend user_id
        await payment_service.verify_razorpay_payment(
            registration_id=body.registration_id,
            razorpay_order_id=body.razorpay_order_id,
            razorpay_payment_id=body.razorpay_payment_id,
            razorpay_signature=body.razorpay_signature,
            user_id=current_user.id,
            background_tasks=background_tasks,
        )
    except AppError as exc:
        raise _handle_app_error(exc) from exc
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("verify_payment_unexpected", error=str(exc))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"code": "internal_error", "message": "An unexpected error occurred."},
        ) from exc

    return {"paid": True}


@router.post("/webhook", status_code=status.HTTP_200_OK)
async def razorpay_webhook(
    request: Request,
    background_tasks: BackgroundTasks,
) -> dict[str, bool]:
    """Receive and verify Razorpay webhook events.

    Returns immediately while processing downstream notifications in the background.
    """
    signature = request.headers.get("x-razorpay-signature", "")
    if not signature:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "missing_signature", "message": "Missing X-Razorpay-Signature header."},
        )

    payload_bytes = await request.body()

    try:
        await payment_service.handle_webhook(
            payload_bytes=payload_bytes,
            signature=signature,
            background_tasks=background_tasks,
        )
    except AppError as exc:
        raise _handle_app_error(exc) from exc
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("webhook_unexpected", error=str(exc))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"code": "internal_error", "message": "Webhook processing failed."},
        ) from exc

    return {"received": True}
