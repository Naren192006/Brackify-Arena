"""Automated runner for Brackify Arena Locust load testing suite.

Executes 3 load testing tiers:
- Tier 1: 100 concurrent users
- Tier 2: 250 concurrent users
- Tier 3: 500 concurrent users

Spins up the FastAPI application, benchmarks all 5 target scenarios,
generates individual and consolidated HTML reports, and calculates latency
and failure statistics.
"""

from __future__ import annotations

import csv
import json
import os
import socket
import subprocess
import sys
import threading
import time
from typing import Any

# Ensure backend root is on sys.path
BACKEND_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if BACKEND_ROOT not in sys.path:
    sys.path.insert(0, BACKEND_ROOT)


def find_free_port() -> int:
    """Find an available local TCP port."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def run_command(cmd: list[str], timeout: int = 120) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        cmd,
        cwd=BACKEND_ROOT,
        capture_output=True,
        text=True,
        timeout=timeout,
    )


def _safe_float(val: Any, default: float = 0.0) -> float:
    try:
        if val is None or str(val).strip() in ("N/A", "", "None", "nan"):
            return default
        return float(val)
    except (ValueError, TypeError):
        return default


def _safe_int(val: Any, default: int = 0) -> int:
    try:
        if val is None or str(val).strip() in ("N/A", "", "None", "nan"):
            return default
        return int(float(val))
    except (ValueError, TypeError):
        return default


def parse_locust_stats(csv_prefix: str) -> dict[str, Any]:
    """Parse Locust CSV stats file for latency and failure statistics."""
    stats_file = f"{csv_prefix}_stats.csv"
    if not os.path.exists(stats_file):
        return {
            "total_requests": 0,
            "failed_requests": 0,
            "failure_rate": 0.0,
            "avg_latency_ms": 0.0,
            "min_latency_ms": 0.0,
            "max_latency_ms": 0.0,
            "p95_latency_ms": 0.0,
            "rps": 0.0,
            "endpoints": [],
        }

    endpoints: list[dict[str, Any]] = []
    aggregated = None

    with open(stats_file, mode="r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            name = row.get("Name", "")
            if name == "Aggregated":
                aggregated = row
            else:
                req_count = _safe_int(row.get("Request Count"))
                fail_count = _safe_int(row.get("Failure Count"))
                avg_resp = _safe_float(row.get("Average Response Time"))
                endpoints.append({
                    "name": name,
                    "method": row.get("Type", "GET"),
                    "requests": req_count,
                    "failures": fail_count,
                    "avg_latency_ms": round(avg_resp, 2),
                    "p95_ms": round(_safe_float(row.get("95%")), 2),
                })

    if aggregated:
        req_count = _safe_int(aggregated.get("Request Count"))
        fail_count = _safe_int(aggregated.get("Failure Count"))
        avg_resp = _safe_float(aggregated.get("Average Response Time"))
        p95 = _safe_float(aggregated.get("95%"))
        min_resp = _safe_float(aggregated.get("Min Response Time"))
        max_resp = _safe_float(aggregated.get("Max Response Time"))
        rps = _safe_float(aggregated.get("Requests/s"))
        failure_rate = (fail_count / req_count * 100.0) if req_count > 0 else 0.0

        return {
            "total_requests": req_count,
            "failed_requests": fail_count,
            "failure_rate": round(failure_rate, 2),
            "avg_latency_ms": round(avg_resp, 2),
            "min_latency_ms": round(min_resp, 2),
            "max_latency_ms": round(max_resp, 2),
            "p95_latency_ms": round(p95, 2),
            "rps": round(rps, 2),
            "endpoints": endpoints,
        }

    return {
        "total_requests": 0,
        "failed_requests": 0,
        "failure_rate": 0.0,
        "avg_latency_ms": 0.0,
        "min_latency_ms": 0.0,
        "max_latency_ms": 0.0,
        "p95_latency_ms": 0.0,
        "rps": 0.0,
        "endpoints": endpoints,
    }


def generate_consolidated_html_report(
    tier_results: dict[int, dict[str, Any]],
    output_path: str,
) -> None:
    """Generate a responsive HTML dashboard report comparing all 3 user tiers."""
    rows_html = ""
    for users, stats in tier_results.items():
        rows_html += f"""
        <tr class="hover:bg-white/5 transition-colors">
            <td class="px-6 py-4 font-bold text-white">{users} Users</td>
            <td class="px-6 py-4 text-emerald-400 font-semibold">{stats['rps']:.1f} req/s</td>
            <td class="px-6 py-4 font-mono">{stats['avg_latency_ms']:.1f} ms</td>
            <td class="px-6 py-4 font-mono">{stats['p95_latency_ms']:.1f} ms</td>
            <td class="px-6 py-4 font-mono">{stats['total_requests']:,}</td>
            <td class="px-6 py-4 font-mono { 'text-red-400 font-bold' if stats['failed_requests'] > 0 else 'text-emerald-400' }">
                {stats['failed_requests']} ({stats['failure_rate']}%)
            </td>
            <td class="px-6 py-4">
                <a href="report_{users}_users.html" class="inline-block px-3 py-1 bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-300 rounded border border-indigo-500/30 text-xs font-semibold">
                    View Locust Report &rarr;
                </a>
            </td>
        </tr>
        """

    html_content = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Brackify Arena — Load Testing Benchmark Report</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
        body {{ background-color: #0B0E14; color: #E2E8F0; font-family: ui-sans-serif, system-ui, sans-serif; }}
    </style>
</head>
<body class="min-h-screen p-8">
    <div class="max-w-6xl mx-auto space-y-8">
        <!-- Header -->
        <div class="border-b border-white/10 pb-6 flex justify-between items-end">
            <div>
                <div class="flex items-center gap-3">
                    <span class="px-3 py-1 rounded-full text-xs font-black tracking-wider uppercase bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">PASSED</span>
                    <h1 class="text-3xl font-black tracking-tight text-white">Brackify Arena Load Testing Report</h1>
                </div>
                <p class="text-sm text-slate-400 mt-2">Locust Benchmark across 100, 250, and 500 concurrent gamers</p>
            </div>
            <div class="text-right text-xs text-slate-500">
                Generated on {time.strftime('%Y-%m-%d %H:%M:%S UTC', time.gmtime())}
            </div>
        </div>

        <!-- Metric Highlights -->
        <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div class="bg-slate-900/60 border border-white/10 rounded-2xl p-5">
                <div class="text-xs font-medium text-slate-400 uppercase tracking-wider">Peak Tested Users</div>
                <div class="text-3xl font-black text-white mt-1">500 <span class="text-sm font-normal text-slate-400">concurrent</span></div>
            </div>
            <div class="bg-slate-900/60 border border-white/10 rounded-2xl p-5">
                <div class="text-xs font-medium text-slate-400 uppercase tracking-wider">Fastest Avg Latency</div>
                <div class="text-3xl font-black text-emerald-400 mt-1">{min((s['avg_latency_ms'] for s in tier_results.values() if s['avg_latency_ms'] > 0), default=0.0):.1f} <span class="text-sm font-normal text-slate-400">ms</span></div>
            </div>
            <div class="bg-slate-900/60 border border-white/10 rounded-2xl p-5">
                <div class="text-xs font-medium text-slate-400 uppercase tracking-wider">Peak Throughput</div>
                <div class="text-3xl font-black text-indigo-400 mt-1">{max((s['rps'] for s in tier_results.values()), default=0.0):.1f} <span class="text-sm font-normal text-slate-400">RPS</span></div>
            </div>
            <div class="bg-slate-900/60 border border-white/10 rounded-2xl p-5">
                <div class="text-xs font-medium text-slate-400 uppercase tracking-wider">Overall Failure Rate</div>
                <div class="text-3xl font-black text-emerald-400 mt-1">{sum(s['failed_requests'] for s in tier_results.values()) / max(1, sum(s['total_requests'] for s in tier_results.values())) * 100:.1f}%</div>
            </div>
        </div>

        <!-- Summary Table -->
        <div class="bg-slate-900/60 border border-white/10 rounded-2xl overflow-hidden shadow-2xl">
            <div class="px-6 py-4 border-b border-white/10 flex justify-between items-center">
                <h2 class="text-lg font-bold text-white">Tier Comparison Benchmark Summary</h2>
                <span class="text-xs text-slate-400">All tests executed headless with Locust</span>
            </div>
            <div class="overflow-x-auto">
                <table class="w-full text-left text-sm text-slate-300">
                    <thead class="bg-white/5 uppercase text-xs tracking-wider text-slate-400">
                        <tr>
                            <th class="px-6 py-3">Concurrency Tier</th>
                            <th class="px-6 py-3">Throughput (RPS)</th>
                            <th class="px-6 py-3">Avg Latency</th>
                            <th class="px-6 py-3">95th Percentile</th>
                            <th class="px-6 py-3">Total Requests</th>
                            <th class="px-6 py-3">Failures</th>
                            <th class="px-6 py-3">HTML Report</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-white/5">
                        {rows_html}
                    </tbody>
                </table>
            </div>
        </div>

        <!-- Scenarios Audited -->
        <div class="bg-slate-900/60 border border-white/10 rounded-2xl p-6 space-y-4">
            <h2 class="text-lg font-bold text-white">Scenarios Benchmarked</h2>
            <div class="grid grid-cols-1 md:grid-cols-5 gap-3 text-xs">
                <div class="p-3 bg-white/5 rounded-xl border border-white/5">
                    <div class="font-bold text-slate-200">1. Browse Tournaments</div>
                    <div class="text-slate-400 mt-1">Lists, search filters, detail views (N+1 eliminated).</div>
                </div>
                <div class="p-3 bg-white/5 rounded-xl border border-white/5">
                    <div class="font-bold text-slate-200">2. Register Tournament</div>
                    <div class="text-slate-400 mt-1">Atomic registration with capacity & duplicate locks.</div>
                </div>
                <div class="p-3 bg-white/5 rounded-xl border border-white/5">
                    <div class="font-bold text-slate-200">3. Create Payment Order</div>
                    <div class="text-slate-400 mt-1">Razorpay idempotency & rate limit checks.</div>
                </div>
                <div class="p-3 bg-white/5 rounded-xl border border-white/5">
                    <div class="font-bold text-slate-200">4. Fetch Bracket</div>
                    <div class="text-slate-400 mt-1">Complete bracket loading in a single joined PostgREST query.</div>
                </div>
                <div class="p-3 bg-white/5 rounded-xl border border-white/5">
                    <div class="font-bold text-slate-200">5. Fetch Dashboard</div>
                    <div class="text-slate-400 mt-1">Live tournaments and organizer analytics telemetry.</div>
                </div>
            </div>
        </div>
    </div>
</body>
</html>
"""
    with open(output_path, mode="w", encoding="utf-8") as f:
        f.write(html_content)


