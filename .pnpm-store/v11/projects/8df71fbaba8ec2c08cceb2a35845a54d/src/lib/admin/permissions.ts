import type { SupabaseClient } from "@supabase/supabase-js";

export type AdminRole = "super_admin" | "sub_admin";

export async function getAdminRole(client: SupabaseClient, userId: string): Promise<AdminRole | null> {
  const { data, error } = await client.from("admin_roles").select("role").eq("user_id", userId).maybeSingle();
  if (error) throw error;
  return data?.role === "super_admin" || data?.role === "sub_admin" ? data.role : null;
}

export async function isSuperAdmin(client: SupabaseClient, userId: string) { return (await getAdminRole(client, userId)) === "super_admin"; }
export async function isSubAdmin(client: SupabaseClient, userId: string) { return (await getAdminRole(client, userId)) === "sub_admin"; }

export async function isTournamentAdmin(client: SupabaseClient, userId: string, tournamentId: string) {
  if (await isSuperAdmin(client, userId)) return true;
  const { data, error } = await client.from("tournament_admins").select("tournament_id").eq("tournament_id", tournamentId).eq("user_id", userId).maybeSingle();
  if (error) throw error;
  return Boolean(data);
}
