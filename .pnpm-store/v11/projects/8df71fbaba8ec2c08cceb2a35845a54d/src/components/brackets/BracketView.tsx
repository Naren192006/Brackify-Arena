"use client";

import type { Bracket, Match, Round } from "@/types/bracket";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { supabase } from "@/lib/supabase/client";

const labels: Record<Round["round_type"], string> = { quarterfinal: "Quarterfinals", semifinal: "Semifinals", final: "Final", grand_final: "Grand Final" };

export function BracketView({ bracket, teamNames = {}, tournamentSlug }: { bracket: Bracket; teamNames?: Record<string, string>; tournamentSlug: string }) {
  const ids = [...new Set(bracket.rounds.flatMap((round) => round.matches.flatMap((match) => [match.team_a_id, match.team_b_id, match.winner_team_id]).filter((id): id is string => Boolean(id))))];
  const teamQuery = useQuery({ queryKey: ["bracket-teams", ids], queryFn: async () => { const { data, error } = await supabase.from("teams").select("id,name,tag").in("id", ids); if (error) throw error; return Object.fromEntries((data ?? []).map((team) => [team.id, team.tag ? `${team.name} [${team.tag}]` : team.name])); }, enabled: ids.length > 0 });
  const names = { ...teamNames, ...(teamQuery.data ?? {}) };
  return <div className="overflow-x-auto pb-3"><div className="flex min-w-[760px] items-stretch gap-6">{bracket.rounds.map((round) => <section className="flex min-w-52 flex-1 flex-col" key={round.id}><h2 className="mb-4 font-display text-lg font-semibold text-white">{labels[round.round_type]}</h2><div className="flex flex-1 flex-col justify-around gap-4">{round.matches.map((match) => <MatchCard key={match.id} match={match} teamNames={names} tournamentSlug={tournamentSlug} />)}</div></section>)}<section className="flex min-w-44 flex-1 flex-col"><h2 className="mb-4 font-display text-lg font-semibold text-white">Champion</h2><div className="flex flex-1 items-center"><div className="w-full rounded-xl border border-cyan-400/30 bg-cyan-400/10 p-4 text-center font-semibold text-white">{bracket.champion_team_id ? names[bracket.champion_team_id] ?? "Champion decided" : "Awaiting final"}</div></div></section></div></div>;
}

function MatchCard({ match, teamNames, tournamentSlug }: { match: Match; teamNames: Record<string, string>; tournamentSlug: string }) {
  const team = (id: string | null) => id ? teamNames[id] ?? "TBD" : "TBD";
  return <Link href={`/tournaments/${tournamentSlug}/matches/${match.id}`} className="block rounded-xl border border-white/10 bg-white/[0.04] p-3 text-sm hover:border-cyan-400/30"><div className={match.winner_team_id === match.team_a_id ? "font-semibold text-arena-accent" : "text-white"}>{team(match.team_a_id)}</div><div className="my-2 border-t border-white/10" /><div className={match.winner_team_id === match.team_b_id ? "font-semibold text-arena-accent" : "text-white"}>{team(match.team_b_id)}</div><p className="mt-2 text-[10px] uppercase tracking-wider text-arena-muted">{match.status}</p></Link>;
}
