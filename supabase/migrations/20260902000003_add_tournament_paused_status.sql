-- Migration: Add 'paused' status to tournament_status enum
do $$ begin
  alter type public.tournament_status add value if not exists 'paused';
exception when duplicate_object then null; end $$;

