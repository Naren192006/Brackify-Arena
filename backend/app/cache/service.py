import json
from collections.abc import Callable
from typing import Any

from app.cache.redis_client import get_redis
from app.core.logging import get_logger

logger = get_logger(__name__)


class CacheService:
    async def get(self, key: str) -> Any | None:
        client = await get_redis()
        if client is None:
            return None
        try:
            value = await client.get(key)
            if value is None:
                return None
            return json.loads(value)
        except Exception:
            logger.warning("cache_get_failed", key=key)
            return None

    async def set(self, key: str, value: Any, ttl_seconds: int) -> None:
        client = await get_redis()
        if client is None:
            return
        try:
            await client.setex(key, ttl_seconds, json.dumps(value, default=str))
        except Exception:
            logger.warning("cache_set_failed", key=key)

    async def delete(self, *keys: str) -> None:
        client = await get_redis()
        if client is None or not keys:
            return
        try:
            await client.delete(*keys)
        except Exception:
            logger.warning("cache_delete_failed", keys=keys)

    async def get_or_set(
        self,
        key: str,
        factory: Callable[[], Any],
        ttl_seconds: int,
    ) -> Any:
        cached = await self.get(key)
        if cached is not None:
            return cached
        value = await factory() if callable(factory) else factory
        await self.set(key, value, ttl_seconds)
        return value


cache_service = CacheService()
