-- ---------------------------------------------------------------------------
-- Migration: 20260903000001_realtime_matches_tournaments.sql
-- Description: Enable Supabase Realtime CDC publication for matches and tournaments
-- ---------------------------------------------------------------------------

-- Set replica identity to FULL so realtime updates send complete records
alter table public.matches replica identity full;
alter table public.tournaments replica identity full;
alter table public.brackets replica identity full;

-- Add tables to the supabase_realtime publication if not already added
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'matches'
  ) then
    alter publication supabase_realtime add table public.matches;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'tournaments'
  ) then
    alter publication supabase_realtime add table public.tournaments;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'brackets'
  ) then
    alter publication supabase_realtime add table public.brackets;
  end if;
end $$;

