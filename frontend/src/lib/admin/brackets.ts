import { supabase } from "@/lib/supabase/client";

export const BRACKET_TEAM_COUNTS = [2, 4, 8, 16, 32] as const;
export const BRACKET_TEAM_COUNT_ERROR = "Bracket can only be generated with 2, 4, 8, 16, or 32 checked-in teams.";

export function validateBracketTeamCount(count: number): void {
  if (!BRACKET_TEAM_COUNTS.includes(count as (typeof BRACKET_TEAM_COUNTS)[number])) {
    throw new Error(BRACKET_TEAM_COUNT_ERROR);
  }
}

export async function getCheckedInTeamCount(tournamentId: string): Promise<number> {
  const { count, error } = await supabase
    .from("tournament_registrations")
    .select("id", { count: "exact", head: true })
    .eq("tournament_id", tournamentId)
    .in("status", ["registered", "checked_in"])
    .eq("checked_in", true);
  if (error) throw error;
  return count ?? 0;
}

export async function generateAdminBracket(tournamentId: string, regenerate = false): Promise<string> {
  const count = await getCheckedInTeamCount(tournamentId);
  validateBracketTeamCount(count);
  const { data, error } = await supabase.rpc(
    regenerate ? "admin_regenerate_bracket" : "generate_single_elimination_bracket",
    regenerate ? { target_tournament_id: tournamentId } : { tournament_uuid: tournamentId },
  );
  if (error) {
    if (error.message.toLowerCase().includes("checked_in_count") || error.message.toLowerCase().includes("power of two") || error.message.toLowerCase().includes("between 2 and 32")) {
      throw new Error(BRACKET_TEAM_COUNT_ERROR);
    }
    throw error;
  }
  return data as string;
}
