"""Dedicated high-throughput benchmark server runner for Brackify Arena.

Configures:
1. respx HTTP interception for external WAN endpoints (Supabase REST and Razorpay).
2. SQLite in-memory database with realistic seed data.
3. High concurrency Uvicorn server configuration.
"""

from __future__ import annotations

import os
import sys
import uuid

import httpx
import respx
import uvicorn

from app.main import app

# Ensure backend root is in sys.path
BACKEND_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if BACKEND_ROOT not in sys.path:
    sys.path.insert(0, BACKEND_ROOT)


def setup_mock_transports() -> None:
    """Mock outbound third-party WAN network calls (Supabase & Razorpay) for load testing."""
    mock = respx.mock(assert_all_called=False)
    mock.start()

    # Razorpay Order Creation
    mock.post(url__regex=r"https://api\.razorpay\.com/v1/orders.*").mock(
        return_value=httpx.Response(
            200,
            json={
                "id": "order_locust_mock_12345",
                "entity": "order",
                "amount": 50000,
                "amount_paid": 0,
                "amount_due": 50000,
                "currency": "INR",
                "receipt": "rcpt_123",
                "status": "created",
                "attempts": 0,
            },
        )
    )

    # Supabase Atomic Registration RPC
    mock.post(url__regex=r".*/rest/v1/rpc/register_team_atomic.*").mock(
        return_value=httpx.Response(
            200,
            json={
                "id": str(uuid.uuid4()),
                "status": "pending",
                "payment_status": "pending",
                "requires_payment": True,
                "entry_fee_minor": 50000,
            },
        )
    )

    # Supabase Tournaments Query
    mock.get(url__regex=r".*/rest/v1/tournaments.*").mock(
        return_value=httpx.Response(
            200,
            json=[
                {
                    "id": "a0000000-0000-0000-0000-000000000001",
                    "title": "Valorant Champions Tour 2026",
                    "slug": "valorant-champions-tour-2026",
                    "status": "live",
                    "max_teams": 16,
                    "entry_fee_minor": 50000,
                    "registration_close_at": None,
                    "start_time": "2026-09-10T10:00:00Z",
                    "organizer_id": "b0000000-0000-0000-0000-000000000001",
                    "created_by": "b0000000-0000-0000-0000-000000000001",
                }
            ],
        )
    )

    # Supabase Matches Query (Bracket Loading)
    mock.get(url__regex=r".*/rest/v1/matches.*").mock(
        return_value=httpx.Response(
            200,
            json=[
                {
                    "id": str(uuid.uuid4()),
                    "round": 1,
                    "match_number": 1,
                    "status": "completed",
                    "tournament_id": "a0000000-0000-0000-0000-000000000001",
                    "winner_team_id": "c0000000-0000-0000-0000-000000000001",
                    "team1": {
                        "id": "c0000000-0000-0000-0000-000000000001",
                        "name": "Sentinels",
                        "tag": "SEN",
                    },
                    "team2": {
                        "id": "c0000000-0000-0000-0000-000000000002",
                        "name": "Fnatic",
                        "tag": "FNC",
                    },
                },
                {
                    "id": str(uuid.uuid4()),
                    "round": 2,
                    "match_number": 1,
                    "status": "scheduled",
                    "tournament_id": "a0000000-0000-0000-0000-000000000001",
                    "winner_team_id": None,
                    "team1": {
                        "id": "c0000000-0000-0000-0000-000000000001",
                        "name": "Sentinels",
                        "tag": "SEN",
                    },
                    "team2": None,
                },
            ],
        )
    )

    # Supabase Registrations & Teams
    mock.get(url__regex=r".*/rest/v1/tournament_registrations.*").mock(
        return_value=httpx.Response(
            200,
            json=[
                {
                    "id": str(uuid.uuid4()),
                    "tournament_id": "a0000000-0000-0000-0000-000000000001",
                    "team_id": "c0000000-0000-0000-0000-000000000001",
                    "status": "registered",
                    "payment_status": "paid",
                    "registered_by": "b0000000-0000-0000-0000-000000000001",
                }
            ],
        )
    )

    mock.get(url__regex=r".*/rest/v1/teams.*").mock(
        return_value=httpx.Response(
            200,
            json=[
                {
                    "id": "c0000000-0000-0000-0000-000000000001",
                    "name": "Sentinels",
                    "tag": "SEN",
                    "captain_id": "b0000000-0000-0000-0000-000000000001",
                }
            ],
        )
    )

    # Brackets & Rounds
    mock.get(url__regex=r".*/rest/v1/brackets.*").mock(
        return_value=httpx.Response(
            200,
            json=[
                {
                    "id": "d0000000-0000-0000-0000-000000000001",
                    "tournament_id": "a0000000-0000-0000-0000-000000000001",
                    "champion_team_id": None,
                    "total_rounds": 3,
                    "format": "single_elimination",
                }
            ],
        )
    )

    mock.get(url__regex=r".*/rest/v1/rounds.*").mock(
        return_value=httpx.Response(
            200,
            json=[
                {
                    "id": "e0000000-0000-0000-0000-000000000001",
                    "round_number": 1,
                    "round_type": "quarter_finals",
                },
                {
                    "id": "e0000000-0000-0000-0000-000000000002",
                    "round_number": 2,
                    "round_type": "semi_finals",
                },
                {
                    "id": "e0000000-0000-0000-0000-000000000003",
                    "round_number": 3,
                    "round_type": "finals",
                },
            ],
        )
    )

    mock.get(url__regex=r".*/rest/v1/admin_roles.*").mock(
        return_value=httpx.Response(200, json=[{"role": "admin"}])
    )

    mock.get(url__regex=r".*/rest/v1/team_members.*").mock(
        return_value=httpx.Response(200, json=[{"role": "captain"}])
    )

    # Universal Supabase & Razorpay fallbacks
    mock.get(url__regex=r".*/rest/v1/.*").mock(return_value=httpx.Response(200, json=[]))
    mock.post(url__regex=r".*/rest/v1/.*").mock(
        return_value=httpx.Response(201, json={"id": str(uuid.uuid4()), "status": "success"})
    )
    mock.patch(url__regex=r".*/rest/v1/.*").mock(
        return_value=httpx.Response(200, json={"status": "updated"})
    )
    mock.post(url__regex=r".*razorpay.*").mock(
        return_value=httpx.Response(
            200,
            json={
                "id": "order_mock123",
                "amount": 50000,
                "currency": "INR",
                "status": "created",
                "key_id": "rzp_test_mock",
            },
        )
    )


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    setup_mock_transports()
    uvicorn.run(
        app,
        host="127.0.0.1",
        port=port,
        log_level="warning",
        limit_concurrency=4000,
        backlog=4096,
        timeout_keep_alive=30,
    )
