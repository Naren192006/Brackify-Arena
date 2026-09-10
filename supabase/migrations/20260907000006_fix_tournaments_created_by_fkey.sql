-- =========================================================================
-- Migration: 20260907000006_fix_tournaments_created_by_fkey.sql
-- Description: Update tournaments.created_by foreign key to reference admin_users(id)
-- =========================================================================

do $$ begin
  -- 1. Drop old constraint referencing auth.users(id)
  alter table public.tournaments drop constraint if exists tournaments_created_by_fkey;

  -- 2. Add new constraint referencing admin_users(id)
  if to_regclass('public.admin_users') is not null then
    alter table public.tournaments
      add constraint tournaments_created_by_fkey
      foreign key (created_by)
      references public.admin_users(id)
      on delete restrict;
  end if;
exception when others then null; end $$;

