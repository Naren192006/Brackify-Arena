from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.config import settings

if settings.environment == "test":
    # Under pytest, async tests and sync TestClient tests run on different event
    # loops. A pooled asyncpg connection bound to one loop breaks when reused on
    # another ("Future attached to a different loop"), so disable pooling in the
    # test environment entirely.
    engine = create_async_engine(
        settings.database_url,
        poolclass=NullPool,
        connect_args={"statement_cache_size": 0},
    )
else:
    engine = create_async_engine(
        settings.database_url,
        pool_size=settings.db_pool_size,
        max_overflow=settings.db_max_overflow,
        pool_timeout=settings.db_pool_timeout,
        pool_recycle=settings.db_pool_recycle,
        pool_pre_ping=True,
        echo=settings.debug and settings.environment == "development",
    )

async_session_factory = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
    autocommit=False,
)


async def get_db_session() -> AsyncGenerator[AsyncSession, None]:
    async with async_session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
