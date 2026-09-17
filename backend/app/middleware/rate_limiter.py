"""Production-Grade Redis Sliding-Window Rate Limiter for Brackify Arena.

Requirements Enforced:
- Limit registrations to 5 per minute per user
- Limit payment orders to 3 per minute per user
- Limit login attempts to 10 per minute per IP
- Limit tournament creation to 2 per minute per user
- Allow 1000 reads per minute (leaderboard, brackets, public lists)

Features:
1. Redis atomic sliding-window algorithm using sorted sets (ZREMRANGEBYSCORE, ZADD, ZCARD)
2. Thread-safe in-memory sliding window fallback when Redis is unavailable/disabled
3. Automatic 'Retry-After' header calculation in seconds
4. HTTP 429 (Too Many Requests) with standardized, actionable JSON response
5. Supports both Global Middleware rules AND Route-Level Decorators/Dependencies
"""

from __future__ import annotations

import asyncio
import functools
import json
import re
import time
from collections.abc import Callable, Coroutine
from typing import Any

from fastapi import HTTPException, Request, Response, status
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint

from app.cache.redis_client import get_redis
from app.core.logging import get_logger

logger = get_logger(__name__)


# ---------------------------------------------------------------------------
# In-Memory Sliding Window Fallback
# ---------------------------------------------------------------------------


class InMemorySlidingWindowLimiter:
    """Thread-safe in-memory sliding-window limiter for local dev and fallback."""

    def __init__(self) -> None:
        self._store: dict[str, list[float]] = {}
        self._lock = asyncio.Lock()

    async def check_and_increment(
        self, key: str, limit: int, window_seconds: int
    ) -> tuple[bool, int]:
        now = time.time()
        window_start = now - window_seconds

        async with self._lock:
            # Filter timestamps still inside current window
            timestamps = [t for t in self._store.get(key, []) if t > window_start]

            if len(timestamps) >= limit:
                oldest = timestamps[0]
                retry_after = max(1, int(oldest + window_seconds - now))
                self._store[key] = timestamps
                return False, retry_after

            timestamps.append(now)
            self._store[key] = timestamps

            # Memory cleanup if store grows large
            if len(self._store) > 2000:
                stale = [k for k, ts in self._store.items() if not ts or ts[-1] <= window_start]
                for k in stale:
                    self._store.pop(k, None)

            return True, 0

    async def reset(self) -> None:
        """Reset internal storage (for testing)."""
        async with self._lock:
            self._store.clear()


_in_memory_limiter = InMemorySlidingWindowLimiter()


# ---------------------------------------------------------------------------
# Core Rate Limit Verification
# ---------------------------------------------------------------------------


async def check_rate_limit(
    scope: str,
    identifier: str,
    limit: int,
    window_seconds: int = 60,
) -> tuple[bool, int]:
    """Evaluate sliding window rate limit.

    Returns:
        (is_allowed: bool, retry_after_seconds: int)
    """
    key = f"ratelimit:{scope}:{identifier}"

    # 1. Attempt Redis sliding window
    try:
        redis = await get_redis()
        if redis is not None:
            now = time.time()
            pipe = redis.pipeline()
            # Remove entries outside the sliding window
            pipe.zremrangebyscore(key, 0, now - window_seconds)
            # Count remaining hits in window
            pipe.zcard(key)
            # Add current hit
            pipe.zadd(key, {f"{now}:{time.time_ns()}": now})
            # Set TTL slightly longer than window
            pipe.expire(key, window_seconds + 5)
            results = await pipe.execute()

            current_count = results[1]
            if current_count >= limit:
                # Limit exceeded: determine oldest hit to calculate exact Retry-After
                oldest = await redis.zrange(key, 0, 0, withscores=True)
                if oldest and len(oldest) > 0:
                    oldest_score = oldest[0][1]
                    retry_after = max(1, int(oldest_score + window_seconds - now))
                else:
                    retry_after = window_seconds
                return False, retry_after

            return True, 0
    except Exception as exc:
        logger.warning("redis_rate_limit_fallback_triggered", error=str(exc), key=key)

    # 2. In-memory sliding window fallback
    return await _in_memory_limiter.check_and_increment(key, limit, window_seconds)


# ---------------------------------------------------------------------------
# Identifier Extraction Utilities
# ---------------------------------------------------------------------------


def get_client_ip(request: Request) -> str:
    """Extract client IP from reverse proxy headers or socket address."""
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    real_ip = request.headers.get("X-Real-IP")
    if real_ip:
        return real_ip.strip()
    if request.client and request.client.host:
        return request.client.host
    return "127.0.0.1"


def get_user_identifier(request: Request) -> str:
    """Extract Supabase auth.uid() from Bearer JWT or user headers, fallback to IP."""
    # 1. Explicit user header
    if uid := request.headers.get("X-User-Id"):
        return uid.strip()

    # 2. Authorization: Bearer <Supabase JWT>
    auth_header = request.headers.get("Authorization") or request.headers.get("authorization")
    if auth_header and auth_header.startswith("Bearer "):
        token = auth_header[7:].strip()
        try:
            from app.core.auth import decode_supabase_jwt

            claims = decode_supabase_jwt(token)
            if claims and "sub" in claims:
                return str(claims["sub"]).strip()
        except Exception:
            pass

    # 3. Fall back to client IP
    return get_client_ip(request)


# ---------------------------------------------------------------------------
# Rate Limiting Decorator & FastAPI Dependency
# ---------------------------------------------------------------------------


