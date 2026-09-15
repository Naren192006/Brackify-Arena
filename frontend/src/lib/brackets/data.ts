import { supabase } from "@/lib/supabase/client";
import type {
  Bracket,
  BracketRegistrationInfo,
  CompleteTournamentBracket,
  Match,
  MatchStatus,
  Round,
  RoundType,
} from "@/types/bracket";

export async function generateBracket(tournamentId: string) {
  const { data, error } = await supabase.rpc("generate_single_elimination_bracket", { tournament_uuid: tournamentId });
  if (error) throw error;
  return data as string;
}

/**
 * Fetch complete tournament bracket data in a single Supabase query.
 * Eliminates N+1 queries by joining tournament, bracket, matches,
 * and both team registrations (with names and logos) in one network request.
 */
export async function getCompleteTournamentBracket(
  slugOrId: string
): Promise<CompleteTournamentBracket | null> {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(slugOrId);
  const column = isUuid ? "id" : "slug";

  try {
    // 1. Fetch tournament safely
    const { data: tData, error: tError } = await supabase
      .from("tournaments")
      .select("id,title,slug,game,mode,status,start_time,banner_url,max_teams,entry_fee_minor,entry_fee_currency")
      .eq(column, slugOrId)
      .neq("status", "cancelled")
      .maybeSingle();

    if (tError) {
      if (tError.code === "PGRST116" || tError.message?.includes("not found")) {
        return null;
      }
      console.warn("[supabase] getCompleteTournamentBracket tournament lookup warning:", tError);
      return null;
    }

    if (!tData) {
      return null;
    }

    const tournament = {
      id: tData.id,
      title: tData.title,
      slug: tData.slug,
      game: tData.game,
      mode: tData.mode,
      status: tData.status,
      start_time: tData.start_time,
      banner_url: tData.banner_url,
      max_teams: tData.max_teams,
      entry_fee_minor: tData.entry_fee_minor,
      entry_fee_currency: tData.entry_fee_currency,
    };

    // 2. Fetch bracket safely
    const { data: rawBracket } = await supabase
      .from("brackets")
      .select("id,tournament_id,format,total_rounds,champion_team_id,created_at,champion_team:teams!brackets_champion_team_id_fkey(id,name,tag,logo_url)")
      .eq("tournament_id", tData.id)
      .maybeSingle();

    // 3. Fetch matches safely
    const { data: rawMatchesData } = await supabase
      .from("matches")
      .select("id,tournament_id,bracket_id,round,round_number,match_number,status,team_a_id,team_b_id,winner_team_id,started_at,completed_at,created_at,team1_registration_id,team2_registration_id,winner_registration_id,team_a:teams!matches_team_a_id_fkey(id,name,tag,logo_url),team_b:teams!matches_team_b_id_fkey(id,name,tag,logo_url),winner_team:teams!matches_winner_team_id_fkey(id,name,tag,logo_url)")
      .eq("tournament_id", tData.id)
      .order("round", { ascending: true })
      .order("match_number", { ascending: true });

    type RawMatchRecord = {
      id: string;
      tournament_id?: string;
      round?: number;
      round_number?: number;
      match_number: number;
      team_a_id?: string | null;
      team_b_id?: string | null;
      winner_team_id?: string | null;
      status?: string;
      started_at?: string | null;
      completed_at?: string | null;
      created_at?: string;
      team1_registration_id?: string | null;
      team2_registration_id?: string | null;
      winner_registration_id?: string | null;
      team1_registration?: BracketRegistrationInfo | null;
      team2_registration?: BracketRegistrationInfo | null;
      winner_registration?: BracketRegistrationInfo | null;
      team_a?: { id: string; name: string; tag?: string; logo_url?: string | null } | null;
      team_b?: { id: string; name: string; tag?: string; logo_url?: string | null } | null;
      winner_team?: { id: string; name: string; tag?: string; logo_url?: string | null } | null;
    };

    const rawMatches = (rawMatchesData ?? []) as unknown as RawMatchRecord[];

    if (rawMatches.length > 0 || rawBracket) {
      const totalRounds =
        rawBracket?.total_rounds ||
        (rawMatches.length ? Math.max(...rawMatches.map((m: RawMatchRecord) => m.round || m.round_number || 1)) : 1);

      const roundMap = new Map<number, Match[]>();
      for (const m of rawMatches) {
        const roundNum = m.round || m.round_number || 1;
        const teamA = m.team_a || m.team1_registration?.teams || null;
        const teamB = m.team_b || m.team2_registration?.teams || null;
        const winnerTeam = m.winner_team || m.winner_registration?.teams || null;

        const formattedMatch: Match = {
          id: m.id,
          tournament_id: m.tournament_id || tData.id,
          bracket_id: rawBracket?.id || null,
          round_id: null,
          round_number: roundNum,
          match_number: m.match_number,
          team_a_id: m.team_a_id || m.team1_registration?.team_id || null,
          team_b_id: m.team_b_id || m.team2_registration?.team_id || null,
          winner_team_id: m.winner_team_id || m.winner_registration?.team_id || null,
          status: m.status as MatchStatus,
          scheduled_at: m.started_at || null,
          completed_at: m.completed_at || null,
          created_at: m.created_at || new Date().toISOString(),
          team1_registration_id: m.team1_registration_id || null,
          team2_registration_id: m.team2_registration_id || null,
          winner_registration_id: m.winner_registration_id || null,
          team1_registration: m.team1_registration || null,
          team2_registration: m.team2_registration || null,
          winner_registration: m.winner_registration || null,
          team_a: teamA,
          team_b: teamB,
          winner_team: winnerTeam,
        };

        if (!roundMap.has(roundNum)) {
          roundMap.set(roundNum, []);
        }
        roundMap.get(roundNum)!.push(formattedMatch);
      }

      const rounds: Round[] = [];
      for (let r = 1; r <= totalRounds; r++) {
        const matchesInRound = (roundMap.get(r) || []).sort((a, b) => a.match_number - b.match_number);
        const roundType: RoundType =
          r === totalRounds
            ? "final"
            : r === totalRounds - 1
              ? "semifinal"
              : r === totalRounds - 2
                ? "quarterfinal"
                : "quarterfinal";

        rounds.push({
          id: `round-${r}`,
          bracket_id: rawBracket?.id || tData.id,
          round_number: r,
          round_type: roundType,
          created_at: rawBracket?.created_at || new Date().toISOString(),
          matches: matchesInRound,
        });
      }

      const championTeam = Array.isArray(rawBracket?.champion_team)
        ? rawBracket.champion_team[0]
        : rawBracket?.champion_team || null;

      const bracket: Bracket = {
        id: rawBracket?.id || `bracket-${tData.id}`,
        tournament_id: tData.id,
        format: (rawBracket?.format as "single_elimination") || "single_elimination",
        total_rounds: totalRounds,
        champion_team_id: rawBracket?.champion_team_id || null,
        champion_team: championTeam,
        created_at: rawBracket?.created_at || new Date().toISOString(),
        rounds,
      };

      return { tournament, bracket };
    }

    return {
      tournament,
      bracket: null,
    };
  } catch (err) {
    console.warn("[supabase] getCompleteTournamentBracket uncaught error:", err);
    return null;
  }
}

export async function getBracket(tournamentId: string): Promise<Bracket | null> {
  const complete = await getCompleteTournamentBracket(tournamentId).catch(() => null);
  if (complete?.bracket) return complete.bracket;

  const { data, error } = await supabase.rpc("get_tournament_bracket", { tournament_uuid: tournamentId });
  if (error) {
    if (error.code === "PGRST116" || error.message?.includes("not found")) return null;
    return null;
  }
  if (!data || typeof data !== "object" || !("id" in data)) return null;
  return data as Bracket;
}

export async function advanceWinner(matchId: string, winnerId: string) {
  const { data, error } = await supabase.rpc("advance_match_winner", { match_uuid: matchId, winner_uuid: winnerId });
  if (error) throw error;
  return data as string;
}

export async function getMatchesByRound(roundId: string): Promise<Match[]> {
  const { data, error } = await supabase
    .from("matches")
    .select("id,tournament_id,bracket_id,round_id,round_number,match_number,team_a_id,team_b_id,winner_team_id,team1_score,team2_score,scheduled_at,completed_at,status,created_at")
    .eq("round_id", roundId)
    .order("match_number");
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
