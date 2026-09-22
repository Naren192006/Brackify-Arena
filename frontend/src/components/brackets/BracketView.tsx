"use client";

import { useMemo } from "react";
import type { Bracket, Match, Round } from "@/types/bracket";
import Link from "next/link";

const labels: Record<Round["round_type"], string> = {
  quarterfinal: "Quarterfinals",
  semifinal: "Semifinals",
  final: "Final",
  grand_final: "Grand Final",
};

const statusConfig: Record<string, { label: string; cls: string }> = {
  live: { label: "Live", cls: "border-emerald-500/30 bg-emerald-500/15 text-emerald-400 animate-pulse" },
  completed: { label: "Completed", cls: "border-arena-accent bg-arena-bg-elevated text-arena-accent" },
  awaiting_approval: { label: "Review", cls: "border-amber-400/30 bg-amber-400/10 text-amber-300" },
  reported: { label: "Reported", cls: "border-purple-400/30 bg-purple-400/10 text-purple-300" },
  scheduled: { label: "Scheduled", cls: "border-arena-border bg-arena-bg-elevated text-arena-muted" },
  pending: { label: "Pending", cls: "border-arena-border bg-arena-bg-elevated text-arena-muted" },
  cancelled: { label: "Cancelled", cls: "border-red-400/30 bg-red-400/10 text-arena-danger" },
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
  // Extract team names directly from embedded relationship data (Zero N+1 network requests)
  const embeddedNames = useMemo(() => {
    const map: Record<string, string> = {};
    if (bracket.champion_team_id && bracket.champion_team) {
      map[bracket.champion_team_id] = bracket.champion_team.tag
        ? `${bracket.champion_team.name} [${bracket.champion_team.tag}]`
        : bracket.champion_team.name;
    }
    for (const round of bracket.rounds) {
      for (const m of round.matches) {
        const t1 = m.team1_registration?.teams ?? m.team_a;
        if (t1 && m.team_a_id) {
          map[m.team_a_id] = t1.tag ? `${t1.name} [${t1.tag}]` : t1.name;
        }
        const t2 = m.team2_registration?.teams ?? m.team_b;
        if (t2 && m.team_b_id) {
          map[m.team_b_id] = t2.tag ? `${t2.name} [${t2.tag}]` : t2.name;
        }
        const tw = m.winner_registration?.teams ?? m.winner_team;
        if (tw && m.winner_team_id) {
          map[m.winner_team_id] = tw.tag ? `${tw.name} [${tw.tag}]` : tw.name;
        }
      }
    }
    return map;
  }, [bracket]);

  const names = { ...embeddedNames, ...teamNames };

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
              <div className="mb-4 flex items-center justify-between border-b border-arena-border pb-2">
                <h2 className="font-display text-base font-semibold tracking-wide text-arena-text">
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
          <div className="mb-4 border-b border-arena-border pb-2">
            <h2 className="font-display text-base font-semibold tracking-wide text-arena-text">
              Champion
            </h2>
          </div>
          <div className="flex flex-1 items-center">
            <div className="w-full rounded-2xl border border-arena-accent bg-gradient-to-b from-cyan-400/15 to-cyan-400/5 p-5 text-center shadow-lg shadow-cyan-950/30">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full border border-cyan-400/40 bg-cyan-400/20 text-xl font-bold text-arena-accent shadow-inner">

              </div>
              <p className="font-display text-lg font-bold text-arena-text">
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
  const team1 = match.team1_registration?.teams ?? match.team_a;
  const team2 = match.team2_registration?.teams ?? match.team_b;

  const isWinnerA = Boolean(
    (match.winner_team_id && (match.winner_team_id === match.team_a_id || (team1 && match.winner_team_id === team1.id))) ||
    (match.winner_registration_id && match.winner_registration_id === match.team1_registration_id)
  );
  const isWinnerB = Boolean(
    (match.winner_team_id && (match.winner_team_id === match.team_b_id || (team2 && match.winner_team_id === team2.id))) ||
    (match.winner_registration_id && match.winner_registration_id === match.team2_registration_id)
  );

  const teamAName =
    (team1 ? (team1.tag ? `${team1.name} [${team1.tag}]` : team1.name) : null) ||
    (match.team_a_id ? teamNames[match.team_a_id] : null) ||
    (match.team1_registration_id ? "Team 1" : "TBD");

  const teamBName =
    (team2 ? (team2.tag ? `${team2.name} [${team2.tag}]` : team2.name) : null) ||
    (match.team_b_id ? teamNames[match.team_b_id] : null) ||
    (match.team2_registration_id ? "Team 2" : "TBD");

  const hasScore =
    match.team1_score !== null &&
    match.team1_score !== undefined &&
    match.team2_score !== null &&
    match.team2_score !== undefined;

  const status = statusConfig[match.status] ?? {
    label: match.status.replaceAll("_", " "),
    cls: "border-arena-border bg-arena-bg-elevated text-arena-muted",
  };

  return (
    <Link
      href={`/tournaments/${tournamentSlug}/matches/${match.id}`}
      className={`group block rounded-xl border p-3.5 transition-all hover:scale-[1.02] ${
        match.status === "live"
          ? "border-emerald-500/40 bg-emerald-950/20 shadow-md shadow-emerald-950/40 hover:border-emerald-400"
          : "border-arena-border bg-white/[0.03] hover:border-cyan-400/40 hover:bg-white/[0.05]"
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
            ? "border border-arena-accent bg-arena-bg-elevated text-arena-accent font-semibold"
            : match.team_a_id || match.team1_registration_id
              ? "text-arena-text"
              : "text-arena-muted italic"
        }`}
      >
        <div className="flex items-center gap-2 min-w-0 truncate">
          {team1?.logo_url ? (
            <img
              src={team1.logo_url}
              alt=""
              className="h-4 w-4 shrink-0 rounded-full object-cover border border-arena-border"
            />
          ) : null}
          <span className="truncate text-sm">{teamAName}</span>
          {match.team1_registration_id ? (
            <span
              className="hidden sm:inline-block shrink-0 rounded bg-white/[0.06] px-1 text-[9px] font-mono text-arena-muted"
              title={`Registration ID: ${match.team1_registration_id}`}
            >
              #{match.team1_registration_id.slice(0, 4)}
            </span>
          ) : null}
        </div>
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
            ? "border border-arena-accent bg-arena-bg-elevated text-arena-accent font-semibold"
            : match.team_b_id || match.team2_registration_id
              ? "text-arena-text"
              : "text-arena-muted italic"
        }`}
      >
        <div className="flex items-center gap-2 min-w-0 truncate">
          {team2?.logo_url ? (
            <img
              src={team2.logo_url}
              alt=""
              className="h-4 w-4 shrink-0 rounded-full object-cover border border-arena-border"
            />
          ) : null}
          <span className="truncate text-sm">{teamBName}</span>
          {match.team2_registration_id ? (
            <span
              className="hidden sm:inline-block shrink-0 rounded bg-white/[0.06] px-1 text-[9px] font-mono text-arena-muted"
              title={`Registration ID: ${match.team2_registration_id}`}
            >
              #{match.team2_registration_id.slice(0, 4)}
            </span>
          ) : null}
        </div>
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
