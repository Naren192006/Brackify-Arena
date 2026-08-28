do $$ begin
  create type public.tournament_status as enum ('draft', 'open', 'full', 'ongoing', 'completed', 'cancelled');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.registration_status as enum ('registered', 'withdrawn', 'disqualified');
exception when duplicate_object then null; end $$;

create table if not exists public.tournaments (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 3 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  game text not null default 'VALORANT',
  mode text not null default '5v5',
  description text,
  rules text,
  max_teams integer not null check (max_teams between 2 and 512),
  registration_open_at timestamptz not null,
  registration_close_at timestamptz not null,
  start_time timestamptz not null,
  status public.tournament_status not null default 'draft',
  created_by uuid not null references auth.users(id) on delete restrict,
  banner_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (registration_open_at < registration_close_at and registration_close_at <= start_time)
);

create table if not exists public.tournament_registrations (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  registered_by uuid not null references auth.users(id) on delete restrict,
  status public.registration_status not null default 'registered',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tournament_id, team_id)
);

create table if not exists public.tournament_admins (
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (tournament_id, user_id)
);

create index if not exists tournaments_status_start_idx on public.tournaments(status, start_time);
create index if not exists tournaments_game_mode_idx on public.tournaments(game, mode);
create index if not exists tournaments_slug_idx on public.tournaments(slug);
create index if not exists registrations_tournament_status_idx on public.tournament_registrations(tournament_id, status);
create index if not exists registrations_team_idx on public.tournament_registrations(team_id, status);
create index if not exists tournament_admins_user_idx on public.tournament_admins(user_id);

drop trigger if exists tournaments_set_updated_at on public.tournaments;
create trigger tournaments_set_updated_at before update on public.tournaments for each row execute function public.set_updated_at();
drop trigger if exists tournament_registrations_set_updated_at on public.tournament_registrations;
create trigger tournament_registrations_set_updated_at before update on public.tournament_registrations for each row execute function public.set_updated_at();

create or replace function public.create_tournament(
  tournament_title text, tournament_slug text, tournament_description text default null,
  tournament_rules text default null, tournament_max_teams integer default 16,
  tournament_open_at timestamptz default now(), tournament_close_at timestamptz default now(),
  tournament_start_at timestamptz default now(), tournament_banner_url text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare tournament_id uuid;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  insert into public.tournaments(title, slug, description, rules, max_teams, registration_open_at, registration_close_at, start_time, status, created_by, banner_url)
  values (trim(tournament_title), lower(trim(tournament_slug)), tournament_description, tournament_rules, tournament_max_teams, tournament_open_at, tournament_close_at, tournament_start_at, 'open', auth.uid(), tournament_banner_url)
  returning id into tournament_id;
  insert into public.tournament_admins(tournament_id, user_id) values (tournament_id, auth.uid());
  return tournament_id;
exception when unique_violation then raise exception 'tournament_slug_taken';
end;
$$;

create or replace function public.register_team_for_tournament(target_tournament_id uuid, target_team_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare registration_id uuid; current_count integer; max_allowed integer; tournament_status public.tournament_status; close_at timestamptz;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if not exists (select 1 from public.teams where id = target_team_id and captain_id = auth.uid()) then raise exception 'captain_required'; end if;
  select t.status, t.registration_close_at, t.max_teams into tournament_status, close_at, max_allowed from public.tournaments t where t.id = target_tournament_id for update;
  if tournament_status is null then raise exception 'tournament_not_found'; end if;
  if tournament_status not in ('open', 'full') or now() < (select registration_open_at from public.tournaments where id = target_tournament_id) or now() >= close_at then raise exception 'registration_closed'; end if;
  if exists (select 1 from public.tournament_registrations where tournament_id = target_tournament_id and team_id = target_team_id and status = 'registered') then raise exception 'team_already_registered'; end if;
  select count(*) into current_count from public.tournament_registrations where tournament_id = target_tournament_id and status = 'registered';
  if current_count >= max_allowed then raise exception 'tournament_full'; end if;
  insert into public.tournament_registrations(tournament_id, team_id, registered_by, status) values (target_tournament_id, target_team_id, auth.uid(), 'registered')
  on conflict (tournament_id, team_id) do update set status = 'registered', registered_by = auth.uid(), updated_at = now() returning id into registration_id;
  update public.tournaments set status = case when current_count + 1 >= max_allowed then 'full' else 'open' end where id = target_tournament_id;
  return registration_id;
end;
$$;

create or replace function public.unregister_team(target_tournament_id uuid, target_team_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.teams where id = target_team_id and captain_id = auth.uid()) then raise exception 'captain_required'; end if;
  update public.tournament_registrations set status = 'withdrawn', updated_at = now() where tournament_id = target_tournament_id and team_id = target_team_id and status = 'registered';
end;
$$;

create or replace function public.is_team_registered(target_tournament_id uuid, target_team_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.tournament_registrations where tournament_id = target_tournament_id and team_id = target_team_id and status = 'registered');
$$;

alter table public.tournaments enable row level security;
alter table public.tournament_registrations enable row level security;
alter table public.tournament_admins enable row level security;

drop policy if exists tournaments_public_select on public.tournaments;
create policy tournaments_public_select on public.tournaments for select using (true);
drop policy if exists tournaments_creator_insert on public.tournaments;
create policy tournaments_creator_insert on public.tournaments for insert to authenticated with check (created_by = auth.uid());
drop policy if exists tournaments_admin_update on public.tournaments;
create policy tournaments_admin_update on public.tournaments for update to authenticated using (created_by = auth.uid() or exists (select 1 from public.tournament_admins a where a.tournament_id = id and a.user_id = auth.uid()));
drop policy if exists registrations_public_select on public.tournament_registrations;
create policy registrations_public_select on public.tournament_registrations for select using (true);
drop policy if exists tournament_admins_self_select on public.tournament_admins;
create policy tournament_admins_self_select on public.tournament_admins for select using (user_id = auth.uid());

grant select on public.tournaments, public.tournament_registrations to anon, authenticated;
grant select on public.tournament_admins to authenticated;
grant execute on function public.create_tournament(text, text, text, text, integer, timestamptz, timestamptz, timestamptz, text) to authenticated;
grant execute on function public.register_team_for_tournament(uuid, uuid) to authenticated;
grant execute on function public.unregister_team(uuid, uuid) to authenticated;
grant execute on function public.is_team_registered(uuid, uuid) to anon, authenticated;
