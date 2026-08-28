-- Keep legacy checked_in rows compatible with bracket generation.
-- The checked_in boolean and registration status are authoritative for this flow.

update public.tournament_registrations
set check_in_status = 'checked_in'::public.check_in_status,
    checked_in_at = coalesce(checked_in_at, now())
where status::text in ('registered', 'checked_in')
  and checked_in = true
  and check_in_status::text <> 'checked_in';

-- The Phase 8.5 generator intentionally uses only accepted registrations whose
-- checked_in flag is true. It does not require a separately synchronized status.
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
      and checked_in = true;
  if team_count not in (2, 4, 8, 16, 32) then
    raise exception 'Bracket can only be generated with 2, 4, 8, 16, or 32 checked-in teams.';
  end if;
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
    select r.team_id from public.tournament_registrations r
    where r.tournament_id = tournament_uuid
      and r.status::text in ('registered', 'checked_in')
      and r.checked_in = true
    order by random()
  loop
    match_no := match_no + 1;
    update public.matches
      set team_a_id = case when match_no % 2 = 1 then seeded_team else team_a_id end,
          team_b_id = case when match_no % 2 = 0 then seeded_team else team_b_id end
      where bracket_id = bracket_uuid and round_number = 1 and match_number = ((match_no + 1) / 2);
  end loop;

  update public.tournaments set status = 'ongoing'::public.tournament_status where id = tournament_uuid;
  insert into public.activity_events(user_id, event_type, description)
    values (auth.uid(), 'bracket_generated', 'Generated a bracket for tournament ' || tournament_uuid::text);
  insert into public.notifications(user_id, title, body)
    select distinct r.registered_by, 'Bracket generated', 'Your tournament bracket is ready.'
    from public.tournament_registrations r
    where r.tournament_id = tournament_uuid and r.status::text in ('registered', 'checked_in') and r.checked_in = true;
  return bracket_uuid;
end;
$$;

grant execute on function public.generate_single_elimination_bracket(uuid) to authenticated;
