"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { assignTournamentAdmin, listAdminUsers, removeTournamentAdmin } from "@/lib/admin/roles";
import { supabase } from "@/lib/supabase/client";

export function AdminAssignment({ tournamentId }: { tournamentId: string }) {
  const client = useQueryClient(); const admins = useQuery({ queryKey: ["tournament-admins", tournamentId], queryFn: async () => { const { data, error } = await supabase.from("tournament_admins").select("user_id").eq("tournament_id", tournamentId); if (error) throw error; return data ?? []; } }); const users = useQuery({ queryKey: ["admin-users"], queryFn: listAdminUsers });
  const assign = useMutation({ mutationFn: (id: string) => assignTournamentAdmin(tournamentId, id), onSuccess: () => { toast.success("Admin assigned"); void client.invalidateQueries({ queryKey: ["tournament-admins", tournamentId] }); }, onError: (error: Error) => toast.error(error.message.replaceAll("_", " ")) });
  const remove = useMutation({ mutationFn: (id: string) => removeTournamentAdmin(tournamentId, id), onSuccess: () => { toast.success("Admin removed"); void client.invalidateQueries({ queryKey: ["tournament-admins", tournamentId] }); }, onError: (error: Error) => toast.error(error.message.replaceAll("_", " ")) });
  return <div className="space-y-3">{users.data?.map((user) => { const assigned = admins.data?.some((admin) => admin.user_id === user.user_id); return <div className="flex items-center justify-between rounded-xl bg-white/[0.04] p-3" key={user.user_id}><span className="text-sm text-white">{user.display_name || user.username || user.user_id}</span>{assigned ? <button className="text-xs text-arena-muted hover:text-white" onClick={() => remove.mutate(user.user_id)}>Remove</button> : <button className="text-xs text-arena-accent hover:underline" onClick={() => assign.mutate(user.user_id)}>Assign</button>}</div>; })}</div>;
}
