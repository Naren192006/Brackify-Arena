# Brackify Arena — Supabase Environment Separation Strategy

To ensure zero downtime, secure user authentication, and isolated payment environments, Brackify Arena uses three distinct Supabase projects:

| Environment | Project Ref | Purpose | DB Migrations | Razorpay Mode |
| :--- | :--- | :--- | :--- | :--- |
| **Development** | Local / Dev Ref | Feature development, local unit & integration tests | Automatic via Supabase CLI (`supabase start`) | Test (`rzp_test_*`) |
| **Staging** | `stage-brackify-...` | End-to-end user acceptance testing, preview PR deployments | Automated via CI pipeline (`supabase db push`) | Test (`rzp_test_*`) |
| **Production** | `prod-brackify-...` | Live tournaments, real payment transactions | Manual approval gate in CI / CLI migration | Live (`rzp_live_*`) |

---

## 1. Migration Lifecycle & Promotion

1. **Local Development:**
   - Create new migration files in `supabase/migrations/` using timestamp format (`YYYYMMDDHHMMSS_<name>.sql`).
   - Verify locally with `npx supabase db reset`.

2. **Staging Promotion:**
   - On merge to `develop` branch, CI runs:
     ```bash
     supabase link --project-ref $SUPABASE_STAGING_PROJECT_REF
     supabase db push
     ```

3. **Production Promotion:**
   - On release tag or merge to `main`, migrations are applied:
     ```bash
     supabase link --project-ref $SUPABASE_PROD_PROJECT_REF
     supabase db push
     ```

---

## 2. Row Level Security (RLS) Verification

In production, all public schema tables MUST enforce Row Level Security.
To audit database security, run:

```sql
SELECT * FROM public.verify_production_security_rls();
```

All core tables (`tournaments`, `matches`, `tournament_registrations`, `payments`, `users`, `teams`, `notifications`) must report status `SECURED`.

---

## 3. Storage Buckets Setup

The four application storage buckets are initialized via migration [`20260903000004_storage_buckets.sql`](file:///x:/tournament/supabase/migrations/20260903000004_storage_buckets.sql):
- `avatars` (Public read, authenticated owner write)
- `team-logos` (Public read, team captain write)
- `tournament-banners` (Public read, organizer / admin write)
- `match-evidence` (Private read, participant write)

---

## 4. Secret Key Management & Rotation

- **`anon` key:** Safe for frontend browser client (`NEXT_PUBLIC_SUPABASE_ANON_KEY`).
- **`service_role` key:** **NEVER EXPOSE TO BROWSER**. Kept only on backend servers (Render/Railway).
- **`jwt_secret`:** Used by FastAPI backend to cryptographically verify Supabase JWT signatures (`auth.uid()`).

