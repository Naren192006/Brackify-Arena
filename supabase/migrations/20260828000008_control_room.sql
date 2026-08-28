-- Phase 14: organizer control-room notes, announcements, and pause state.
alter table public.tournaments add column if not exists paused_at timestamptz;

create table if not exists public.tournament_announcements (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  announcement_type text not null check (announcement_type in ('registration','check_in_reminder','round_started','match_reminder','tournament_paused','finals_live','champion_announced')),
  message text not null check (char_length(trim(message)) between 1 and 1000),
  created_at timestamptz not null default now()
);
create table if not exists public.tournament_admin_notes (
  tournament_id uuid primary key references public.tournaments(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  content text not null default '',
  updated_at timestamptz not null default now()
);
create index if not exists tournament_announcements_tournament_idx on public.tournament_announcements(tournament_id, created_at desc);
alter table public.tournament_announcements enable row level security;
alter table public.tournament_admin_notes enable row level security;
drop policy if exists tournament_announcements_admin_select on public.tournament_announcements;
create policy tournament_announcements_admin_select on public.tournament_announcements for select to authenticated using (public.is_tournament_admin(auth.uid(), tournament_id));
drop policy if exists tournament_admin_notes_admin_all on public.tournament_admin_notes;
create policy tournament_admin_notes_admin_all on public.tournament_admin_notes for all to authenticated using (public.is_tournament_admin(auth.uid(), tournament_id)) with check (public.is_tournament_admin(auth.uid(), tournament_id));
grant select on public.tournament_announcements, public.tournament_admin_notes to authenticated;

create or replace function public.admin_broadcast_announcement(target_tournament_id uuid, target_type text, target_message text)
returns uuid language plpgsql security definer set search_path = public as $$
declare new_id uuid; title text;
begin
  if not public.is_tournament_admin(auth.uid(), target_tournament_id) then raise exception 'tournament_admin_required'; end if;
  insert into public.tournament_announcements(tournament_id, author_id, announcement_type, message) values (target_tournament_id, auth.uid(), target_type, trim(target_message)) returning id into new_id;
  select t.title into title from public.tournaments t where t.id = target_tournament_id;
  insert into public.notifications(user_id, title, body)
    select distinct tm.user_id, 'Tournament announcement', title || ': ' || trim(target_message)
    from public.tournament_registrations r join public.team_members tm on tm.team_id = r.team_id
    where r.tournament_id = target_tournament_id and r.status in ('registered','checked_in');
  insert into public.activity_events(user_id, event_type, description) values (auth.uid(), 'tournament_announcement', 'Posted an announcement for ' || coalesce(title, 'tournament') || '.');
  return new_id;
end;
$$;

create or replace function public.admin_save_tournament_note(target_tournament_id uuid, target_content text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_tournament_admin(auth.uid(), target_tournament_id) then raise exception 'tournament_admin_required'; end if;
  insert into public.tournament_admin_notes(tournament_id, author_id, content) values (target_tournament_id, auth.uid(), target_content)
  on conflict (tournament_id) do update set author_id = auth.uid(), content = excluded.content, updated_at = now();
end;
$$;

create or replace function public.admin_toggle_tournament_pause(target_tournament_id uuid, should_pause boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_tournament_admin(auth.uid(), target_tournament_id) then raise exception 'tournament_admin_required'; end if;
  update public.tournaments set paused_at = case when should_pause then coalesce(paused_at, now()) else null end where id = target_tournament_id;
  insert into public.activity_events(user_id, event_type, description) values (auth.uid(), case when should_pause then 'tournament_paused' else 'tournament_resumed' end, case when should_pause then 'Paused tournament.' else 'Resumed tournament.' end);
end;
$$;
grant execute on function public.admin_broadcast_announcement(uuid, text, text), public.admin_save_tournament_note(uuid, text), public.admin_toggle_tournament_pause(uuid, boolean) to authenticated;
