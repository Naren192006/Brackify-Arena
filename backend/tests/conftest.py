import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.config import settings
from app.db.session import get_db_session
from app.main import app
from app.models import Base

TEST_DATABASE_URL = settings.database_url


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest_asyncio.fixture(scope="session")
async def engine():
    engine = create_async_engine(
        TEST_DATABASE_URL,
        pool_pre_ping=True,
        connect_args={"statement_cache_size": 0},
    )

    # Idempotent schema setup: drop public schema objects so the schema always
    # matches the current models. create_all() is not a migration tool - stale
    # tables/constraints from previous model revisions must not survive here.
    async with engine.begin() as conn:
        # asyncpg forbids multiple commands per prepared statement.
        await conn.execute(text("DROP SCHEMA public CASCADE"))
        await conn.execute(text("CREATE SCHEMA public"))
        await conn.execute(text("GRANT ALL ON SCHEMA public TO public"))
        await conn.run_sync(Base.metadata.create_all)

    yield engine

    await engine.dispose()


@pytest_asyncio.fixture
async def db_session_factory(engine):
    async with engine.connect() as connection:
        transaction = await connection.begin()

        Session = async_sessionmaker(
            bind=connection,
            class_=AsyncSession,
            expire_on_commit=False,
        )

        yield Session

        # Roll back everything created during the test.
        await transaction.rollback()


@pytest.fixture(autouse=True)
def reset_rate_limiter_state():
    """Reset the global in-memory sliding-window limiter between tests.

    The limiter is module-global and never resets on its own, so counts from
    one test leak into the next and cause spurious 429s once limits are hit.
    """
    from app.middleware.rate_limiter import _in_memory_limiter

    _in_memory_limiter._store = {}

    yield

    _in_memory_limiter._store = {}


@pytest_asyncio.fixture
async def client(db_session_factory):
    async def override_get_db():
        async with db_session_factory() as session:
            yield session

    app.dependency_overrides[get_db_session] = override_get_db

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as client:
        yield client

    app.dependency_overrides.clear()


@pytest_asyncio.fixture
async def registered_user(client: AsyncClient):
    payload = {
        "email": "player@example.com",
        "username": "player1",
        "password": "Securepass123!",
        "display_name": "Player One",
    }

    response = await client.post("/api/v1/auth/register", json=payload)
    assert response.status_code == 201
    return response.json()