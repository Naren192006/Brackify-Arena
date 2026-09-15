"use client";

import Link from "next/link";
import { useMemo } from "react";
import type { LiveMatch, RoundProgress } from "@/types/live";

interface LiveScoreboardProps {
  slug: string;
  matches: LiveMatch[];
  rounds: RoundProgress[];
  currentRoundNumber?: number | null;
  spectatorMode?: boolean;
}

export function LiveScoreboard({
  slug,
  matches,
  rounds,
  currentRoundNumber,
  spectatorMode = false,
}: LiveScoreboardProps) {
  // Separate matches by category
  const { liveMatches, upcomingMatches, completedMatches } = useMemo(() => {
    const live: LiveMatch[] = [];
    const upcoming: LiveMatch[] = [];
    const completed: LiveMatch[] = [];

    matches.forEach((m) => {
      if (m.status === "live") {
        live.push(m);
      } else if (m.status === "completed") {
        completed.push(m);
      } else if (m.status !== "cancelled") {
        upcoming.push(m);
      }
    });

    return {
      liveMatches: live,
      upcomingMatches: upcoming,
      completedMatches: completed.sort(
        (a, b) =>
          new Date(b.completed_at || 0).getTime() - new Date(a.completed_at || 0).getTime()
      ),
    };
  }, [matches]);

  return (
    <div className="space-y-6">
      {/* ── 1. ACTIVE LIVE MATCHES ────────────────────────────────────── */}
      <section className="glass-card rounded-2xl border border-emerald-500/30 bg-[#0c1624]/90 p-5 backdrop-blur-xl shadow-xl shadow-emerald-950/20">
        <div className="flex items-center justify-between border-b border-arena-border pb-3">
          <div className="flex items-center gap-2">
            <span className="flex h-3 w-3 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500" />
            </span>
            <h2 className="font-display text-lg font-black tracking-wide text-arena-text uppercase flex items-center gap-2">
              Live Matches
              <span className="rounded-full bg-emerald-500/20 border border-emerald-500/40 px-2 py-0.5 text-[10px] font-mono text-emerald-400">
                {liveMatches.length} ACTIVE
              </span>
            </h2>
          </div>
          {currentRoundNumber ? (
            <span className="text-xs font-semibold text-arena-accent font-mono">
              Round {currentRoundNumber}
            </span>
          ) : null}
        </div>

        {liveMatches.length === 0 ? (
          <div className="rounded-xl border border-dashed border-arena-border bg-white/[0.02] p-8 text-center my-3">
            <span className="text-3xl block mb-2">⚡</span>
            <p className="text-sm font-semibold text-arena-text">No matches currently in progress</p>
            <p className="mt-1 text-xs text-arena-muted">
              Matches will appear here live with animated scoreboards when administrators start them.
            </p>
          </div>
        ) : (
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {liveMatches.map((m) => (
              <LiveMatchCard key={m.id} match={m} slug={slug} spectatorMode={spectatorMode} />
            ))}
          </div>
        )}
      </section>

      {/* ── 2. UPCOMING MATCHES ────────────────────────────────────────── */}
      <section className="glass-card rounded-2xl border border-arena-border bg-[#0d1322]/80 p-5 backdrop-blur-xl shadow-xl">
        <div className="flex items-center justify-between border-b border-arena-border pb-3">
          <h2 className="font-display text-base font-bold text-arena-text flex items-center gap-2">
            <span>⏳</span> Upcoming Matches
            <span className="rounded-full bg-arena-bg-elevated px-2 py-0.5 text-[10px] font-mono text-arena-muted">
              {upcomingMatches.length}
            </span>
          </h2>
        </div>

        {upcomingMatches.length === 0 ? (
          <p className="text-xs text-arena-muted py-4 text-center">No upcoming matches remaining.</p>
        ) : (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {upcomingMatches.slice(0, 6).map((m) => (
              <div
                key={m.id}
                className="rounded-xl border border-arena-border bg-white/[0.02] p-3.5 hover:border-arena-border transition-colors"
              >
                <div className="flex justify-between items-center text-[10px] text-arena-muted mb-2 font-mono">
                  <span>Round {m.round_number} · Match #{m.match_number}</span>
                  <span className="uppercase text-amber-400 font-semibold">{m.status}</span>
                </div>
                <div className="space-y-1 text-xs text-arena-text">
                  <div className="flex justify-between items-center">
                    <span className="truncate">{m.team_a?.name || "TBD"}</span>
                    <span className="font-mono text-arena-muted text-[11px]">—</span>
                  </div>
                  <div className="flex justify-between items-center text-white/80">
                    <span className="truncate">{m.team_b?.name || "TBD"}</span>
                    <span className="font-mono text-arena-muted text-[11px]">—</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── 3. COMPLETED MATCHES TIMELINE ───────────────────────────────── */}
      <section className="glass-card rounded-2xl border border-arena-border bg-[#0d1322]/80 p-5 backdrop-blur-xl shadow-xl">
        <div className="flex items-center justify-between border-b border-arena-border pb-3">
          <h2 className="font-display text-base font-bold text-arena-text flex items-center gap-2">
            <span>🏁</span> Completed Matches
            <span className="rounded-full bg-arena-bg-elevated px-2 py-0.5 text-[10px] font-mono text-arena-muted">
              {completedMatches.length}
            </span>
          </h2>
        </div>

        {completedMatches.length === 0 ? (
          <p className="text-xs text-arena-muted py-4 text-center">No matches finished yet.</p>
        ) : (
          <div className="mt-4 space-y-2.5">
            {completedMatches.slice(0, 8).map((m) => {
              const isT1Winner = m.winner_team_id === m.team_a_id;
              const isT2Winner = m.winner_team_id === m.team_b_id;

              return (
                <div
                  key={m.id}
                  className="flex items-center justify-between rounded-xl border border-arena-border bg-white/[0.02] p-3 text-xs text-arena-text hover:bg-white/[0.04] transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-[10px] text-arena-muted">
                      R{m.round_number}M{m.match_number}
                    </span>
                    <div className="flex items-center gap-2">
                      <span
                        className={`truncate max-w-[120px] sm:max-w-[160px] ${
                          isT1Winner ? "font-bold text-emerald-400" : "text-arena-muted"
                        }`}
                      >
                        {m.team_a?.name || "TBD"}
                      </span>
                      <span className="font-mono font-bold text-arena-accent px-1.5 py-0.5 rounded bg-arena-bg-elevated text-[11px]">
                        {m.team1_score ?? 0} : {m.team2_score ?? 0}
                      </span>
                      <span
                        className={`truncate max-w-[120px] sm:max-w-[160px] ${
                          isT2Winner ? "font-bold text-emerald-400" : "text-arena-muted"
                        }`}
                      >
                        {m.team_b?.name || "TBD"}
                      </span>
                    </div>
                  </div>

                  {m.winner_team_id ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 text-[9px] font-semibold text-emerald-400">
                      🏆 {isT1Winner ? m.team_a?.name : m.team_b?.name}
                    </span>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function LiveMatchCard({
  match,
  slug,
  spectatorMode,
}: {
  match: LiveMatch;
  slug: string;
  spectatorMode?: boolean;
}) {
  const matchHref = `/tournaments/${slug}/matches/${match.id}`;

  return (
    <div className="relative overflow-hidden rounded-2xl border-2 border-emerald-500/60 bg-gradient-to-br from-[#0c1d2e] via-[#091523] to-[#060e18] p-5 shadow-lg shadow-emerald-950/40 group hover:border-emerald-400 transition-all">
      {/* Top Bar */}
      <div className="flex items-center justify-between border-b border-emerald-500/20 pb-2.5 text-xs">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[11px] font-bold text-emerald-400">
            Round {match.round_number} · Match #{match.match_number}
          </span>
          {match.map_name ? (
            <span className="text-[10px] text-white/50 bg-arena-bg-elevated px-2 py-0.5 rounded font-mono">
              🗺️ {match.map_name}
            </span>
          ) : null}
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/20 border border-emerald-400/50 px-2.5 py-0.5 text-[10px] font-black text-arena-success animate-pulse">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          LIVE NOW
        </span>
      </div>

      {/* Main Scoreboard Display */}
      <div className="mt-4 grid grid-cols-3 items-center text-center">
        {/* Team A */}
        <div className="text-left">
          <p className="font-display text-sm font-bold text-arena-text truncate">
            {match.team_a?.name || "Team Alpha"}
          </p>
          {match.team_a?.tag ? (
            <span className="text-[10px] font-mono text-arena-accent font-semibold">
              [{match.team_a.tag}]
            </span>
          ) : null}
        </div>

        {/* Live Score Counter */}
        <div className="flex flex-col items-center justify-center">
          <div className="flex items-center gap-2 rounded-xl bg-black/60 border border-emerald-500/40 px-3.5 py-1 shadow-inner">
            <span className="font-mono text-2xl font-black text-arena-text">
              {match.team1_score ?? 0}
            </span>
            <span className="text-emerald-400 font-bold text-sm">:</span>
            <span className="font-mono text-2xl font-black text-arena-text">
              {match.team2_score ?? 0}
            </span>
          </div>
          <span className="mt-1 text-[9px] uppercase tracking-wider text-emerald-400/80 font-bold">
            Live Score
          </span>
        </div>

        {/* Team B */}
        <div className="text-right">
          <p className="font-display text-sm font-bold text-arena-text truncate">
            {match.team_b?.name || "Team Bravo"}
          </p>
          {match.team_b?.tag ? (
            <span className="text-[10px] font-mono text-arena-accent font-semibold">
              [{match.team_b.tag}]
            </span>
          ) : null}
        </div>
      </div>

      {/* Link to Match Detail */}
      <div className="mt-4 pt-3 border-t border-arena-border flex justify-end">
        <Link
          href={matchHref}
          className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-400 hover:text-arena-success transition-colors"
        >
          <span>View Match Details</span>
          <span>→</span>
        </Link>
      </div>
    </div>
  );
}
