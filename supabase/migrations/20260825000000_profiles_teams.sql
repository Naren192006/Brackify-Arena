create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  username text not null unique,
  avatar_url text,
  riot_id text,
  region text,
  bio text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 40),
  logo_url text,
  captain_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.team_members (
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('captain', 'member')),
  joined_at timestamptz not null default now(),
  primary key (team_id, user_id)
);

create table if not exists public.team_invitations (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  inviter_id uuid not null references auth.users(id) on delete cascade,
  invitee_id uuid references auth.users(id) on delete cascade,
  invitee_email text,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  check (invitee_id is not null or invitee_email is not null)
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  body text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.activity_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null,
  description text not null,
  created_at timestamptz not null default now()
);

create index if not exists team_members_user_id_idx on public.team_members(user_id);
create index if not exists team_invitations_invitee_idx on public.team_invitations(invitee_id, status);
create index if not exists team_invitations_email_idx on public.team_invitations(lower(invitee_email), status);
create index if not exists notifications_user_created_idx on public.notifications(user_id, created_at desc);
create index if not exists activity_events_user_created_idx on public.activity_events(user_id, created_at desc);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.is_team_member(target_team_id uuid, target_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.team_members where team_id = target_team_id and user_id = target_user_id);
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at before update on public.profiles
for each row execute function public.set_updated_at();
drop trigger if exists teams_set_updated_at on public.teams;
create trigger teams_set_updated_at before update on public.teams
for each row execute function public.set_updated_at();

create or replace function public.sync_profile_from_auth()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  metadata jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  base_username text := lower(regexp_replace(coalesce(metadata->>'user_name', split_part(new.email, '@', 1), 'player'), '[^a-zA-Z0-9_]+', '', 'g'));
begin
  base_username := left(nullif(base_username, ''), 24);
  insert into public.profiles (id, display_name, username, avatar_url)
  values (
    new.id,
    coalesce(metadata->>'full_name', metadata->>'name'),
    coalesce(base_username, 'player') || '_' || left(replace(new.id::text, '-', ''), 8),
    metadata->>'avatar_url'
  )
  on conflict (id) do update set
    display_name = coalesce(excluded.display_name, public.profiles.display_name),
    avatar_url = coalesce(excluded.avatar_url, public.profiles.avatar_url);
  return new;
end;
$$;

drop trigger if exists on_auth_user_profile_sync on auth.users;
create trigger on_auth_user_profile_sync after insert or update of raw_user_meta_data on auth.users
for each row execute function public.sync_profile_from_auth();

