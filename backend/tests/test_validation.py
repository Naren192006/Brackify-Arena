"""Input Validation & Security Hardening Tests (PROMPT 2).

Tests:
1. SQL injection prevention across string inputs
2. XSS payload detection and sanitization
3. Numeric boundary validation (entry_fee, max_teams, amount)
4. Password strength enforcement (upper, lower, digit, symbol, length)
5. Username character restriction (alphanumeric + underscore)
6. Supported game enum validation
7. Custom exception handler response format (no DB or internal leak)
"""

import os
import sys
from uuid import uuid4

import pytest
from pydantic import ValidationError

sys.path.insert(0, ".")

os.environ["DATABASE_URL"] = "sqlite+aiosqlite:///load_tests/benchmark_store.db"
os.environ["REDIS_ENABLED"] = "false"
os.environ["SECRET_KEY"] = "test-secret-key-validation-hardening-long!!"
os.environ["ENVIRONMENT"] = "test"

from fastapi.testclient import TestClient
from app.main import app
from app.schemas.validation import (
    CreatePaymentOrderInput,
    CreateTeamInput,
    CreateTournamentInput,
    SignupInput,
    SupportedGame,
    check_sql_injection,
    check_xss,
    sanitize_string,
)

client = TestClient(app)


# ---------------------------------------------------------------------------
# 1. SQL Injection Prevention Tests
# ---------------------------------------------------------------------------

def test_sql_injection_detected():
    """Verify SQL injection patterns are caught and rejected."""
    sqli_payloads = [
        "Valorant'; DROP TABLE tournaments; --",
        "Apex' OR 1=1 --",
        "Team /* comment */ Alpha",
        "CS2; EXEC(xp_cmdshell 'dir')",
        "Arena' UNION SELECT 1, 2, 3 --",
    ]
    for payload in sqli_payloads:
        with pytest.raises((ValueError, ValidationError)):
            CreateTournamentInput(
                tournament_name=payload,
                entry_fee=100,
                max_teams=16,
                game=SupportedGame.VALORANT,
            )


# ---------------------------------------------------------------------------
# 2. XSS Prevention Tests
# ---------------------------------------------------------------------------

def test_xss_injection_detected():
    """Verify script injection and XSS handlers are blocked."""
    xss_payloads = [
        "<script>alert('pwned')</script>",
        "<iframe src='javascript:alert(1)'></iframe>",
        "<img src=x onerror=alert('xss')>",
        "javascript:alert(1)",
    ]
    for payload in xss_payloads:
        with pytest.raises((ValueError, ValidationError)):
            CreateTeamInput(
                team_name=payload,
                captain_id=uuid4(),
                game=SupportedGame.VALORANT,
            )


# ---------------------------------------------------------------------------
# 3. Numeric Boundary Tests
# ---------------------------------------------------------------------------

def test_tournament_numeric_boundaries():
    """Verify entry fee (0-100,000) and max_teams (2-128) boundary checks."""
    # Negative entry fee
    with pytest.raises(ValidationError):
        CreateTournamentInput(
            tournament_name="Valid Tourney",
            entry_fee=-10,
            max_teams=16,
            game=SupportedGame.VALORANT,
        )

    # Excessive entry fee > 100,000
    with pytest.raises(ValidationError):
        CreateTournamentInput(
            tournament_name="Valid Tourney",
            entry_fee=150000,
            max_teams=16,
            game=SupportedGame.VALORANT,
        )

    # Max teams too low (< 2)
    with pytest.raises(ValidationError):
        CreateTournamentInput(
            tournament_name="Valid Tourney",
            entry_fee=50,
            max_teams=1,
            game=SupportedGame.VALORANT,
        )

    # Max teams too high (> 128)
    with pytest.raises(ValidationError):
        CreateTournamentInput(
            tournament_name="Valid Tourney",
            entry_fee=50,
            max_teams=256,
            game=SupportedGame.VALORANT,
        )


def test_payment_order_boundaries():
    """Verify payment amount limits (1 - 100,000 INR)."""
    # 0 amount rejected
    with pytest.raises(ValidationError):
        CreatePaymentOrderInput(
            tournament_id=uuid4(),
            amount=0,
            user_id=uuid4(),
        )

    # Amount > 100,000 rejected
    with pytest.raises(ValidationError):
        CreatePaymentOrderInput(
            tournament_id=uuid4(),
            amount=100001,
            user_id=uuid4(),
        )

    # Valid payment order accepted
    order = CreatePaymentOrderInput(
        tournament_id=uuid4(),
        amount=500.0,
        user_id=uuid4(),
    )
    assert order.amount == 500.0


