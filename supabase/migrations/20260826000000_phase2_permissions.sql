-- Expose the Phase 2 tables to the API roles. RLS remains the row-level boundary.
grant usage on schema public to anon, authenticated;
grant select on public.teams to anon, authenticated;
grant select on public.profiles, public.team_members, public.team_invitations, public.notifications, public.activity_events to authenticated;
grant update on public.profiles to authenticated;

-- RPCs perform writes after validating auth.uid() and captain/member ownership.
grant execute on function public.create_team(text, text) to authenticated;
grant execute on function public.create_team(text, text, text, text) to authenticated;
grant execute on function public.invite_team_member(uuid, text) to authenticated;
grant execute on function public.leave_team(uuid) to authenticated;
grant execute on function public.remove_team_member(uuid, uuid) to authenticated;
grant execute on function public.respond_to_team_invitation(uuid, text) to authenticated;
