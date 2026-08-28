import { supabase } from "@/lib/supabase/client";
import type { Bracket, Match, Round } from "@/types/bracket";

export async function generateBracket(tournamentId: string) {
  const { data, error } = await supabase.rpc("generate_single_elimination_bracket", { tournament_uuid: tournamentId });
  if (error) throw error;
  return data as string;
}

export async function getBracket(tournamentId: string): Promise<Bracket | null> {
  const { data, error } = await supabase.rpc("get_tournament_bracket", { tournament_uuid: tournamentId });
  if (error) throw error;
  if (!data || typeof data !== "object" || !("id" in data)) return null;
  return data as Bracket;
}

export async function advanceWinner(matchId: string, winnerId: string) {
  const { data, error } = await supabase.rpc("advance_match_winner", { match_uuid: matchId, winner_uuid: winnerId });
  if (error) throw error;
  return data as string;
}

export async function getMatchesByRound(roundId: string): Promise<Match[]> {
  const { data, error } = await supabase.from("matches").select("*").eq("round_id", roundId).order("match_number");
  if (error) throw error;
  return (data ?? []) as Match[];
}

export async function startMatch(matchId: string) {
  const { error } = await supabase.rpc("admin_start_match", { target_match_id: matchId });
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
