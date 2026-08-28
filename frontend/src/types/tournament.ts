import type { Database } from "@/types/api.generated";

export type TournamentStatus = Exclude<Database["public"]["Enums"]["tournament_status"], "full">;
export type RegistrationStatus = "pending" | "registered" | "checked_in" | "cancelled" | "withdrawn" | "disqualified";

export type Tournament = {
  id: string;
  title: string;
  slug: string;
  game: string;
  mode: string;
  description: string | null;
  rules: string | null;
  max_teams: number;
  registration_open_at: string;
  registration_close_at: string;
  checkin_open_at: string;
  checkin_close_at: string;
  start_time: string;
  status: TournamentStatus;
  banner_url: string | null;
  registered_count: number;
  registration_status?: RegistrationStatus;
  checked_in?: boolean;
  checked_in_at?: string | null;
  team_id?: string;
  bracket_id?: string;
  champion_team_id?: string | null;
  current_round?: number | null;
};

export type TournamentRegistration = {
  id: string;
  status: RegistrationStatus;
  team_id: string;
  teams: { id: string; name: string; tag: string | null; logo_url: string | null } | null;
  checked_in: boolean;
  checked_in_at: string | null;
  seed: number | null;
  check_in_status?: "pending" | "checked_in" | "absent";
};
