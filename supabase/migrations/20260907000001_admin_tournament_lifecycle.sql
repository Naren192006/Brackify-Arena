-- =========================================================================
-- Brackify Arena: Admin Tournament Lifecycle, Soft Deletes & Metadata
-- Migration: 20260907000001_admin_tournament_lifecycle.sql
-- =========================================================================

-- 1. Safely add missing enum values to tournament_status enum if needed
do $$ begin
  alter type public.tournament_status add value if not exists 'published';
exception when duplicate_object then null; end $$;

do $$ begin
  alter type public.tournament_status add value if not exists 'registration_open';
exception when duplicate_object then null; end $$;

do $$ begin
  alter type public.tournament_status add value if not exists 'live';
exception when duplicate_object then null; end $$;

-- 2. Add lifecycle timestamp columns & auxiliary tournament fields
alter table public.tournaments
  add column if not exists published_at timestamptz,
  add column if not exists paused_at timestamptz,
  add column if not exists resumed_at timestamptz,
  add column if not exists cancelled_at timestamptz,
  add column if not exists completed_at timestamptz,
  add column if not exists deleted_at timestamptz,
  add column if not exists platform text not null default 'PC',
  add column if not exists team_size integer not null default 5 check (team_size between 1 and 10),
  add column if not exists timezone text not null default 'UTC',
  add column if not exists format text not null default 'single_elimination';

-- 3. Indexes for soft-deletes and status queries
create index if not exists tournaments_deleted_at_idx on public.tournaments(deleted_at);
create index if not exists tournaments_status_start_time_idx on public.tournaments(status, start_time);
create index if not exists tournaments_platform_idx on public.tournaments(platform);
