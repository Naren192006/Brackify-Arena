-- Migration: Support team registration IDs on matches table for tournament start match generation
alter table public.matches add column if not exists team1_registration_id uuid references public.tournament_registrations(id) on delete set null;
alter table public.matches add column if not exists team2_registration_id uuid references public.tournament_registrations(id) on delete set null;
alter table public.matches add column if not exists winner_registration_id uuid references public.tournament_registrations(id) on delete set null;

create index if not exists matches_team1_reg_idx on public.matches(team1_registration_id);
create index if not exists matches_team2_reg_idx on public.matches(team2_registration_id);
create index if not exists matches_winner_reg_idx on public.matches(winner_registration_id);