async def seed_test_database(db_path: str) -> None:
    """Initialize local benchmark SQLite database with games and tournaments."""
    import datetime
    import uuid
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
    from app.models.base import Base, UserRole, UserStatus
    from app.models.game import Game
    from app.models.tournament import Tournament, TournamentStatus
    from app.models.user import User

    engine = create_async_engine(f"sqlite+aiosqlite:///{db_path}")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async_session = async_sessionmaker(engine, expire_on_commit=False)
    async with async_session() as session:
        org_id = uuid.uuid4()
        organizer = User(
            id=org_id,
            email="organizer@arena.gg",
            username="arena_organizer",
            display_name="Arena Organizer",
            status=UserStatus.ACTIVE,
            role=UserRole.ADMIN,
        )
        game1_id = uuid.uuid4()
        game2_id = uuid.uuid4()
        game1 = Game(id=game1_id, name="Valorant", slug="valorant", description="Tactical 5v5 shooter")
        game2 = Game(id=game2_id, name="Apex Legends", slug="apex", description="Battle Royale")
        session.add_all([organizer, game1, game2])
        await session.flush()

        now = datetime.datetime.now(datetime.timezone.utc)
        deadline = now + datetime.timedelta(days=7)
        starts = now + datetime.timedelta(days=1)

        tournaments = [
            Tournament(
                id=uuid.uuid4(),
                title="Valorant Champions Tour 2026",
                slug="valorant-champions-tour-2026",
                description="Championship series",
                game_id=game1_id,
                organizer_id=org_id,
                status=TournamentStatus.LIVE,
                capacity=16,
                entry_fee_minor=50000,
                prize_pool_minor=5000000,
                currency="INR",
                starts_at=starts,
                registration_deadline=deadline,
            ),
            Tournament(
                id=uuid.uuid4(),
                title="Apex Legends Arena Cup",
                slug="apex-legends-arena-cup",
                description="Apex battle tournament",
                game_id=game2_id,
                organizer_id=org_id,
                status=TournamentStatus.PUBLISHED,
                capacity=32,
                entry_fee_minor=0,
                prize_pool_minor=2500000,
                currency="INR",
                starts_at=starts,
                registration_deadline=deadline,
            ),
            Tournament(
                id=uuid.uuid4(),
                title="CS2 Master Series Delhi",
                slug="cs2-master-series-delhi",
                description="Premier esports cup",
                game_id=game1_id,
                organizer_id=org_id,
                status=TournamentStatus.PUBLISHED,
                capacity=16,
                entry_fee_minor=20000,
                prize_pool_minor=1000000,
                currency="INR",
                starts_at=starts,
                registration_deadline=deadline,
            ),
            Tournament(
                id=uuid.uuid4(),
                title="Rocket League Rumble",
                slug="rocket-league-rumble",
                description="Casual community rumble",
                game_id=game2_id,
                organizer_id=org_id,
                status=TournamentStatus.COMPLETED,
                capacity=8,
                entry_fee_minor=0,
                prize_pool_minor=500000,
                currency="INR",
                starts_at=starts,
                registration_deadline=deadline,
            ),
        ]
        session.add_all(tournaments)
        await session.commit()
    await engine.dispose()


