# Brackify Arena

**A Production-Ready Esports Tournament Management Platform**

![Brackify Arena](https://raw.githubusercontent.com/Naren192006/Brackify-Arena/main/frontend/public/screenshots/bracket.png)

## 🎯 What It Does

Brackify Arena automates competitive FPS tournaments (Valorant, CS2, OW2):
- ✅ Auto-seeding & deterministic single-elimination bracket generation
- ✅ Secure Razorpay payments (HMAC-SHA256 signature verification & webhook reconciliation)
- ✅ Real-time bracket progression (`advance_winner`) and match reset capability
- ✅ Fair play engine: in-game screenshot evidence upload + admin score review queue
- ✅ Live seasonal leaderboards with RP and win-rate tracking
- ✅ Administrative control rooms: telemetry analytics, registration rosters, and check-in management

---

## 🏗️ Architecture

| Layer | Technology | Purpose |
|-------|------------|---------|
| **Frontend** | Next.js 15 (App Router), React 19, Tailwind CSS, Recharts | Fast, responsive esports dark-theme web application |
| **Backend** | FastAPI (Async Python 3.11), Pydantic v2, Starlette | High-throughput asynchronous REST API & background tasks |
| **Database** | Supabase (PostgreSQL 15), RLS Policies | Authoritative relational store with multi-tenant row security |
| **Auth** | Supabase JWT | Cryptographic `auth.uid()` validation on all protected endpoints |
| **Payments** | Razorpay (Orders, Webhooks, HMAC-SHA256) | Secure entry fee collection and instant seed allocation |
| **Storage** | Supabase Storage Buckets (`match-evidence`, `team-logos`) | Encrypted multi-screenshot scoreboard verification |
| **Testing** | Pytest, Locust (100–500 concurrent users) | E2E validation under heavy load conditions |
| **Deployment** | Vercel (Frontend), Render / Railway (Backend) | Globally distributed production infrastructure |

---

## 🚀 Live Demo

- **Frontend App:** [https://brackify-arena.vercel.app](https://brackify-arena.vercel.app)
- **Backend API Docs:** [https://brackify-arena-api.onrender.com/docs](https://brackify-arena-api.onrender.com/docs)
- **API Health Check:** [https://brackify-arena-api.onrender.com/health](https://brackify-arena-api.onrender.com/health)

---

## 📋 Features (37 Total)

### Tournament & Brackets (8)
- Auto-seeding & automatic bye assignment for 2, 4, 8, 16, and 32 teams
- Deterministic winner progression (`advance_winner`)
- Admin match control room (`/admin/brackets/[tournamentId]`) with match start, complete, and winner selection
- Match reset capability (`PATCH /api/v1/matches/{id}/reset`) clearing downstream slots cleanly
- Public read-only interactive bracket viewer with canvas zoom controls (`+`, `−`, `Reset`)
- Round navigation tabs (Full Bracket, Quarterfinals, Semifinals, Grand Finals)
- Tournament Champion showcase banner with team logo and trophy badge
- Automatic tournament state transitions: `draft` $\rightarrow$ `open` $\rightarrow$ `check_in` $\rightarrow$ `ongoing` $\rightarrow$ `completed`

### Match Execution & Fair Play (6)
- Player Match Center (`/matches/[matchId]`) with team face-offs and captain info
- Live countdown timer to scheduled match start
- Direct Discord Match Lobby integration link
- Scoreboard submission modal for scores and match notes
- Multi-screenshot evidence upload to private Supabase bucket (`match-evidence`)
- Admin Match Report Review Queue (`/admin/reports`) with Approve, Reject, and Request Resubmission actions

### Payments & Finance (5)
- Razorpay order creation (`POST /api/v1/payments/order`)
- HMAC-SHA256 server-side signature verification
- Webhook reconciliation fallback (`POST /api/v1/payments/webhook`)
- Idempotency guards preventing double registrations or duplicate payments
- Admin manual mark-paid override for offline entries

### Admin & Operations (7)
- Analytics Dashboard (`/admin/analytics`) powered by Recharts:
  - Registration conversion trend (AreaChart)
  - Revenue collected in INR (AreaChart)
  - Payment status breakdown (PieChart)
  - Game participation distribution (BarChart)
- Live registration management table (`/admin/registrations`)
- One-click CSV export of tournament rosters
- Tournament Check-In Manager (Pending Check-In, Checked In, Absent)
- Sub-admin role assignment and permissions management
- Team removal and refund handling

### Player & Community (5)
- Competitive leaderboard (`/leaderboard`) tracking RP, W/L, Win %, Tournaments Played, and Titles
- MVP badges dynamically computed for top performers
- Live tournament search and multi-criteria filters (Game, Entry Fee, Live/Upcoming/Completed)
- Team profile pages with active roster inspection
- User dashboard with registered tournament cards and match schedules

### Infrastructure & Security (6)
- Supabase JWT validation on every protected route
- PostgreSQL Row-Level Security (RLS) preventing cross-tenant data tampering
- FastAPI `BackgroundTasks` handling notifications and analytics without blocking payment verification
- Comprehensive health endpoints: `/health` (deep database ping + Redis check), `/health/live`, `/health/ready`
- Docker multi-stage build running under an unprivileged user (`appuser:1001`)
- ## ☁️ CloudOps Sentinel — Monitoring & Observability

CloudOps Sentinel is an integrated monitoring module for Brackify Arena that provides application-level metrics, AWS CloudWatch integration, and an admin monitoring dashboard.

It helps administrators observe HTTP traffic, track server errors, and monitor the health of the CloudWatch metrics publisher.

### Features

- **Application Metrics:** Collects HTTP request counts, server errors, and HTTP status-code metrics.
- **Prometheus-Compatible Endpoint:** Exposes application metrics through `/metrics`, controlled by the `METRICS_ENABLED` setting.
- **AWS CloudWatch Integration:** Publishes metrics to the custom namespace `BrackifyArena/Monitoring`.
- **Background Publisher:** Periodically publishes application metrics to CloudWatch without blocking normal request handling.
- **Admin Monitoring Dashboard:** Provides monitoring information through `/admin/monitoring`.
- **Publisher Health:** Reports CloudWatch publishing status and relevant errors.
- **Configurable AWS Region:** Supports configuration of the CloudWatch region and publishing settings.

### Architecture

```text
Brackify Arena Backend
         |
         v
 Application Metrics
         |
         +-----------------------+
         |                       |
         v                       v
 Prometheus Endpoint      Background Publisher
      /metrics                    |
                                  v
                           AWS CloudWatch
                      BrackifyArena/Monitoring

Admin Monitoring Dashboard
         |
         v
    Monitoring API
         |
         v
 Application and Publisher Status
```

### CloudWatch Metrics

| Metric | Description |
|---|---|
| `TotalHttpRequests` | Total HTTP requests observed |
| `Http5xxErrors` | HTTP server-error responses |
| `HttpStatus200` | HTTP 200 response count |

Additional HTTP status-code metrics may be published based on observed application traffic.

Metrics include an `Environment` dimension to distinguish the configured environment.

### Configuration

Configure these environment variables in the backend environment:

| Variable | Purpose |
|---|---|
| `AWS_CLOUDWATCH_ENABLED` | Enables or disables CloudWatch publishing |
| `AWS_DEFAULT_REGION` | AWS region used for publishing |
| `AWS_ACCESS_KEY_ID` | AWS access key, if using explicit credentials |
| `AWS_SECRET_ACCESS_KEY` | AWS secret access key, if using explicit credentials |
| `METRICS_ENABLED` | Enables or disables the Prometheus metrics endpoint |

Example configuration:

```dotenv
AWS_CLOUDWATCH_ENABLED=true
AWS_DEFAULT_REGION=ap-southeast-2
METRICS_ENABLED=true
```

The configured CloudWatch namespace is:

```text
BrackifyArena/Monitoring
```

The publisher's default publishing interval is 300 seconds.

**Security:** Never commit actual AWS credentials or other secrets to Git. Use environment variables, an appropriate AWS identity mechanism, or a deployment platform's secret manager.

### Admin Dashboard

The monitoring page is available at:

```text
/admin/monitoring
```

It displays monitoring information, including application metrics, CloudWatch publishing status, and published datapoint information.

Access to monitoring APIs follows the application's admin authentication and authorization policies.

### Testing

Monitoring tests cover:

- CloudWatch metric publishing and error handling.
- Admin monitoring API behavior.
- Health and metrics endpoint behavior.
- Configuration-dependent metrics endpoint access.

Run the focused tests from the `backend` directory:

```powershell
python -m pytest tests/test_cloudwatch_publisher.py tests/test_admin_monitoring.py tests/test_health.py -q
```

Tests that recreate the database schema must use a dedicated disposable test database, never the production or Supabase database.

### Implementation Status

- CloudOps Sentinel code committed locally.
- CloudWatch publishing verified in the local development environment.
- Admin monitoring dashboard integrated into the frontend.
- Automated tests added; successful execution of the focused test suite remains pending.
- Production deployment and production CloudWatch publishing are not yet confirmed.

- GitHub Actions CI automated pipeline running lint, typecheck, and build tests

---

## 🔐 Security Highlights

- **JWT Server-Side Verification:** Never trusts client-supplied user IDs; resolves identity directly from JWT claims.
- **Financial Idempotency:** Payment orders are verified cryptographically via HMAC-SHA256 before state transitions.
- **State Invariants:** Prevents completing matches before start, starting completed matches, or registering after tournament start time.
- **Row-Level Security:** Strict PostgreSQL RLS policies protect team rosters, payments, and private evidence.

---

## 📊 Testing & Performance

- **Load Testing:** Verified using Locust under concurrent loads of 100, 250, and 500 simulated users.
- **Latency:** Average API response latency $< 120\text{ ms}$.
- **Error Rate:** 0.00% failed requests across standard registration and bracket browsing flows.
- **Code Quality:** 0 TypeScript compiler errors, 0 ESLint errors.

---

## 🛠️ Setup & Local Development

### 1. Frontend Setup
```bash
cd frontend
npm install
npm run dev
# App runs at http://localhost:3000
```

### 2. Backend Setup
```bash
cd backend
python -m venv venv
# On Windows:
venv\Scripts\activate
# On Linux/macOS:
source venv/bin/activate

pip install -r requirements.txt
uvicorn main:app --reload --port 8000
# API runs at http://localhost:8000
```

### 3. Environment Configuration

**Frontend (`frontend/.env.local`)**:
```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
NEXT_PUBLIC_RAZORPAY_KEY_ID=rzp_test_your_key_id
NEXT_PUBLIC_API_URL=http://localhost:8000
```

**Backend (`backend/.env`)**:
```env
ENVIRONMENT=development
DATABASE_URL=postgresql+asyncpg://postgres:password@localhost:5432/tournament
SECRET_KEY=your-32-character-secret-key-here
REDIS_ENABLED=false
CORS_ORIGINS=http://localhost:3000
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
RAZORPAY_KEY_ID=rzp_test_your_key_id
RAZORPAY_KEY_SECRET=your-razorpay-secret
RAZORPAY_WEBHOOK_SECRET=your-webhook-secret
```

---

## 🧪 Running Tests

### Backend Unit & Integration Tests
```bash
cd backend
python tests/test_phase7_endpoints.py
pytest tests/ -v
```

### Frontend Type & Lint Checks
```bash
cd frontend
npm run typecheck
npm run lint
npm run build
```

---

## 📁 Repository Structure

```
Brackify-Arena/
├── frontend/                   # Next.js 15 App Router
│   ├── src/
│   │   ├── app/               # Routes: /tournaments, /brackets, /matches, /admin, /leaderboard
│   │   ├── components/        # Brackets, MatchCenter, ReportsQueue, Leaderboard, Analytics
│   │   ├── lib/               # Supabase client, Razorpay SDK, API clients
│   │   └── types/             # TypeScript interfaces
│   └── package.json
├── backend/                    # FastAPI asynchronous service
│   ├── app/
│   │   ├── api/v1/            # Endpoints: matches, match-reports, tournaments, payments, auth
│   │   ├── services/          # advance_winner, match reports, bracket logic
│   │   ├── schemas/           # Pydantic schemas
│   │   └── config.py          # Environment settings
│   ├── tests/                 # Integration tests
│   ├── requirements.txt       # Python dependencies
│   └── main.py                # Service entry point
├── supabase/
│   └── migrations/            # SQL schemas, RLS policies, storage bucket configurations
├── render.yaml                 # Render cloud deployment blueprint
├── railway.toml                # Railway configuration
└── README.md                   # Project documentation
```

---

## 📜 License

MIT License. Built for competitive esports tournaments.
