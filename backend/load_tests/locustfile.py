"""Locust load test suite for Brackify Arena.

Simulates concurrent gamer traffic across 5 core scenarios:
1. Browse Tournaments (listing & detail views)
2. Register Tournament (team registration with JWT auth)
3. Create Payment Order (Razorpay order initialization)
4. Fetch Bracket (full single-elimination tournament bracket)
5. Fetch Dashboard (user profile & tournament overview telemetry)

Supports scaling targets: 100, 250, and 500 concurrent users.
"""

from __future__ import annotations

import os
import random
import sys
import time
import uuid

from locust import FastHttpUser, between, tag, task

from app.core.auth import encode_supabase_jwt

# Ensure backend root is on sys.path for app imports
BACKEND_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if BACKEND_ROOT not in sys.path:
    sys.path.insert(0, BACKEND_ROOT)


class BrackifyArenaGamerUser(FastHttpUser):
    """Simulates realistic player & organizer workflows with valid Supabase JWTs."""

    host = os.environ.get("TARGET_HOST", "http://127.0.0.1:8008")
    network_timeout = 10.0
    connection_timeout = 10.0
    max_retries = 3

    # Dynamic player interaction pace: 50ms to 200ms
    wait_time = between(0.05, 0.2)

    def on_start(self) -> None:
        """Initialize user session with a unique UUID and authenticated Supabase JWT."""
        if self.environment and self.environment.host:
            self.client.base_url = self.environment.host
        self.user_id = str(uuid.uuid4())
        self.team_id = str(uuid.uuid4())
        self.email = f"gamer_{self.user_id[:8]}@arena.gg"

        # Generate a valid Supabase JWT for this user
        payload = {
            "sub": self.user_id,
            "aud": "authenticated",
            "role": "authenticated",
            "email": self.email,
            "exp": time.time() + 86400,  # valid for 24 hours
            "app_metadata": {"role": "player"},
            "user_metadata": {"username": f"player_{self.user_id[:6]}"},
        }
        self.token = encode_supabase_jwt(payload)
        self.auth_headers = {
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json",
            "X-User-Id": self.user_id,
        }

        # Cached active tournament pool for browsing & bracket fetches
        self.cached_tournaments: list[str] = [
            "valorant-champions-tour-2026",
            "apex-legends-arena-cup",
            "cs2-master-series-delhi",
            "rocket-league-rumble",
        ]
        self.last_registered_id: str | None = None

    # -----------------------------------------------------------------------
    # Scenario 1: Browse Tournaments (Read Heavy - Weight 4)
    # -----------------------------------------------------------------------
    @task(4)
    @tag("browse")
    def browse_tournaments(self) -> None:
        """Fetch tournament lists with pagination, search, and detail views."""
        page = random.randint(1, 3)
        page_size = random.choice([10, 20])

        with self.client.get(
            f"/api/v1/tournaments?page={page}&page_size={page_size}",
            headers=self.auth_headers,
            name="/api/v1/tournaments [list]",
            catch_response=True,
        ) as resp:
            if resp.status_code in (200, 404):
                resp.success()
                try:
                    data = resp.json()
                    items = data.get("items", [])
                    if items and isinstance(items, list):
                        slugs = [item["slug"] for item in items if "slug" in item]
                        if slugs:
                            self.cached_tournaments = slugs
                except Exception:
                    pass
            else:
                resp.failure(f"Browse tournament list failed with status: {resp.status_code}")

        # Follow up by browsing a specific tournament detail
        target_slug = random.choice(self.cached_tournaments)
        with self.client.get(
            f"/api/v1/tournaments/{target_slug}",
            headers=self.auth_headers,
            name="/api/v1/tournaments/{slug} [detail]",
            catch_response=True,
        ) as detail_resp:
            if detail_resp.status_code in (200, 404):
                detail_resp.success()
            else:
                detail_resp.failure(
                    f"Browse tournament detail failed with status: {detail_resp.status_code}"
                )

    # -----------------------------------------------------------------------
    # Scenario 2: Register Tournament (Write / Concurrency - Weight 2)
    # -----------------------------------------------------------------------
    @task(2)
    @tag("register")
    def register_tournament(self) -> None:
        """Register a team for a tournament with slot capacity and JWT verification."""
        target_tournament = random.choice(self.cached_tournaments)
        team_id = str(uuid.uuid4())

        payload = {
            "team_id": team_id,
            "user_id": self.user_id,
        }

        with self.client.post(
            f"/api/v1/tournaments/{target_tournament}/register",
            headers=self.auth_headers,
            json=payload,
            name="/api/v1/tournaments/{id}/register [create]",
            catch_response=True,
        ) as resp:
            # 201 Created = Success
            # 409 Conflict = Expected when tournament capacity full or duplicate
            # 403 Forbidden = Expected if registration closed or ownership enforced
            # 404 Not Found = Mock test tournament slug
            # 429 Too Many Requests = Rate limiter active (5 req/min)
            if resp.status_code in (201, 409, 403, 404, 429):
                resp.success()
                try:
                    res_json = resp.json()
                    if resp.status_code == 201 and "registration" in res_json:
                        self.last_registered_id = res_json["registration"].get("id")
                except Exception:
                    pass
            else:
                resp.failure(f"Unexpected status on tournament register: {resp.status_code}")

    # -----------------------------------------------------------------------
    # Scenario 3: Create Payment Order (Transactional - Weight 2)
    # -----------------------------------------------------------------------
    @task(2)
    @tag("payment")
    def create_payment_order(self) -> None:
        """Create a Razorpay order for an entry fee registration."""
        reg_id = self.last_registered_id or str(uuid.uuid4())
        payload = {
            "registration_id": reg_id,
            "amount_paise": 50000,  # Rs. 500
            "user_id": self.user_id,
        }

        with self.client.post(
            "/api/v1/payments/create-order",
            headers=self.auth_headers,
            json=payload,
            name="/api/v1/payments/create-order [create]",
            catch_response=True,
        ) as resp:
            # 201 = Order created
            # 403 = Ownership check (registration does not belong to user)
            # 400 / 404 = Registration not found / already paid
            # 429 = Rate limited (3 req/min/user)
            # 500 = Payment gateway unconfigured in test environment
            if resp.status_code in (201, 400, 403, 404, 429):
                resp.success()
            elif resp.status_code == 500 and "Razorpay" in resp.text:
                resp.success()  # Mock payment gateway credential absence in test
            else:
                resp.failure(f"Unexpected payment order response: {resp.status_code}")

    # -----------------------------------------------------------------------
    # Scenario 4: Fetch Bracket (High Query Cost / N+1 Elimination - Weight 3)
    # -----------------------------------------------------------------------
    @task(3)
    @tag("bracket")
    def fetch_bracket(self) -> None:
        """Fetch single-elimination tournament bracket with joined match & team data."""
        target_tournament = random.choice(self.cached_tournaments)

        with self.client.get(
            f"/api/v1/tournaments/{target_tournament}/bracket",
            headers=self.auth_headers,
            name="/api/v1/tournaments/{id}/bracket [fetch]",
            catch_response=True,
        ) as resp:
            if resp.status_code in (200, 404):
                resp.success()
            else:
                resp.failure(f"Fetch bracket returned unexpected status: {resp.status_code}")

        # Also hit match list endpoint
        with self.client.get(
            f"/api/v1/tournaments/{target_tournament}/matches",
            headers=self.auth_headers,
            name="/api/v1/tournaments/{id}/matches [fetch]",
            catch_response=True,
        ) as match_resp:
            if match_resp.status_code in (200, 404):
                match_resp.success()
            else:
                match_resp.failure(
                    f"Fetch matches returned unexpected status: {match_resp.status_code}"
                )

    # -----------------------------------------------------------------------
    # Scenario 5: Fetch Dashboard (Personalized Telemetry - Weight 3)
    # -----------------------------------------------------------------------
    @task(3)
    @tag("dashboard")
    def fetch_dashboard(self) -> None:
        """Fetch dashboard telemetry, active matches, and profile."""
        with self.client.get(
            "/api/v1/tournaments?status=live&page=1&page_size=5",
            headers=self.auth_headers,
            name="/api/v1/tournaments [dashboard-live]",
            catch_response=True,
        ) as resp:
            if resp.status_code in (200, 404):
                resp.success()
            else:
                resp.failure(f"Dashboard query returned unexpected status: {resp.status_code}")
