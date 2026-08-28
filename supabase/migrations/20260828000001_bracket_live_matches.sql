-- Phase 8.5: checked-in single-elimination brackets and live match progression.

alter type public.match_status add value if not exists 'awaiting_approval';

create index if not exists matches_tournament_round_match_idx
  on public.matches(tournament_id, round_number, match_number);

drop policy if exists brackets_admin_write on public.brackets;
create policy brackets_admin_write on public.brackets for all to authenticated
  using (public.is_tournament_admin(auth.uid(), tournament_id))
  with check (public.is_tournament_admin(auth.uid(), tournament_id));

drop policy if exists rounds_admin_write on public.rounds;
create policy rounds_admin_write on public.rounds for all to authenticated
  using (exists (select 1 from public.brackets b where b.id = rounds.bracket_id and public.is_tournament_admin(auth.uid(), b.tournament_id)))
  with check (exists (select 1 from public.brackets b where b.id = rounds.bracket_id and public.is_tournament_admin(auth.uid(), b.tournament_id)));

drop policy if exists matches_admin_write on public.matches;
create policy matches_admin_write on public.matches for all to authenticated
  using (public.is_tournament_admin(auth.uid(), tournament_id))
  with check (public.is_tournament_admin(auth.uid(), tournament_id));

create or replace function public.advance_match_winner(match_uuid uuid, winner_uuid uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  current_match public.matches%rowtype;
  next_match public.matches%rowtype;
  next_round_id uuid;
  next_match_no integer;
  current_winner uuid;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into current_match from public.matches where id = match_uuid for update;
  if current_match.id is null then raise exception 'match_not_found'; end if;
  if not public.is_tournament_admin(auth.uid(), current_match.tournament_id) then raise exception 'tournament_admin_required'; end if;
  if current_match.status::text = 'completed' then raise exception 'match_already_completed'; end if;
  if winner_uuid is null or (winner_uuid <> current_match.team_a_id and winner_uuid <> current_match.team_b_id) then
    raise exception 'winner_must_be_a_match_team';
  end if;

  update public.matches
    set winner_team_id = winner_uuid, status = 'completed'::public.match_status, completed_at = coalesce(completed_at, now())
    where id = match_uuid;
  current_winner := winner_uuid;

  select r.id into next_round_id
    from public.rounds r
    where r.bracket_id = current_match.bracket_id and r.round_number = current_match.round_number + 1;

  if next_round_id is null then
    update public.brackets set champion_team_id = current_winner where id = current_match.bracket_id;
    update public.tournaments set status = 'completed'::public.tournament_status where id = current_match.tournament_id;
    insert into public.activity_events(user_id, event_type, description)
      values (auth.uid(), 'tournament_completed', 'Tournament completed after final match ' || match_uuid::text);
    insert into public.notifications(user_id, title, body)
      select distinct tm.user_id, 'Champion announced', 'The tournament is complete and a champion has been crowned.'
      from public.team_members tm where tm.team_id = current_winner;
    return current_winner;
  end if;

  next_match_no := (current_match.match_number + 1) / 2;
  select * into next_match from public.matches where round_id = next_round_id and match_number = next_match_no for update;
  if next_match.id is null then raise exception 'next_match_not_found'; end if;
  if current_match.match_number % 2 = 1 then
    update public.matches set team_a_id = current_winner where id = next_match.id;
  else
    update public.matches set team_b_id = current_winner where id = next_match.id;
  end if;

  insert into public.activity_events(user_id, event_type, description)
    values (auth.uid(), 'winner_advanced', 'Winner advanced from match ' || match_uuid::text);

  -- A match with one populated side is a bye. Advance it immediately, including chained byes.
  select * into next_match from public.matches where id = next_match.id for update;
  if (next_match.team_a_id is not null and next_match.team_b_id is null) then
    perform public.advance_match_winner(next_match.id, next_match.team_a_id);
  elsif (next_match.team_b_id is not null and next_match.team_a_id is null) then
    perform public.advance_match_winner(next_match.id, next_match.team_b_id);
  end if;
  return current_winner;
end;
$$;

create or replace function public.generate_single_elimination_bracket(tournament_uuid uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  bracket_uuid uuid;
  team_count integer;
  slot_count integer := 1;
  total_rounds integer := 0;
  round_no integer;
  round_uuid uuid;
  round_kind public.round_type;
  match_no integer;
  seeded_team uuid;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if not public.is_tournament_admin(auth.uid(), tournament_uuid) then raise exception 'tournament_admin_required'; end if;
  if exists (select 1 from public.brackets where tournament_id = tournament_uuid) then raise exception 'bracket_already_exists'; end if;

  select count(*) into team_count
    from public.tournament_registrations
    where tournament_id = tournament_uuid
      and status::text in ('registered', 'checked_in')
      and (status::text = 'checked_in' or coalesce(checked_in, false) = true)
      and coalesce(check_in_status::text, 'checked_in') = 'checked_in';
  if team_count < 2 or team_count > 32 then raise exception 'checked_in_count_must_be_between_2_and_32'; end if;
  while slot_count < team_count loop slot_count := slot_count * 2; end loop;
  while (1 << total_rounds) < slot_count loop total_rounds := total_rounds + 1; end loop;

  insert into public.brackets(tournament_id, format, total_rounds)
    values (tournament_uuid, 'single_elimination', total_rounds) returning id into bracket_uuid;
  for round_no in 1..total_rounds loop
    round_kind := case when round_no = total_rounds then 'final'::public.round_type
      when round_no = total_rounds - 1 then 'semifinal'::public.round_type
      else 'quarterfinal'::public.round_type end;
    insert into public.rounds(bracket_id, round_number, round_type)
      values (bracket_uuid, round_no, round_kind) returning id into round_uuid;
    for match_no in 1..(slot_count / (1 << round_no)) loop
      insert into public.matches(tournament_id, bracket_id, round_id, round_number, match_number, status)
        values (tournament_uuid, bracket_uuid, round_uuid, round_no, match_no, 'scheduled'::public.match_status);
    end loop;
  end loop;

  match_no := 0;
  for seeded_team in
    select r.team_id
    from public.tournament_registrations r
    where r.tournament_id = tournament_uuid
      and r.status::text in ('registered', 'checked_in')
      and (r.status::text = 'checked_in' or coalesce(r.checked_in, false) = true)
      and coalesce(r.check_in_status::text, 'checked_in') = 'checked_in'
    order by random()
  loop
    match_no := match_no + 1;
    update public.matches set team_a_id = case when match_no % 2 = 1 then seeded_team else team_a_id end,
      team_b_id = case when match_no % 2 = 0 then seeded_team else team_b_id end
      where bracket_id = bracket_uuid and round_number = 1 and match_number = ((match_no + 1) / 2);
  end loop;

  update public.tournaments set status = 'ongoing'::public.tournament_status where id = tournament_uuid;
  insert into public.activity_events(user_id, event_type, description)
    values (auth.uid(), 'bracket_generated', 'Generated a bracket for tournament ' || tournament_uuid::text);
  insert into public.notifications(user_id, title, body)
    select distinct r.registered_by, 'Bracket generated', 'Your tournament bracket is ready.'
    from public.tournament_registrations r
    where r.tournament_id = tournament_uuid and r.status::text in ('registered', 'checked_in');

  -- Resolve all first-round byes after seeding.
  for match_no in 1..(slot_count / 2) loop
    if (select team_a_id is not null and team_b_id is null from public.matches where bracket_id = bracket_uuid and round_number = 1 and match_number = match_no) then
      perform public.advance_match_winner((select id from public.matches where bracket_id = bracket_uuid and round_number = 1 and match_number = match_no), (select team_a_id from public.matches where bracket_id = bracket_uuid and round_number = 1 and match_number = match_no));
    end if;
  end loop;
  return bracket_uuid;
end;
$$;

create or replace function public.admin_start_match(target_match_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare target public.matches%rowtype;
begin
  select * into target from public.matches where id = target_match_id for update;
  if target.id is null then raise exception 'match_not_found'; end if;
  if not public.is_tournament_admin(auth.uid(), target.tournament_id) then raise exception 'tournament_admin_required'; end if;
  if target.team_a_id is null or target.team_b_id is null then raise exception 'match_teams_not_ready'; end if;
  if target.status::text not in ('scheduled', 'pending') then raise exception 'match_not_startable'; end if;
  update public.matches set status = 'live'::public.match_status where id = target.id;
  insert into public.activity_events(user_id, event_type, description) values (auth.uid(), 'match_started', 'Started match ' || target.id::text);
end;
$$;

create or replace function public.admin_reset_match(target_match_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare target public.matches%rowtype;
begin
  select * into target from public.matches where id = target_match_id for update;
  if target.id is null then raise exception 'match_not_found'; end if;
  if not public.is_tournament_admin(auth.uid(), target.tournament_id) then raise exception 'tournament_admin_required'; end if;
  update public.matches set winner_team_id = null, team1_score = null, team2_score = null, reported_by = null, reported_at = null, verified_by = null, verified_at = null, completed_at = null, status = 'scheduled'::public.match_status where id = target.id;
  update public.match_reports set status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now() where match_id = target.id and status = 'submitted';
end;
$$;

create or replace function public.admin_force_match_winner(target_match_id uuid, winner_uuid uuid)
returns uuid language plpgsql security definer set search_path = public as $$
begin
  return public.advance_match_winner(target_match_id, winner_uuid);
end;
$$;

create or replace function public.submit_match_score(match_id uuid, team1_score integer, team2_score integer)
returns uuid language plpgsql security definer set search_path = public as $$
declare target public.matches%rowtype; winner uuid; report_id uuid;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if team1_score is null or team2_score is null or team1_score < 0 or team2_score < 0 or team1_score = team2_score then raise exception 'invalid_match_score'; end if;
  select * into target from public.matches where id = match_id for update;
  if target.id is null then raise exception 'match_not_found'; end if;
  if target.status::text in ('completed', 'cancelled', 'reported', 'awaiting_approval') then raise exception 'match_not_reportable'; end if;
  if not exists (select 1 from public.teams where captain_id = auth.uid() and id in (target.team_a_id, target.team_b_id)) then raise exception 'captain_required'; end if;
  winner := case when team1_score > team2_score then target.team_a_id else target.team_b_id end;
  if winner is null then raise exception 'match_teams_not_ready'; end if;
  insert into public.match_reports(match_id, team1_score, team2_score, winner_team_id, reported_by)
    values (match_id, team1_score, team2_score, winner, auth.uid()) returning id into report_id;
  update public.matches set team1_score = submit_match_score.team1_score, team2_score = submit_match_score.team2_score,
    winner_team_id = winner, reported_by = auth.uid(), reported_at = now(), status = 'awaiting_approval'::public.match_status
    where id = match_id;
  insert into public.activity_events(user_id, event_type, description) values (auth.uid(), 'match_score_reported', 'Reported a score for match ' || match_id::text);
  return report_id;
end;
$$;

create or replace function public.approve_match_result(match_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare target public.matches%rowtype; winner uuid;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into target from public.matches where id = match_id for update;
  if target.id is null then raise exception 'match_not_found'; end if;
  if not public.is_tournament_admin(auth.uid(), target.tournament_id) then raise exception 'tournament_admin_required'; end if;
  if target.status::text not in ('reported', 'awaiting_approval') then raise exception 'match_result_not_pending_approval'; end if;
  winner := case when target.team1_score > target.team2_score then target.team_a_id else target.team_b_id end;
  if winner is null then raise exception 'match_teams_not_ready'; end if;
  update public.match_reports set status = 'approved', reviewed_by = auth.uid(), reviewed_at = now() where match_id = target.id and status = 'submitted';
  perform public.advance_match_winner(target.id, winner);
  update public.matches set verified_by = auth.uid(), verified_at = now() where id = target.id;
  insert into public.activity_events(user_id, event_type, description) values (auth.uid(), 'match_result_approved', 'Approved result for match ' || match_id::text);
  insert into public.notifications(user_id, title, body)
    select distinct tm.user_id, 'Match result approved', 'Your match result has been approved.' from public.team_members tm where tm.team_id in (target.team_a_id, target.team_b_id);
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
  if not public.is_tournament_admin(auth.uid(), target.tournament_id) then raise exception 'tournament_admin_required'; end if;
  if target.status::text not in ('reported', 'awaiting_approval') then raise exception 'match_result_not_pending_approval'; end if;
  update public.match_reports set status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now() where match_id = target.id and status = 'submitted';
  update public.matches set team1_score = null, team2_score = null, winner_team_id = null, reported_by = null, reported_at = null,
    status = 'pending'::public.match_status where id = target.id;
  insert into public.activity_events(user_id, event_type, description) values (auth.uid(), 'match_result_rejected', 'Rejected result for match ' || match_id::text);
  insert into public.notifications(user_id, title, body)
    select distinct tm.user_id, 'Match result needs correction', 'Your submitted match result was rejected. Please submit it again.' from public.team_members tm where tm.team_id in (target.team_a_id, target.team_b_id);
  return target.id;
end;
$$;

grant execute on function public.generate_single_elimination_bracket(uuid), public.advance_match_winner(uuid, uuid), public.admin_start_match(uuid), public.admin_reset_match(uuid), public.admin_force_match_winner(uuid, uuid) to authenticated;
grant execute on function public.submit_match_score(uuid, integer, integer), public.approve_match_result(uuid), public.reject_match_result(uuid) to authenticated;
