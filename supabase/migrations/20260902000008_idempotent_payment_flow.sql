-- ---------------------------------------------------------------------------
-- Migration: 20260902000008_idempotent_payment_flow.sql
-- Description: Enforce unique constraint on payments.registration_id and idempotent payment flow
-- ---------------------------------------------------------------------------

-- 1. Deduplicate payments if any exist, keeping the latest / paid one
delete from public.payments p1
where p1.id not in (
  select distinct on (registration_id) id
  from public.payments
  order by registration_id, (case when status = 'paid' then 1 else 2 end), created_at desc
);

-- 2. Add unique constraint on payments.registration_id
alter table public.payments
  drop constraint if exists payments_registration_id_key;

alter table public.payments
  add constraint payments_registration_id_key unique (registration_id);

-- 3. Ensure fast lookup index
create index if not exists idx_payments_registration_id_status
  on public.payments (registration_id, status);

