-- Phase 7.5: platform roles. Existing player and tournament data is preserved.
create table if not exists public.admin_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('super_admin', 'sub_admin')),
  created_at timestamptz not null default now()
);

alter table public.admin_roles enable row level security;

create or replace function public.is_super_admin(target_user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admin_roles where user_id = target_user_id and role = 'super_admin');
$$;

create or replace function public.is_sub_admin(target_user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admin_roles where user_id = target_user_id and role = 'sub_admin');
$$;

create or replace function public.is_tournament_admin(target_user_id uuid, target_tournament_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_super_admin(target_user_id)
    or exists (select 1 from public.tournament_admins where user_id = target_user_id and tournament_id = target_tournament_id);
$$;

drop policy if exists admin_roles_self_or_super_select on public.admin_roles;
create policy admin_roles_self_or_super_select on public.admin_roles for select to authenticated
  using (user_id = auth.uid() or public.is_super_admin(auth.uid()));
drop policy if exists admin_roles_super_insert on public.admin_roles;
create policy admin_roles_super_insert on public.admin_roles for insert to authenticated
  with check (public.is_super_admin(auth.uid()) and role = 'sub_admin');
drop policy if exists admin_roles_super_update on public.admin_roles;
create policy admin_roles_super_update on public.admin_roles for update to authenticated
  using (public.is_super_admin(auth.uid())) with check (public.is_super_admin(auth.uid()) and role = 'sub_admin');
drop policy if exists admin_roles_super_delete on public.admin_roles;
create policy admin_roles_super_delete on public.admin_roles for delete to authenticated
  using (public.is_super_admin(auth.uid()));

drop policy if exists tournament_admins_self_select on public.tournament_admins;
create policy tournament_admins_self_select on public.tournament_admins for select to authenticated
  using (user_id = auth.uid() or public.is_super_admin(auth.uid()));
drop policy if exists tournament_admins_super_write on public.tournament_admins;
create policy tournament_admins_super_write on public.tournament_admins for all to authenticated
  using (public.is_super_admin(auth.uid())) with check (public.is_super_admin(auth.uid()));

drop policy if exists tournaments_creator_insert on public.tournaments;
create policy tournaments_creator_insert on public.tournaments for insert to authenticated
  with check (created_by = auth.uid() and (public.is_super_admin(auth.uid()) or public.is_sub_admin(auth.uid())));
drop policy if exists tournaments_admin_update on public.tournaments;
create policy tournaments_admin_update on public.tournaments for update to authenticated
  using (public.is_tournament_admin(auth.uid(), id));
drop policy if exists tournaments_super_delete on public.tournaments;
create policy tournaments_super_delete on public.tournaments for delete to authenticated
  using (public.is_super_admin(auth.uid()));

create or replace function public.admin_set_role(target_user_id uuid, next_role text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_super_admin(auth.uid()) then raise exception 'super_admin_required'; end if;
  if next_role not in ('sub_admin', 'player') then raise exception 'invalid_admin_role'; end if;
  if target_user_id = auth.uid() then raise exception 'cannot_change_own_role'; end if;
  if next_role = 'player' then
    delete from public.admin_roles where user_id = target_user_id and role = 'sub_admin';
  else
    insert into public.admin_roles(user_id, role) values (target_user_id, 'sub_admin')
      on conflict (user_id) do update set role = 'sub_admin';
  end if;
end;
$$;

create or replace function public.admin_assign_sub_admin(target_tournament_id uuid, target_user_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_super_admin(auth.uid()) then raise exception 'super_admin_required'; end if;
  if not public.is_sub_admin(target_user_id) and not public.is_super_admin(target_user_id) then raise exception 'organizer_role_required'; end if;
  insert into public.tournament_admins(tournament_id, user_id) values (target_tournament_id, target_user_id) on conflict do nothing;
end;
$$;

create or replace function public.admin_remove_sub_admin(target_tournament_id uuid, target_user_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_super_admin(auth.uid()) then raise exception 'super_admin_required'; end if;
  delete from public.tournament_admins where tournament_id = target_tournament_id and user_id = target_user_id;
end;
$$;

create or replace function public.admin_set_tournament_status(target_tournament_id uuid, next_status public.tournament_status)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_tournament_admin(auth.uid(), target_tournament_id) then raise exception 'tournament_admin_required'; end if;
  update public.tournaments set status = next_status where id = target_tournament_id;
  if not found then raise exception 'tournament_not_found'; end if;
end;
$$;

create or replace function public.admin_finish_tournament(target_tournament_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_tournament_admin(auth.uid(), target_tournament_id) then raise exception 'tournament_admin_required'; end if;
  update public.tournaments set status = 'completed' where id = target_tournament_id;
  if not found then raise exception 'tournament_not_found'; end if;
end;
$$;

grant select on public.admin_roles to authenticated;
grant execute on function public.is_super_admin(uuid), public.is_sub_admin(uuid), public.is_tournament_admin(uuid, uuid) to authenticated;
grant execute on function public.admin_set_role(uuid, text), public.admin_assign_sub_admin(uuid, uuid), public.admin_remove_sub_admin(uuid, uuid) to authenticated;
grant execute on function public.admin_set_tournament_status(uuid, public.tournament_status), public.admin_finish_tournament(uuid) to authenticated;

-- Restrict tournament creation to users who have an explicit organizer role.
create or replace function public.create_tournament(
  tournament_title text, tournament_slug text, tournament_description text default null,
  tournament_rules text default null, tournament_max_teams integer default 16,
  tournament_open_at timestamptz default now(), tournament_close_at timestamptz default now(),
  tournament_start_at timestamptz default now(), tournament_banner_url text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare new_tournament_id uuid;
begin
  if not (public.is_super_admin(auth.uid()) or public.is_sub_admin(auth.uid())) then raise exception 'organizer_role_required'; end if;
  insert into public.tournaments(title, slug, description, rules, max_teams, registration_open_at, registration_close_at, checkin_open_at, checkin_close_at, start_time, status, created_by, banner_url)
  values (trim(tournament_title), lower(trim(tournament_slug)), tournament_description, tournament_rules, tournament_max_teams, tournament_open_at, tournament_close_at, tournament_close_at, tournament_start_at - interval '15 minutes', tournament_start_at, 'open', auth.uid(), tournament_banner_url)
  returning id into new_tournament_id;
  insert into public.tournament_admins(tournament_id, user_id) values (new_tournament_id, auth.uid());
  insert into public.activity_events(user_id, event_type, description) values (auth.uid(), 'tournament_created', 'Created tournament ' || trim(tournament_title));
  return new_tournament_id;
exception when unique_violation then raise exception 'tournament_slug_taken';
end;
$$;

-- Existing privileged functions now recognize platform super admins as well.
create or replace function public.admin_moderate_registration(target_registration_id uuid, action text)
returns void language plpgsql security definer set search_path = public as $$
declare target public.tournament_registrations%rowtype; tournament_title text; next_status public.registration_status; event_name text;
begin
  if not (public.is_super_admin(auth.uid()) or exists (select 1 from public.tournament_admins where tournament_id = (select tournament_id from public.tournament_registrations where id = target_registration_id) and user_id = auth.uid())) then raise exception 'tournament_admin_required'; end if;
  if action not in ('approve', 'reject', 'remove') then raise exception 'invalid_registration_action'; end if;
  select r.* into target from public.tournament_registrations r where r.id = target_registration_id for update;
  if target.id is null then raise exception 'registration_not_found'; end if;
  select title into tournament_title from public.tournaments where id = target.tournament_id;
  next_status := case when action = 'approve' then 'registered'::public.registration_status else 'cancelled'::public.registration_status end;
  event_name := case when action = 'approve' then 'registration_approved' when action = 'reject' then 'registration_rejected' else 'registration_removed' end;
  update public.tournament_registrations set status = next_status, checked_in = false, checked_in_at = null, updated_at = now() where id = target_registration_id;
  insert into public.activity_events(user_id, event_type, description) values (target.registered_by, event_name, initcap(action) || ' tournament registration for ' || tournament_title);
  insert into public.notifications(user_id, title, body) values (target.registered_by, 'Registration ' || case when action = 'approve' then 'approved' else 'updated' end, 'Your registration for ' || tournament_title || ' was ' || case when action = 'approve' then 'approved.' else 'updated by an administrator.' end);
end;
$$;

create or replace function public.admin_regenerate_bracket(target_tournament_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare new_bracket_id uuid;
begin
  if not public.is_tournament_admin(auth.uid(), target_tournament_id) then raise exception 'tournament_admin_required'; end if;
  delete from public.brackets where tournament_id = target_tournament_id;
  new_bracket_id := public.generate_single_elimination_bracket(target_tournament_id);
  return new_bracket_id;
end;
$$;

-- Keep the Phase 5 winner progression available to super admins.
create or replace function public.advance_match_winner(match_uuid uuid, winner_uuid uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare current_match public.matches%rowtype; next_match_id uuid; next_round_id uuid; next_match_no integer; next_round integer;
begin
  select * into current_match from public.matches where id = match_uuid for update;
  if current_match.id is null then raise exception 'match_not_found'; end if;
  if not public.is_tournament_admin(auth.uid(), current_match.tournament_id) then raise exception 'tournament_admin_required'; end if;
  if current_match.status::text = 'completed' then raise exception 'match_already_completed'; end if;
  if winner_uuid is null or (winner_uuid <> current_match.team_a_id and winner_uuid <> current_match.team_b_id) then raise exception 'winner_must_be_a_match_team'; end if;
  update public.matches set winner_team_id = winner_uuid, status = 'completed', completed_at = now() where id = match_uuid;
  next_round := current_match.round_number + 1;
  select r.id into next_round_id from public.rounds r where r.bracket_id = current_match.bracket_id and r.round_number = next_round;
  if next_round_id is null then update public.brackets set champion_team_id = winner_uuid where id = current_match.bracket_id; return winner_uuid; end if;
  next_match_no := (current_match.match_number + 1) / 2;
  select m.id into next_match_id from public.matches m where m.round_id = next_round_id and m.match_number = next_match_no for update;
  if current_match.match_number % 2 = 1 then update public.matches set team_a_id = winner_uuid where id = next_match_id; else update public.matches set team_b_id = winner_uuid where id = next_match_id; end if;
  return winner_uuid;
end;
$$;

grant execute on function public.create_tournament(text, text, text, text, integer, timestamptz, timestamptz, timestamptz, text), public.advance_match_winner(uuid, uuid), public.admin_moderate_registration(uuid, text), public.admin_regenerate_bracket(uuid) to authenticated;

create or replace function public.generate_single_elimination_bracket(tournament_uuid uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare bracket_uuid uuid; team_count integer; total integer; round_no integer; round_uuid uuid; round_kind text; match_no integer; shuffled_team uuid;
begin
  if not public.is_tournament_admin(auth.uid(), tournament_uuid) then raise exception 'tournament_admin_required'; end if;
  if exists (select 1 from public.brackets where tournament_id = tournament_uuid) then raise exception 'bracket_already_exists'; end if;
  select count(*) into team_count from public.tournament_registrations where tournament_id = tournament_uuid and status::text = 'checked_in';
  if team_count < 2 or (team_count & (team_count - 1)) <> 0 then raise exception 'checked_in_count_must_be_power_of_two'; end if;
  total := floor(log(2, team_count))::integer;
  insert into public.brackets(tournament_id, total_rounds) values (tournament_uuid, total) returning id into bracket_uuid;
  for round_no in 1..total loop
    round_kind := case when round_no = total then 'final' when round_no = total - 1 then 'semifinal' else 'quarterfinal' end;
    insert into public.rounds(bracket_id, round_number, round_type) values (bracket_uuid, round_no, round_kind::public.round_type) returning id into round_uuid;
    for match_no in 1..(team_count / power(2, round_no)::integer) loop
      insert into public.matches(tournament_id, bracket_id, round_id, round_number, match_number) values (tournament_uuid, bracket_uuid, round_uuid, round_no, match_no);
    end loop;
  end loop;
  match_no := 0;
  for shuffled_team in select tr.team_id from public.tournament_registrations tr where tr.tournament_id = tournament_uuid and tr.status::text = 'checked_in' order by random() loop
    match_no := match_no + 1;
    update public.matches set team_a_id = case when match_no % 2 = 1 then shuffled_team else team_a_id end, team_b_id = case when match_no % 2 = 0 then shuffled_team else team_b_id end where bracket_id = bracket_uuid and round_number = 1 and match_number = ((match_no + 1) / 2);
  end loop;
  return bracket_uuid;
end;
$$;

create or replace function public.approve_match_result(match_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare target public.matches%rowtype; winner uuid;
begin
  select * into target from public.matches where id = match_id for update;
  if target.id is null then raise exception 'match_not_found'; end if;
  if not public.is_tournament_admin(auth.uid(), target.tournament_id) then raise exception 'tournament_admin_required'; end if;
  if target.status::text <> 'reported' then raise exception 'match_result_not_pending_approval'; end if;
  winner := case when target.team1_score > target.team2_score then target.team_a_id else target.team_b_id end;
  if winner is null then raise exception 'match_teams_not_ready'; end if;
  update public.match_reports set status = 'approved', reviewed_by = auth.uid(), reviewed_at = now() where match_id = target.id and status = 'submitted';
  perform public.advance_match_winner(target.id, winner);
  update public.matches set verified_by = auth.uid(), verified_at = now() where id = target.id;
  insert into public.activity_events(user_id, event_type, description) values (auth.uid(), 'match_result_approved', 'Approved result for match ' || match_id::text);
  insert into public.notifications(user_id, title, body) select distinct tm.user_id, 'Match result approved', 'Your match result has been approved.' from public.team_members tm where tm.team_id in (target.team_a_id, target.team_b_id);
  return winner;
end;
$$;

create or replace function public.reject_match_result(match_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare target public.matches%rowtype;
begin
  select * into target from public.matches where id = match_id for update;
  if target.id is null then raise exception 'match_not_found'; end if;
  if not public.is_tournament_admin(auth.uid(), target.tournament_id) then raise exception 'tournament_admin_required'; end if;
  if target.status::text <> 'reported' then raise exception 'match_result_not_pending_approval'; end if;
  update public.match_reports set status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now() where match_id = target.id and status = 'submitted';
  update public.matches set team1_score = null, team2_score = null, winner_team_id = null, reported_by = null, reported_at = null, status = 'pending' where id = target.id;
  insert into public.activity_events(user_id, event_type, description) values (auth.uid(), 'match_result_rejected', 'Rejected result for match ' || match_id::text);
  insert into public.notifications(user_id, title, body) select distinct tm.user_id, 'Match result needs correction', 'Your submitted match result was rejected. Please submit it again.' from public.team_members tm where tm.team_id in (target.team_a_id, target.team_b_id);
  return target.id;
end;
$$;

grant execute on function public.generate_single_elimination_bracket(uuid), public.approve_match_result(uuid), public.reject_match_result(uuid) to authenticated;
