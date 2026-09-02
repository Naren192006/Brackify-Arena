import { supabase } from "@/lib/supabase/client";
import type { AdminAnalytics, AdminMember, AdminMatch, AdminRegistration } from "@/types/admin";
import type { Tournament } from "@/types/tournament";
import { generateAdminBracket } from "@/lib/admin/brackets";
import type { ControlRoomSnapshot } from "@/types/controlRoom";

export async function getAdminTournament(slug: string): Promise<Tournament | null> {
  const { data, error } = await supabase.from("tournaments").select("id,title,slug,game,mode,description,rules,max_teams,registration_open_at,registration_close_at,checkin_open_at,checkin_close_at,start_time,status,banner_url,entry_fee_minor,entry_fee_currency,paused_at").eq("slug", slug).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const count = await supabase.from("tournament_registrations").select("id", { count: "exact", head: true }).eq("tournament_id", data.id).in("status", ["registered", "checked_in"]);
  if (count.error) throw count.error;
  return { ...data, registered_count: count.count ?? 0 } as Tournament;
}


export async function getAdminRegistrations(tournamentId: string): Promise<AdminRegistration[]> {
  const { data, error } = await supabase.from("tournament_registrations").select("id,status,team_id,registered_by,created_at,checked_in,checked_in_at,seed,teams(id,name,tag,logo_url,captain_id)").eq("tournament_id", tournamentId).order("created_at", { ascending: true });
  if (error) throw error;
  const rows = data ?? [];
  const teamIds = rows.map((row) => row.team_id);
  if (!teamIds.length) return [];
  const members = await supabase.from("team_members").select("team_id,user_id,role").in("team_id", teamIds);
  if (members.error) throw members.error;
  const userIds = [...new Set((members.data ?? []).map((member) => member.user_id))];
  const profiles = userIds.length ? await supabase.from("profiles").select("id,display_name,username").in("id", userIds) : { data: [], error: null };
  if (profiles.error) throw profiles.error;
  const profileById = new Map((profiles.data ?? []).map((profile) => [profile.id, { display_name: profile.display_name, username: profile.username }]));
  const grouped = new Map<string, AdminMember[]>();
  for (const member of members.data ?? []) grouped.set(member.team_id, [...(grouped.get(member.team_id) ?? []), { user_id: member.user_id, role: member.role, profiles: profileById.get(member.user_id) ?? null }]);
  return rows.map((row) => ({ ...row, teams: row.teams ? { ...row.teams, team_members: grouped.get(row.team_id) ?? [] } : null })) as unknown as AdminRegistration[];
}

export async function getAdminMatches(tournamentId: string): Promise<AdminMatch[]> {
  const { data, error } = await supabase.from("matches").select("id,tournament_id,bracket_id,round_id,round_number,match_number,team_a_id,team_b_id,winner_team_id,team1_score,team2_score,reported_by,reported_at,verified_by,verified_at,scheduled_at,completed_at,status,created_at,team_a:teams!matches_team_a_id_fkey(id,name,tag),team_b:teams!matches_team_b_id_fkey(id,name,tag)").eq("tournament_id", tournamentId).order("round_number").order("match_number");
  if (error) throw error;
  return (data ?? []) as unknown as AdminMatch[];
}

export async function getAdminAnalytics(tournamentId: string): Promise<AdminAnalytics> {
  const [registrations, matches, bracket] = await Promise.all([
    getAdminRegistrations(tournamentId), getAdminMatches(tournamentId), supabase.from("brackets").select("champion_team_id").eq("tournament_id", tournamentId).maybeSingle(),
  ]);
  const unfinished = matches.filter((match) => match.status !== "completed" && match.status !== "cancelled");
  return { registeredTeams: registrations.length, approvedTeams: registrations.filter((item) => ["registered", "checked_in"].includes(item.status)).length, checkedInTeams: registrations.filter((item) => item.status === "checked_in" || item.checked_in).length, rejectedTeams: registrations.filter((item) => ["cancelled", "withdrawn", "disqualified"].includes(item.status)).length, matchesCompleted: matches.filter((item) => item.status === "completed").length, matchesPending: unfinished.length, currentRound: unfinished.map((item) => item.round_number).sort((a, b) => a - b)[0] ?? null, championTeamId: bracket.data?.champion_team_id ?? null };
}

export async function updateTournamentSettings(tournamentId: string, values: Partial<Pick<Tournament, "title" | "description" | "banner_url" | "rules" | "registration_open_at" | "registration_close_at" | "checkin_open_at" | "checkin_close_at" | "start_time">>) {
  const { error } = await supabase.from("tournaments").update(values).eq("id", tournamentId);
  if (error) throw error;
}

export async function setTournamentStatus(tournamentId: string, status: Tournament["status"]) { const { error } = await supabase.rpc("admin_set_tournament_status", { target_tournament_id: tournamentId, next_status: status }); if (error) throw error; }
export async function moderateRegistration(registrationId: string, action: "approve" | "reject" | "remove") { const { error } = await supabase.rpc("admin_moderate_registration", { target_registration_id: registrationId, action }); if (error) throw error; }
export async function finishTournament(tournamentId: string) { const { error } = await supabase.rpc("admin_finish_tournament", { target_tournament_id: tournamentId }); if (error) throw error; }
export async function regenerateBracket(tournamentId: string) { return generateAdminBracket(tournamentId, true); }
export async function updateCheckIn(registrationId: string, action: "check_in" | "undo" | "absent") { const { error } = await supabase.rpc("admin_update_check_in", { target_registration_id: registrationId, action }); if (error) throw error; }
export async function closeCheckIn(tournamentId: string) { const { error } = await supabase.rpc("admin_close_check_in", { target_tournament_id: tournamentId }); if (error) throw error; }

export async function getControlRoomSnapshot(slug: string): Promise<ControlRoomSnapshot | null> {
  const tournament = await getAdminTournament(slug); if (!tournament) return null;
  const [registrations, matches, activity, reports] = await Promise.all([
    getAdminRegistrations(tournament.id), getAdminMatches(tournament.id),
    supabase.from("activity_events").select("id,description,created_at").order("created_at", { ascending: false }).limit(20),
    supabase.from("fair_play_reports").select("id", { count: "exact", head: true }).eq("tournament_id", tournament.id).in("status", ["open", "investigating"]),
  ]);
  if (activity.error) throw activity.error; if (reports.error) throw reports.error;
  const tournamentWithPause = tournament as Tournament & { paused_at?: string | null };
  return { tournament: tournamentWithPause, registrations, matches, reportsPending: reports.count ?? 0, activity: activity.data ?? [], paused: Boolean(tournamentWithPause.paused_at) };
}
export async function broadcastAnnouncement(tournamentId: string, type: string, message: string) { const { error } = await supabase.rpc("admin_broadcast_announcement", { target_tournament_id: tournamentId, target_type: type, target_message: message }); if (error) throw error; }
export async function saveOrganizerNote(tournamentId: string, content: string) { const { error } = await supabase.rpc("admin_save_tournament_note", { target_tournament_id: tournamentId, target_content: content }); if (error) throw error; }
export async function toggleTournamentPause(tournamentId: string, paused: boolean) { const { error } = await supabase.rpc("admin_toggle_tournament_pause", { target_tournament_id: tournamentId, should_pause: paused }); if (error) throw error; }
export async function getOrganizerNote(tournamentId: string) { const { data, error } = await supabase.from("tournament_admin_notes").select("content").eq("tournament_id", tournamentId).maybeSingle(); if (error) throw error; return data?.content ?? ""; }
