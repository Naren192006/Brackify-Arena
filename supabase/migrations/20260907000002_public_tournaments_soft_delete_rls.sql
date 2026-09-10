-- =========================================================================
-- Brackify Arena: Public Tournament Visibility & Soft Delete RLS
-- Migration: 20260907000002_public_tournaments_soft_delete_rls.sql
-- =========================================================================

-- 1. Ensure soft-deleted and cancelled tournaments are hidden from public SELECT
drop policy if exists tournaments_public_select on public.tournaments;

create policy tournaments_public_select on public.tournaments
  for select
  using (
    -- Public users (anon & authenticated players) only see non-cancelled, non-draft tournaments
    (status not in ('cancelled', 'draft'))
    -- Platform administrators (admins / super admins) and organizers see all
    or exists (
      select 1 from public.admin_roles
      where user_id = auth.uid() and role in ('admin', 'super_admin')
    )
    or (auth.uid() is not null and created_by = auth.uid())
    or exists (
      select 1 from public.tournament_admins
      where tournament_id = public.tournaments.id and user_id = auth.uid()
    )
  );

grant select on public.tournaments to anon, authenticated, service_role;

