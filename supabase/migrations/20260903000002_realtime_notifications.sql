-- ---------------------------------------------------------------------------
-- Migration: 20260903000002_realtime_notifications.sql
-- Description: Enable Supabase Realtime CDC publication for notifications table
-- ---------------------------------------------------------------------------

-- Set replica identity to FULL so realtime updates send complete records
alter table public.notifications replica identity full;

-- Add notifications table to the supabase_realtime publication if not already added
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;

