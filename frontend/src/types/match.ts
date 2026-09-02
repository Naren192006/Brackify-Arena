export type MatchStatus = "pending" | "scheduled" | "live" | "awaiting_approval" | "reported" | "completed" | "cancelled";

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
  team1_score: number | null;
  team2_score: number | null;
  reported_by: string | null;
  reported_at: string | null;
  verified_by: string | null;
  verified_at: string | null;
  scheduled_at: string | null;
  completed_at: string | null;
  status: MatchStatus;
  created_at: string;
  team_a?: { id: string; name: string; tag?: string | null } | null;
  team_b?: { id: string; name: string; tag?: string | null } | null;
};

export type MatchReport = {
  id: string;
  match_id: string;
  team1_score: number;
  team2_score: number;
  winner_team_id: string;
  reported_by: string;
  status: "submitted" | "approved" | "rejected";
  notes?: string | null;
  evidence_url?: string | null;
  created_at: string;
  updated_at?: string | null;
  winner_team?: {
    id: string;
    name: string;
    tag?: string | null;
  } | null;
};

