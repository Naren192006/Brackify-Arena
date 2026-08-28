export type MatchStatus = "scheduled" | "live" | "awaiting_approval" | "completed" | "pending" | "reported" | "cancelled";
export type RoundType = "quarterfinal" | "semifinal" | "final" | "grand_final";

export type Bracket = {
  id: string;
  tournament_id: string;
  format: "single_elimination";
  total_rounds: number;
  champion_team_id: string | null;
  created_at: string;
  rounds: Round[];
};

export type Round = { id: string; bracket_id: string; round_number: number; round_type: RoundType; created_at: string; matches: Match[] };

export type Match = {
  id: string;
  tournament_id: string;
  bracket_id: string;
  round_id: string;
  round_number: number;
  match_number: number;
  team_a_id: string | null;
  team_b_id: string | null;
  winner_team_id: string | null;
  team1_score?: number | null;
  team2_score?: number | null;
  reported_by?: string | null;
  reported_at?: string | null;
  verified_by?: string | null;
  verified_at?: string | null;
  scheduled_at: string | null;
  completed_at: string | null;
  status: MatchStatus;
  created_at: string;
};
