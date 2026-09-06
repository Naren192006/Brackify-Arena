-- Migration: Update register_team_for_tournament to validate paid slots and registration close timestamp

create or replace function public.register_team_for_tournament(target_tournament_id uuid, target_team_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  registration_id uuid;
  current_paid_count integer;
  max_allowed integer;
  current_status public.tournament_status;
  open_at timestamptz;
  close_at timestamptz;
  tournament_title text;
  fee_minor bigint;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  if not exists (select 1 from public.teams where id = target_team_id and captain_id = auth.uid()) then
    raise exception 'captain_required';
  end if;

  select t.status, t.registration_open_at, t.registration_close_at, t.max_teams, t.title, coalesce(t.entry_fee_minor, 0)
    into current_status, open_at, close_at, max_allowed, tournament_title, fee_minor
    from public.tournaments t
    where t.id = target_tournament_id for update;

  if current_status is null then
    raise exception 'tournament_not_found';
  end if;

  if now() < open_at or now() >= close_at or current_status in ('completed'::public.tournament_status, 'cancelled'::public.tournament_status) then
    raise exception 'registration_closed';
  end if;

  if exists (
    select 1 from public.tournament_registrations
    where tournament_id = target_tournament_id and team_id = target_team_id and status::text in ('registered', 'checked_in')
  ) then
    raise exception 'team_already_registered';
  end if;

  -- Count paid registrations for paid tournaments; active registrations for free tournaments
  if fee_minor > 0 then
    select count(*) into current_paid_count
      from public.tournament_registrations
      where tournament_id = target_tournament_id and payment_status = 'paid';
  else
    select count(*) into current_paid_count
      from public.tournament_registrations
      where tournament_id = target_tournament_id and status::text in ('registered', 'checked_in');
  end if;

  if current_paid_count >= max_allowed then
    raise exception 'tournament_full';
  end if;

  insert into public.tournament_registrations(
    tournament_id, team_id, registered_by, status, payment_status, checked_in, checked_in_at
  ) values (
    target_tournament_id, target_team_id, auth.uid(), 'registered', case when fee_minor = 0 then 'paid' else 'pending' end, false, null
  )
  on conflict (tournament_id, team_id) do update
    set status = 'registered',
        registered_by = auth.uid(),
        payment_status = case when fee_minor = 0 then 'paid' else 'pending' end,
        checked_in = false,
        checked_in_at = null,
        updated_at = now()
    returning id into registration_id;

  insert into public.activity_events(user_id, event_type, description)
    values (auth.uid(), 'tournament_registered', 'Registered a team for ' || tournament_title);
  insert into public.notifications(user_id, title, body)
    values (auth.uid(), 'Registration successful', 'Your team is registered for ' || tournament_title || '.');

  return registration_id;
end;
$$;

grant execute on function public.register_team_for_tournament(uuid, uuid) to authenticated;

