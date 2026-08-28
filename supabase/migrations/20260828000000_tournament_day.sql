-- Phase 8 tournament-day primitives. Existing registration/check-in columns remain compatible.
do $$ begin
  alter type public.tournament_status add value if not exists 'registration_closed';
  alter type public.tournament_status add value if not exists 'check_in';
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.check_in_status as enum ('pending', 'checked_in', 'absent');
exception when duplicate_object then null; end $$;

alter table public.tournament_registrations add column if not exists check_in_status public.check_in_status not null default 'pending';
alter table public.tournament_registrations add column if not exists checked_in boolean not null default false;
alter table public.tournament_registrations add column if not exists checked_in_at timestamptz;

update public.tournament_registrations set check_in_status = case when checked_in then 'checked_in'::public.check_in_status else 'pending'::public.check_in_status end;

create index if not exists registrations_check_in_status_idx on public.tournament_registrations(tournament_id, check_in_status);

create or replace function public.admin_update_check_in(target_registration_id uuid, action text)
returns void language plpgsql security definer set search_path = public as $$
declare target public.tournament_registrations%rowtype;
begin
  select * into target from public.tournament_registrations where id = target_registration_id for update;
  if target.id is null then raise exception 'registration_not_found'; end if;
  if not public.is_tournament_admin(auth.uid(), target.tournament_id) then raise exception 'tournament_admin_required'; end if;
  if action = 'check_in' then
    update public.tournament_registrations set checked_in = true, checked_in_at = now(), check_in_status = 'checked_in' where id = target.id;
  elsif action = 'undo' then
    update public.tournament_registrations set checked_in = false, checked_in_at = null, check_in_status = 'pending' where id = target.id;
  elsif action = 'absent' then
    update public.tournament_registrations set checked_in = false, checked_in_at = null, check_in_status = 'absent' where id = target.id;
  else raise exception 'invalid_check_in_action'; end if;
end;
$$;

create or replace function public.admin_close_check_in(target_tournament_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_tournament_admin(auth.uid(), target_tournament_id) then raise exception 'tournament_admin_required'; end if;
  update public.tournament_registrations set check_in_status = 'absent', checked_in = false where tournament_id = target_tournament_id and status::text in ('registered', 'checked_in') and check_in_status = 'pending';
  update public.tournaments set status = 'registration_closed'::public.tournament_status where id = target_tournament_id;
end;
$$;

grant execute on function public.admin_update_check_in(uuid, text), public.admin_close_check_in(uuid) to authenticated;
