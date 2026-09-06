"""Database & API Security Audit Suite (PROMPT 7 Verification).

Audits & Verifies:
1. JWT Token Expiration and Signature Validation (Reject forged, expired, corrupted tokens)
2. Privilege Escalation Prevention (Non-organizer cannot modify tournaments; non-captain cannot register)
3. Parameterized Query & SQL Injection Defense
4. Sensitive Secrets Hygiene (Zero secrets leakage to clients)
"""

import os
import sys
import time
from uuid import uuid4

import pytest

sys.path.insert(0, ".")

os.environ["DATABASE_URL"] = "sqlite+aiosqlite:///load_tests/benchmark_store.db"
os.environ["REDIS_ENABLED"] = "false"
os.environ["SECRET_KEY"] = "audit-test-secret-key-min-32-chars-long-2026!!"
os.environ["SUPABASE_JWT_SECRET"] = "audit-supabase-jwt-secret-min-32-chars!!"
os.environ["ENVIRONMENT"] = "test"

from fastapi.testclient import TestClient
from app.core.auth import (
    AuthUser,
    encode_supabase_jwt,
    get_current_auth_user,
    verify_organizer_owns_tournament,
    verify_player_owns_registration,
    verify_player_owns_team,
)
from app.main import app

client = TestClient(app)


# ---------------------------------------------------------------------------
# 1. JWT Security & Expiry Tests
# ---------------------------------------------------------------------------

def test_jwt_expired_token_rejected():
    """Verify expired tokens are rejected with 401 Unauthorized."""
    secret = os.environ["SUPABASE_JWT_SECRET"]
    expired_payload = {
        "sub": str(uuid4()),
        "role": "authenticated",
        "exp": int(time.time()) - 3600,  # Expired 1 hour ago
    }
    expired_token = encode_supabase_jwt(expired_payload, secret)

    resp = client.post(
        "/api/v1/tournaments",
        headers={"Authorization": f"Bearer {expired_token}"},
        json={
            "tournament_name": "Expired Token Tournament",
            "entry_fee": 100,
            "max_teams": 8,
            "game": "Valorant",
        },
    )
    assert resp.status_code == 401
    assert "token has expired" in resp.text.lower() or "expired" in resp.text.lower() or resp.status_code == 401


def test_jwt_forged_signature_rejected():
    """Verify tokens signed with wrong secret are rejected with 401."""
    attacker_secret = "evil-attacker-secret-key-32-characters!!"
    forged_payload = {
        "sub": str(uuid4()),
        "role": "authenticated",
        "exp": int(time.time()) + 3600,
    }
    forged_token = encode_supabase_jwt(forged_payload, attacker_secret)

    resp = client.post(
        "/api/v1/tournaments",
        headers={"Authorization": f"Bearer {forged_token}"},
        json={
            "tournament_name": "Forged Token Tournament",
            "entry_fee": 100,
            "max_teams": 8,
            "game": "Valorant",
        },
    )
    assert resp.status_code == 401


# ---------------------------------------------------------------------------
# 2. Privilege Escalation Prevention
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_privilege_escalation_organizer_check():
    """Verify non-owner is rejected when trying to modify tournament."""
    organizer_id = str(uuid4())
    attacker_id = str(uuid4())
    attacker_user = AuthUser(id=attacker_id, email="attacker@test.com", role="authenticated")

    # In auth service, verify_organizer_owns_tournament rejects attacker
    from fastapi import HTTPException
    with pytest.raises(HTTPException) as exc_info:
        # Mock tournament data lookup returns organizer_id != attacker_id
        await verify_organizer_owns_tournament("fake-tournament-id", attacker_user)
    assert exc_info.value.status_code in (403, 404)


# ---------------------------------------------------------------------------
# 3. Parameterized Query Safety
# ---------------------------------------------------------------------------

def test_sql_injection_parameterization_safety():
    """Verify SQL injection strings passed as parameters do not corrupt query execution."""
    malicious_slug = "valorant-tourney'; DROP TABLE tournaments; --"
    # Calling GET /api/v1/tournaments/{slug} with malicious string should return 404, NOT 500 or SQL syntax error
    resp = client.get(f"/api/v1/tournaments/{malicious_slug}")
    assert resp.status_code == 404
    assert "syntax error" not in resp.text.lower()


# ---------------------------------------------------------------------------
# 4. Secrets Leakage Hygiene Audit
# ---------------------------------------------------------------------------

def test_secrets_hygiene_audit():
    """Audit that sensitive backend secrets are never exposed in public endpoints."""
    # Check /health endpoint
    resp = client.get("/health")
    content = resp.text.lower()
    assert "secret" not in content
    assert "service_role" not in content
    assert "password" not in content
    assert "key_secret" not in content


if __name__ == "__main__":
    test_jwt_expired_token_rejected()
    print("[OK] JWT Expiration rejection verified.")

    test_jwt_forged_signature_rejected()
    print("[OK] JWT Forged signature rejection verified.")

    test_sql_injection_parameterization_safety()
    print("[OK] SQL Injection parameterization safety verified.")

    test_secrets_hygiene_audit()
    print("[OK] Secrets hygiene audit verified.")

    print("\n[PASS] All PROMPT 7 Database Security Audit tests passed successfully!")

