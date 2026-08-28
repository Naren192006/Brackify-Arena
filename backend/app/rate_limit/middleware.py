import time

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint

from app.cache.redis_client import get_redis
from app.core.logging import get_logger

logger = get_logger(__name__)


class RateLimitRule:
    def __init__(self, path_prefix: str, limit: int, window_seconds: int) -> None:
        self.path_prefix = path_prefix
        self.limit = limit
        self.window_seconds = window_seconds


DEFAULT_RULES = [
    RateLimitRule("/api/v1/auth/login", limit=5, window_seconds=60),
    RateLimitRule("/api/v1/auth/register", limit=3, window_seconds=3600),
    RateLimitRule("/api/v1/auth/refresh", limit=30, window_seconds=60),
    RateLimitRule("/api/v1/auth/password-reset", limit=5, window_seconds=3600),
]


class RateLimitMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, rules: list[RateLimitRule] | None = None) -> None:
        super().__init__(app)
        self.rules = rules or DEFAULT_RULES

    async def dispatch(
        self, request: Request, call_next: RequestResponseEndpoint
    ) -> Response:
        rule = self._match_rule(request.url.path)
        if rule is None:
            return await call_next(request)

        client_ip = request.client.host if request.client else "unknown"
        key = f"ratelimit:{rule.path_prefix}:{client_ip}"

        client = await get_redis()
        if client is None:
            return await call_next(request)

        try:
            current = await client.incr(key)
            if current == 1:
                await client.expire(key, rule.window_seconds)

            if current > rule.limit:
                ttl = await client.ttl(key)
                response = Response(
                    content='{"detail":{"code":"rate_limit_exceeded","message":"Too many requests"}}',
                    status_code=429,
                    media_type="application/json",
                )
                response.headers["Retry-After"] = str(max(ttl, 1))
                return response
        except Exception:
            logger.warning("rate_limit_check_failed", path=request.url.path)

        return await call_next(request)

    def _match_rule(self, path: str) -> RateLimitRule | None:
        for rule in self.rules:
            if path.startswith(rule.path_prefix):
                return rule
        return None
