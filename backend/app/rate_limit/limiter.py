"""Centralized sliding-window rate limiter with Redis & in-memory fallback."""

from __future__ import annotations

import asyncio
import time

from app.cache.redis_client import get_redis
from app.core.logging import get_logger

logger = get_logger(__name__)


class InMemorySlidingWindowLimiter:
    """Thread-safe in-memory sliding-window rate limiter."""

    def __init__(self) -> None:
        self._store: dict[str, list[float]] = {}
        self._lock = asyncio.Lock()

    async def check_and_increment(
        self, key: str, limit: int, window_seconds: int
    ) -> tuple[bool, int]:
        """Check if request is allowed and record it.

        Returns:
            (is_allowed, retry_after_seconds)
        """
        now = time.time()
        window_start = now - window_seconds

        async with self._lock:
            timestamps = [t for t in self._store.get(key, []) if t > window_start]

            if len(timestamps) >= limit:
                oldest = timestamps[0]
                retry_after = max(1, int(oldest + window_seconds - now))
                self._store[key] = timestamps
                return False, retry_after

            timestamps.append(now)
            self._store[key] = timestamps

            # Periodic cleanup if storage grows
            if len(self._store) > 1000:
                stale_keys = [
                    k for k, ts in self._store.items() if not ts or ts[-1] <= window_start
                ]
                for k in stale_keys:
                    self._store.pop(k, None)

            return True, 0

    async def reset(self) -> None:
        """Clear in-memory store (for testing)."""
        async with self._lock:
            self._store.clear()


_in_memory_limiter = InMemorySlidingWindowLimiter()


async def check_rate_limit(
    scope: str,
    identifier: str,
    limit: int,
    window_seconds: int = 60,
) -> tuple[bool, int]:
    """Check rate limit using Redis if available, otherwise in-memory sliding window.

    Returns:
        (is_allowed, retry_after_seconds)
    """
    key = f"ratelimit:{scope}:{identifier}"

    # 1. Try Redis sliding window with sorted sets
    try:
        redis_client = await get_redis()
        if redis_client is not None:
            now = time.time()
            pipe = redis_client.pipeline()
            pipe.zremrangebyscore(key, 0, now - window_seconds)
            pipe.zcard(key)
            pipe.zadd(key, {str(now): now})
            pipe.expire(key, window_seconds + 5)
            results = await pipe.execute()

            current_count = results[1]
            if current_count >= limit:
                # Limit exceeded: fetch oldest timestamp in window to compute accurate retry_after
                oldest = await redis_client.zrange(key, 0, 0, withscores=True)
                if oldest and len(oldest) > 0:
                    oldest_score = oldest[0][1]
                    retry_after = max(1, int(oldest_score + window_seconds - now))
                else:
                    retry_after = window_seconds
                return False, retry_after

            return True, 0
    except Exception as exc:
        logger.warning("redis_rate_limit_fallback", error=str(exc), key=key)

    # 2. In-memory sliding window fallback
    return await _in_memory_limiter.check_and_increment(key, limit, window_seconds)
