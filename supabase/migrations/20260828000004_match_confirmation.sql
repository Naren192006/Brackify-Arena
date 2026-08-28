-- Phase 10: captain confirmation/dispute and live match notifications.

create or replace function public.get_team_current_match(team_id uuid)
returns setof public.matches language sql stable security definer set search_path = public as $$
  select m.* from public.matches m
  where team_id in (m.team_a_id, m.team_b_id)
    and m.status::text in ('pending', 'scheduled', 'live', 'reported', 'awaiting_approval')
  order by m.round_number, m.match_number limit 1;
$$;

create or replace function public.advance_match_winner_internal(match_uuid uuid, winner_uuid uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare current_match public.matches%rowtype; next_match public.matches%rowtype; next_round_id uuid; next_match_no integer;
begin
  select * into current_match from public.matches where id = match_uuid for update;
  if current_match.id is null then raise exception 'match_not_found'; end if;
  if current_match.status::text = 'completed' then raise exception 'match_already_completed'; end if;
  if winner_uuid is null or (winner_uuid <> current_match.team_a_id and winner_uuid <> current_match.team_b_id) then raise exception 'winner_must_be_a_match_team'; end if;
  update public.matches set winner_team_id = winner_uuid, status = 'completed'::public.match_status, completed_at = coalesce(completed_at, now()) where id = match_uuid;
  select r.id into next_round_id from public.rounds r where r.bracket_id = current_match.bracket_id and r.round_number = current_match.round_number + 1;
  if next_round_id is null then
    update public.brackets set champion_team_id = winner_uuid where id = current_match.bracket_id;
    update public.tournaments set status = 'completed'::public.tournament_status where id = current_match.tournament_id;
    insert into public.activity_events(user_id, event_type, description) values (auth.uid(), 'tournament_completed', 'Tournament completed after final match ' || match_uuid::text);
    insert into public.notifications(user_id, title, body) select distinct tm.user_id, 'Champion announced', 'The tournament is complete and a champion has been crowned.' from public.team_members tm where tm.team_id = winner_uuid;
    return winner_uuid;
  end if;
  next_match_no := (current_match.match_number + 1) / 2;
  select * into next_match from public.matches where round_id = next_round_id and match_number = next_match_no for update;
  if current_match.match_number % 2 = 1 then update public.matches set team_a_id = winner_uuid where id = next_match.id; else update public.matches set team_b_id = winner_uuid where id = next_match.id; end if;
  insert into public.activity_events(user_id, event_type, description) values (auth.uid(), 'winner_advanced', 'Winner advanced from match ' || match_uuid::text);
  select * into next_match from public.matches where id = next_match.id for update;
  if next_match.team_a_id is not null and next_match.team_b_id is null then perform public.advance_match_winner_internal(next_match.id, next_match.team_a_id);
  elsif next_match.team_b_id is not null and next_match.team_a_id is null then perform public.advance_match_winner_internal(next_match.id, next_match.team_b_id); end if;
  return winner_uuid;
end;
$$;

create or replace function public.advance_match_winner(match_uuid uuid, winner_uuid uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare target public.matches%rowtype;
begin
  select * into target from public.matches where id = match_uuid;
  if target.id is null then raise exception 'match_not_found'; end if;
  if not public.is_tournament_admin(auth.uid(), target.tournament_id) then raise exception 'tournament_admin_required'; end if;
  return public.advance_match_winner_internal(match_uuid, winner_uuid);
end;
$$;

create or replace function public.confirm_match_result(target_match_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare target public.matches%rowtype; winner uuid;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into target from public.matches where id = target_match_id for update;
  if target.id is null then raise exception 'match_not_found'; end if;
  if target.status::text not in ('reported', 'awaiting_approval') then raise exception 'match_result_not_pending_approval'; end if;
  if not exists (select 1 from public.teams where captain_id = auth.uid() and id in (target.team_a_id, target.team_b_id)) then raise exception 'captain_required'; end if;
  if target.reported_by = auth.uid() then raise exception 'opponent_confirmation_required'; end if;
  winner := case when target.team1_score > target.team2_score then target.team_a_id else target.team_b_id end;
  if winner is null then raise exception 'match_teams_not_ready'; end if;
  update public.match_reports set status = 'approved', reviewed_by = auth.uid(), reviewed_at = now() where match_id = target.id and status = 'submitted';
  perform public.advance_match_winner_internal(target.id, winner);
  update public.matches set verified_by = auth.uid(), verified_at = now() where id = target.id;
  insert into public.activity_events(user_id, event_type, description) values (auth.uid(), 'match_result_confirmed', 'Confirmed result for match ' || target.id::text);
  insert into public.notifications(user_id, title, body)
    select distinct tm.user_id, 'Match result confirmed', 'The match result was confirmed and the winner advanced.'
    from public.team_members tm where tm.team_id in (target.team_a_id, target.team_b_id);
  return winner;
end;
$$;

create or replace function public.dispute_match_result(target_match_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare target public.matches%rowtype;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into target from public.matches where id = target_match_id for update;
  if target.id is null then raise exception 'match_not_found'; end if;
  if target.status::text not in ('reported', 'awaiting_approval') then raise exception 'match_result_not_pending_approval'; end if;
  if not exists (select 1 from public.teams where captain_id = auth.uid() and id in (target.team_a_id, target.team_b_id)) then raise exception 'captain_required'; end if;
  insert into public.activity_events(user_id, event_type, description) values (auth.uid(), 'match_result_disputed', 'Disputed result for match ' || target.id::text);
  insert into public.notifications(user_id, title, body)
    select distinct tm.user_id, 'Match result disputed', 'A match result was disputed and is awaiting admin review.'
    from public.team_members tm where tm.team_id in (target.team_a_id, target.team_b_id);
  return target.id;
end;
$$;

-- Rejection returns the match to live play so the captain can submit a correction.
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
    status = 'live'::public.match_status where id = target.id;
  insert into public.activity_events(user_id, event_type, description) values (auth.uid(), 'match_result_rejected', 'Rejected result for match ' || match_id::text);
  insert into public.notifications(user_id, title, body)
    select distinct tm.user_id, 'Match result rejected', 'The result was rejected. Submit the score again.' from public.team_members tm where tm.team_id in (target.team_a_id, target.team_b_id);
  return target.id;
end;
$$;

grant execute on function public.confirm_match_result(uuid), public.dispute_match_result(uuid), public.reject_match_result(uuid) to authenticated;
grant execute on function public.get_team_current_match(uuid) to anon, authenticated;
