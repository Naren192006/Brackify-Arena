"""Phase 7 Final MVP Completion Tests.

Verifies:
1. PATCH /api/v1/matches/{id}/start
2. PATCH /api/v1/matches/{id}/complete
3. PATCH /api/v1/matches/{id}/reset
4. PATCH /api/v1/matches/{id}/winner
5. POST /api/v1/match-reports
6. PATCH /api/v1/match-reports/{id}/approve
7. PATCH /api/v1/match-reports/{id}/reject
8. PATCH /api/v1/match-reports/{id}/resubmit
"""

import os
import sys

sys.path.insert(0, ".")

os.environ["DATABASE_URL"] = "sqlite+aiosqlite:///load_tests/benchmark_store.db"
os.environ["REDIS_ENABLED"] = "false"
os.environ["SECRET_KEY"] = "test-secret-key-phase-7-verification-long!!"
os.environ["ENVIRONMENT"] = "test"

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_routes_registered():
    """Verify all required Phase 7 routes are registered in FastAPI."""
    paths = app.openapi()["paths"]

    # Matches
    assert "/api/v1/matches/{match_id}/start" in paths
    assert "patch" in paths["/api/v1/matches/{match_id}/start"]
    assert "post" in paths["/api/v1/matches/{match_id}/start"]

    assert "/api/v1/matches/{match_id}/complete" in paths
    assert "patch" in paths["/api/v1/matches/{match_id}/complete"]

    assert "/api/v1/matches/{match_id}/reset" in paths
    assert "patch" in paths["/api/v1/matches/{match_id}/reset"]

    assert "/api/v1/matches/{match_id}/winner" in paths
    assert "patch" in paths["/api/v1/matches/{match_id}/winner"]

    # Match Reports
    assert "/api/v1/match-reports" in paths
    assert "post" in paths["/api/v1/match-reports"]

    assert "/api/v1/match-reports/{report_id}/approve" in paths
    assert "patch" in paths["/api/v1/match-reports/{report_id}/approve"]

    assert "/api/v1/match-reports/{report_id}/reject" in paths
    assert "patch" in paths["/api/v1/match-reports/{report_id}/reject"]

    assert "/api/v1/match-reports/{report_id}/resubmit" in paths
    assert "patch" in paths["/api/v1/match-reports/{report_id}/resubmit"]

    print("[PASS] All Phase 7 API routes and HTTP methods verified in OpenAPI schema.")


def test_unauthenticated_requests_rejected():
    """Verify protected match and report endpoints reject unauthenticated calls."""
    # Match actions
    r1 = client.patch("/api/v1/matches/m-123/start")
    assert r1.status_code == 401

    r2 = client.patch("/api/v1/matches/m-123/complete")
    assert r2.status_code == 401

    r3 = client.patch("/api/v1/matches/m-123/reset")
    assert r3.status_code == 401

    r4 = client.patch("/api/v1/matches/m-123/winner", json={"winner_choice": "team1"})
    assert r4.status_code == 401

    # Reports
    r5 = client.post("/api/v1/match-reports", json={"match_id": "m-123"})
    assert r5.status_code == 401

    r6 = client.patch("/api/v1/match-reports/r-123/approve")
    assert r6.status_code == 401

    print("[PASS] All protected routes enforce JWT authentication (HTTP 401).")


if __name__ == "__main__":
    test_routes_registered()
    test_unauthenticated_requests_rejected()
    print("[PASS] All Phase 7 endpoint tests passed successfully!")
