# Brackify Arena — Esports Tournament Platform

Production-grade esports tournament platform. The backend is a FastAPI modular monolith; PostgreSQL is authoritative, while Redis is limited to cache, rate limits, locks, and jobs.

## Stack

- **Frontend:** Next.js 15, TypeScript, Tailwind CSS, TanStack Query
- **Backend:** FastAPI, SQLAlchemy 2 (async), Alembic, PostgreSQL, Redis, ARQ workers
- **Observability:** structlog, Prometheus `/metrics`, correlation IDs

## Quick Start

### Prerequisites

- Docker & Docker Compose
- Node.js 20+ (for local frontend dev)
- Python 3.12+ (for local backend dev)

### 1. Environment

```bash
cp .env.example .env
```

### 2. Start infrastructure + API

```bash
docker compose up -d postgres redis
docker compose up api worker
```

Or full stack:

```bash
docker compose up --build
```

### 3. Run migrations

```bash
cd backend
pip install -e ".[dev]"
alembic upgrade head
```

### 4. Frontend (local dev)

```bash
cd frontend
npm install
npm run dev
```

- Frontend: http://localhost:3000
- API: http://localhost:8000
- API docs: http://localhost:8000/docs
- Metrics: http://localhost:8000/metrics

### 5. Generate OpenAPI types (optional)

With API running:

```bash
cd frontend
npm run generate-api-types
```

## Testing

```bash
# Backend (requires postgres + redis; uses DATABASE_URL from env)
cd backend
DATABASE_URL=postgresql+asyncpg://tournament:tournament@localhost:5432/tournament_test \
REDIS_URL=redis://localhost:6379/0 \
SECRET_KEY=test-secret-key-minimum-32-characters \
ENVIRONMENT=test \
pytest -v
```

## Phase 0 Scope

- [x] Monorepo + Docker Compose + CI
- [x] PostgreSQL schema (users, auth tokens, games, configurations, tournaments, audit logs)
- [x] Alembic migrations
- [x] Auth: register, login, refresh, logout, me
- [x] User profile (GET/PATCH /users/me)
- [x] Redis client, cache service foundation, rate limiting
- [x] Correlation IDs, Prometheus metrics, structured logging
- [x] ARQ worker skeleton
- [x] Game plugin architecture stub (VALORANT adapter)
- [x] Frontend: Arena Dark theme, landing, auth, dashboard shell, tournament discovery contract
- [x] Backend tests
- [x] CI lint, typecheck, unit test, migration, build, and browser smoke-test jobs

## Authorization and data boundaries

All protected operations are authorized in FastAPI dependencies and services. Database constraints, foreign keys, unique indexes, and short transactions protect authoritative state. The frontend never determines roles, prices, capacity, or registration eligibility.

## Storage boundary

Asset uploads use a provider-neutral `StorageService` interface. Provider credentials and signed URL creation stay server-side; avatars, team logos, tournament banners, and game assets must not be written directly from the browser to arbitrary URLs.

## Google sign-in (local setup)

1. Create a Google OAuth web client in Google Cloud Console.
2. Add `http://localhost:8000/api/v1/auth/google/callback` as an authorized redirect URI.
3. Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, and `FRONTEND_URL` in the backend environment.
4. Restart the API. The login and registration pages will then show “Continue with Google”.

If the API or frontend runs on another host or port, update the redirect URI and `FRONTEND_URL` consistently.

## Architecture

Modular monolith. PostgreSQL is the source of truth. Redis is used for cache, rate limits, locks, and job queues — never for authoritative registration or payment state.

See the implementation plan in project documentation for full Phase 1+ roadmap.
