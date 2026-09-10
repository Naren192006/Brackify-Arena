import { supabase } from "@/lib/supabase/client";
import { apiFetch } from "@/lib/api/client";
import { adminApiFetch } from "@/lib/admin/auth";
import type { AdminAnalytics, AdminMember, AdminMatch, AdminRegistration } from "@/types/admin";
import type { Tournament } from "@/types/tournament";
import { generateAdminBracket } from "@/lib/admin/brackets";
import type { ControlRoomSnapshot } from "@/types/controlRoom";

// ---------------------------------------------------------------------------
// Typed Admin Tournament Interfaces
// ---------------------------------------------------------------------------

export type AdminTournamentItem = {
  id: string;
  title: string;
  slug: string;
  game: string;
  platform: string;
  status: string;
  team_size: number;
  max_teams: number;
  registered_count: number;
  checked_in_count: number;
  paid_count: number;
  entry_fee_minor: number;
  entry_fee_currency: string;
  registration_open_at: string;
  registration_close_at: string;
  start_time: string;
  banner_url?: string | null;
  format: string;
  mode?: string | null;
  is_registration_open?: boolean;
  created_at: string;
  updated_at?: string | null;
};

export type AdminTournamentListResult = {
  items: AdminTournamentItem[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
};

export type AdminTournamentDetail = AdminTournamentItem & {
  description?: string | null;
  rules?: string | null;
  timezone: string;
  published_at?: string | null;
  paused_at?: string | null;
  resumed_at?: string | null;
  cancelled_at?: string | null;
  completed_at?: string | null;
  created_by?: string | null;
  is_power_of_two: boolean;
};

export type CreateAdminTournamentInput = {
  title: string;
  slug?: string | null;
  game?: string;
  platform?: string;
  team_size?: number;
  max_teams: number;
  entry_fee?: number;
  entry_fee_currency?: string;
  registration_open_at: string;
  registration_close_at: string;
  start_time: string;
  timezone?: string;
  format?: string;
  description?: string | null;
  rules?: string | null;
  banner_url?: string | null;
  status?: "draft" | "published";
};

export type UpdateAdminTournamentInput = {
  title?: string;
  description?: string | null;
  rules?: string | null;
  banner_url?: string | null;
  game?: string;
  platform?: string;
  team_size?: number;
  max_teams?: number;
  entry_fee?: number;
  entry_fee_currency?: string;
  registration_open_at?: string;
  registration_close_at?: string;
  start_time?: string;
  timezone?: string;
  format?: string;
};

// ---------------------------------------------------------------------------
// Dedicated Admin API Client Methods (HttpOnly admin_session)
// ---------------------------------------------------------------------------

export async function listAdminTournamentsApi(params?: {
  search?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}): Promise<AdminTournamentListResult> {
  const query = new URLSearchParams();
  if (params?.search) query.set("search", params.search.trim());
  if (params?.status && params.status !== "all") query.set("status", params.status);
  if (params?.page) query.set("page", String(params.page));
  if (params?.pageSize) query.set("page_size", String(params.pageSize));

  const qs = query.toString();
  return adminApiFetch<AdminTournamentListResult>(`/api/v1/admin/tournaments${qs ? `?${qs}` : ""}`);
}

export async function getAdminTournamentList(params?: {
  search?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}): Promise<AdminTournamentListResult> {
  return listAdminTournamentsApi(params);
}

export async function getAdminTournamentDetailApi(slugOrId: string): Promise<AdminTournamentDetail> {
  return adminApiFetch<AdminTournamentDetail>(`/api/v1/admin/tournaments/${encodeURIComponent(slugOrId)}`);
}

export async function createAdminTournamentApi(input: CreateAdminTournamentInput): Promise<AdminTournamentDetail> {
  return adminApiFetch<AdminTournamentDetail>("/api/v1/admin/tournaments", {
    method: "POST",
    body: input,
  });
}

export async function updateAdminTournamentApi(
  slugOrId: string,
  input: UpdateAdminTournamentInput
): Promise<AdminTournamentDetail> {
  return adminApiFetch<AdminTournamentDetail>(`/api/v1/admin/tournaments/${encodeURIComponent(slugOrId)}`, {
    method: "PATCH",
    body: input,
  });
}

export async function publishAdminTournamentApi(slugOrId: string): Promise<AdminTournamentDetail> {
  return adminApiFetch<AdminTournamentDetail>(`/api/v1/admin/tournaments/${encodeURIComponent(slugOrId)}/publish`, {
    method: "POST",
  });
}

export async function pauseAdminTournamentApi(slugOrId: string): Promise<AdminTournamentDetail> {
  return adminApiFetch<AdminTournamentDetail>(`/api/v1/admin/tournaments/${encodeURIComponent(slugOrId)}/pause`, {
    method: "POST",
  });
}

export async function resumeAdminTournamentApi(slugOrId: string): Promise<AdminTournamentDetail> {
  return adminApiFetch<AdminTournamentDetail>(`/api/v1/admin/tournaments/${encodeURIComponent(slugOrId)}/resume`, {
    method: "POST",
  });
}

export async function cancelAdminTournamentApi(slugOrId: string): Promise<AdminTournamentDetail> {
  return adminApiFetch<AdminTournamentDetail>(`/api/v1/admin/tournaments/${encodeURIComponent(slugOrId)}/cancel`, {
    method: "POST",
  });
}

export async function transitionAdminTournamentLifecycleApi(
  slugOrId: string,
  action: "publish" | "open_registration" | "close_registration" | "start_live" | "pause" | "resume" | "complete" | "cancel",
  reason?: string
): Promise<AdminTournamentDetail> {
  return adminApiFetch<AdminTournamentDetail>(`/api/v1/admin/tournaments/${encodeURIComponent(slugOrId)}/lifecycle`, {
    method: "POST",
    body: { action, reason },
  });
}

export type DeleteTournamentResponse = {
  success: boolean;
  deleted: boolean;
  deletedTournamentId?: string;
  deleted_tournament_id?: string;
  soft_deleted?: boolean;
  tournament_id: string;
  tournament_name: string;
  rows_deleted?: number;
  related_records_deleted?: Record<string, number>;
  deleted_by?: string;
  delete_reason?: string;
  deleted_at?: string;
  message?: string;
};

export async function deleteTournamentApi(
  slugOrId: string,
  reason?: string,
  confirmationTitle?: string
): Promise<DeleteTournamentResponse> {
  return adminApiFetch<DeleteTournamentResponse>(
    `/api/v1/admin/tournaments/${encodeURIComponent(slugOrId)}`,
    {
      method: "DELETE",
      body: {
        reason: reason || "Admin deleted tournament",
        confirmation_title: confirmationTitle || undefined,
      },
    }
  );
}

// ---------------------------------------------------------------------------
// Legacy / Supabase Helper Functions (Preserved for compatibility)
// ---------------------------------------------------------------------------

export async function getAdminTournament(slug: string): Promise<Tournament | null> {
  try {
    const data = await getAdminTournamentDetailApi(slug);
    if (!data) return null;
    return {
      id: data.id,
      title: data.title,
      slug: data.slug,
      game: data.game,
      mode: `${data.team_size}v${data.team_size}`,
      description: data.description ?? null,
      rules: data.rules ?? null,
      max_teams: data.max_teams,
      registration_open_at: data.registration_open_at,
      registration_close_at: data.registration_close_at,
      checkin_open_at: null,
      checkin_close_at: null,
      start_time: data.start_time,
      status: data.status as any,
      banner_url: data.banner_url ?? null,
      entry_fee_minor: data.entry_fee_minor,
      entry_fee_currency: data.entry_fee_currency,
      paused_at: data.paused_at ?? null,
      registered_count: data.registered_count ?? 0,
      platform: data.platform,
      team_size: data.team_size,
      format: data.format,
      timezone: data.timezone,
    } as unknown as Tournament;
  } catch {
    return null;
  }
}

export async function getAdminRegistrations(tournamentId: string): Promise<AdminRegistration[]> {
  const { data, error } = await supabase
    .from("tournament_registrations")
    .select("id,status,team_id,registered_by,created_at,checked_in,checked_in_at,seed,teams(id,name,tag,logo_url,captain_id)")
    .eq("tournament_id", tournamentId)
    .order("created_at", { ascending: true });
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
  const { data, error } = await supabase
    .from("matches")
    .select("id,tournament_id,bracket_id,round_id,round_number,match_number,team_a_id,team_b_id,winner_team_id,team1_score,team2_score,reported_by,reported_at,verified_by,verified_at,scheduled_at,completed_at,status,created_at,team_a:teams!matches_team_a_id_fkey(id,name,tag),team_b:teams!matches_team_b_id_fkey(id,name,tag)")
    .eq("tournament_id", tournamentId)
    .order("round_number")
    .order("match_number");
  if (error) throw error;
  return (data ?? []) as unknown as AdminMatch[];
}

export async function getAdminAnalytics(tournamentId: string): Promise<AdminAnalytics> {
  const [registrations, matches, bracket] = await Promise.all([
    getAdminRegistrations(tournamentId),
    getAdminMatches(tournamentId),
    supabase.from("brackets").select("champion_team_id").eq("tournament_id", tournamentId).maybeSingle(),
  ]);
  const unfinished = matches.filter((match) => match.status !== "completed" && match.status !== "cancelled");
  return {
    registeredTeams: registrations.length,
    approvedTeams: registrations.filter((item) => ["registered", "checked_in"].includes(item.status)).length,
    checkedInTeams: registrations.filter((item) => item.status === "checked_in" || item.checked_in).length,
    rejectedTeams: registrations.filter((item) => ["cancelled", "withdrawn", "disqualified"].includes(item.status)).length,
    matchesCompleted: matches.filter((item) => item.status === "completed").length,
    matchesPending: unfinished.length,
    currentRound: unfinished.map((item) => item.round_number).sort((a, b) => a - b)[0] ?? null,
    championTeamId: bracket.data?.champion_team_id ?? null,
  };
}

export async function updateTournamentSettings(
  tournamentId: string,
  values: Partial<Pick<Tournament, "title" | "description" | "banner_url" | "rules" | "registration_open_at" | "registration_close_at" | "checkin_open_at" | "checkin_close_at" | "start_time">>
) {
  return updateAdminTournamentApi(tournamentId, values);
}

export async function setTournamentStatus(tournamentId: string, status: Tournament["status"]) {
  const actionMap: Record<string, "publish" | "open_registration" | "close_registration" | "start_live" | "pause" | "resume" | "complete" | "cancel"> = {
    published: "publish",
    open: "open_registration",
    registration_open: "open_registration",
    registration_closed: "close_registration",
    ongoing: "start_live",
    live: "start_live",
    paused: "pause",
    completed: "complete",
    cancelled: "cancel",
  };
  const action = actionMap[status.toLowerCase()] || "open_registration";
  return transitionAdminTournamentLifecycleApi(tournamentId, action);
}

export async function moderateRegistration(registrationId: string, action: "approve" | "reject" | "remove") {
  const { error } = await supabase.rpc("admin_moderate_registration", { target_registration_id: registrationId, action });
  if (error) throw error;
}

export async function finishTournament(tournamentId: string) {
  return completeTournamentApi(tournamentId);
}

export async function regenerateBracket(tournamentId: string) {
  return generateAdminBracket(tournamentId, true);
}

export async function updateCheckIn(registrationId: string, action: "check_in" | "undo" | "absent") {
  const { error } = await supabase.rpc("admin_update_check_in", { target_registration_id: registrationId, action });
  if (error) throw error;
}

export async function closeCheckIn(tournamentId: string) {
  const { error } = await supabase.rpc("admin_close_check_in", { target_tournament_id: tournamentId });
  if (error) throw error;
}

export async function getControlRoomSnapshot(slug: string): Promise<ControlRoomSnapshot | null> {
  const tournament = await getAdminTournament(slug);
  if (!tournament) return null;
  const [registrations, matches, activity, reports] = await Promise.all([
    getAdminRegistrations(tournament.id),
    getAdminMatches(tournament.id),
    supabase.from("activity_events").select("id,description,created_at").order("created_at", { ascending: false }).limit(20),
    supabase.from("fair_play_reports").select("id", { count: "exact", head: true }).eq("tournament_id", tournament.id).in("status", ["open", "investigating"]),
  ]);
  if (activity.error) throw activity.error;
  if (reports.error) throw reports.error;
  const tournamentWithPause = tournament as Tournament & { paused_at?: string | null };
  return {
    tournament: tournamentWithPause,
    registrations,
    matches,
    reportsPending: reports.count ?? 0,
    activity: activity.data ?? [],
    paused: Boolean(tournamentWithPause.paused_at),
  };
}

export async function broadcastAnnouncement(tournamentId: string, type: string, message: string) {
  const { error } = await supabase.rpc("admin_broadcast_announcement", { target_tournament_id: tournamentId, target_type: type, target_message: message });
  if (error) throw error;
}

export async function saveOrganizerNote(tournamentId: string, content: string) {
  const { error } = await supabase.rpc("admin_save_tournament_note", { target_tournament_id: tournamentId, target_content: content });
  if (error) throw error;
}

export async function toggleTournamentPause(tournamentId: string, paused: boolean) {
  if (paused) {
    return pauseAdminTournamentApi(tournamentId);
  } else {
    return resumeAdminTournamentApi(tournamentId);
  }
}

export async function getOrganizerNote(tournamentId: string) {
  const { data, error } = await supabase.from("tournament_admin_notes").select("content").eq("tournament_id", tournamentId).maybeSingle();
  if (error) throw error;
  return data?.content ?? "";
}

// ---------------------------------------------------------------------------
// Match Control & Bracket Progression Endpoints
// ---------------------------------------------------------------------------

export async function startTournamentApi(tournamentId: string) {
  return apiFetch<{ ok: boolean; message: string; matches_created?: number }>(
    `/api/v1/tournaments/${tournamentId}/start`,
    { method: "POST" }
  );
}

export async function pauseTournamentApi(tournamentId: string) {
  return apiFetch<{ ok: boolean; message: string }>(
    `/api/v1/tournaments/${tournamentId}/pause`,
    { method: "PATCH" }
  );
}

export async function resumeTournamentApi(tournamentId: string) {
  return apiFetch<{ ok: boolean; message: string }>(
    `/api/v1/tournaments/${tournamentId}/resume`,
    { method: "PATCH" }
  );
}

export async function completeTournamentApi(tournamentId: string) {
  return apiFetch<{ ok: boolean; message: string }>(
    `/api/v1/tournaments/${tournamentId}/complete`,
    { method: "PATCH" }
  );
}

export async function adminCancelRegistrationApi(tournamentId: string, registrationId: string) {
  return apiFetch<{ ok: boolean; message: string }>(
    `/api/v1/tournaments/${tournamentId}/registrations/${registrationId}/cancel`,
    { method: "POST" }
  );
}

export async function adminRefundRegistrationApi(tournamentId: string, registrationId: string) {
  return apiFetch<{ ok: boolean; message: string }>(
    `/api/v1/tournaments/${tournamentId}/registrations/${registrationId}/refund`,
    { method: "POST" }
  );
}

export async function adminRemindRegistrationApi(tournamentId: string, registrationId: string) {
  return apiFetch<{ ok: boolean; message: string }>(
    `/api/v1/tournaments/${tournamentId}/registrations/${registrationId}/remind`,
    { method: "POST" }
  );
}

export async function adminRemoveRegistrationApi(tournamentId: string, registrationId: string) {
  return apiFetch<{ ok: boolean; message: string }>(
    `/api/v1/tournaments/${tournamentId}/registrations/${registrationId}`,
    { method: "DELETE" }
  );
}

export async function getMatchesApi(tournamentId: string) {
  return apiFetch<any[]>(`/api/v1/matches?tournament_id=${encodeURIComponent(tournamentId)}`);
}

export async function startMatchApi(matchId: string) {
  return apiFetch<{ ok: boolean; message: string }>(
    `/api/v1/matches/${matchId}/start`,
    { method: "POST" }
  );
}

export async function pauseMatchApi(matchId: string) {
  return apiFetch<{ ok: boolean; message: string }>(
    `/api/v1/matches/${matchId}/pause`,
    { method: "POST" }
  );
}

export async function finishMatchApi(matchId: string) {
  return apiFetch<{ ok: boolean; message: string }>(
    `/api/v1/matches/${matchId}/finish`,
    { method: "POST" }
  );
}

export type SetMatchWinnerResponse = {
  ok: boolean;
  message: string;
  champion_crowned?: boolean;
  advanced_to_round?: number | null;
  advanced_to_match?: number | null;
  [key: string]: any;
};

export async function setMatchWinnerApi(
  matchId: string,
  winnerChoice?: "team1" | "team2",
  winnerTeamId?: string
) {
  return apiFetch<SetMatchWinnerResponse>(
    `/api/v1/matches/${matchId}/winner`,
    {
      method: "PATCH",
      body: {
        winner_choice: winnerChoice,
        winner_team_id: winnerTeamId,
      },
    }
  );
}

export type ProgressTournamentResponse = {
  ok: boolean;
  message: string;
  champion?: { name: string; id?: string } | null;
  current_round?: number | null;
  [key: string]: any;
};

export async function progressTournamentApi(tournamentId: string) {
  return apiFetch<ProgressTournamentResponse>(
    `/api/v1/tournaments/${tournamentId}/progress`,
    { method: "POST" }
  );
}

export async function getMatchDetailApi(matchId: string) {
  return apiFetch<any>(`/api/v1/matches/${matchId}`);
}

export async function resetMatchApi(matchId: string) {
  return apiFetch<{ ok: boolean; message: string }>(
    `/api/v1/matches/${matchId}/reset`,
    { method: "PATCH" }
  );
}
