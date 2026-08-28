alter table public.teams add column if not exists tag text;
alter table public.teams add column if not exists description text;

create or replace function public.sync_profile_from_auth()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  metadata jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  base_username text := lower(regexp_replace(coalesce(metadata->>'user_name', split_part(new.email, '@', 1), 'player'), '[^a-zA-Z0-9_]+', '', 'g'));
begin
  base_username := left(nullif(base_username, ''), 24);
  insert into public.profiles (id, display_name, username, avatar_url)
  values (new.id, coalesce(metadata->>'full_name', metadata->>'name'), coalesce(base_username, 'player') || '_' || left(replace(new.id::text, '-', ''), 8), metadata->>'avatar_url')
  on conflict (id) do update set
    display_name = coalesce(public.profiles.display_name, excluded.display_name),
    avatar_url = coalesce(public.profiles.avatar_url, excluded.avatar_url);
  return new;
end;
$$;
alter table public.teams drop constraint if exists teams_tag_length;
alter table public.teams add constraint teams_tag_length check (tag is null or char_length(tag) between 3 and 6);
create unique index if not exists teams_tag_unique_idx on public.teams (lower(tag)) where tag is not null;

create unique index if not exists pending_team_invitation_unique_idx
on public.team_invitations (team_id, coalesce(invitee_id, '00000000-0000-0000-0000-000000000000'::uuid), coalesce(lower(invitee_email), ''))
where status = 'pending';

create or replace function public.create_team(team_name text, team_tag text, team_description text default null, team_logo_url text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare new_team_id uuid;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  insert into public.teams (name, tag, description, logo_url, captain_id)
  values (trim(team_name), upper(trim(team_tag)), nullif(trim(team_description), ''), team_logo_url, auth.uid())
  returning id into new_team_id;
  insert into public.team_members (team_id, user_id, role) values (new_team_id, auth.uid(), 'captain');
  insert into public.activity_events(user_id, event_type, description) values (auth.uid(), 'team_created', 'Created team ' || trim(team_name));
  return new_team_id;
exception when unique_violation then raise exception 'team_tag_taken';
end;
$$;

create or replace function public.respond_to_team_invitation(invitation_id uuid, decision text)
returns void language plpgsql security definer set search_path = public as $$
declare target_team_id uuid; team_name text;
begin
  if decision not in ('accepted', 'declined') then raise exception 'invalid_decision'; end if;
  select i.team_id, t.name into target_team_id, team_name
  from public.team_invitations i join public.teams t on t.id = i.team_id
  where i.id = invitation_id and i.status = 'pending'
    and (i.invitee_id = auth.uid() or lower(i.invitee_email) = lower((select email from auth.users where id = auth.uid())))
  for update;
  if target_team_id is null then raise exception 'invitation_not_found'; end if;
  if decision = 'accepted' then
    insert into public.team_members(team_id, user_id, role) values (target_team_id, auth.uid(), 'member') on conflict do nothing;
    insert into public.activity_events(user_id, event_type, description) values (auth.uid(), 'invitation_accepted', 'Joined ' || team_name);
  else
    insert into public.activity_events(user_id, event_type, description) values (auth.uid(), 'invitation_rejected', 'Rejected invitation to ' || team_name);
  end if;
  update public.team_invitations set status = decision where id = invitation_id;
end;
$$;

drop policy if exists teams_member_select on public.teams;
create policy teams_public_select on public.teams for select using (true);

create or replace function public.can_view_profile(target_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select target_user_id = auth.uid() or exists (
    select 1 from public.team_members mine
    join public.team_members theirs on theirs.team_id = mine.team_id
    where mine.user_id = auth.uid() and theirs.user_id = target_user_id
  );
$$;
drop policy if exists profiles_team_member_select on public.profiles;
create policy profiles_team_member_select on public.profiles for select using (public.can_view_profile(id));

insert into storage.buckets (id, name, public) values ('avatars', 'avatars', true) on conflict (id) do nothing;
drop policy if exists avatars_public_read on storage.objects;
create policy avatars_public_read on storage.objects for select using (bucket_id = 'avatars');
drop policy if exists avatars_owner_write on storage.objects;
create policy avatars_owner_write on storage.objects for all to authenticated using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text) with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

grant execute on function public.create_team(text, text, text, text) to authenticated;
