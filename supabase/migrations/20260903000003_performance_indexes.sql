-- ---------------------------------------------------------------------------
-- Migration: 20260903000003_performance_indexes.sql
-- Description: Add missing indexes to optimize queries on payments, registrations,
--              matches, reports, and tournaments.
-- ---------------------------------------------------------------------------

-- 1. Payments: fast webhook verification, order lookup, and user payment history
create index if not exists idx_payments_razorpay_order_id
  on public.payments(razorpay_order_id);

create index if not exists idx_payments_razorpay_payment_id
  on public.payments(razorpay_payment_id);

create index if not exists idx_payments_user_status_created
  on public.payments(user_id, status, created_at desc);

-- 2. Tournament Registrations: fast occupied slot count, atomic registration lock queries, and user history
create index if not exists idx_tournament_registrations_tourn_payment_status
  on public.tournament_registrations(tournament_id, payment_status, status);

create index if not exists idx_tournament_registrations_registered_by
  on public.tournament_registrations(registered_by, created_at desc);

-- 3. Matches: fast team lookup, tournament status filter, and live polling replacement
create index if not exists idx_matches_team_a_id
  on public.matches(team_a_id);

create index if not exists idx_matches_team_b_id
  on public.matches(team_b_id);

create index if not exists idx_matches_tourn_status_created
  on public.matches(tournament_id, status, created_at desc);

-- 4. Fair Play Reports: fast reporter and accused registration joins
create index if not exists idx_reports_reporter_reg
  on public.reports(reporter_registration_id);

create index if not exists idx_reports_accused_reg
  on public.reports(accused_registration_id);

-- 5. Tournaments: fast creator lookup and admin listing order
create index if not exists idx_tournaments_creator_id
  on public.tournaments(creator_id);

create index if not exists idx_tournaments_created_at
  on public.tournaments(created_at desc);

