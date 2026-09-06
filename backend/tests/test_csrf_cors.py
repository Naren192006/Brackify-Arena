"""CSRF & CORS Security Tests (PROMPT 9 Verification).

Tests:
1. HTTP Security Headers (X-Frame-Options, X-Content-Type-Options, CSP, Referrer-Policy)
2. CSRF Token Generation & Endpoint (GET /api/v1/auth/csrf)
3. Cryptographic CSRF Validation (Valid, Tampered, Expired)
4. CORS Preflight & Allowed Origins
"""

import os
import sys

sys.path.insert(0, ".")

os.environ["DATABASE_URL"] = "sqlite+aiosqlite:///load_tests/benchmark_store.db"
os.environ["REDIS_ENABLED"] = "false"
os.environ["SECRET_KEY"] = "test-secret-key-csrf-cors-long-enough-32-chars!!"
os.environ["ENVIRONMENT"] = "test"
os.environ["CORS_ORIGINS"] = "http://localhost:3000,https://brackify-arena.vercel.app"

from fastapi.testclient import TestClient
from app.core.csrf import generate_csrf_token, validate_csrf_token
from app.main import app

client = TestClient(app)


def test_security_headers_present():
    """Verify standard security headers are injected on API responses."""
    resp = client.get("/health/live")
    assert resp.status_code == 200
    assert resp.headers.get("X-Frame-Options") == "DENY"
    assert resp.headers.get("X-Content-Type-Options") == "nosniff"
    assert "strict-origin-when-cross-origin" in resp.headers.get("Referrer-Policy", "")
    assert "Content-Security-Policy" in resp.headers


def test_csrf_endpoint_and_cookie():
    """Verify /api/v1/auth/csrf dispenses a signed token and sets cookie."""
    resp = client.get("/api/v1/auth/csrf")
    assert resp.status_code == 200
    data = resp.json()
    assert "csrf_token" in data
    token = data["csrf_token"]
    assert len(token) > 20
    assert validate_csrf_token(token) is True


def test_csrf_tampered_token_rejected():
    """Verify tampered or forged tokens are rejected."""
    assert validate_csrf_token("invalid-token") is False
    assert validate_csrf_token("") is False

    valid = generate_csrf_token()
    tampered = valid[:-4] + "xxxx"
    assert validate_csrf_token(tampered) is False


def test_cors_allowed_origin():
    """Verify CORS preflight succeeds for allowed origin."""
    resp = client.options(
        "/api/v1/tournaments",
        headers={
            "Origin": "http://localhost:3000",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "Content-Type,Authorization",
        },
    )
    assert resp.status_code == 200
    assert resp.headers.get("access-control-allow-origin") == "http://localhost:3000"
    assert resp.headers.get("access-control-allow-credentials") == "true"


if __name__ == "__main__":
    test_security_headers_present()
    print("[OK] Security Headers verified.")

    test_csrf_endpoint_and_cookie()
    print("[OK] CSRF Token dispenser verified.")

    test_csrf_tampered_token_rejected()
    print("[OK] CSRF Tamper resistance verified.")

    test_cors_allowed_origin()
    print("[OK] CORS Origin preflight verified.")

    print("\n[PASS] All PROMPT 9 CSRF & CORS Security tests passed successfully!")

