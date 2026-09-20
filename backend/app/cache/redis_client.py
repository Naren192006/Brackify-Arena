from typing import Any

try:
    import redis.asyncio as redis
except ImportError:
    redis = None  # type: ignore[assignment]

from app.config import settings

_redis_client: Any | None = None


async def get_redis() -> Any | None:
    global _redis_client
    if redis is None or not settings.redis_enabled:
        return None
    if _redis_client is None:
        _redis_client = redis.from_url(  # type: ignore[no-untyped-call]
            settings.redis_url,
            encoding="utf-8",
            decode_responses=True,
        )
    return _redis_client


async def close_redis() -> None:
    global _redis_client
    if _redis_client is not None:
        await _redis_client.aclose()
        _redis_client = None


async def ping_redis() -> bool:
    client = await get_redis()
    if client is None:
        return False
    try:
        return bool(await client.ping())
    except Exception:
        return False
