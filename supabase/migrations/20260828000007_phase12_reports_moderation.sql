-- Phase 12: fair-play reports and moderation. Create locally; do not push automatically.
create table if not exists public.fair_play_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  reported_user_id uuid not null references auth.users(id) on delete cascade,
  tournament_id uuid references public.tournaments(id) on delete set null,
  match_id uuid references public.matches(id) on delete set null,
  team_id uuid references public.teams(id) on delete set null,
  category text not null check (category in ('no_show','wrong_player','fake_score','toxic_behaviour','cheating','other')),
  description text not null check (char_length(trim(description)) between 10 and 4000),
  evidence_url text,
  status text not null default 'open' check (status in ('open','investigating','resolved','rejected')),
  moderator_notes text,
  resolution text check (resolution is null or resolution in ('warning','trust_penalty','match_forfeit','team_disqualification','tournament_ban')),
  rejection_reason text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  moderator_id uuid references auth.users(id) on delete set null,
  check (reporter_id <> reported_user_id)
);

create table if not exists public.moderation_actions (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.fair_play_reports(id) on delete restrict,
  moderator_id uuid not null references auth.users(id) on delete restrict,
  action text not null check (action in ('investigating','resolved','rejected','note_added')),
  outcome text,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists fair_play_reports_tournament_idx on public.fair_play_reports(tournament_id, created_at desc);
create index if not exists fair_play_reports_status_idx on public.fair_play_reports(status, created_at desc);
create index if not exists fair_play_reports_reported_user_idx on public.fair_play_reports(reported_user_id, created_at desc);
create index if not exists moderation_actions_report_idx on public.moderation_actions(report_id, created_at desc);

alter table public.fair_play_reports enable row level security;
alter table public.moderation_actions enable row level security;

drop policy if exists fair_play_reports_participant_select on public.fair_play_reports;
create policy fair_play_reports_participant_select on public.fair_play_reports for select to authenticated using (
  reporter_id = auth.uid() or reported_user_id = auth.uid()
  or public.is_super_admin(auth.uid())
  or (tournament_id is not null and public.is_tournament_admin(auth.uid(), tournament_id))
);
drop policy if exists fair_play_reports_authenticated_insert on public.fair_play_reports;
create policy fair_play_reports_authenticated_insert on public.fair_play_reports for insert to authenticated with check (
  reporter_id = auth.uid() and reporter_id <> reported_user_id
);
drop policy if exists fair_play_reports_admin_update on public.fair_play_reports;
create policy fair_play_reports_admin_update on public.fair_play_reports for update to authenticated using (
  public.is_super_admin(auth.uid())
  or (tournament_id is not null and public.is_tournament_admin(auth.uid(), tournament_id))
) with check (
  public.is_super_admin(auth.uid())
  or (tournament_id is not null and public.is_tournament_admin(auth.uid(), tournament_id))
);

drop policy if exists moderation_actions_admin_select on public.moderation_actions;
create policy moderation_actions_admin_select on public.moderation_actions for select to authenticated using (
  public.is_super_admin(auth.uid()) or exists (
    select 1 from public.fair_play_reports r
    where r.id = report_id and r.tournament_id is not null and public.is_tournament_admin(auth.uid(), r.tournament_id)
  )
);

create or replace function public.submit_fair_play_report(
  target_reported_user_id uuid,
  target_tournament_id uuid default null,
  target_match_id uuid default null,
  target_team_id uuid default null,
  target_category text default 'other',
  target_description text default '',
  target_evidence_url text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare new_id uuid;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if auth.uid() = target_reported_user_id then raise exception 'cannot_report_self'; end if;
  if char_length(trim(target_description)) < 10 then raise exception 'description_required'; end if;
  if exists (
    select 1 from public.fair_play_reports
    where reporter_id = auth.uid() and reported_user_id = target_reported_user_id
      and match_id is not distinct from target_match_id and category = target_category
      and status in ('open','investigating')
  ) then raise exception 'duplicate_report'; end if;
  insert into public.fair_play_reports(reporter_id, reported_user_id, tournament_id, match_id, team_id, category, description, evidence_url)
  values (auth.uid(), target_reported_user_id, target_tournament_id, target_match_id, target_team_id, target_category, trim(target_description), nullif(trim(target_evidence_url), ''))
  returning id into new_id;
  insert into public.notifications(user_id, title, body) values (target_reported_user_id, 'Fair-play report received', 'A report involving your account has been submitted for review.');
  insert into public.notifications(user_id, title, body)
    select distinct a.user_id, 'New fair-play report', 'A new report is waiting for moderation.'
    from public.tournament_admins a where a.tournament_id = target_tournament_id;
  insert into public.activity_events(user_id, event_type, description) values (auth.uid(), 'fair_play_report_submitted', 'Submitted a fair-play report.');
  return new_id;
end;
$$;

create or replace function public.moderate_fair_play_report(target_report_id uuid, target_action text, target_resolution text default null, target_notes text default null)
returns void language plpgsql security definer set search_path = public as $$
declare target public.fair_play_reports%rowtype; penalty integer := 0;
begin
  if not (public.is_super_admin(auth.uid()) or exists (select 1 from public.fair_play_reports r where r.id = target_report_id and r.tournament_id is not null and public.is_tournament_admin(auth.uid(), r.tournament_id))) then raise exception 'moderator_required'; end if;
  select * into target from public.fair_play_reports where id = target_report_id for update;
  if target.id is null then raise exception 'report_not_found'; end if;
  if target.status in ('resolved', 'rejected') then raise exception 'report_already_closed'; end if;
  if target_action = 'investigating' then
    update public.fair_play_reports set status = 'investigating', moderator_id = auth.uid(), moderator_notes = coalesce(target_notes, moderator_notes) where id = target_report_id;
  elsif target_action = 'rejected' then
    update public.fair_play_reports set status = 'rejected', moderator_id = auth.uid(), moderator_notes = target_notes, rejection_reason = target_notes, resolved_at = now() where id = target_report_id;
  elsif target_action = 'resolved' then
    if target_resolution is null then raise exception 'resolution_required'; end if;
    if target_resolution = 'tournament_ban' and not public.is_super_admin(auth.uid()) then raise exception 'super_admin_required'; end if;
    penalty := case target_resolution when 'warning' then 2 when 'trust_penalty' then 5 when 'match_forfeit' then 10 when 'team_disqualification' then 20 when 'tournament_ban' then 30 else 0 end;
    update public.fair_play_reports set status = 'resolved', resolution = target_resolution, moderator_id = auth.uid(), moderator_notes = target_notes, resolved_at = now() where id = target_report_id;
    if penalty > 0 then update public.profiles set trust_score = greatest(0, coalesce(trust_score, 50) - penalty) where id = target.reported_user_id; end if;
    insert into public.notifications(user_id, title, body) values (target.reported_user_id, 'Fair-play report resolved', 'A moderation review involving your account has been resolved.');
  else raise exception 'invalid_moderation_action'; end if;
  insert into public.moderation_actions(report_id, moderator_id, action, outcome, notes) values (target_report_id, auth.uid(), target_action, target_resolution, target_notes);
  insert into public.activity_events(user_id, event_type, description) values (auth.uid(), 'fair_play_report_' || target_action, 'Moderated fair-play report ' || target_report_id::text || '.');
end;
$$;

revoke all on function public.submit_fair_play_report(uuid, uuid, uuid, uuid, text, text, text) from public;
grant execute on function public.submit_fair_play_report(uuid, uuid, uuid, uuid, text, text, text) to authenticated;
revoke all on function public.moderate_fair_play_report(uuid, text, text, text) from public;
grant execute on function public.moderate_fair_play_report(uuid, text, text, text) to authenticated;
grant select on public.fair_play_reports, public.moderation_actions to authenticated;
