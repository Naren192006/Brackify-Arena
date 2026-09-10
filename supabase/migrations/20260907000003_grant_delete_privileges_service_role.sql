-- =========================================================================
-- Brackify Arena: Grant DELETE and ALL Privileges to service_role
-- Migration: 20260907000003_grant_delete_privileges_service_role.sql
-- =========================================================================

-- 1. Grant table-level DELETE and ALL privileges on all public tables to service_role
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON ROUTINES TO service_role;

-- Specific table grants to ensure explicit permissions
GRANT DELETE, SELECT, INSERT, UPDATE ON TABLE public.tournaments TO service_role;
GRANT DELETE, SELECT, INSERT, UPDATE ON TABLE public.matches TO service_role;
GRANT DELETE, SELECT, INSERT, UPDATE ON TABLE public.brackets TO service_role;
GRANT DELETE, SELECT, INSERT, UPDATE ON TABLE public.tournament_registrations TO service_role;
GRANT DELETE, SELECT, INSERT, UPDATE ON TABLE public.tournament_admins TO service_role;

-- 2. Explicitly revoke DELETE permissions from public, anon, and authenticated
REVOKE DELETE ON TABLE public.tournaments FROM public, anon, authenticated;
REVOKE DELETE ON TABLE public.matches FROM public, anon, authenticated;
REVOKE DELETE ON TABLE public.brackets FROM public, anon, authenticated;
REVOKE DELETE ON TABLE public.tournament_registrations FROM public, anon, authenticated;
REVOKE DELETE ON TABLE public.tournament_admins FROM public, anon, authenticated;

