-- Admin-only helpers for tournament operations. Existing tables and Phase 1-6 data remain intact.
create or replace function public.admin_set_tournament_status(target_tournament_id uuid, next_status public.tournament_status)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if not exists (select 1 from public.tournament_admins where tournament_id = target_tournament_id and user_id = auth.uid()) then raise exception 'tournament_admin_required'; end if;
  update public.tournaments set status = next_status where id = target_tournament_id;
  if not found then raise exception 'tournament_not_found'; end if;
end;
$$;

create or replace function public.admin_moderate_registration(target_registration_id uuid, action text)
returns void language plpgsql security definer set search_path = public as $$
declare target public.tournament_registrations%rowtype; tournament_title text; next_status public.registration_status; event_name text;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if action not in ('approve', 'reject', 'remove') then raise exception 'invalid_registration_action'; end if;
  select r.* into target from public.tournament_registrations r where r.id = target_registration_id for update;
  if target.id is null then raise exception 'registration_not_found'; end if;
  select t.title into tournament_title from public.tournaments t where t.id = target.tournament_id;
  if not exists (select 1 from public.tournament_admins where tournament_id = target.tournament_id and user_id = auth.uid()) then raise exception 'tournament_admin_required'; end if;
  next_status := case when action = 'approve' then 'registered'::public.registration_status else 'cancelled'::public.registration_status end;
  event_name := case when action = 'approve' then 'registration_approved' when action = 'reject' then 'registration_rejected' else 'registration_removed' end;
  update public.tournament_registrations set status = next_status, checked_in = false, checked_in_at = null, updated_at = now() where id = target_registration_id;
  insert into public.activity_events(user_id, event_type, description) values (target.registered_by, event_name, initcap(action) || ' tournament registration for ' || tournament_title);
  insert into public.notifications(user_id, title, body) values (target.registered_by, 'Registration ' || case when action = 'approve' then 'approved' else 'updated' end, 'Your registration for ' || tournament_title || ' was ' || case when action = 'approve' then 'approved.' else 'updated by an administrator.' end);
end;
$$;

create or replace function public.admin_finish_tournament(target_tournament_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if not exists (select 1 from public.tournament_admins where tournament_id = target_tournament_id and user_id = auth.uid()) then raise exception 'tournament_admin_required'; end if;
  update public.tournaments set status = 'completed' where id = target_tournament_id;
  if not found then raise exception 'tournament_not_found'; end if;
end;
$$;

-- Admins need roster/captain details to moderate registrations. These policies do not grant write access.
drop policy if exists team_members_tournament_admin_select on public.team_members;
create policy team_members_tournament_admin_select on public.team_members for select to authenticated using (
  exists (select 1 from public.tournament_registrations r join public.tournament_admins a on a.tournament_id = r.tournament_id and a.user_id = auth.uid() where r.team_id = team_members.team_id)
);
drop policy if exists profiles_tournament_admin_select on public.profiles;
create policy profiles_tournament_admin_select on public.profiles for select to authenticated using (
  exists (select 1 from public.team_members tm join public.tournament_registrations r on r.team_id = tm.team_id join public.tournament_admins a on a.tournament_id = r.tournament_id and a.user_id = auth.uid() where tm.user_id = profiles.id)
);

grant execute on function public.admin_set_tournament_status(uuid, public.tournament_status) to authenticated;
grant execute on function public.admin_moderate_registration(uuid, text) to authenticated;
grant execute on function public.admin_finish_tournament(uuid) to authenticated;

create or replace function public.admin_regenerate_bracket(target_tournament_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare new_bracket_id uuid;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if not exists (select 1 from public.tournament_admins where tournament_id = target_tournament_id and user_id = auth.uid()) then raise exception 'tournament_admin_required'; end if;
  delete from public.brackets where tournament_id = target_tournament_id;
  new_bracket_id := public.generate_single_elimination_bracket(target_tournament_id);
  return new_bracket_id;
end;
$$;

grant execute on function public.admin_regenerate_bracket(uuid) to authenticated;
