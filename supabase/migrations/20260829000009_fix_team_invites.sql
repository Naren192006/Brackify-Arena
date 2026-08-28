-- Fix team invitations sent by email. This stores and notifies the recipient;
-- actual email delivery should be connected to a trusted email service later.
create or replace function public.invite_team_member(target_team_id uuid, target text)
returns uuid language plpgsql security definer set search_path = public as $$
declare target_user_id uuid; invitation_id uuid; normalized text := lower(trim(target)); team_name text;
begin
  if not exists (select 1 from public.teams where id = target_team_id and captain_id = auth.uid()) then raise exception 'captain_required'; end if;
  select t.name into team_name from public.teams t where t.id = target_team_id;
  select p.id into target_user_id from public.profiles p where lower(p.username) = normalized limit 1;
  if target_user_id is null then select u.id into target_user_id from auth.users u where lower(u.email) = normalized limit 1; end if;
  if target_user_id = auth.uid() then raise exception 'cannot_invite_self'; end if;
  insert into public.team_invitations(team_id, inviter_id, invitee_id, invitee_email)
  values (target_team_id, auth.uid(), target_user_id, case when target_user_id is null then normalized else null end)
  returning id into invitation_id;
  if target_user_id is not null then
    insert into public.notifications(user_id, title, body) values (target_user_id, 'Team invitation', 'You have been invited to join ' || coalesce(team_name, 'a team') || '.');
  end if;
  return invitation_id;
end;
$$;
grant execute on function public.invite_team_member(uuid, text) to authenticated;
