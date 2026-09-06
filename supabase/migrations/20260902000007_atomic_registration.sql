-- ---------------------------------------------------------------------------
-- Migration: 20260902000007_atomic_registration.sql
-- Description: Implement atomic registration logic and prevent slot overbooking
-- ---------------------------------------------------------------------------

-- 1. Ensure unique index on active tournament registrations per team
create unique index if not exists uq_active_team_tournament_reg
  on public.tournament_registrations (tournament_id, team_id)
  where status != 'cancelled';

-- 2. Atomic Team Registration RPC with row-level locking
create or replace function public.register_team_atomic(
  p_tournament_id uuid,
  p_team_id uuid,
  p_user_id uuid,
  p_payment_status text default 'pending'
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tournament record;
  v_current_count integer;
  v_registration_id uuid;
  v_created_reg record;
  v_initial_payment_status text;
begin
  -- 1. Lock tournament record to serialize concurrent registrations
  select id, status, registration_open_at, registration_close_at, start_time, max_teams, entry_fee_minor
  into v_tournament
  from public.tournaments
  where id = p_tournament_id
  for update;

  if not found then
    raise exception 'tournament_not_found';
  end if;

  -- 2. Validate tournament status
  if lower(coalesce(v_tournament.status::text, '')) not in ('open', 'registration_open') then
    raise exception 'registration_closed';
  end if;

  -- 3. Validate registration window
  if v_tournament.registration_close_at is not null and now() >= v_tournament.registration_close_at then
    raise exception 'registration_closed';
  end if;

  if v_tournament.start_time is not null and now() >= v_tournament.start_time then
    raise exception 'registration_closed';
  end if;

  -- 4. Check for duplicate active registration for the same team
  if exists (
    select 1
    from public.tournament_registrations
    where tournament_id = p_tournament_id
      and team_id = p_team_id
      and status != 'cancelled'
  ) then
    raise exception 'duplicate_registration';
  end if;

  -- 5. Count all paid + pending (non-cancelled) registrations
  select count(*)
  into v_current_count
  from public.tournament_registrations
  where tournament_id = p_tournament_id
    and status != 'cancelled';

  -- 6. Check slot capacity against max_teams
  if v_current_count >= coalesce(v_tournament.max_teams, 16) then
    raise exception 'tournament_full';
  end if;

  -- 7. Determine initial payment status
  if coalesce(v_tournament.entry_fee_minor, 0) = 0 then
    v_initial_payment_status := 'paid';
  else
    v_initial_payment_status := coalesce(p_payment_status, 'pending');
  end if;

  -- 8. Insert registration atomically
  insert into public.tournament_registrations (
    tournament_id,
    team_id,
    registered_by,
    status,
    payment_status,
    checked_in,
    created_at,
    updated_at
  ) values (
    p_tournament_id,
    p_team_id,
    p_user_id,
    'registered',
    v_initial_payment_status,
    false,
    now(),
    now()
  )
  returning * into v_created_reg;

  -- 9. Return structured registration response
  return jsonb_build_object(
    'id', v_created_reg.id,
    'tournament_id', v_created_reg.tournament_id,
    'team_id', v_created_reg.team_id,
    'registered_by', v_created_reg.registered_by,
    'status', v_created_reg.status,
    'payment_status', v_created_reg.payment_status,
    'created_at', v_created_reg.created_at,
    'slots_remaining', (coalesce(v_tournament.max_teams, 16) - (v_current_count + 1)),
    'requires_payment', (coalesce(v_tournament.entry_fee_minor, 0) > 0),
    'entry_fee_minor', coalesce(v_tournament.entry_fee_minor, 0)
  );
end;
$$;

-- Grant execution to service_role and authenticated users
grant execute on function public.register_team_atomic(uuid, uuid, uuid, text) to authenticated, service_role;

