import type { AdminMatch } from "@/types/admin";
export type TournamentActivity = { id: string; tournament_id: string; event_type: string; message: string; created_at: string };
export type MatchReadyStatus = { match_id: string; team_id: string; user_id: string; status: "ready" | "not_ready" | "late"; updated_at: string };
export type MatchHistoryEntry = { id: string; match_id: string; user_id: string; team_id: string; result: "win" | "loss"; rp_change: number; created_at: string };
export type MatchMVP = { match_id: string; voter_id: string; player_id: string; created_at: string };
export type RoundProgress = { round: number; completed: number; total: number };
export type LiveTournamentStats = { live: number; completed: number; remaining: number; registered: number; checkedIn: number };
export type LiveMatch = AdminMatch & { started_at?: string | null; map_name?: string | null };
