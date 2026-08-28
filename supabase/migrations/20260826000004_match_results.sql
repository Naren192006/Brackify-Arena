-- Phase 5 already created public.match_status with scheduled/live/completed.
-- Keep scheduled for backwards compatibility and add the Phase 6 states idempotently.
alter type public.match_status add value if not exists 'pending';
alter type public.match_status add value if not exists 'reported';
alter type public.match_status add value if not exists 'cancelled';

alter table public.matches add column if not exists team1_score integer;
alter table public.matches add column if not exists team2_score integer;
alter table public.matches add column if not exists reported_by uuid references auth.users(id) on delete set null;
alter table public.matches add column if not exists reported_at timestamptz;
alter table public.matches add column if not exists verified_by uuid references auth.users(id) on delete set null;
alter table public.matches add column if not exists verified_at timestamptz;

alter table public.matches drop constraint if exists matches_scores_nonnegative;
alter table public.matches add constraint matches_scores_nonnegative check ((team1_score is null or team1_score >= 0) and (team2_score is null or team2_score >= 0));
alter table public.matches drop constraint if exists matches_scores_complete;
alter table public.matches add constraint matches_scores_complete check ((team1_score is null and team2_score is null) or (team1_score is not null and team2_score is not null and team1_score <> team2_score));

create table if not exists public.match_reports (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  team1_score integer not null check (team1_score >= 0),
  team2_score integer not null check (team2_score >= 0 and team1_score <> team2_score),
  winner_team_id uuid not null references public.teams(id) on delete restrict,
  reported_by uuid not null references auth.users(id) on delete restrict,
  status text not null default 'submitted' check (status in ('submitted', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  check (winner_team_id is not null)
);

create index if not exists matches_status_idx on public.matches(status);
create index if not exists matches_reported_by_idx on public.matches(reported_by);
create index if not exists matches_verified_by_idx on public.matches(verified_by);
create index if not exists match_reports_match_idx on public.match_reports(match_id, created_at desc);
create index if not exists match_reports_reporter_idx on public.match_reports(reported_by);

alter table public.match_reports enable row level security;
drop policy if exists match_reports_public_select on public.match_reports;
create policy match_reports_public_select on public.match_reports for select using (true);
drop policy if exists match_reports_captain_insert on public.match_reports;
create policy match_reports_captain_insert on public.match_reports for insert to authenticated with check (reported_by = auth.uid());

grant select on public.match_reports to anon, authenticated;

create or replace function public.submit_match_score(match_id uuid, team1_score integer, team2_score integer)
returns uuid language plpgsql security definer set search_path = public as $$
declare target public.matches%rowtype; winner uuid; report_id uuid; captain boolean;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if team1_score is null or team2_score is null or team1_score < 0 or team2_score < 0 or team1_score = team2_score then raise exception 'invalid_match_score'; end if;
  select * into target from public.matches where id = match_id for update;
  if target.id is null then raise exception 'match_not_found'; end if;
  if target.status::text in ('completed', 'cancelled') then raise exception 'match_not_reportable'; end if;
  select exists (select 1 from public.teams where captain_id = auth.uid() and id in (target.team_a_id, target.team_b_id)) into captain;
  if not captain then raise exception 'captain_required'; end if;
  if team1_score > team2_score then winner := target.team_a_id; else winner := target.team_b_id; end if;
  if winner is null then raise exception 'match_teams_not_ready'; end if;
  insert into public.match_reports(match_id, team1_score, team2_score, winner_team_id, reported_by)
    values (match_id, team1_score, team2_score, winner, auth.uid()) returning id into report_id;
  update public.matches set team1_score = submit_match_score.team1_score, team2_score = submit_match_score.team2_score,
    winner_team_id = winner, reported_by = auth.uid(), reported_at = now(), status =
      (select enumlabel::public.match_status from pg_enum where enumtypid = 'public.match_status'::regtype and enumlabel = 'reported')
    where id = match_id;
  insert into public.activity_events(user_id, event_type, description) values (auth.uid(), 'match_score_reported', 'Reported a score for match ' || match_id::text);
  return report_id;
end;
$$;

create or replace function public.approve_match_result(match_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare target public.matches%rowtype; winner uuid; report_uuid uuid;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into target from public.matches where id = match_id for update;
  if target.id is null then raise exception 'match_not_found'; end if;
  if not exists (select 1 from public.tournament_admins where tournament_id = target.tournament_id and user_id = auth.uid()) then raise exception 'tournament_admin_required'; end if;
  if target.status::text <> 'reported' then raise exception 'match_result_not_pending_approval'; end if;
  winner := case when target.team1_score > target.team2_score then target.team_a_id else target.team_b_id end;
  if winner is null then raise exception 'match_teams_not_ready'; end if;
  update public.match_reports set status = 'approved', reviewed_by = auth.uid(), reviewed_at = now() where match_id = target.id and status = 'submitted' returning id into report_uuid;
  perform public.advance_match_winner(target.id, winner);
  update public.matches set verified_by = auth.uid(), verified_at = now() where id = target.id;
  insert into public.activity_events(user_id, event_type, description) values (auth.uid(), 'match_result_approved', 'Approved result for match ' || match_id::text);
  insert into public.notifications(user_id, title, body)
    select distinct tm.user_id, 'Match result approved', 'Your match result has been approved.'
    from public.team_members tm where tm.team_id in (target.team_a_id, target.team_b_id);
  return winner;
end;
$$;

create or replace function public.reject_match_result(match_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare target public.matches%rowtype;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into target from public.matches where id = match_id for update;
  if target.id is null then raise exception 'match_not_found'; end if;
  if not exists (select 1 from public.tournament_admins where tournament_id = target.tournament_id and user_id = auth.uid()) then raise exception 'tournament_admin_required'; end if;
  if target.status::text <> 'reported' then raise exception 'match_result_not_pending_approval'; end if;
  update public.match_reports set status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now() where match_id = target.id and status = 'submitted';
  update public.matches set team1_score = null, team2_score = null, winner_team_id = null, reported_by = null, reported_at = null,
    status = (select enumlabel::public.match_status from pg_enum where enumtypid = 'public.match_status'::regtype and enumlabel = 'pending') where id = target.id;
  insert into public.activity_events(user_id, event_type, description) values (auth.uid(), 'match_result_rejected', 'Rejected result for match ' || match_id::text);
  insert into public.notifications(user_id, title, body)
    select distinct tm.user_id, 'Match result needs correction', 'Your submitted match result was rejected. Please submit it again.'
    from public.team_members tm where tm.team_id in (target.team_a_id, target.team_b_id);
  return target.id;
end;
$$;

create or replace function public.get_team_current_match(team_id uuid)
returns setof public.matches language sql stable security definer set search_path = public as $$
  select m.* from public.matches m
  where team_id in (m.team_a_id, m.team_b_id) and m.status::text in ('pending', 'scheduled', 'live', 'reported')
  order by m.round_number, m.match_number limit 1;
$$;

grant execute on function public.submit_match_score(uuid, integer, integer) to authenticated;
grant execute on function public.approve_match_result(uuid) to authenticated;
grant execute on function public.reject_match_result(uuid) to authenticated;
grant execute on function public.get_team_current_match(uuid) to anon, authenticated;
