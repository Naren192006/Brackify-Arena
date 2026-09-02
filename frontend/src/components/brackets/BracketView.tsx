"use client";

import type { Bracket, Match, Round } from "@/types/bracket";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { supabase } from "@/lib/supabase/client";

const labels: Record<Round["round_type"], string> = {
  quarterfinal: "Quarterfinals",
  semifinal: "Semifinals",
  final: "Final",
  grand_final: "Grand Final",
};

const statusConfig: Record<string, { label: string; cls: string }> = {
  live: { label: "Live", cls: "border-emerald-500/30 bg-emerald-500/15 text-emerald-400 animate-pulse" },
  completed: { label: "Completed", cls: "border-cyan-400/30 bg-cyan-400/10 text-arena-accent" },
  awaiting_approval: { label: "Review", cls: "border-amber-400/30 bg-amber-400/10 text-amber-300" },
  reported: { label: "Reported", cls: "border-purple-400/30 bg-purple-400/10 text-purple-300" },
  scheduled: { label: "Scheduled", cls: "border-white/10 bg-white/5 text-arena-muted" },
  pending: { label: "Pending", cls: "border-white/10 bg-white/5 text-arena-muted" },
  cancelled: { label: "Cancelled", cls: "border-red-400/30 bg-red-400/10 text-red-300" },
};

export function BracketView({
  bracket,
  teamNames = {},
  tournamentSlug,
}: {
  bracket: Bracket;
  teamNames?: Record<string, string>;
  tournamentSlug: string;
}) {
  const ids = [
    ...new Set(
      bracket.rounds.flatMap((round) =>
        round.matches
          .flatMap((match) => [match.team_a_id, match.team_b_id, match.winner_team_id])
          .filter((id): id is string => Boolean(id))
      )
    ),
  ];

  const teamQuery = useQuery({
    queryKey: ["bracket-teams", ids],
    queryFn: async () => {
      const { data, error } = await supabase.from("teams").select("id,name,tag").in("id", ids);
      if (error) throw error;
      return Object.fromEntries(
        (data ?? []).map((team) => [team.id, team.tag ? `${team.name} [${team.tag}]` : team.name])
      );
    },
    enabled: ids.length > 0,
  });

  const names = { ...teamNames, ...(teamQuery.data ?? {}) };

  return (
    <div className="w-full overflow-x-auto pb-6 pt-2 scrollbar-thin scrollbar-track-white/5 scrollbar-thumb-white/10">
      <div className="flex min-w-[800px] items-stretch gap-6 sm:gap-8">
        {bracket.rounds.map((round) => {
          const roundLabel =
            labels[round.round_type] ||
            (round.round_number === bracket.total_rounds
              ? "Final"
              : `Round ${round.round_number}`);

          return (
            <section className="flex min-w-60 flex-1 flex-col" key={round.id}>
              <div className="mb-4 flex items-center justify-between border-b border-white/10 pb-2">
                <h2 className="font-display text-base font-semibold tracking-wide text-white">
                  {roundLabel}
                </h2>
                <span className="text-xs text-arena-muted">
                  {round.matches.length} {round.matches.length === 1 ? "match" : "matches"}
                </span>
              </div>
              <div className="flex flex-1 flex-col justify-around gap-4">
                {round.matches.map((match) => (
                  <MatchCard
                    key={match.id}
                    match={match}
                    teamNames={names}
                    tournamentSlug={tournamentSlug}
                  />
                ))}
              </div>
            </section>
          );
        })}

        {/* ── Champion Podium ────────────────────────────────────────── */}
        <section className="flex min-w-52 flex-1 flex-col">
          <div className="mb-4 border-b border-white/10 pb-2">
            <h2 className="font-display text-base font-semibold tracking-wide text-white">
              Champion
            </h2>
          </div>
          <div className="flex flex-1 items-center">
            <div className="w-full rounded-2xl border border-cyan-400/30 bg-gradient-to-b from-cyan-400/15 to-cyan-400/5 p-5 text-center shadow-lg shadow-cyan-950/30">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full border border-cyan-400/40 bg-cyan-400/20 text-xl font-bold text-arena-accent shadow-inner">
                🏆
              </div>
              <p className="font-display text-lg font-bold text-white">
                {bracket.champion_team_id
                  ? names[bracket.champion_team_id] ?? "Champion Crowned"
                  : "Awaiting Final"}
              </p>
              <p className="mt-1 text-xs uppercase tracking-wider text-arena-accent">
                {bracket.champion_team_id ? "Tournament Winner" : "In Progress"}
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function MatchCard({
  match,
  teamNames,
  tournamentSlug,
}: {
  match: Match;
  teamNames: Record<string, string>;
  tournamentSlug: string;
}) {
  const isWinnerA = Boolean(match.winner_team_id && match.winner_team_id === match.team_a_id);
  const isWinnerB = Boolean(match.winner_team_id && match.winner_team_id === match.team_b_id);

  const teamAName = match.team_a_id ? teamNames[match.team_a_id] ?? "Team A" : "TBD";
  const teamBName = match.team_b_id ? teamNames[match.team_b_id] ?? "Team B" : "TBD";

  const hasScore =
    match.team1_score !== null &&
    match.team1_score !== undefined &&
    match.team2_score !== null &&
    match.team2_score !== undefined;

  const status = statusConfig[match.status] ?? {
    label: match.status.replaceAll("_", " "),
    cls: "border-white/10 bg-white/5 text-arena-muted",
  };

  return (
    <Link
      href={`/tournaments/${tournamentSlug}/matches/${match.id}`}
      className={`group block rounded-xl border p-3.5 transition-all hover:scale-[1.02] ${
        match.status === "live"
          ? "border-emerald-500/40 bg-emerald-950/20 shadow-md shadow-emerald-950/40 hover:border-emerald-400"
          : "border-white/10 bg-white/[0.03] hover:border-cyan-400/40 hover:bg-white/[0.05]"
      }`}
    >
      {/* Header: Match number & status badge */}
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium uppercase tracking-wider text-arena-muted">
          Match #{match.match_number}
        </span>
        <span
          className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${status.cls}`}
        >
          {status.label}
        </span>
      </div>

      {/* Team 1 */}
      <div
        className={`flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 transition-colors ${
          isWinnerA
            ? "border border-cyan-400/30 bg-cyan-400/10 text-arena-accent font-semibold"
            : match.team_a_id
              ? "text-white"
              : "text-arena-muted italic"
        }`}
      >
        <span className="truncate text-sm">{teamAName}</span>
        {hasScore ? (
          <span
            className={`font-mono text-sm font-bold ${
              isWinnerA ? "text-arena-accent" : "text-white/80"
            }`}
          >
            {match.team1_score}
          </span>
        ) : null}
      </div>

      {/* Divider */}
      <div className="my-1 border-t border-white/[0.06]" />

      {/* Team 2 */}
      <div
        className={`flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 transition-colors ${
          isWinnerB
            ? "border border-cyan-400/30 bg-cyan-400/10 text-arena-accent font-semibold"
            : match.team_b_id
              ? "text-white"
              : "text-arena-muted italic"
        }`}
      >
        <span className="truncate text-sm">{teamBName}</span>
        {hasScore ? (
          <span
            className={`font-mono text-sm font-bold ${
              isWinnerB ? "text-arena-accent" : "text-white/80"
            }`}
          >
            {match.team2_score}
          </span>
        ) : null}
      </div>
    </Link>
  );
}
