export type MatchStatus = "scheduled" | "live" | "awaiting_approval" | "completed" | "pending" | "reported" | "cancelled";
export type RoundType = "quarterfinal" | "semifinal" | "final" | "grand_final";

export type BracketTeamInfo = {
  id: string;
  name: string;
  tag?: string | null;
  logo_url?: string | null;
};

export type BracketRegistrationInfo = {
  id: string;
  team_id: string;
  teams?: BracketTeamInfo | null;
};

export type Bracket = {
  id: string;
  tournament_id: string;
  format: "single_elimination";
  total_rounds: number;
  champion_team_id: string | null;
  champion_team?: BracketTeamInfo | null;
  created_at: string;
  rounds: Round[];
};

export type Round = {
  id: string;
  bracket_id: string;
  round_number: number;
  round_type: RoundType;
  created_at: string;
  matches: Match[];
};

export type Match = {
  id: string;
  tournament_id: string;
  bracket_id?: string | null;
  round_id?: string | null;
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

  // Joined registration & team relations for zero N+1 queries
  team1_registration_id?: string | null;
  team2_registration_id?: string | null;
  winner_registration_id?: string | null;
  team_a?: BracketTeamInfo | null;
  team_b?: BracketTeamInfo | null;
  winner_team?: BracketTeamInfo | null;
  team1_registration?: BracketRegistrationInfo | null;
  team2_registration?: BracketRegistrationInfo | null;
  winner_registration?: BracketRegistrationInfo | null;
};

export type CompleteTournamentBracket = {
  tournament: {
    id: string;
    title: string;
    slug: string;
    game: string;
    mode: string;
    status: string;
    start_time: string;
    banner_url: string | null;
    max_teams: number;
    entry_fee_minor: number;
    entry_fee_currency: string;
  };
  bracket: Bracket | null;
};
