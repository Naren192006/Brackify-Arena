import { supabase } from "@/lib/supabase/client";
import type { Match } from "@/types/match";

export async function getMatch(matchId: string, tournamentSlug: string): Promise<Match | null> {
  const { data, error } = await supabase.from("matches").select("id,tournament_id,bracket_id,round_id,round_number,match_number,team_a_id,team_b_id,winner_team_id,team1_score,team2_score,reported_by,reported_at,verified_by,verified_at,scheduled_at,completed_at,status,created_at,team_a:teams!matches_team_a_id_fkey(id,name,tag),team_b:teams!matches_team_b_id_fkey(id,name,tag),tournaments!inner(id,slug,title)").eq("id", matchId).eq("tournaments.slug", tournamentSlug).maybeSingle();
  if (error) { console.error("[supabase] match lookup failed", error); throw error; }
  return (data ?? null) as unknown as Match | null;
}

export async function getTeamCurrentMatch(teamId: string): Promise<Match | null> {
  const { data, error } = await supabase.rpc("get_team_current_match", { team_id: teamId });
  if (error) throw error;
  return (Array.isArray(data) ? data[0] : data) ?? null;
}

export async function submitMatchScore(matchId: string, team1Score: number, team2Score: number) {
  const { data, error } = await supabase.rpc("submit_match_score", { match_id: matchId, team1_score: team1Score, team2_score: team2Score });
  if (error) throw error;
  return data ?? null;
}

export async function approveMatchResult(matchId: string) {
  const { data, error } = await supabase.rpc("approve_match_result", { match_id: matchId });
  if (error) throw error;
  return data ?? null;
}

export async function rejectMatchResult(matchId: string) {
  const { data, error } = await supabase.rpc("reject_match_result", { match_id: matchId });
  if (error) throw error;
  return data ?? null;
}

export async function confirmMatchResult(matchId: string) {
  const { data, error } = await supabase.rpc("confirm_match_result", { target_match_id: matchId });
  if (error) throw error;
  return data ?? null;
}

export async function disputeMatchResult(matchId: string) {
  const { data, error } = await supabase.rpc("dispute_match_result", { target_match_id: matchId });
  if (error) throw error;
  return data ?? null;
}

export async function startMatch(matchId: string) {
  const { error } = await supabase.rpc("admin_start_match", { target_match_id: matchId });
  if (error) throw error;
}

/** Ends an active match with its submitted score awaiting review. */
export async function endMatch(matchId: string) {
  const { data: match, error: lookupError } = await supabase
    .from("matches")
    .select("id,status,team1_score,team2_score")
    .eq("id", matchId)
    .maybeSingle();
  if (lookupError) throw lookupError;
  if (!match) throw new Error("match_not_found");
  if (match.status !== "live") throw new Error("match_not_live");
  if (match.team1_score === null || match.team2_score === null) throw new Error("match_score_required");

  const { error } = await supabase
    .from("matches")
    .update({ status: "awaiting_approval" })
    .eq("id", matchId);
  if (error) throw error;
}

/** Allows an assigned admin to correct a score before approval. */
export async function editMatchScore(matchId: string, team1Score: number, team2Score: number) {
  if (!Number.isInteger(team1Score) || !Number.isInteger(team2Score) || team1Score < 0 || team2Score < 0 || team1Score === team2Score) {
    throw new Error("Scores must be whole numbers, non-negative, and cannot be tied.");
  }
  const { data: match, error: lookupError } = await supabase
    .from("matches")
    .select("id,team_a_id,team_b_id,status")
    .eq("id", matchId)
    .maybeSingle();
  if (lookupError) throw lookupError;
  if (!match) throw new Error("match_not_found");
  if (match.status === "completed") throw new Error("match_completed_reset_first");
  const winner_team_id = team1Score > team2Score ? match.team_a_id : match.team_b_id;
  if (!winner_team_id) throw new Error("match_teams_not_ready");
  const { error } = await supabase.from("matches").update({
    team1_score: team1Score,
    team2_score: team2Score,
    winner_team_id,
    status: "awaiting_approval",
  }).eq("id", matchId);
  if (error) throw error;
}

export async function resetMatch(matchId: string) {
  const { error } = await supabase.rpc("admin_reset_match", { target_match_id: matchId });
  if (error) throw error;
}

export async function forceMatchWinner(matchId: string, winnerId: string) {
  const { data, error } = await supabase.rpc("admin_force_match_winner", { target_match_id: matchId, winner_uuid: winnerId });
  if (error) throw error;
  return data as string;
}
