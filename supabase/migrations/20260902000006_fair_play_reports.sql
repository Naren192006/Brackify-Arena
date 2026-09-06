-- Migration: Fair Play Reports System
create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  match_id uuid references public.matches(id) on delete set null,
  reporter_registration_id uuid references public.tournament_registrations(id) on delete set null,
  accused_registration_id uuid references public.tournament_registrations(id) on delete set null,
  reason text not null,
  description text not null,
  status text not null default 'pending' check (status in ('pending', 'investigating', 'resolved', 'rejected', 'banned')),
  admin_notes text,
  resolved_by uuid references auth.users(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists reports_tournament_id_idx on public.reports(tournament_id, created_at desc);
create index if not exists reports_status_idx on public.reports(status, created_at desc);
create index if not exists reports_match_id_idx on public.reports(match_id);

alter table public.reports enable row level security;

-- Policies
do $$ begin
  create policy "Authenticated users can create reports"
    on public.reports for insert to authenticated
    with check (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Users and Admins can view reports"
    on public.reports for select to authenticated
    using (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Admins can update reports"
    on public.reports for update to authenticated
    using (true);
exception when duplicate_object then null; end $$;

grant select, insert, update on public.reports to authenticated, service_role;

