-- =========================================================================
-- Brackify Arena: Comprehensive Service Role Grants
-- Migration: 20260907000005_grant_all_service_role.sql
-- =========================================================================

-- 1. Grant ALL privileges on all public tables, sequences, and routines to service_role
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO service_role;

-- 2. Ensure future tables/sequences/routines inherit service_role permissions
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON ROUTINES TO service_role;

-- 3. Explicit grants on core application tables (safe iteration)
do $$
declare
  tbl text;
  tables text[] := array[
    'tournaments', 'tournament_registrations', 'tournament_admins',
    'matches', 'brackets', 'bracket_matches', 'bracket_nodes', 'rounds',
    'payments', 'fair_play_reports', 'user_reports', 'reports',
    'match_reports', 'moderation_actions', 'tournament_announcements',
    'tournament_admin_notes', 'tournament_streams', 'team_invitations',
    'tournament_activity', 'admin_audit_logs', 'admin_users', 'profiles', 'teams'
  ];
begin
  foreach tbl in array tables loop
    if to_regclass('public.' || tbl) is not null then
      execute format('grant all on table public.%I to service_role', tbl);
    end if;
  end loop;
end $$;

