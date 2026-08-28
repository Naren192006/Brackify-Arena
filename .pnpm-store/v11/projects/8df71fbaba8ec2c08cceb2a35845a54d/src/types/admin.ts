import type { Match } from "@/types/match";
import type { Tournament, TournamentRegistration } from "@/types/tournament";

export type AdminMember = { user_id: string; role: string; profiles: { display_name: string | null; username: string; } | null };
export type AdminRegistration = TournamentRegistration & { registered_by: string; created_at: string; teams: (NonNullable<TournamentRegistration["teams"]> & { captain_id: string; team_members: AdminMember[] }) | null };
export type AdminMatch = Match & { round_type?: string; team_a?: { id: string; name: string; tag: string | null } | null; team_b?: { id: string; name: string; tag: string | null } | null };
export type AdminAnalytics = { registeredTeams: number; approvedTeams: number; checkedInTeams: number; rejectedTeams: number; matchesCompleted: number; matchesPending: number; currentRound: number | null; championTeamId: string | null };
export type AdminTournament = Tournament;
