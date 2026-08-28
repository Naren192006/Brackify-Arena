-- Phase 15: live tournament center support tables.
create table if not exists public.tournament_activity (
  id uuid primary key default gen_random_uuid(), tournament_id uuid not null references public.tournaments(id) on delete cascade,
  event_type text not null, actor_id uuid references auth.users(id) on delete set null, match_id uuid references public.matches(id) on delete set null,
  message text not null, created_at timestamptz not null default now()
);
create table if not exists public.match_ready_status (
  match_id uuid not null references public.matches(id) on delete cascade, team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade, status text not null default 'ready' check (status in ('ready','not_ready','late')),
  updated_at timestamptz not null default now(), primary key (match_id, team_id)
);
create table if not exists public.player_match_history (
  id uuid primary key default gen_random_uuid(), match_id uuid not null references public.matches(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade, team_id uuid not null references public.teams(id) on delete cascade,
  result text not null check (result in ('win','loss')), rp_change integer not null default 0, created_at timestamptz not null default now(), unique (match_id, user_id)
);
create table if not exists public.match_mvp_votes (
  match_id uuid not null references public.matches(id) on delete cascade, voter_id uuid not null references auth.users(id) on delete cascade,
  player_id uuid not null references auth.users(id) on delete cascade, created_at timestamptz not null default now(), primary key (match_id, voter_id), check (voter_id <> player_id)
);
create index if not exists tournament_activity_feed_idx on public.tournament_activity(tournament_id, created_at desc);
create index if not exists match_ready_status_match_idx on public.match_ready_status(match_id);
create index if not exists player_match_history_user_idx on public.player_match_history(user_id, created_at desc);
alter table public.tournament_activity enable row level security;
alter table public.match_ready_status enable row level security;
alter table public.player_match_history enable row level security;
alter table public.match_mvp_votes enable row level security;
drop policy if exists tournament_activity_public_select on public.tournament_activity;
create policy tournament_activity_public_select on public.tournament_activity for select using (true);
drop policy if exists match_ready_participant_select on public.match_ready_status;
create policy match_ready_participant_select on public.match_ready_status for select to authenticated using (user_id = auth.uid() or exists (select 1 from public.matches m join public.tournament_admins a on a.tournament_id = m.tournament_id where m.id = match_id and a.user_id = auth.uid()));
drop policy if exists player_history_self_select on public.player_match_history;
create policy player_history_self_select on public.player_match_history for select to authenticated using (user_id = auth.uid());
drop policy if exists mvp_votes_public_select on public.match_mvp_votes;
create policy mvp_votes_public_select on public.match_mvp_votes for select using (true);
grant select on public.tournament_activity, public.match_ready_status, public.player_match_history, public.match_mvp_votes to anon, authenticated;
