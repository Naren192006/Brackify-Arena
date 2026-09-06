"""Rate Limiter Tests (PROMPT 1 Verification).

Tests all 5 specific requirements:
1. Registrations: max 5 per minute per user -> 429 on 6th request
2. Payment orders: max 3 per minute per user -> 429 on 4th request
3. Login attempts: max 10 per minute per IP -> 429 on 11th request
4. Tournament creation: max 2 per minute per user -> 429 on 3rd request
5. Header verification: Returns HTTP 429 with 'Retry-After' header and clear JSON error message
"""

import os
import sys
from uuid import uuid4

sys.path.insert(0, ".")

os.environ["DATABASE_URL"] = "sqlite+aiosqlite:///load_tests/benchmark_store.db"
os.environ["REDIS_ENABLED"] = "false"
os.environ["SECRET_KEY"] = "test-secret-key-rate-limiter-long-enough-32-chars!!"
os.environ["ENVIRONMENT"] = "test"

from fastapi.testclient import TestClient
from app.core.auth import AuthUser, get_current_auth_user
from app.main import app
from app.middleware.rate_limiter import _in_memory_limiter

client = TestClient(app)


def setup_function():
    """Reset the in-memory limiter store before each test."""
    import asyncio
    asyncio.run(_in_memory_limiter.reset())


def test_login_rate_limit_10_per_minute_per_ip():
    """Verify login is capped at 10 requests per minute per IP."""
    ip = "192.168.1.50"
    headers = {"X-Forwarded-For": ip}

    # First 10 login attempts pass rate limiter (may return 400/401/422 from auth logic, but not 429)
    for i in range(10):
        resp = client.post(
            "/api/v1/auth/login",
            headers=headers,
            json={"email": f"user{i}@test.com", "password": "WrongPassword123!"},
        )
        assert resp.status_code != 429, f"Attempt {i+1} was unexpectedly rate limited"

    # 11th login attempt must be blocked with HTTP 429 Too Many Requests
    resp_11 = client.post(
        "/api/v1/auth/login",
        headers=headers,
        json={"email": "user11@test.com", "password": "WrongPassword123!"},
    )
    assert resp_11.status_code == 429
    assert "Retry-After" in resp_11.headers
    retry_after = int(resp_11.headers["Retry-After"])
    assert retry_after >= 1

    data = resp_11.json()
    assert data["error"] == "rate_limit_exceeded"
    assert "Please try again in" in data["message"] or "Rate limit exceeded" in data["message"]


def test_tournament_creation_rate_limit_2_per_minute():
    """Verify tournament creation is capped at 2 requests per minute per user."""
    user_id = str(uuid4())
    headers = {"X-User-Id": user_id}

    app.dependency_overrides[get_current_auth_user] = lambda: AuthUser(
        id=user_id,
        email="organizer@brackify.gg",
        role="organizer",
    )

    try:
        # Request 1 & 2 succeed
        for i in range(2):
            resp = client.post(
                "/api/v1/tournaments",
                headers=headers,
                json={
                    "tournament_name": f"Tourney {i+1} Cup",
                    "entry_fee": 100,
                    "max_teams": 16,
                    "game": "Valorant",
                },
            )
            assert resp.status_code == 201, f"Creation {i+1} failed: {resp.text}"

        # Request 3 is blocked by rate limiter
        resp_3 = client.post(
            "/api/v1/tournaments",
            headers=headers,
            json={
                "tournament_name": "Tourney Spammed 3",
                "entry_fee": 100,
                "max_teams": 16,
                "game": "Valorant",
            },
        )
        assert resp_3.status_code == 429
        assert "Retry-After" in resp_3.headers
        assert resp_3.json()["error"] == "rate_limit_exceeded"
    finally:
        app.dependency_overrides.pop(get_current_auth_user, None)


def test_payment_order_rate_limit_3_per_minute():
    """Verify payment order creation is capped at 3 requests per minute per user."""
    user_id = str(uuid4())
    headers = {"X-User-Id": user_id}

    app.dependency_overrides[get_current_auth_user] = lambda: AuthUser(
        id=user_id,
        email="payer@brackify.gg",
        role="player",
    )

    try:
        # Requests 1, 2, 3 pass rate limiting (whether mocked service creates order or errors)
        for i in range(3):
            resp = client.post(
                "/api/v1/payments/order",
                headers=headers,
                json={
                    "tournament_id": str(uuid4()),
                    "amount": 250.0,
                    "user_id": user_id,
                },
            )
            # Must not be 429
            assert resp.status_code != 429, f"Order {i+1} was unexpectedly rate limited"

        # Request 4 must be rate limited with 429
        resp_4 = client.post(
            "/api/v1/payments/order",
            headers=headers,
            json={
                "tournament_id": str(uuid4()),
                "amount": 250.0,
                "user_id": user_id,
            },
        )
        assert resp_4.status_code == 429
        assert "Retry-After" in resp_4.headers
        assert resp_4.json()["error"] == "rate_limit_exceeded"
    finally:
        app.dependency_overrides.pop(get_current_auth_user, None)


def test_registration_rate_limit_5_per_minute():
    """Verify tournament registration is capped at 5 requests per minute per user."""
    user_id = str(uuid4())
    headers = {"X-User-Id": user_id}
    tournament_id = str(uuid4())

    app.dependency_overrides[get_current_auth_user] = lambda: AuthUser(
        id=user_id,
        email="player@brackify.gg",
        role="player",
    )

    try:
        # Requests 1..5 pass rate limiter
        for i in range(5):
            resp = client.post(
                f"/api/v1/tournaments/{tournament_id}/register",
                headers=headers,
                json={"team_id": str(uuid4())},
            )
            assert resp.status_code != 429, f"Registration {i+1} was unexpectedly rate limited"

        # Request 6 must return 429
        resp_6 = client.post(
            f"/api/v1/tournaments/{tournament_id}/register",
            headers=headers,
            json={"team_id": str(uuid4())},
        )
        assert resp_6.status_code == 429
        assert "Retry-After" in resp_6.headers
        assert resp_6.json()["error"] == "rate_limit_exceeded"
    finally:
        app.dependency_overrides.pop(get_current_auth_user, None)


if __name__ == "__main__":
    setup_function()
    test_login_rate_limit_10_per_minute_per_ip()
    print("[OK] Login rate limit (10/min/IP) verified.")

    setup_function()
    test_tournament_creation_rate_limit_2_per_minute()
    print("[OK] Tournament creation rate limit (2/min/user) verified.")

    setup_function()
    test_payment_order_rate_limit_3_per_minute()
    print("[OK] Payment order rate limit (3/min/user) verified.")

    setup_function()
    test_registration_rate_limit_5_per_minute()
    print("[OK] Registration rate limit (5/min/user) verified.")

    print("\n[PASS] All PROMPT 1 Rate Limiting tests passed successfully!")
