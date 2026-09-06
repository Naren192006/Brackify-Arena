-- Migration: Registration Cancellation Security & Non-Destructive Cancellation

alter table public.tournament_registrations
  add column if not exists cancelled_at timestamptz;

create or replace function public.cancel_tournament_registration(target_tournament_id uuid, target_team_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  tournament_title text;
  current_status public.tournament_status;
  close_at timestamptz;
  reg_record public.tournament_registrations%rowtype;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  if not exists (
    select 1 from public.teams
    where id = target_team_id and captain_id = auth.uid()
  ) then
    raise exception 'captain_required';
  end if;

  select title, status, registration_close_at
    into tournament_title, current_status, close_at
    from public.tournaments
    where id = target_tournament_id for update;

  if tournament_title is null then
    raise exception 'tournament_not_found';
  end if;

  -- 1. Disallow cancellation once registration has closed or tournament is live/completed
  if now() >= close_at or current_status in ('registration_closed'::public.tournament_status, 'ongoing'::public.tournament_status, 'completed'::public.tournament_status, 'cancelled'::public.tournament_status) then
    raise exception 'registration_closed';
  end if;

  select * into reg_record
    from public.tournament_registrations
    where tournament_id = target_tournament_id and team_id = target_team_id
    for update;

  if reg_record.id is null then
    raise exception 'registration_not_found';
  end if;

  if reg_record.status = 'cancelled' then
    raise exception 'already_cancelled';
  end if;

  -- 2. Mark registration and payment_status as cancelled without deleting row or altering payments table
  update public.tournament_registrations
    set status = 'cancelled',
        payment_status = 'cancelled',
        cancelled_at = now(),
        checked_in = false,
        checked_in_at = null,
        updated_at = now()
    where tournament_id = target_tournament_id and team_id = target_team_id;

  -- 3. If tournament was full, update status to open if slots became available
  update public.tournaments t
    set status = 'open'::public.tournament_status
    where t.id = target_tournament_id
      and t.status = 'full'::public.tournament_status
      and (
        select count(*)
        from public.tournament_registrations r
        where r.tournament_id = t.id
          and r.status::text in ('registered', 'checked_in')
          and r.payment_status = 'paid'
      ) < t.max_teams;

  insert into public.activity_events(user_id, event_type, description)
    values (auth.uid(), 'tournament_registration_cancelled', 'Cancelled registration for ' || tournament_title);

  insert into public.notifications(user_id, title, body)
    values (auth.uid(), 'Registration cancelled', 'Your registration for ' || tournament_title || ' has been cancelled.');
end;
$$;

grant execute on function public.cancel_tournament_registration(uuid, uuid) to authenticated;

