from typing import Any

from arq import cron
from arq.connections import RedisSettings

from app.config import settings
from app.core.logging import configure_logging, get_logger

logger = get_logger(__name__)


async def startup(ctx: dict[str, Any]) -> None:
    configure_logging(settings.environment)
    logger.info("worker_started")


async def shutdown(ctx: dict[str, Any]) -> None:
    logger.info("worker_stopped")


async def health_check_job(ctx: dict[str, Any]) -> str:
    logger.info("worker_health_check", status="ok")
    return "ok"


class WorkerSettings:
    functions = [health_check_job]
    cron_jobs = [cron(health_check_job, minute={0, 30})]
    redis_settings = RedisSettings.from_dsn(settings.redis_url)
    on_startup = startup
    on_shutdown = shutdown
