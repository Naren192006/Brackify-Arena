-- Migration: Add champion_team_registration_id to tournaments and brackets
alter table public.tournaments add column if not exists champion_team_id uuid references public.teams(id) on delete set null;
alter table public.tournaments add column if not exists champion_team_registration_id uuid references public.tournament_registrations(id) on delete set null;

alter table public.brackets add column if not exists champion_team_registration_id uuid references public.tournament_registrations(id) on delete set null;

create index if not exists tournaments_champion_reg_idx on public.tournaments(champion_team_registration_id);
create index if not exists tournaments_champion_team_idx on public.tournaments(champion_team_id);