def rate_limit(
    limit: int,
    window_seconds: int = 60,
    scope: str = "custom",
    by: str = "user",  # 'user' or 'ip'
) -> Callable[..., Any]:
    """FastAPI endpoint decorator for explicit per-route rate limiting.

    Example:
        @router.post("/tournaments")
        @rate_limit(limit=2, window_seconds=60, scope="create_tournament", by="user")
        async def create_tournament(...):
            ...
    """

    def decorator(func: Callable[..., Any]) -> Callable[..., Any]:
        @functools.wraps(func)
        async def wrapper(*args: Any, **kwargs: Any) -> Any:
            # Find the Request object in kwargs or args
            request = kwargs.get("request") or next(
                (a for a in args if isinstance(a, Request)), None
            )
            if request:
                ident = get_client_ip(request) if by == "ip" else get_user_identifier(request)
                allowed, retry_after = await check_rate_limit(scope, ident, limit, window_seconds)
                if not allowed:
                    raise HTTPException(
                        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                        detail={
                            "error": "rate_limit_exceeded",
                            "message": (
                                f"Rate limit exceeded for '{scope}'. "
                                f"Try again in {retry_after} seconds."
                            ),
                            "retry_after": retry_after,
                        },
                        headers={"Retry-After": str(retry_after)},
                    )
            return await func(*args, **kwargs)

        return wrapper

    return decorator


def rate_limiter_dep(
    limit: int,
    window_seconds: int = 60,
    scope: str = "endpoint",
    by: str = "user",
) -> Callable[[Request], Coroutine[Any, Any, None]]:
    """FastAPI dependency for declarative rate limiting.

    Example:
        @router.post(
            "/tournaments",
            dependencies=[
                Depends(rate_limiter_dep(limit=2, window_seconds=60, scope="create_tournament"))
            ]
        )
    """

    async def dependency(request: Request) -> None:
        ident = get_client_ip(request) if by == "ip" else get_user_identifier(request)
        allowed, retry_after = await check_rate_limit(scope, ident, limit, window_seconds)
        if not allowed:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail={
                    "error": "rate_limit_exceeded",
                    "message": (
                        f"Rate limit exceeded for '{scope}'. Try again in {retry_after} seconds."
                    ),
                    "retry_after": retry_after,
                },
                headers={"Retry-After": str(retry_after)},
            )

    return dependency


# ---------------------------------------------------------------------------
# Rate Limit Rule & Global Middleware
# ---------------------------------------------------------------------------


class RateLimitRule:
    def __init__(
        self,
        name: str,
        path_pattern: str,
        limit: int,
        window_seconds: int = 60,
        methods: list[str] | None = None,
        by: str = "user",  # 'user' or 'ip'
    ) -> None:
        self.name = name
        self.regex = re.compile(path_pattern)
        self.limit = limit
        self.window_seconds = window_seconds
        self.methods = (
            [m.upper() for m in methods] if methods else ["POST", "PATCH", "PUT", "DELETE"]
        )
        self.by = by

    def matches(self, method: str, path: str) -> bool:
        if method.upper() not in self.methods:
            return False
        return bool(self.regex.match(path))


# Preconfigured platform rules adhering strictly to Prompt 1
BUILTIN_RATE_LIMIT_RULES = [
    # 1. Login attempts: 10 per minute per IP
    RateLimitRule(
        name="login_ip",
        path_pattern=r"^/api/v1/auth/login/?$",
        limit=10,
        window_seconds=60,
        methods=["POST"],
        by="ip",
    ),
    # 2. Tournament Creation: 2 per minute per user
    RateLimitRule(
        name="tournament_creation",
        path_pattern=r"^/api/v1/tournaments/?$",
        limit=2,
        window_seconds=60,
        methods=["POST"],
        by="user",
    ),
    # 3. Registrations: 5 per minute per user (tournament team register & auth signups)
    RateLimitRule(
        name="tournament_registration",
        path_pattern=r"^/api/v1/tournaments/[^/]+/register/?$",
        limit=5,
        window_seconds=60,
        methods=["POST"],
        by="user",
    ),
    RateLimitRule(
        name="auth_registration",
        path_pattern=r"^/api/v1/auth/(register|signup)/?$",
        limit=5,
        window_seconds=60,
        methods=["POST"],
        by="user",
    ),
    # 4. Payment orders: 3 per minute per user
    RateLimitRule(
        name="payment_orders",
        path_pattern=r"^/api/v1/payments/(order|create-order)/?$",
        limit=3,
        window_seconds=60,
        methods=["POST"],
        by="user",
    ),
    # 5. General Read Requests: 1000 per minute per IP/user
    RateLimitRule(
        name="general_reads",
        path_pattern=r"^/api/v1/.*$",
        limit=1000,
        window_seconds=60,
        methods=["GET"],
        by="user",
    ),
]


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Automatic global rate limiting middleware."""

    def __init__(self, app: Any, rules: list[RateLimitRule] | None = None) -> None:
        super().__init__(app)
        self.rules = rules or BUILTIN_RATE_LIMIT_RULES

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        rule = self._match_rule(request.method, request.url.path)
        if rule is None:
            return await call_next(request)

        identifier = get_client_ip(request) if rule.by == "ip" else get_user_identifier(request)
        is_allowed, retry_after = await check_rate_limit(
            scope=rule.name,
            identifier=identifier,
            limit=rule.limit,
            window_seconds=rule.window_seconds,
        )

        if not is_allowed:
            logger.warning(
                "rate_limit_exceeded",
                scope=rule.name,
                identifier=identifier,
                path=request.url.path,
                retry_after=retry_after,
            )
            payload = {
                "error": "rate_limit_exceeded",
                "message": (
                    f"Rate limit exceeded for '{rule.name}'. "
                    f"Please try again in {retry_after} seconds."
                ),
                "retry_after": retry_after,
            }
            response = Response(
                content=json.dumps(payload),
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
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
