-- =========================================================================
-- Brackify Arena: Ensure Tournament Extended Columns Exist
-- Migration: 20260907000004_add_tournament_extended_columns.sql
-- =========================================================================

-- 1. Ensure tournament_status enum values
DO $$ BEGIN
  ALTER TYPE public.tournament_status ADD VALUE IF NOT EXISTS 'published';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TYPE public.tournament_status ADD VALUE IF NOT EXISTS 'registration_open';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TYPE public.tournament_status ADD VALUE IF NOT EXISTS 'live';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TYPE public.tournament_status ADD VALUE IF NOT EXISTS 'paused';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Add extended columns to tournaments table safely
ALTER TABLE public.tournaments
  ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'Asia/Kolkata',
  ADD COLUMN IF NOT EXISTS format text NOT NULL DEFAULT 'single_elimination',
  ADD COLUMN IF NOT EXISTS platform text NOT NULL DEFAULT 'PC',
  ADD COLUMN IF NOT EXISTS team_size integer NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS published_at timestamptz,
  ADD COLUMN IF NOT EXISTS paused_at timestamptz,
  ADD COLUMN IF NOT EXISTS resumed_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- 3. Add performance indexes
CREATE INDEX IF NOT EXISTS tournaments_format_idx ON public.tournaments(format);
CREATE INDEX IF NOT EXISTS tournaments_platform_idx ON public.tournaments(platform);
CREATE INDEX IF NOT EXISTS tournaments_timezone_idx ON public.tournaments(timezone);
CREATE INDEX IF NOT EXISTS tournaments_deleted_at_idx ON public.tournaments(deleted_at);

