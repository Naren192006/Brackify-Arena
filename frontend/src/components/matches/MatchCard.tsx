import Link from "next/link";

import type { Match } from "@/types/match";
import { StatusBadge } from "@/components/tournaments/StatusBadge";

export function MatchCard({ match, teamNames = {}, tournamentSlug = match.tournament_id }: { match: Match; teamNames?: Record<string, string>; tournamentSlug?: string }) {
  const name = (id: string | null) => id ? teamNames[id] ?? "Team" : "TBD";
  return <Link href={`/tournaments/${tournamentSlug}/matches/${match.id}`} className="block rounded-xl border border-arena-border bg-white/[0.04] p-3 transition-colors hover:border-arena-accent"><div className="flex items-center justify-between gap-3"><span className={match.winner_team_id === match.team_a_id ? "font-semibold text-arena-accent" : "text-arena-text"}>{name(match.team_a_id)}</span><span className="font-display text-lg text-arena-text">{match.team1_score ?? "–"}</span></div><div className="my-2 border-t border-arena-border" /><div className="flex items-center justify-between gap-3"><span className={match.winner_team_id === match.team_b_id ? "font-semibold text-arena-accent" : "text-arena-text"}>{name(match.team_b_id)}</span><span className="font-display text-lg text-arena-text">{match.team2_score ?? "–"}</span></div><div className="mt-3"><StatusBadge status={match.status === "scheduled" ? "pending" : match.status} /></div></Link>;
}
