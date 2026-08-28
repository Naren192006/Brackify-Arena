from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse

from app.api.v1.router import api_router
from app.cache.redis_client import close_redis, ping_redis
from app.config import settings
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

from app.rate_limit.middleware import RateLimitMiddleware  # noqa: E402

app.add_middleware(RateLimitMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Request-ID", "X-Response-Time-Ms", "Server-Timing"],
)


@app.exception_handler(AppError)
async def app_error_handler(_request: Request, exc: AppError) -> JSONResponse:
    http_exc = app_error_to_http(exc)
    return JSONResponse(status_code=http_exc.status_code, content={"detail": http_exc.detail})


@app.get("/health")
async def health_check() -> dict:
    redis_ok = await ping_redis()
    return {
        "status": "ok",
        "environment": settings.environment,
        "redis": "ok" if redis_ok else "unavailable",
    }


@app.get("/metrics")
async def metrics():
    return await metrics_endpoint()


app.include_router(api_router, prefix=settings.api_v1_prefix)
