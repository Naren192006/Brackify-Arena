import { supabase } from "@/lib/supabase/client";
import { apiFetch } from "@/lib/api/client";
import type { AdminRole } from "@/lib/admin/permissions";
import type { AdminUser } from "@/types/adminRoles";

import { getAdminTournamentList } from "@/lib/admin/tournaments";

export async function getMyAdminRole() { const { data: user } = await supabase.auth.getUser(); return user.user ? (await supabase.from("admin_roles").select("role").eq("user_id", user.user.id).maybeSingle()).data?.role as AdminRole | null ?? null : null; }
export async function listAdminUsers(): Promise<AdminUser[]> { return (await searchUsers("")).filter((user) => user.role === "sub_admin"); }
export async function searchUsers(search: string): Promise<AdminUser[]> { const { data, error } = await supabase.rpc("admin_list_users", { search_term: search }); if (error) throw error; return (data ?? []) as AdminUser[]; }
export async function setAdminRole(userId: string, role: "sub_admin" | "player") { const { error } = await supabase.rpc("admin_set_role", { target_user_id: userId, next_role: role }); if (error) throw error; }
export async function assignTournamentAdmin(tournamentId: string, userId: string) { const { error } = await supabase.rpc("admin_assign_sub_admin", { target_tournament_id: tournamentId, target_user_id: userId }); if (error) throw error; }
export async function removeTournamentAdmin(tournamentId: string, userId: string) { const { error } = await supabase.rpc("admin_remove_sub_admin", { target_tournament_id: tournamentId, target_user_id: userId }); if (error) throw error; }
export async function listManagedTournaments() {
  const result = await getAdminTournamentList({ page: 1, pageSize: 100 });
  return result.items.map((item) => ({
    ...item,
    registered_count: item.registered_count ?? 0,
  }));
}

export async function addAdminUserApi(userId: string, role: "super_admin" | "sub_admin" = "sub_admin") {
  return apiFetch<{ success: boolean; user_id: string; role: string }>("/api/v1/admin/users", {
    method: "POST",
    body: { user_id: userId, role },
  });
}

export async function deleteAdminUserApi(userId: string) {
  return apiFetch<{ success: boolean; message: string }>(`/api/v1/admin/users/${encodeURIComponent(userId)}`, {
    method: "DELETE",
  });
}


