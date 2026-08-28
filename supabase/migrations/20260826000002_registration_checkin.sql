alter type public.registration_status add value if not exists 'pending';
alter type public.registration_status add value if not exists 'checked_in';
alter type public.registration_status add value if not exists 'cancelled';

alter table public.tournament_registrations add column if not exists checked_in boolean not null default false;
alter table public.tournament_registrations add column if not exists checked_in_at timestamptz;
alter table public.tournament_registrations add column if not exists seed integer;
alter table public.tournaments add column if not exists checkin_open_at timestamptz;
alter table public.tournaments add column if not exists checkin_close_at timestamptz;

update public.tournaments
set checkin_open_at = coalesce(checkin_open_at, registration_close_at),
    checkin_close_at = coalesce(checkin_close_at, start_time - interval '15 minutes')
where checkin_open_at is null or checkin_close_at is null;

alter table public.tournaments drop constraint if exists tournaments_checkin_window;
alter table public.tournaments add constraint tournaments_checkin_window check (checkin_open_at <= checkin_close_at and checkin_close_at <= start_time);
alter table public.tournament_registrations drop constraint if exists registrations_checkin_consistency;
-- Compare through text so this constraint is safe in the same transaction as ALTER TYPE.
alter table public.tournament_registrations add constraint registrations_checkin_consistency
  check ((status::text = 'checked_in' and checked_in = true) or status::text <> 'checked_in');

create index if not exists registrations_checkin_idx on public.tournament_registrations(tournament_id, checked_in, status);
create index if not exists tournaments_checkin_window_idx on public.tournaments(checkin_open_at, checkin_close_at);

