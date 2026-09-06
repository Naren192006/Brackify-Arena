-- =========================================================================
-- Brackify Arena: Admin Tournament Deletion & Audit Logging
-- Migration: 20260905000001_admin_tournament_delete.sql
-- =========================================================================

-- 1. Create admin_audit_logs table
create table if not exists public.admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null,
  action text not null,
  tournament_id uuid,
  tournament_name text,
  deleted_registrations integer default 0,
  deleted_matches integer default 0,
  details jsonb default '{}'::jsonb,
  deleted_at timestamptz default now(),
  created_at timestamptz not null default now()
);

create index if not exists admin_audit_logs_tournament_idx on public.admin_audit_logs(tournament_id);
create index if not exists admin_audit_logs_admin_idx on public.admin_audit_logs(admin_id, created_at desc);

alter table public.admin_audit_logs enable row level security;

drop policy if exists admin_audit_logs_select on public.admin_audit_logs;
create policy admin_audit_logs_select on public.admin_audit_logs for select to authenticated using (
  exists (
    select 1 from public.admin_roles
    where user_id = auth.uid() and role in ('admin', 'super_admin')
  )
);

grant select, insert on public.admin_audit_logs to authenticated, service_role;

-- 2. Allow 'cancelled_admin' status in payments table if check constraint exists
do $$
begin
  if exists (
    select 1 from information_schema.constraint_column_usage
    where table_name = 'payments' and constraint_name = 'payments_status_check'
  ) then
    alter table public.payments drop constraint if exists payments_status_check;
    alter table public.payments add constraint payments_status_check
      check (status in ('created', 'paid', 'failed', 'refunded', 'cancelled_admin'));
  end if;
end $$;

-- 3. Atomic Transactional Tournament Deletion Function
create or replace function public.admin_delete_tournament_tx(
  target_tournament_id uuid,
  target_admin_id uuid
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  t_record record;
  reg_count integer := 0;
  match_count integer := 0;
  evidence_urls text[] := array[]::text[];
  banner_url_val text := null;
  match_ids uuid[] := array[]::uuid[];
begin
  -- 1. Verify tournament exists
  select id, title, banner_url into t_record
  from public.tournaments
  where id = target_tournament_id for update;

  if t_record.id is null then
    raise exception 'tournament_not_found';
  end if;

  banner_url_val := t_record.banner_url;

  -- 2. Clean match reports and matches (only if tables exist)
  if to_regclass('public.matches') is not null then
    select coalesce(array_agg(id), array[]::uuid[]), count(*)
    into match_ids, match_count
    from public.matches
    where tournament_id = target_tournament_id;

    if to_regclass('public.match_reports') is not null and array_length(match_ids, 1) > 0 then
      -- Collect dispute evidence URLs for storage cleanup
      select coalesce(array_agg(evidence_url) filter (where evidence_url is not null and evidence_url <> ''), array[]::text[])
      into evidence_urls
      from public.match_reports
      where match_id = any(match_ids);

      delete from public.match_reports where match_id = any(match_ids);
    end if;

    delete from public.matches where tournament_id = target_tournament_id;
  end if;

  -- 3. Clean brackets, bracket nodes, and bracket matches
  if to_regclass('public.bracket_matches') is not null then
    delete from public.bracket_matches where tournament_id = target_tournament_id;
  end if;
  if to_regclass('public.bracket_nodes') is not null then
    delete from public.bracket_nodes where tournament_id = target_tournament_id;
  end if;
  if to_regclass('public.brackets') is not null then
    delete from public.brackets where tournament_id = target_tournament_id;
  end if;

  -- 4. Clean reports and fair-play moderation records
  if to_regclass('public.moderation_actions') is not null and to_regclass('public.fair_play_reports') is not null then
    delete from public.moderation_actions
    where report_id in (select id from public.fair_play_reports where tournament_id = target_tournament_id);
  end if;
  if to_regclass('public.fair_play_reports') is not null then
    delete from public.fair_play_reports where tournament_id = target_tournament_id;
  end if;
  if to_regclass('public.reports') is not null then
    delete from public.reports where tournament_id = target_tournament_id;
  end if;

  -- 5. Clean announcements, admin notes, stream links, invitations, and tournament admins
  if to_regclass('public.tournament_announcements') is not null then
    delete from public.tournament_announcements where tournament_id = target_tournament_id;
  end if;
  if to_regclass('public.tournament_admin_notes') is not null then
    delete from public.tournament_admin_notes where tournament_id = target_tournament_id;
  end if;
  if to_regclass('public.tournament_admins') is not null then
    delete from public.tournament_admins where tournament_id = target_tournament_id;
  end if;
  if to_regclass('public.tournament_streams') is not null then
    delete from public.tournament_streams where tournament_id = target_tournament_id;
  end if;
  if to_regclass('public.team_invitations') is not null then
    delete from public.team_invitations where tournament_id = target_tournament_id;
  end if;

  -- 6. PRESERVE PAYMENTS: Mark linked payments as cancelled_admin (Never delete payment rows)
  if to_regclass('public.payments') is not null then
    update public.payments
    set status = 'cancelled_admin', updated_at = now()
    where tournament_id = target_tournament_id;
  end if;

  -- 7. Clean tournament registrations
  if to_regclass('public.tournament_registrations') is not null then
    select count(*) into reg_count
    from public.tournament_registrations
    where tournament_id = target_tournament_id;

    delete from public.tournament_registrations where tournament_id = target_tournament_id;
  end if;

  -- 8. Delete the tournament record itself
  delete from public.tournaments where id = target_tournament_id;

  -- 9. Insert immutable audit logs
  if to_regclass('public.admin_audit_logs') is not null then
    insert into public.admin_audit_logs(
      admin_id, action, tournament_id, tournament_name,
      deleted_registrations, deleted_matches, deleted_at, details
    ) values (
      target_admin_id, 'tournament_deleted', target_tournament_id, t_record.title,
      reg_count, match_count, now(),
      jsonb_build_object('banner_url', banner_url_val, 'evidence_urls', evidence_urls)
    );
  end if;

  if to_regclass('public.activity_events') is not null then
    insert into public.activity_events(user_id, event_type, description)
    values (
      target_admin_id,
      'admin_tournament_deleted',
      'Admin permanently deleted tournament ' || coalesce(t_record.title, target_tournament_id::text)
    );
  end if;

  return jsonb_build_object(
    'success', true,
    'deleted', true,
    'tournament_id', target_tournament_id,
    'tournament_name', t_record.title,
    'deleted_registrations', reg_count,
    'deleted_matches', match_count,
    'banner_url', banner_url_val,
    'evidence_urls', evidence_urls
  );
end;
$$;

revoke all on function public.admin_delete_tournament_tx(uuid, uuid) from public;
grant execute on function public.admin_delete_tournament_tx(uuid, uuid) to authenticated, service_role;

