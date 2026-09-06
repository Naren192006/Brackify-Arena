"""Automated verification test for API rate limiting on protected endpoints."""

from __future__ import annotations

import asyncio
import sys

sys.path.insert(0, ".")

from starlette.requests import Request
from starlette.responses import Response

from app.rate_limit.limiter import _in_memory_limiter, check_rate_limit
from app.rate_limit.middleware import DEFAULT_RULES, RateLimitMiddleware


async def run_tests() -> None:
    print("========================================")
    print("Testing Rate Limiting Engine & Rules")
    print("========================================")

    await _in_memory_limiter.reset()

    # Dummy ASGI app for testing middleware
    async def dummy_app(scope, receive, send):
        response = Response(content='{"ok":true}', media_type="application/json", status_code=200)
        await response(scope, receive, send)

    middleware = RateLimitMiddleware(dummy_app)

    # -----------------------------------------------------------------------
    # Test 1: Tournament Start (1 request / minute / admin)
    # -----------------------------------------------------------------------
    print("\n[Test 1] Tournament Start Rate Limit (1 req / min / admin)...")
    rule = middleware._match_rule("POST", "/api/v1/tournaments/tourn-123/start")
    assert rule is not None, "Failed to match tournament start rule"
    assert rule.limit == 1, f"Expected limit 1, got {rule.limit}"

    admin_1 = "admin-user-001"
    ok1, retry1 = await check_rate_limit(rule.name, admin_1, rule.limit, rule.window_seconds)
    assert ok1 is True, "First tournament start request should succeed"
    assert retry1 == 0

    ok2, retry2 = await check_rate_limit(rule.name, admin_1, rule.limit, rule.window_seconds)
    assert ok2 is False, "Second tournament start request within 60s should be blocked"
    assert retry2 > 0 and retry2 <= 60, f"Expected retry_after between 1 and 60, got {retry2}"
    print(f"  [OK] Admin 1 blocked on 2nd request with retry_after={retry2}s")

    # Another admin should still be allowed
    admin_2 = "admin-user-002"
    ok_admin2, _ = await check_rate_limit(rule.name, admin_2, rule.limit, rule.window_seconds)
    assert ok_admin2 is True, "Different admin should be allowed"
    print("  [OK] Admin 2 allowed independently")

    # -----------------------------------------------------------------------
    # Test 2: Payments Create Order (3 requests / minute / user)
    # -----------------------------------------------------------------------
    print("\n[Test 2] Payments Create Order (3 req / min / user)...")
    p_rule = middleware._match_rule("POST", "/api/v1/payments/create-order")
    assert p_rule is not None, "Failed to match payment create-order rule"
    assert p_rule.limit == 3, f"Expected limit 3, got {p_rule.limit}"

    payer = "user-payer-100"
    for i in range(1, 4):
        ok, r = await check_rate_limit(p_rule.name, payer, p_rule.limit, p_rule.window_seconds)
        assert ok is True, f"Payment request {i} should succeed"
    print("  [OK] First 3 payment requests allowed")

    # 4th request must be blocked
    ok_p4, retry_p4 = await check_rate_limit(p_rule.name, payer, p_rule.limit, p_rule.window_seconds)
    assert ok_p4 is False, "4th payment request should be blocked (limit 3)"
    assert retry_p4 > 0, f"Expected retry_after > 0, got {retry_p4}"
    print(f"  [OK] 4th payment request blocked with retry_after={retry_p4}s")

    # -----------------------------------------------------------------------
    # Test 3: Tournament Registration (5 requests / minute / user)
    # -----------------------------------------------------------------------
    print("\n[Test 3] Tournament Registration (5 req / min / user)...")
    reg_rule = middleware._match_rule("POST", "/api/v1/tournaments/valorant-cup/register")
    assert reg_rule is not None, "Failed to match tournament registration rule"
    assert reg_rule.limit == 5, f"Expected limit 5, got {reg_rule.limit}"

    registrant = "user-team-captain-77"
    for i in range(1, 6):
        ok, _ = await check_rate_limit(reg_rule.name, registrant, reg_rule.limit, reg_rule.window_seconds)
        assert ok is True, f"Registration request {i} should succeed"
    print("  [OK] First 5 tournament registration requests allowed")

    ok_reg6, retry_reg6 = await check_rate_limit(reg_rule.name, registrant, reg_rule.limit, reg_rule.window_seconds)
    assert ok_reg6 is False, "6th registration request should be blocked"
    assert retry_reg6 > 0, f"Expected retry_after > 0, got {retry_reg6}"
    print(f"  [OK] 6th registration request blocked with retry_after={retry_reg6}s")

    # -----------------------------------------------------------------------
    # Test 4: Match Winner Updates (5 requests / minute / user)
    # -----------------------------------------------------------------------
    print("\n[Test 4] Match Winner Updates (5 req / min / user)...")
    winner_rule = middleware._match_rule("PATCH", "/api/v1/matches/match-42/winner")
    assert winner_rule is not None, "Failed to match match winner update rule"
    assert winner_rule.limit == 5, f"Expected limit 5, got {winner_rule.limit}"

    admin_scorer = "admin-referee-05"
    for i in range(1, 6):
        ok, _ = await check_rate_limit(winner_rule.name, admin_scorer, winner_rule.limit, winner_rule.window_seconds)
        assert ok is True, f"Match winner update {i} should succeed"
    print("  [OK] First 5 match winner update requests allowed")

    ok_w6, retry_w6 = await check_rate_limit(winner_rule.name, admin_scorer, winner_rule.limit, winner_rule.window_seconds)
    assert ok_w6 is False, "6th match winner request should be blocked"
    assert retry_w6 > 0, f"Expected retry_after > 0, got {retry_w6}"
    print(f"  [OK] 6th match winner update blocked with retry_after={retry_w6}s")

    # -----------------------------------------------------------------------
    # Test 5: Login (5 requests / minute / user)
    # -----------------------------------------------------------------------
    print("\n[Test 5] Login Rate Limiting (5 req / min / user)...")
    login_rule = middleware._match_rule("POST", "/api/v1/auth/login")
    assert login_rule is not None, "Failed to match login rule"
    assert login_rule.limit == 5, f"Expected limit 5, got {login_rule.limit}"

    login_ip = "192.168.1.50"
    for i in range(1, 6):
        ok, _ = await check_rate_limit(login_rule.name, login_ip, login_rule.limit, login_rule.window_seconds)
        assert ok is True, f"Login request {i} should succeed"
    print("  [OK] First 5 login requests allowed")

    ok_l6, retry_l6 = await check_rate_limit(login_rule.name, login_ip, login_rule.limit, login_rule.window_seconds)
    assert ok_l6 is False, "6th login request should be blocked"
    assert retry_l6 > 0, f"Expected retry_after > 0, got {retry_l6}"
    print(f"  [OK] 6th login request blocked with retry_after={retry_l6}s")

    # -----------------------------------------------------------------------
    # Test 6: HTTP 429 & Retry-After Header Generation
    # -----------------------------------------------------------------------
    print("\n[Test 6] Full Middleware HTTP 429 & Headers Generation...")
    # Simulate blocked request through middleware dispatch
    async def mock_call_next(req):
        return Response(content='{"status":"ok"}', status_code=200)

    # Make request with user that has exceeded limit
    blocked_request = Request(
        scope={
            "type": "http",
            "method": "POST",
            "path": "/api/v1/payments/create-order",
            "headers": [
                (b"content-type", b"application/json"),
                (b"x-user-id", payer.encode("utf-8")),
            ],
            "query_string": b"",
        }
    )

    response = await middleware.dispatch(blocked_request, mock_call_next)
    assert response.status_code == 429, f"Expected 429, got {response.status_code}"
    assert "Retry-After" in response.headers, "Response must include Retry-After header"
    retry_header_val = int(response.headers["Retry-After"])
    assert retry_header_val > 0, f"Retry-After header must be > 0, got {retry_header_val}"

    import json
    body_data = json.loads(response.body.decode())
    assert body_data["detail"]["code"] == "rate_limit_exceeded"
    assert "retry_after" in body_data["detail"]
    assert body_data["retry_after"] == retry_header_val
    print(f"  [OK] Received HTTP 429 with Retry-After header = {retry_header_val}s")
    print(f"  [OK] Response body correctly contains retry_after: {body_data['retry_after']}")

    print("\n========================================")
    print("ALL RATE LIMITING TESTS PASSED (6/6) [OK]")
    print("========================================")


if __name__ == "__main__":
    asyncio.run(run_tests())
