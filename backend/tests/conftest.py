import os
import pytest
import pytest_asyncio
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.db.session import get_db_session

TEST_DATABASE_URL = os.getenv("TEST_DATABASE_URL", "")
if not TEST_DATABASE_URL or "test" not in TEST_DATABASE_URL.lower():
    raise ValueError(f"TEST_DATABASE_URL invalid: {TEST_DATABASE_URL}")

@pytest.fixture(scope="function")
async def engine():
    async_engine = create_async_engine(TEST_DATABASE_URL, echo=False)
    yield async_engine
    await async_engine.dispose()

@pytest_asyncio.fixture(scope="function")
async def session(engine):
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with async_session() as s:
        yield s

@pytest_asyncio.fixture(scope="function", autouse=True)
async def clean_tables(engine):
    yield
    async with engine.begin() as conn:
        await conn.execute(text("""
            DO $$ DECLARE r RECORD;
            BEGIN
                FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public' 
                          AND tablename NOT IN ('alembic_version', 'spatial_ref_sys', 'games'))
                LOOP EXECUTE 'TRUNCATE TABLE public.' || quote_ident(r.tablename) || ' CASCADE';
                END LOOP;
            END $$;
        """))

@pytest_asyncio.fixture
async def client(session):
    app.dependency_overrides[get_db_session] = lambda: session
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()

@pytest_asyncio.fixture
async def registered_user(client):
    response = await client.post(
        "/api/v1/auth/register",
        json={
            "email": "player@example.com",
            "username": "player1",
            "password": "Securepass123!",
            "display_name": "Player One",
        },
    )
    assert response.status_code == 201
    return response.json()
