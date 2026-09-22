# Brackify Arena — Architecture Notes

## The two data stacks

The codebase contains two parallel backends that both work, but serve different parts of
the app. Knowing which is which prevents most accidental breakage.

| | **Supabase REST** (live path) | **Backend ORM** (FastAPI + SQLAlchemy) |
|---|---|---|
| Used by | Public site: tournaments, teams, players, brackets, matches, notifications, community | Admin tournament CRUD, teams API, payments, match-reports |
| Tables | Supabase-shaped migrations in `supabase/migrations/` | `backend/app/models/*.py` (aspirational schema) |
| Status | **Authoritative for prod** | Self-consistent; used where noted below |
| Tests | — | `backend/tests/` (138 passing) |

**Key fact:** the frontend's public data layer (`frontend/src/lib/{tournaments,arena,brackets,matches,community}/data.ts`)
reads Supabase directly with the publishable key. The backend routers
`/api/v1/tournaments`, `/api/v1/brackets`, `/api/v1/matches` are ORM-based and **drifted
from the prod schema** (different status vocabulary, missing columns). No page calls them,
so the drift is invisible to users — but do not "fix" prod to match the ORM or vice versa
without a real migration plan.

## Auth: backend ↔ Supabase bridge

Login/register hit the FastAPI backend, which mints **both** a backend session cookie and
a real Supabase session (`supabase_session` in the response). The frontend adopts the
Supabase session so RLS-gated reads work. Legacy users who exist only in Supabase are
auto-provisioned into the backend on first login.

Integrity rules added in this cycle (do not regress):

- `reset_password` syncs the new password to Supabase via the service-role admin API.
- `delete_account` anonymizes/deletes the matching Supabase auth user too, so the bridge
  cannot resurrect a deleted account on next login.
- The bridge is hard-disabled when `ENVIRONMENT=test`, and the test suite refuses to run
  against any non-localhost database (guard in `backend/tests/conftest.py`).

## Long-term consolidation plan (not yet executed)

1. Make Supabase Postgres the single schema of record; regenerate the ORM from it
   (or drop the ORM for pure REST/PostgREST access).
2. Reconcile the tournament status vocabulary (`open/full/ongoing/completed` vs the ORM's
   `published/live/paused`) with one enum + a DB migration.
3. Move admin flows onto the same table shapes so `admin_users` vs `users` distinctions
   disappear.
4. Delete the aspirational ORM columns that were never applied, or apply them via
   migration — either way, one truth.
5. Retire the session bridge once Supabase is the only auth issuer.

Estimate: this is a dedicated project touching ~7k lines of backend services; do not
attempt as a drive-by.
