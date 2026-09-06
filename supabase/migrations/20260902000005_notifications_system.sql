-- Migration: Notifications System
alter table public.notifications add column if not exists type text not null default 'info';
alter table public.notifications add column if not exists is_read boolean not null default false;

-- Backfill is_read from read_at if present
update public.notifications set is_read = (read_at is not null) where is_read is false and read_at is not null;

create index if not exists notifications_user_id_idx on public.notifications(user_id, created_at desc);
create index if not exists notifications_is_read_idx on public.notifications(user_id, is_read);

-- Enable RLS on notifications
alter table public.notifications enable row level security;

do $$ begin
  create policy "Users can view their own notifications"
    on public.notifications for select
    using (auth.uid() = user_id);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Users can update their own notifications"
    on public.notifications for update
    using (auth.uid() = user_id);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Service role can insert notifications"
    on public.notifications for insert
    with check (true);
exception when duplicate_object then null; end $$;

-- RPC helper to mark all notifications as read for current user
create or replace function public.mark_all_notifications_read()
returns integer language plpgsql security definer set search_path = public as $$
declare
  updated_count integer;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  update public.notifications
  set is_read = true, read_at = coalesce(read_at, now())
  where user_id = auth.uid() and is_read = false;

  get diagnostics updated_count = row_count;
  return updated_count;
end;
$$;

grant execute on function public.mark_all_notifications_read() to authenticated;