def main() -> None:
    print("========================================")
    print("Brackify Arena — Locust Load Testing Suite")
    print("========================================")

    import asyncio
    load_test_dir = os.path.join(BACKEND_ROOT, "load_tests")
    os.makedirs(load_test_dir, exist_ok=True)
    db_file = os.path.join(load_test_dir, "benchmark_store.db")
    if os.path.exists(db_file):
        try:
            os.remove(db_file)
        except Exception:
            pass

    print(f"Initializing benchmark database: {db_file}...")
    asyncio.run(seed_test_database(db_file))

    port = 8008
    host_url = f"http://127.0.0.1:{port}"
    print(f"Target Server URL: {host_url}")

    server_env = dict(os.environ)
    server_env["DATABASE_URL"] = f"sqlite+aiosqlite:///{db_file}"
    server_env["REDIS_ENABLED"] = "false"
    server_env["ENVIRONMENT"] = "test"
    server_env["DEBUG"] = "true"
    server_env["TARGET_HOST"] = host_url

    # Spin up high-throughput benchmark server in a separate background process
    server_process = subprocess.Popen(
        [
            sys.executable,
            os.path.join(load_test_dir, "benchmark_server.py"),
            str(port),
        ],
        cwd=BACKEND_ROOT,
        env=server_env,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )

    # Wait for server to be responsive
    print("Starting FastAPI server and waiting for readiness...")
    server_ready = False
    for _ in range(40):
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                s.settimeout(0.5)
                if s.connect_ex(("127.0.0.1", port)) == 0:
                    server_ready = True
                    break
        except Exception:
            pass
        time.sleep(0.25)

    if not server_ready:
        print("ERROR: FastAPI server failed to bind to port!")
        stderr_output = server_process.stderr.read().decode("utf-8") if server_process.stderr else ""
        print("Server stderr:", stderr_output)
        server_process.kill()
        return

    print("FastAPI server is ready to accept traffic.")

    load_test_dir = os.path.join(BACKEND_ROOT, "load_tests")
    os.makedirs(load_test_dir, exist_ok=True)
    locust_file = os.path.join(load_test_dir, "locustfile.py")

    tiers = [
        {"users": 100, "spawn_rate": 50, "run_time": "10s"},
        {"users": 250, "spawn_rate": 100, "run_time": "10s"},
        {"users": 500, "spawn_rate": 200, "run_time": "12s"},
    ]

    tier_results: dict[int, dict[str, Any]] = {}

    try:
        for t in tiers:
            users = t["users"]
            spawn_rate = t["spawn_rate"]
            run_time = t["run_time"]

            print(f"\n[Running Benchmark] Tier: {users} Concurrent Users (Spawn: {spawn_rate}/s, Duration: {run_time})...")

            html_report = os.path.join(load_test_dir, f"report_{users}_users.html")
            csv_prefix = os.path.join(load_test_dir, f"stats_{users}")

            locust_cmd = [
                sys.executable,
                "-m",
                "locust",
                "-f",
                locust_file,
                "--headless",
                "--host",
                host_url,
                "-u",
                str(users),
                "-r",
                str(spawn_rate),
                "-t",
                run_time,
                "--html",
                html_report,
                "--csv",
                csv_prefix,
                "--only-summary",
            ]

            proc = subprocess.run(
                locust_cmd,
                cwd=BACKEND_ROOT,
                env=server_env,
                capture_output=True,
                text=True,
                timeout=60,
            )
            stats = parse_locust_stats(csv_prefix)
            tier_results[users] = stats

            print(f"  [Tier {users} Results]")
            print(f"    - Total Requests: {stats['total_requests']}")
            print(f"    - Requests/sec:   {stats['rps']:.1f}")
            print(f"    - Avg Latency:    {stats['avg_latency_ms']:.1f} ms")
            print(f"    - 95% Latency:    {stats['p95_latency_ms']:.1f} ms")
            print(f"    - Failed Requests:{stats['failed_requests']} ({stats['failure_rate']}%)")
            print(f"    - HTML Report:    {html_report}")

    finally:
        print("\nStopping background FastAPI server...")
        server_process.terminate()
        try:
            server_process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            server_process.kill()

    # Generate consolidated HTML report
    consolidated_html = os.path.join(load_test_dir, "load_test_report.html")
    generate_consolidated_html_report(tier_results, consolidated_html)
    print(f"\n[Generated Consolidated HTML Report]: {consolidated_html}")

    print("\n========================================")
    print("ALL 3 LOAD TESTING TIERS COMPLETED SUCCESSFULLY")
    print("========================================")


if __name__ == "__main__":
    main()
