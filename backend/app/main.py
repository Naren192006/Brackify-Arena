from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse

from app.api.v1.router import api_router
from app.cache.redis_client import close_redis, ping_redis
from app.config import settings
from app.core.error_handlers import register_error_handlers
from app.core.exceptions import AppError, app_error_to_http
from app.core.logging import configure_logging, get_logger
from app.db.session import engine
from app.middleware.correlation import CorrelationIdMiddleware, TimingMiddleware
from app.middleware.metrics import PrometheusMiddleware, metrics_endpoint

logger = get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    configure_logging(settings.environment)
    logger.info("application_starting", environment=settings.environment)
    yield
    await close_redis()
    await engine.dispose()
    logger.info("application_stopped")


app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    docs_url="/docs" if not settings.is_production else None,
    redoc_url="/redoc" if not settings.is_production else None,
    lifespan=lifespan,
)

app.add_middleware(GZipMiddleware, minimum_size=500)
app.add_middleware(CorrelationIdMiddleware)
app.add_middleware(TimingMiddleware)
app.add_middleware(PrometheusMiddleware)

from app.middleware.rate_limiter import RateLimitMiddleware  # noqa: E402
from app.middleware.security_headers import SecurityHeadersMiddleware  # noqa: E402

app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(RateLimitMiddleware)

if settings.allowed_hosts != "*":
    from fastapi.middleware.trustedhost import TrustedHostMiddleware

    app.add_middleware(TrustedHostMiddleware, allowed_hosts=settings.allowed_hosts_list)

DEFAULT_CORS_ORIGINS = [
    "https://brackify-arena-self.vercel.app",
    "https://brackify-arena.vercel.app",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:8000",
    "http://127.0.0.1:8000",
]

cors_origins = list(
    dict.fromkeys(
        DEFAULT_CORS_ORIGINS + settings.cors_origins_list + [settings.frontend_url.rstrip("/")]
    )
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_origin_regex=r"^https:\/\/.*\.vercel\.app$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Request-ID", "X-Response-Time-Ms", "Server-Timing", "X-CSRF-Token"],
)


register_error_handlers(app)


@app.exception_handler(AppError)
async def app_error_handler(_request: Request, exc: AppError) -> JSONResponse:
    http_exc = app_error_to_http(exc)
    return JSONResponse(status_code=http_exc.status_code, content={"detail": http_exc.detail})


async def _check_db_health() -> bool:
    """Verify primary database connectivity via lightweight query."""
    try:
        from sqlalchemy import text

        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        return True
    except Exception as exc:
        logger.warning("health_db_check_failed", error=str(exc))
        return False


@app.get("/health/live")
async def liveness_check() -> dict:
    """Lightweight Kubernetes/Render liveness probe."""
    import datetime

    return {
        "status": "alive",
        "timestamp": datetime.datetime.now(datetime.UTC).isoformat(),
    }


@app.get("/health/ready")
@app.get("/health")
async def health_check() -> JSONResponse:
    """Comprehensive readiness probe verifying DB, cache, and service availability."""
    db_ok = await _check_db_health()
    redis_ok = await ping_redis() if settings.redis_enabled else True

    # Database is critical; redis is optional if disabled or degraded
    is_healthy = db_ok
    status_code = 200 if is_healthy else 503

    return JSONResponse(
        status_code=status_code,
        content={
            "status": "healthy" if is_healthy else "unhealthy",
            "app": settings.app_name,
            "version": "0.1.0",
            "environment": settings.environment,
            "dependencies": {
                "database": "ok" if db_ok else "unavailable",
                "redis": "ok"
                if redis_ok
                else ("disabled" if not settings.redis_enabled else "degraded"),
            },
        },
    )


@app.get("/metrics")
async def metrics():
    return await metrics_endpoint()


app.include_router(api_router, prefix=settings.api_v1_prefix)
