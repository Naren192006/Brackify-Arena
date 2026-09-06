-- Migration: Isolated Admin Users Table with RLS and Bcrypt Password Hashing
-- Phase 8: Platform Administrator Authentication System

create table if not exists public.admin_users (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  password_hash text not null,
  role text not null check (role in ('super_admin', 'sub_admin')),
  permissions jsonb not null default '[]'::jsonb,
  active boolean not null default true,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Enable RLS — strictly restricted to service_role (no public policies)
alter table public.admin_users enable row level security;

-- Automatic updated_at trigger
create or replace function public.set_admin_users_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_admin_users_updated_at on public.admin_users;
create trigger trg_admin_users_updated_at
  before update on public.admin_users
  for each row
  execute function public.set_admin_users_updated_at();

-- Seed initial super admin account (bcrypt hash of 'Admin@12345' with cost factor 12)
insert into public.admin_users (email, password_hash, role, permissions, active)
values (
  'admin@brackify.com',
  '$2b$12$bpLFEWhqf9P35ZxyrHGmeufLCnJRrqzqm.oVbZ2ANJJnbqRWo1QKa',
  'super_admin',
  '["all", "delete_tournaments", "manage_users", "manage_brackets", "manage_matches"]'::jsonb,
  true
)
on conflict (email) do update set
  role = 'super_admin',
  active = true,
  permissions = '["all", "delete_tournaments", "manage_users", "manage_brackets", "manage_matches"]'::jsonb;

