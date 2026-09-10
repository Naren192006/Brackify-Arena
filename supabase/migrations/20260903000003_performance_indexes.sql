-- ---------------------------------------------------------------------------
-- Migration: 20260903000003_performance_indexes.sql
-- Description: Add missing indexes to optimize queries on payments, registrations,
--              matches, reports, and tournaments.
-- ---------------------------------------------------------------------------

-- 1. Payments: fast webhook verification, order lookup, and user payment history
do $$ begin
  execute 'create index if not exists idx_payments_razorpay_order_id on public.payments(razorpay_order_id)';
exception when others then null; end $$;

do $$ begin
  execute 'create index if not exists idx_payments_razorpay_payment_id on public.payments(razorpay_payment_id)';
exception when others then null; end $$;

do $$ begin
  execute 'create index if not exists idx_payments_user_status_created on public.payments(user_id, status, created_at desc)';
exception when others then null; end $$;

-- 2. Tournament Registrations: fast occupied slot count, atomic registration lock queries, and user history
do $$ begin
  execute 'create index if not exists idx_tournament_registrations_tourn_payment_status on public.tournament_registrations(tournament_id, payment_status, status)';
exception when others then null; end $$;

do $$ begin
  execute 'create index if not exists idx_tournament_registrations_registered_by on public.tournament_registrations(registered_by, created_at desc)';
exception when others then null; end $$;

-- 3. Matches: fast team lookup, tournament status filter, and live polling replacement
do $$ begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'matches' and column_name = 'team_a_id') then
    execute 'create index if not exists idx_matches_team_a_id on public.matches(team_a_id)';
  elsif exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'matches' and column_name = 'team1_id') then
    execute 'create index if not exists idx_matches_team_a_id on public.matches(team1_id)';
  end if;
exception when others then null; end $$;

do $$ begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'matches' and column_name = 'team_b_id') then
    execute 'create index if not exists idx_matches_team_b_id on public.matches(team_b_id)';
  elsif exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'matches' and column_name = 'team2_id') then
    execute 'create index if not exists idx_matches_team_b_id on public.matches(team2_id)';
  end if;
exception when others then null; end $$;

do $$ begin
  execute 'create index if not exists idx_matches_tourn_status_created on public.matches(tournament_id, status, created_at desc)';
exception when others then null; end $$;

-- 4. Fair Play Reports: fast reporter and accused registration joins
do $$ begin
  execute 'create index if not exists idx_reports_reporter_reg on public.reports(reporter_registration_id)';
exception when others then null; end $$;

do $$ begin
  execute 'create index if not exists idx_reports_accused_reg on public.reports(accused_registration_id)';
exception when others then null; end $$;

-- 5. Tournaments: fast creator lookup and admin listing order
do $$ begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'tournaments' and column_name = 'creator_id') then
    execute 'create index if not exists idx_tournaments_creator_id on public.tournaments(creator_id)';
  elsif exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'tournaments' and column_name = 'created_by') then
    execute 'create index if not exists idx_tournaments_creator_id on public.tournaments(created_by)';
  end if;
exception when others then null; end $$;

do $$ begin
  execute 'create index if not exists idx_tournaments_created_at on public.tournaments(created_at desc)';
exception when others then null; end $$;

