-- Grant full table access to service_role on tournaments, tournament_registrations, and payments
-- This allows backend FastAPI services using the service_role key to query and update records via PostgREST.

grant all on public.tournaments to service_role;
grant all on public.tournament_registrations to service_role;
grant all on public.payments to service_role;