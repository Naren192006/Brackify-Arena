-- Phase 1: Add entry_fee columns to the Supabase-managed tournaments table.
-- The FastAPI-managed tournaments table already has these columns via Alembic
-- migration 002_phase0_domain_foundation. This migration brings the Supabase
-- schema into parity so the frontend can read entry_fee_minor directly from
-- supabase.from("tournaments").

alter table public.tournaments
  add column if not exists entry_fee_minor bigint not null default 0
    check (entry_fee_minor >= 0),
  add column if not exists entry_fee_currency text not null default 'INR';

comment on column public.tournaments.entry_fee_minor is
  'Registration entry fee in the smallest currency unit (paise for INR). 0 = free tournament.';