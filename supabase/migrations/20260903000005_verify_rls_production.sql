-- =========================================================================
-- Brackify Arena: Production Row Level Security (RLS) Verification
-- Migration: 20260903000005_verify_rls_production.sql
-- =========================================================================

-- 1. Ensure RLS is enabled on all production core tables
DO $$
DECLARE
  tbl text;
  core_tables text[] := ARRAY[
    'users',
    'tournaments',
    'tournament_registrations',
    'matches',
    'payments',
    'teams',
    'team_members',
    'match_reports',
    'notifications',
    'brackets',
    'rounds',
    'games',
    'game_configurations',
    'admin_roles'
  ];
BEGIN
  FOREACH tbl IN ARRAY core_tables LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = tbl
    ) THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', tbl);
      RAISE NOTICE 'Enforced RLS on table: public.%', tbl;
    END IF;
  END LOOP;
END $$;

-- 2. Create Audit & Verification Function
CREATE OR REPLACE FUNCTION public.verify_production_security_rls()
RETURNS TABLE (
  table_name text,
  rls_enabled boolean,
  status text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    t.tablename::text AS table_name,
    t.rowsecurity AS rls_enabled,
    CASE
      WHEN t.rowsecurity = true THEN 'SECURED'
      ELSE 'VULNERABLE: RLS NOT ENABLED'
    END AS status
  FROM pg_tables t
  WHERE t.schemaname = 'public'
    AND t.tablename NOT LIKE 'pg_%'
    AND t.tablename NOT LIKE '_alembic_%'
    AND t.tablename NOT LIKE 'schema_migrations'
  ORDER BY t.tablename;
END;
$$;

-- Grant execution permissions
REVOKE EXECUTE ON FUNCTION public.verify_production_security_rls() FROM public;
GRANT EXECUTE ON FUNCTION public.verify_production_security_rls() TO service_role;

