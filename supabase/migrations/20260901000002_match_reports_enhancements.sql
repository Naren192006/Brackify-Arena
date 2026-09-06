-- Enhancements for match_reports table: additional optional columns and grants

alter table public.match_reports
  add column if not exists notes text,
  add column if not exists evidence_url text,
  add column if not exists updated_at timestamptz not null default now();

create index if not exists match_reports_status_idx on public.match_reports(status);

grant select, insert, update on public.match_reports to anon, authenticated, service_role;

