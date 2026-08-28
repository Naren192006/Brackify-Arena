-- Make every tournament status write explicitly use the existing enum.
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
  values (trim(tournament_title), lower(trim(tournament_slug)), tournament_description, tournament_rules, tournament_max_teams, tournament_open_at, tournament_close_at, tournament_close_at, tournament_start_at - interval '15 minutes', tournament_start_at, 'open'::public.tournament_status, auth.uid(), tournament_banner_url)
  returning id into new_tournament_id;
  insert into public.tournament_admins(tournament_id, user_id) values (new_tournament_id, auth.uid());
  insert into public.activity_events(user_id, event_type, description) values (auth.uid(), 'tournament_created', 'Created tournament ' || trim(tournament_title));
  return new_tournament_id;
exception when unique_violation then raise exception 'tournament_slug_taken';
end;
$$;

create or replace function public.register_team_for_tournament(target_tournament_id uuid, target_team_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare registration_id uuid; current_count integer; max_allowed integer; current_status public.tournament_status; close_at timestamptz; tournament_title text;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if not exists (select 1 from public.teams where id = target_team_id and captain_id = auth.uid()) then raise exception 'captain_required'; end if;
  select t.status, t.registration_close_at, t.max_teams, t.title into current_status, close_at, max_allowed, tournament_title from public.tournaments t where t.id = target_tournament_id for update;
  if current_status is null then raise exception 'tournament_not_found'; end if;
  if current_status not in ('open'::public.tournament_status, 'full'::public.tournament_status) or now() < (select registration_open_at from public.tournaments where id = target_tournament_id) or now() >= close_at then raise exception 'registration_closed'; end if;
  if exists (select 1 from public.tournament_registrations where tournament_id = target_tournament_id and team_id = target_team_id and status::text in ('registered', 'checked_in')) then raise exception 'team_already_registered'; end if;
  select count(*) into current_count from public.tournament_registrations where tournament_id = target_tournament_id and status::text in ('registered', 'checked_in');
  if current_count >= max_allowed then raise exception 'tournament_full'; end if;
  insert into public.tournament_registrations(tournament_id, team_id, registered_by, status, checked_in, checked_in_at) values (target_tournament_id, target_team_id, auth.uid(), 'registered', false, null) on conflict (tournament_id, team_id) do update set status = 'registered', registered_by = auth.uid(), checked_in = false, checked_in_at = null, updated_at = now() returning id into registration_id;
  update public.tournaments set status = (case when current_count + 1 >= max_allowed then 'full' else 'open' end)::public.tournament_status where id = target_tournament_id;
  insert into public.activity_events(user_id, event_type, description) values (auth.uid(), 'tournament_registered', 'Registered a team for ' || tournament_title);
  insert into public.notifications(user_id, title, body) values (auth.uid(), 'Registration successful', 'Your team is registered for ' || tournament_title || '.');
  return registration_id;
end;
$$;

create or replace function public.unregister_team(target_tournament_id uuid, target_team_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.teams where id = target_team_id and captain_id = auth.uid()) then raise exception 'captain_required'; end if;
  update public.tournament_registrations set status = 'withdrawn', updated_at = now() where tournament_id = target_tournament_id and team_id = target_team_id and status::text = 'registered';
end;
$$;

create or replace function public.cancel_tournament_registration(target_tournament_id uuid, target_team_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare tournament_title text; current_status public.tournament_status;
begin
  if not exists (select 1 from public.teams where id = target_team_id and captain_id = auth.uid()) then raise exception 'captain_required'; end if;
  select title, status into tournament_title, current_status from public.tournaments where id = target_tournament_id for update;
  if tournament_title is null then raise exception 'tournament_not_found'; end if;
  if current_status in ('ongoing'::public.tournament_status, 'completed'::public.tournament_status, 'cancelled'::public.tournament_status) or now() >= (select start_time from public.tournaments where id = target_tournament_id) then raise exception 'tournament_live'; end if;
  update public.tournament_registrations set status = 'cancelled', checked_in = false, checked_in_at = null, updated_at = now() where tournament_id = target_tournament_id and team_id = target_team_id and status::text in ('registered', 'checked_in');
  update public.tournaments t set status = 'open'::public.tournament_status where t.id = target_tournament_id and t.status = 'full'::public.tournament_status and (select count(*) from public.tournament_registrations r where r.tournament_id = t.id and r.status::text in ('registered', 'checked_in')) < t.max_teams;
  insert into public.activity_events(user_id, event_type, description) values (auth.uid(), 'tournament_registration_cancelled', 'Cancelled registration for ' || tournament_title);
end;
$$;

grant execute on function public.create_tournament(text, text, text, text, integer, timestamptz, timestamptz, timestamptz, text), public.register_team_for_tournament(uuid, uuid), public.unregister_team(uuid, uuid), public.cancel_tournament_registration(uuid, uuid) to authenticated;