# ---------------------------------------------------------------------------
# 4. Password Strength & Signup Validation Tests
# ---------------------------------------------------------------------------

def test_password_strength_enforcement():
    """Verify strong password requirement (upper, lower, digit, symbol, 8-128)."""
    # Too short (< 8)
    with pytest.raises(ValidationError) as exc:
        SignupInput(email="pro@gamer.com", username="pro_gamer", password="Ab1!")
    assert "at least 8 characters" in str(exc.value)

    # Missing uppercase
    with pytest.raises(ValidationError) as exc:
        SignupInput(email="pro@gamer.com", username="pro_gamer", password="password123!")
    assert "uppercase" in str(exc.value)

    # Missing lowercase
    with pytest.raises(ValidationError) as exc:
        SignupInput(email="pro@gamer.com", username="pro_gamer", password="PASSWORD123!")
    assert "lowercase" in str(exc.value)

    # Missing digit
    with pytest.raises(ValidationError) as exc:
        SignupInput(email="pro@gamer.com", username="pro_gamer", password="PasswordStrong!")
    assert "number" in str(exc.value)

    # Missing symbol
    with pytest.raises(ValidationError) as exc:
        SignupInput(email="pro@gamer.com", username="pro_gamer", password="Password1234")
    assert "special symbol" in str(exc.value)

    # Valid strong password passes
    valid = SignupInput(
        email="champion@brackify.gg",
        username="champion_99",
        password="SecureP@ssw0rd!2026",
    )
    assert valid.username == "champion_99"


def test_username_character_restriction():
    """Verify username only allows alphanumeric + underscore."""
    invalid_usernames = ["user name", "user@name", "user-name", "user#123", "a"]
    for u in invalid_usernames:
        with pytest.raises(ValidationError):
            SignupInput(
                email="user@test.com",
                username=u,
                password="ValidP@ssw0rd1",
            )


# ---------------------------------------------------------------------------
# 5. Game Enum Normalization
# ---------------------------------------------------------------------------

def test_game_enum_normalization():
    """Verify case-insensitive game matching."""
    t1 = CreateTournamentInput(
        tournament_name="Valorant Masters",
        entry_fee=250,
        max_teams=8,
        game="valorant",
    )
    assert t1.game == SupportedGame.VALORANT

    t2 = CreateTournamentInput(
        tournament_name="CS2 Major",
        entry_fee=0,
        max_teams=16,
        game="counter-strike 2",
    )
    assert t2.game == SupportedGame.CS2

    with pytest.raises(ValidationError):
        CreateTournamentInput(
            tournament_name="Fortnite Cup",
            entry_fee=0,
            max_teams=16,
            game="Fortnite",
        )


# ---------------------------------------------------------------------------
# 6. HTTP API Validation Error Responses
# ---------------------------------------------------------------------------

def test_api_validation_error_handler():
    """Verify HTTP API returns standardized, clean error responses without DB leaks."""
    # 1. Test POST /api/v1/auth/signup with invalid password / username
    resp_auth = client.post("/api/v1/auth/signup", json={
        "email": "invalid-email",
        "username": "bad user name!",
        "password": "123",
    })
    assert resp_auth.status_code == 422
    data_auth = resp_auth.json()
    assert data_auth["error"] == "validation_error"
    assert "Invalid input" in data_auth["message"]
    assert len(data_auth["details"]) > 0

    # 2. Test POST /api/v1/tournaments with authenticated user and invalid payload
    from app.core.auth import AuthUser, get_current_auth_user
    app.dependency_overrides[get_current_auth_user] = lambda: AuthUser(
        id="00000000-0000-0000-0000-000000000001",
        email="test@brackify.gg",
        role="organizer",
    )
    try:
        resp = client.post("/api/v1/tournaments", json={
            "tournament_name": "A",  # too short
            "entry_fee": -50,         # negative
            "max_teams": 500,        # too large
            "game": "InvalidGame",
        })
        assert resp.status_code == 422
        data = resp.json()
        assert data["error"] == "validation_error"
        assert "Invalid input" in data["message"]
        assert len(data["details"]) > 0
    finally:
        app.dependency_overrides.pop(get_current_auth_user, None)


if __name__ == "__main__":
    test_sql_injection_detected()
    test_xss_injection_detected()
    test_tournament_numeric_boundaries()
    test_payment_order_boundaries()
    test_password_strength_enforcement()
    test_username_character_restriction()
    test_game_enum_normalization()
    test_api_validation_error_handler()
    print("[PASS] All Input Validation & Security Hardening tests passed successfully!")