create or replace function public.create_tournament(
  tournament_title text, tournament_slug text, tournament_description text default null,
  tournament_rules text default null, tournament_max_teams integer default 16,
  tournament_open_at timestamptz default now(), tournament_close_at timestamptz default now(),
  tournament_start_at timestamptz default now(), tournament_banner_url text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare new_tournament_id uuid;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  insert into public.tournaments(title, slug, description, rules, max_teams, registration_open_at, registration_close_at, checkin_open_at, checkin_close_at, start_time, status, created_by, banner_url)
  values (trim(tournament_title), lower(trim(tournament_slug)), tournament_description, tournament_rules, tournament_max_teams, tournament_open_at, tournament_close_at, tournament_close_at, tournament_start_at - interval '15 minutes', tournament_start_at, 'open', auth.uid(), tournament_banner_url)
  returning id into new_tournament_id;
  insert into public.tournament_admins(tournament_id, user_id) values (new_tournament_id, auth.uid());
  return new_tournament_id;
exception when unique_violation then raise exception 'tournament_slug_taken';
end;
$$;

create or replace function public.register_team_for_tournament(target_tournament_id uuid, target_team_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare registration_id uuid; current_count integer; max_allowed integer; tournament_status public.tournament_status; close_at timestamptz; tournament_title text;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if not exists (select 1 from public.teams where id = target_team_id and captain_id = auth.uid()) then raise exception 'captain_required'; end if;
  select t.status, t.registration_close_at, t.max_teams, t.title into tournament_status, close_at, max_allowed, tournament_title from public.tournaments t where t.id = target_tournament_id for update;
  if tournament_status is null then raise exception 'tournament_not_found'; end if;
  if tournament_status not in ('open', 'full') or now() < (select registration_open_at from public.tournaments where id = target_tournament_id) or now() >= close_at then raise exception 'registration_closed'; end if;
  if exists (select 1 from public.tournament_registrations where tournament_id = target_tournament_id and team_id = target_team_id and status::text in ('registered', 'checked_in')) then raise exception 'team_already_registered'; end if;
  select count(*) into current_count from public.tournament_registrations where tournament_id = target_tournament_id and status::text in ('registered', 'checked_in');
  if current_count >= max_allowed then raise exception 'tournament_full'; end if;
  insert into public.tournament_registrations(tournament_id, team_id, registered_by, status, checked_in, checked_in_at)
  values (target_tournament_id, target_team_id, auth.uid(), 'registered', false, null)
  on conflict (tournament_id, team_id) do update set status = 'registered', registered_by = auth.uid(), checked_in = false, checked_in_at = null, updated_at = now()
  returning id into registration_id;
  update public.tournaments set status = case when current_count + 1 >= max_allowed then 'full' else 'open' end where id = target_tournament_id;
  insert into public.activity_events(user_id, event_type, description) values (auth.uid(), 'tournament_registered', 'Registered a team for ' || tournament_title);
  insert into public.notifications(user_id, title, body) values (auth.uid(), 'Registration successful', 'Your team is registered for ' || tournament_title || '.');
  return registration_id;
end;
$$;

create or replace function public.check_in_team(target_tournament_id uuid, target_team_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare registration_id uuid; tournament_title text; open_at timestamptz; close_at timestamptz; current_status public.tournament_status;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if not exists (select 1 from public.teams where id = target_team_id and captain_id = auth.uid()) then raise exception 'captain_required'; end if;
  select t.title, t.checkin_open_at, t.checkin_close_at, t.status into tournament_title, open_at, close_at, current_status from public.tournaments t where t.id = target_tournament_id for update;
  if tournament_title is null then raise exception 'tournament_not_found'; end if;
  if open_at is null or close_at is null then raise exception 'checkin_not_configured'; end if;
  if current_status in ('completed', 'cancelled') or now() < open_at then raise exception 'checkin_not_open'; end if;
  if now() >= close_at then raise exception 'checkin_closed'; end if;
  update public.tournament_registrations set status = (select enumlabel::public.registration_status from pg_enum where enumtypid = 'public.registration_status'::regtype and enumlabel = 'checked_in'), checked_in = true, checked_in_at = now(), updated_at = now()
  where tournament_id = target_tournament_id and team_id = target_team_id and status = 'registered' returning id into registration_id;
  if registration_id is null then raise exception 'registration_not_found'; end if;
  insert into public.activity_events(user_id, event_type, description) values (auth.uid(), 'tournament_checked_in', 'Checked a team in for ' || tournament_title);
  insert into public.notifications(user_id, title, body) values (auth.uid(), 'Check-in successful', 'Your team is checked in for ' || tournament_title || '.');
  return registration_id;
end;
$$;

create or replace function public.cancel_tournament_registration(target_tournament_id uuid, target_team_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare tournament_title text; current_status public.tournament_status;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if not exists (select 1 from public.teams where id = target_team_id and captain_id = auth.uid()) then raise exception 'captain_required'; end if;
  select title, status into tournament_title, current_status from public.tournaments where id = target_tournament_id for update;
  if tournament_title is null then raise exception 'tournament_not_found'; end if;
  if current_status in ('ongoing', 'completed', 'cancelled') or now() >= (select start_time from public.tournaments where id = target_tournament_id) then raise exception 'tournament_live'; end if;
  update public.tournament_registrations set status = (select enumlabel::public.registration_status from pg_enum where enumtypid = 'public.registration_status'::regtype and enumlabel = 'cancelled'), checked_in = false, checked_in_at = null, updated_at = now() where tournament_id = target_tournament_id and team_id = target_team_id and status::text in ('registered', 'checked_in');
  update public.tournaments t set status = 'open'
  where t.id = target_tournament_id and t.status = 'full'
    and (select count(*) from public.tournament_registrations r where r.tournament_id = t.id and r.status::text in ('registered', 'checked_in')) < t.max_teams;
  insert into public.activity_events(user_id, event_type, description) values (auth.uid(), 'tournament_registration_cancelled', 'Cancelled registration for ' || tournament_title);
end;
$$;

create or replace function public.get_registered_team_count(target_tournament_id uuid)
returns integer language sql stable security definer set search_path = public as $$
  select count(*)::integer from public.tournament_registrations where tournament_id = target_tournament_id and status::text in ('registered', 'checked_in');
$$;

grant execute on function public.check_in_team(uuid, uuid) to authenticated;
grant execute on function public.cancel_tournament_registration(uuid, uuid) to authenticated;
grant execute on function public.get_registered_team_count(uuid) to anon, authenticated;
