alter table public.tournament_registrations
  add column if not exists payment_status text not null default 'pending'
    check (payment_status in ('pending', 'created', 'paid', 'failed', 'refunded')),
  add column if not exists razorpay_order_id text,
  add column if not exists razorpay_payment_id text,
  add column if not exists razorpay_signature text,
  add column if not exists paid_at timestamptz;

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null references public.tournament_registrations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  amount_paise bigint not null check (amount_paise > 0),
  currency text not null default 'INR' check (currency = 'INR'),
  status text not null default 'created' check (status in ('created', 'paid', 'failed', 'refunded')),
  razorpay_order_id text not null unique,
  razorpay_payment_id text unique,
  razorpay_signature text,
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists payments_registration_id_idx on public.payments(registration_id);
create index if not exists payments_user_id_idx on public.payments(user_id);
create index if not exists payments_tournament_id_idx on public.payments(tournament_id);
create index if not exists payments_status_idx on public.payments(status);

alter table public.payments enable row level security;

drop policy if exists payments_select_own on public.payments;
create policy payments_select_own on public.payments for select using (auth.uid() = user_id);

drop policy if exists payments_select_tournament_admin on public.payments;
create policy payments_select_tournament_admin on public.payments for select using (
  exists (select 1 from public.tournament_admins ta where ta.tournament_id = payments.tournament_id and ta.user_id = auth.uid())
  or exists (select 1 from public.admin_roles ar where ar.user_id = auth.uid() and ar.role = 'super_admin')
);

revoke insert, update, delete on public.payments from authenticated;