create or replace function public.create_team(team_name text, team_logo_url text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare new_team_id uuid;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  insert into public.teams (name, logo_url, captain_id) values (trim(team_name), team_logo_url, auth.uid()) returning id into new_team_id;
  insert into public.team_members (team_id, user_id, role) values (new_team_id, auth.uid(), 'captain');
  return new_team_id;
end;
$$;

create or replace function public.invite_team_member(target_team_id uuid, target text)
returns uuid language plpgsql security definer set search_path = public as $$
declare target_user_id uuid; invitation_id uuid; normalized text := lower(trim(target));
begin
  if not exists (select 1 from public.teams where id = target_team_id and captain_id = auth.uid()) then raise exception 'captain_required'; end if;
  select id into target_user_id from public.profiles where lower(username) = normalized limit 1;
  insert into public.team_invitations(team_id, inviter_id, invitee_id, invitee_email)
  values (target_team_id, auth.uid(), target_user_id, case when target_user_id is null then normalized else null end)
  returning id into invitation_id;
  return invitation_id;
end;
$$;

create or replace function public.leave_team(target_team_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.teams where id = target_team_id and captain_id = auth.uid()) then raise exception 'captain_cannot_leave'; end if;
  delete from public.team_members where team_id = target_team_id and user_id = auth.uid();
end;
$$;

create or replace function public.remove_team_member(target_team_id uuid, target_user_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.teams where id = target_team_id and captain_id = auth.uid()) then raise exception 'captain_required'; end if;
  delete from public.team_members where team_id = target_team_id and user_id = target_user_id and user_id <> auth.uid();
end;
$$;

create or replace function public.respond_to_team_invitation(invitation_id uuid, decision text)
returns void language plpgsql security definer set search_path = public as $$
declare target_team_id uuid;
begin
  select team_id into target_team_id from public.team_invitations
  where id = invitation_id and status = 'pending' and (invitee_id = auth.uid() or lower(invitee_email) = lower((select email from auth.users where id = auth.uid())))
  for update;
  if target_team_id is null then raise exception 'invitation_not_found'; end if;
  if decision = 'accepted' then
    insert into public.team_members(team_id, user_id, role) values (target_team_id, auth.uid(), 'member') on conflict do nothing;
  end if;
  update public.team_invitations set status = decision where id = invitation_id;
end;
$$;

alter table public.profiles enable row level security;
alter table public.teams enable row level security;
alter table public.team_members enable row level security;
alter table public.team_invitations enable row level security;
alter table public.notifications enable row level security;
alter table public.activity_events enable row level security;

drop policy if exists profiles_self_select on public.profiles;
create policy profiles_self_select on public.profiles for select using (id = auth.uid());
drop policy if exists profiles_self_insert on public.profiles;
create policy profiles_self_insert on public.profiles for insert with check (id = auth.uid());
drop policy if exists profiles_self_update on public.profiles;
create policy profiles_self_update on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists teams_member_select on public.teams;
create policy teams_member_select on public.teams for select using (captain_id = auth.uid() or exists (select 1 from public.team_members m where m.team_id = id and m.user_id = auth.uid()));
drop policy if exists teams_captain_insert on public.teams;
create policy teams_captain_insert on public.teams for insert with check (captain_id = auth.uid());
drop policy if exists teams_captain_update on public.teams;
create policy teams_captain_update on public.teams for update using (captain_id = auth.uid()) with check (captain_id = auth.uid());
drop policy if exists teams_captain_delete on public.teams;
create policy teams_captain_delete on public.teams for delete using (captain_id = auth.uid());

drop policy if exists team_members_member_select on public.team_members;
create policy team_members_member_select on public.team_members for select using (public.is_team_member(team_id, auth.uid()));
drop policy if exists team_members_captain_insert on public.team_members;
create policy team_members_captain_insert on public.team_members for insert with check (exists (select 1 from public.teams t where t.id = team_id and t.captain_id = auth.uid()));
drop policy if exists team_members_leave_or_captain_delete on public.team_members;
create policy team_members_leave_or_captain_delete on public.team_members for delete using (user_id = auth.uid() or exists (select 1 from public.teams t where t.id = team_id and t.captain_id = auth.uid()));

drop policy if exists invitations_visible_to_parties on public.team_invitations;
create policy invitations_visible_to_parties on public.team_invitations for select using (inviter_id = auth.uid() or invitee_id = auth.uid() or lower(invitee_email) = lower((select email from auth.users where id = auth.uid())));
drop policy if exists invitations_captain_insert on public.team_invitations;
create policy invitations_captain_insert on public.team_invitations for insert with check (inviter_id = auth.uid() and exists (select 1 from public.teams t where t.id = team_id and t.captain_id = auth.uid()));
drop policy if exists notifications_self_select on public.notifications;
create policy notifications_self_select on public.notifications for select using (user_id = auth.uid());
drop policy if exists activity_self_select on public.activity_events;
create policy activity_self_select on public.activity_events for select using (user_id = auth.uid());

grant execute on function public.create_team(text, text) to authenticated;
grant execute on function public.invite_team_member(uuid, text) to authenticated;
grant execute on function public.leave_team(uuid) to authenticated;
grant execute on function public.remove_team_member(uuid, uuid) to authenticated;
grant execute on function public.respond_to_team_invitation(uuid, text) to authenticated;

insert into storage.buckets (id, name, public) values ('team-logos', 'team-logos', true) on conflict (id) do nothing;
drop policy if exists team_logos_public_read on storage.objects;
create policy team_logos_public_read on storage.objects for select using (bucket_id = 'team-logos');
drop policy if exists team_logos_captain_write on storage.objects;
create policy team_logos_captain_write on storage.objects for insert to authenticated with check (
  bucket_id = 'team-logos' and exists (select 1 from public.teams t where t.id::text = (storage.foldername(name))[1] and t.captain_id = auth.uid())
);
drop policy if exists team_logos_captain_update on storage.objects;
create policy team_logos_captain_update on storage.objects for update to authenticated using (
  bucket_id = 'team-logos' and exists (select 1 from public.teams t where t.id::text = (storage.foldername(name))[1] and t.captain_id = auth.uid())
);
drop policy if exists team_logos_captain_delete on storage.objects;
create policy team_logos_captain_delete on storage.objects for delete to authenticated using (
  bucket_id = 'team-logos' and exists (select 1 from public.teams t where t.id::text = (storage.foldername(name))[1] and t.captain_id = auth.uid())
);
