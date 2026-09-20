"""Production-Grade Exception Handlers.

Prevents database leakage, sanitizes validation errors, and provides
uniform, actionable JSON error responses.
"""

from __future__ import annotations

from typing import Any

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy.exc import SQLAlchemyError

from app.core.logging import get_logger

logger = get_logger(__name__)


def format_validation_error(error: dict[str, Any]) -> dict[str, str]:
    """Extract a user-friendly field name and human message from a pydantic error."""
    loc = error.get("loc", [])
    # Filter out 'body' prefix if present
    field_parts = [str(x) for x in loc if str(x) != "body"]
    field_name = ".".join(field_parts) if field_parts else "request"

    msg = error.get("msg", "Invalid input")
    # Clean up Pydantic prefix "Value error, "
    if msg.startswith("Value error, "):
        msg = msg[len("Value error, ") :]

    return {
        "field": field_name,
        "message": msg,
    }


async def validation_exception_handler(
    _request: Request, exc: RequestValidationError
) -> JSONResponse:
    """Handle Pydantic request validation errors without leaking internal schemas."""
    errors = exc.errors()
    formatted = [format_validation_error(err) for err in errors]
    first_msg = formatted[0]["message"] if formatted else "Invalid request data"
    first_field = formatted[0]["field"] if formatted else "payload"

    logger.warning(
        "request_validation_failed",
        error_count=len(errors),
        first_field=first_field,
        first_error=first_msg,
    )

    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={
            "error": "validation_error",
            "message": f"Invalid input for '{first_field}': {first_msg}",
            "details": formatted,
        },
    )


async def database_exception_handler(_request: Request, exc: SQLAlchemyError) -> JSONResponse:
    """Handle database errors securely without exposing SQL queries or schemas."""
    # Log the complete raw database error securely on the server
    logger.error(
        "database_error_intercepted",
        error_type=type(exc).__name__,
        error_detail=str(exc),
    )

    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "error": "database_error",
            "message": (
                "A database operation could not be completed securely. Please try again later."
            ),
        },
    )


async def value_error_handler(_request: Request, exc: ValueError) -> JSONResponse:
    """Handle explicit business logic ValueError exceptions."""
    return JSONResponse(
        status_code=status.HTTP_400_BAD_REQUEST,
        content={
            "error": "bad_request",
            "message": str(exc),
        },
    )


def register_error_handlers(app: FastAPI) -> None:
    """Register all custom security & validation exception handlers."""
    app.add_exception_handler(RequestValidationError, validation_exception_handler)  # type: ignore[arg-type]
    app.add_exception_handler(SQLAlchemyError, database_exception_handler)  # type: ignore[arg-type]
    app.add_exception_handler(ValueError, value_error_handler)  # type: ignore[arg-type]
