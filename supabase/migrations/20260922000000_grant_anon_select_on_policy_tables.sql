-- Public read grants for tables referenced inside RLS policy subqueries.
-- Postgres checks permissions on every table a policy touches even when the
-- row filter excludes everything, so without these grants every anonymous
-- tournaments/brackets read failed with 42501 (permission denied) at planning.
-- RLS still governs what anon can actually see: these tables have no
-- permissive anon policies, so no admin rows leak.

GRANT SELECT ON public.admin_roles TO anon;
GRANT SELECT ON public.tournament_admins TO anon;
GRANT SELECT ON public.teams TO anon;
GRANT SELECT ON public.team_members TO anon;
GRANT SELECT ON public.tournament_registrations TO anon;
GRANT SELECT ON public.brackets TO anon;
GRANT SELECT ON public.matches TO anon;
GRANT SELECT ON public.fair_play_reports TO anon;
