-- Super-admin-only user directory for admin management.
create or replace function public.admin_list_users(search_term text default '')
returns table(user_id uuid, email text, display_name text, username text, avatar_url text, role text)
language plpgsql security definer set search_path = public, auth as $$
begin
  if not public.is_super_admin(auth.uid()) then raise exception 'super_admin_required'; end if;
  return query select u.id, u.email::text, p.display_name, p.username, p.avatar_url, ar.role
    from auth.users u left join public.profiles p on p.id = u.id left join public.admin_roles ar on ar.user_id = u.id
    where u.id <> auth.uid() and (nullif(trim(search_term), '') is null or coalesce(p.display_name, '') ilike '%' || trim(search_term) || '%' or coalesce(p.username, '') ilike '%' || trim(search_term) || '%' or coalesce(u.email, '') ilike '%' || trim(search_term) || '%')
    order by coalesce(p.display_name, p.username, u.email), u.id;
end;
$$;
grant execute on function public.admin_list_users(text) to authenticated;
