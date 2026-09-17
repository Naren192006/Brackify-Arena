"""Rate limiting middleware for Brackify Arena API."""

from __future__ import annotations

import json
import re
from typing import Any

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint

from app.core.logging import get_logger
from app.rate_limit.limiter import check_rate_limit

logger = get_logger(__name__)


class RateLimitRule:
    def __init__(
        self,
        name: str,
        path_pattern: str,
        limit: int,
        window_seconds: int = 60,
        methods: list[str] | None = None,
    ) -> None:
        self.name = name
        self.regex = re.compile(path_pattern)
        self.limit = limit
        self.window_seconds = window_seconds
        self.methods = (
            [m.upper() for m in methods] if methods else ["POST", "PATCH", "PUT", "DELETE"]
        )

    def matches(self, method: str, path: str) -> bool:
        if method.upper() not in self.methods:
            return False
        return bool(self.regex.match(path))


DEFAULT_RULES = [
    # 1. Login: 5 requests/minute/user
    RateLimitRule(
        name="login",
        path_pattern=r"^/api/v1/auth/login/?$",
        limit=5,
        window_seconds=60,
        methods=["POST"],
    ),
    # 2. Registration: 5 requests/minute/user (auth register + tournament team register)
    RateLimitRule(
        name="registration",
        path_pattern=r"^/api/v1/auth/register/?$",
        limit=5,
        window_seconds=60,
        methods=["POST"],
    ),
    RateLimitRule(
        name="tournament_registration",
        path_pattern=r"^/api/v1/tournaments/[^/]+/register/?$",
        limit=5,
        window_seconds=60,
        methods=["POST"],
    ),
    # 3. Payments: 3 create-order requests/minute/user
    RateLimitRule(
        name="payments_create_order",
        path_pattern=r"^/api/v1/payments/create-order/?$",
        limit=3,
        window_seconds=60,
        methods=["POST"],
    ),
    # 4. Tournament start: 1 request/minute/admin
    RateLimitRule(
        name="tournament_start",
        path_pattern=r"^/api/v1/tournaments/[^/]+/start/?$",
        limit=1,
        window_seconds=60,
        methods=["POST"],
    ),
    # 5. Match winner updates: 5 requests/minute/user
    RateLimitRule(
        name="match_winner_update",
        path_pattern=r"^/api/v1/matches/[^/]+/winner/?$",
        limit=5,
        window_seconds=60,
        methods=["PATCH", "POST"],
    ),
]


class RateLimitMiddleware(BaseHTTPMiddleware):
    def __init__(self, app: Any, rules: list[RateLimitRule] | None = None) -> None:
        super().__init__(app)
        self.rules = rules or DEFAULT_RULES

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        rule = self._match_rule(request.method, request.url.path)
        if rule is None:
            return await call_next(request)

        identifier = await self._extract_identifier(request)
        is_allowed, retry_after = await check_rate_limit(
            scope=rule.name,
            identifier=identifier,
            limit=rule.limit,
            window_seconds=rule.window_seconds,
        )

        if not is_allowed:
            payload = {
                "detail": {
                    "code": "rate_limit_exceeded",
                    "message": f"Too many requests. Please try again in {retry_after} seconds.",
                    "retry_after": retry_after,
                },
                "retry_after": retry_after,
            }
            logger.warning(
                "rate_limit_exceeded",
                rule=rule.name,
                identifier=identifier,
                path=request.url.path,
                retry_after=retry_after,
            )
            response = Response(
                content=json.dumps(payload),
                status_code=429,
                media_type="application/json",
            )
            response.headers["Retry-After"] = str(retry_after)
            return response

        return await call_next(request)

    def _match_rule(self, method: str, path: str) -> RateLimitRule | None:
        for rule in self.rules:
            if rule.matches(method, path):
                return rule
        return None

    async def _extract_identifier(self, request: Request) -> str:
        # 1. Explicit user header
        if uid := request.headers.get("X-User-Id"):
            return uid.strip()

        # 2. Query param
        if uid := request.query_params.get("user_id"):
            return uid.strip()

        # 3. Authorization Bearer Token
        if auth_header := request.headers.get("Authorization"):
            parts = auth_header.split()
            if len(parts) == 2 and parts[0].lower() == "bearer":
                try:
                    from app.core.security import decode_access_token

                    decoded = decode_access_token(parts[1])
                    if decoded and "sub" in decoded:
                        return decoded["sub"]
                except Exception:
                    pass

        # 4. JSON body for user_id or email
        if request.method in ("POST", "PATCH", "PUT"):
            try:
                content_type = request.headers.get("content-type", "")
                if "application/json" in content_type:
                    body_bytes = await request.body()
                    if body_bytes:
                        data = json.loads(body_bytes.decode("utf-8", errors="ignore"))
                        if isinstance(data, dict):
                            if uid := data.get("user_id"):
                                return str(uid).strip()
                            if email := data.get("email"):
                                return str(email).strip().lower()
            except Exception:
                pass

        # 5. Client IP
        forwarded = request.headers.get("X-Forwarded-For")
        if forwarded:
            return forwarded.split(",")[0].strip()

        if request.client and request.client.host:
            return request.client.host

        return "unknown"
