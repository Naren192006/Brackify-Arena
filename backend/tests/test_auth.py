import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_register_success(client: AsyncClient):
    response = await client.post(
        "/api/v1/auth/register",
        json={
            "email": "newuser@example.com",
            "username": "newuser",
            "password": "Password123!",
            "display_name": "New User",
        },
    )
    assert response.status_code == 201
    data = response.json()
    assert data["user"]["email"] == "newuser@example.com"
    assert data["user"]["username"] == "newuser"
    assert "access_token" in response.cookies


@pytest.mark.asyncio
async def test_register_duplicate_email(client: AsyncClient, registered_user: dict):
    response = await client.post(
        "/api/v1/auth/register",
        json={
            "email": "player@example.com",
            "username": "otheruser",
            "password": "Password123!",
        },
    )
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "email_exists"


@pytest.mark.asyncio
async def test_register_duplicate_username(client: AsyncClient, registered_user: dict):
    response = await client.post(
        "/api/v1/auth/register",
        json={
            "email": "other@example.com",
            "username": "player1",
            "password": "Password123!",
        },
    )
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "username_exists"


@pytest.mark.asyncio
async def test_login_success(client: AsyncClient, registered_user: dict):
    response = await client.post(
        "/api/v1/auth/login",
        json={"email": "player@example.com", "password": "Securepass123!"},
    )
    assert response.status_code == 200
    assert response.json()["user"]["username"] == "player1"


@pytest.mark.asyncio
async def test_login_invalid_credentials(client: AsyncClient, registered_user: dict):
    response = await client.post(
        "/api/v1/auth/login",
        json={"email": "player@example.com", "password": "wrongpassword"},
    )
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_get_me_authenticated(client: AsyncClient, registered_user: dict):
    await client.post(
        "/api/v1/auth/login",
        json={"email": "player@example.com", "password": "Securepass123!"},
    )
    response = await client.get("/api/v1/auth/me")
    assert response.status_code == 200
    assert response.json()["user"]["email"] == "player@example.com"


@pytest.mark.asyncio
async def test_get_me_unauthenticated(client: AsyncClient):
    response = await client.get("/api/v1/auth/me")
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_refresh_token(client: AsyncClient, registered_user: dict):
    await client.post(
        "/api/v1/auth/login",
        json={"email": "player@example.com", "password": "Securepass123!"},
    )
    response = await client.post("/api/v1/auth/refresh")
    assert response.status_code == 200
    assert response.json()["user"]["username"] == "player1"


@pytest.mark.asyncio
async def test_logout(client: AsyncClient, registered_user: dict):
    await client.post(
        "/api/v1/auth/login",
        json={"email": "player@example.com", "password": "Securepass123!"},
    )
    response = await client.post("/api/v1/auth/logout")
    assert response.status_code == 204
    me = await client.get("/api/v1/auth/me")
    assert me.status_code == 401


@pytest.mark.asyncio
async def test_update_profile(client: AsyncClient, registered_user: dict):
    await client.post(
        "/api/v1/auth/login",
        json={"email": "player@example.com", "password": "Securepass123!"},
    )
    response = await client.patch(
        "/api/v1/users/me",
        json={"display_name": "Updated Name", "bio": "Esports player"},
    )
    assert response.status_code == 200
    assert response.json()["display_name"] == "Updated Name"
    assert response.json()["bio"] == "Esports player"


@pytest.mark.asyncio
async def test_correlation_id_header(client: AsyncClient):
    response = await client.get("/health", headers={"X-Request-ID": "test-correlation-123"})
    assert response.headers.get("X-Request-ID") == "test-correlation-123"
