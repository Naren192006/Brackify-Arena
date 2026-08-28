-- Allow authorized tournament admins to update tournament settings.
-- Row-level authorization remains enforced by is_tournament_admin().
grant update on public.tournaments to authenticated;

drop policy if exists tournaments_admin_update on public.tournaments;
create policy tournaments_admin_update on public.tournaments
  for update to authenticated
  using (public.is_tournament_admin(auth.uid(), id))
  with check (public.is_tournament_admin(auth.uid(), id));