-- 3. Atomic Transactional Tournament Deletion Function
CREATE OR REPLACE FUNCTION public.admin_delete_tournament_tx(
  target_tournament_id uuid,
  target_admin_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  t_record record;
  reg_count integer := 0;
  match_count integer := 0;
  evidence_urls text[] := array[]::text[];
  banner_url_val text := null;
  match_ids uuid[] := array[]::uuid[];
BEGIN
  -- Verify tournament exists
  SELECT id, title, banner_url INTO t_record
  FROM public.tournaments
  WHERE id = target_tournament_id FOR UPDATE;

  IF t_record.id IS NULL THEN
    RAISE EXCEPTION 'tournament_not_found';
  END IF;

  banner_url_val := t_record.banner_url;

  -- PRESERVE PAYMENTS: Mark linked payments as cancelled_admin before deleting registrations
  IF to_regclass('public.payments') IS NOT NULL THEN
    UPDATE public.payments
    SET status = 'cancelled_admin', updated_at = now()
    WHERE tournament_id = target_tournament_id
      AND status IN ('created', 'pending', 'paid');
  END IF;

  -- Step 1: Clean tournament registrations
  IF to_regclass('public.tournament_registrations') IS NOT NULL THEN
    SELECT count(*) INTO reg_count
    FROM public.tournament_registrations
    WHERE tournament_id = target_tournament_id;

    DELETE FROM public.tournament_registrations WHERE tournament_id = target_tournament_id;
  END IF;

  -- Step 2: Clean match reports and matches
  IF to_regclass('public.matches') IS NOT NULL THEN
    SELECT coalesce(array_agg(id), array[]::uuid[]), count(*)
    INTO match_ids, match_count
    FROM public.matches
    WHERE tournament_id = target_tournament_id;

    IF to_regclass('public.match_reports') IS NOT NULL AND array_length(match_ids, 1) > 0 THEN
      SELECT coalesce(array_agg(evidence_url) FILTER (WHERE evidence_url IS NOT NULL AND evidence_url <> ''), array[]::text[])
      INTO evidence_urls
      FROM public.match_reports
      WHERE match_id = ANY(match_ids);

      DELETE FROM public.match_reports WHERE match_id = ANY(match_ids);
    END IF;

    DELETE FROM public.matches WHERE tournament_id = target_tournament_id;
  END IF;

  -- Step 3: Clean brackets, bracket nodes, rounds, and bracket matches
  IF to_regclass('public.bracket_matches') IS NOT NULL THEN
    DELETE FROM public.bracket_matches WHERE tournament_id = target_tournament_id;
  END IF;
  IF to_regclass('public.bracket_nodes') IS NOT NULL THEN
    DELETE FROM public.bracket_nodes WHERE tournament_id = target_tournament_id;
  END IF;
  IF to_regclass('public.rounds') IS NOT NULL THEN
    DELETE FROM public.rounds WHERE bracket_id IN (
      SELECT id FROM public.brackets WHERE tournament_id = target_tournament_id
    );
  END IF;
  IF to_regclass('public.brackets') IS NOT NULL THEN
    DELETE FROM public.brackets WHERE tournament_id = target_tournament_id;
  END IF;

  -- Step 4: Clean tournament_admins, reports, moderation, and auxiliary tables
  IF to_regclass('public.moderation_actions') IS NOT NULL AND to_regclass('public.fair_play_reports') IS NOT NULL THEN
    DELETE FROM public.moderation_actions
    WHERE report_id IN (SELECT id FROM public.fair_play_reports WHERE tournament_id = target_tournament_id);
  END IF;
  IF to_regclass('public.fair_play_reports') IS NOT NULL THEN
    DELETE FROM public.fair_play_reports WHERE tournament_id = target_tournament_id;
  END IF;
  IF to_regclass('public.user_reports') IS NOT NULL THEN
    DELETE FROM public.user_reports WHERE tournament_id = target_tournament_id;
  END IF;
  IF to_regclass('public.reports') IS NOT NULL THEN
    DELETE FROM public.reports WHERE tournament_id = target_tournament_id;
  END IF;
  IF to_regclass('public.tournament_announcements') IS NOT NULL THEN
    DELETE FROM public.tournament_announcements WHERE tournament_id = target_tournament_id;
  END IF;
  IF to_regclass('public.tournament_admin_notes') IS NOT NULL THEN
    DELETE FROM public.tournament_admin_notes WHERE tournament_id = target_tournament_id;
  END IF;
  IF to_regclass('public.tournament_streams') IS NOT NULL THEN
    DELETE FROM public.tournament_streams WHERE tournament_id = target_tournament_id;
  END IF;
  IF to_regclass('public.team_invitations') IS NOT NULL THEN
    DELETE FROM public.team_invitations WHERE tournament_id = target_tournament_id;
  END IF;
  IF to_regclass('public.tournament_activity') IS NOT NULL THEN
    DELETE FROM public.tournament_activity WHERE tournament_id = target_tournament_id;
  END IF;
  IF to_regclass('public.tournament_admins') IS NOT NULL THEN
    DELETE FROM public.tournament_admins WHERE tournament_id = target_tournament_id;
  END IF;

  -- Step 5: Delete the tournament row from tournaments table
  DELETE FROM public.tournaments WHERE id = target_tournament_id;

  -- Step 6: Insert immutable audit logs
  IF to_regclass('public.admin_audit_logs') IS NOT NULL THEN
    INSERT INTO public.admin_audit_logs(
      admin_id, action, tournament_id, tournament_name,
      deleted_registrations, deleted_matches, deleted_at, details
    ) VALUES (
      target_admin_id, 'tournament_deleted', target_tournament_id, t_record.title,
      reg_count, match_count, now(),
      jsonb_build_object('banner_url', banner_url_val, 'evidence_urls', evidence_urls)
    );
  END IF;

  IF to_regclass('public.activity_events') IS NOT NULL THEN
    INSERT INTO public.activity_events(user_id, event_type, description)
    VALUES (
      target_admin_id,
      'admin_tournament_deleted',
      'Admin permanently deleted tournament ' || coalesce(t_record.title, target_tournament_id::text)
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'deleted', true,
    'tournament_id', target_tournament_id,
    'tournament_name', t_record.title,
    'deleted_registrations', reg_count,
    'deleted_matches', match_count,
    'banner_url', banner_url_val,
    'evidence_urls', evidence_urls
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_delete_tournament_tx(uuid, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_delete_tournament_tx(uuid, uuid) TO service_role;
