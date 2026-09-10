"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getLiveTournament } from "@/lib/tournaments/live";
import { useTournamentRealtime } from "@/hooks/useTournamentRealtime";
import { StatusBadge } from "@/components/tournaments/StatusBadge";
import { LiveScoreboard } from "@/components/tournaments/LiveScoreboard";
import { LiveEventFeed } from "@/components/realtime/LiveEventFeed";

export function LiveTournamentCenter({ slug }: { slug: string }) {
  // 1. Fetch initial tournament data (no polling, pure Realtime)
  const query = useQuery({
    queryKey: ["live-tournament", slug],
    queryFn: () => getLiveTournament(slug),
  });

  const initialTournamentId = query.data?.tournament?.id || "";

  // 2. Realtime Event Subscription (Phase 10.1, 10.2, 10.3)
  const { isConnected, liveEvents, clearEvents } = useTournamentRealtime({
    tournamentId: initialTournamentId,
    slug,
  });

  // Calculate current round
  const currentRoundNumber = useMemo(() => {
    if (!query.data?.rounds) return null;
    const current = query.data.rounds.find((r) => r.completed < r.total);
    return current?.round ?? null;
  }, [query.data?.rounds]);

  if (query.isLoading) {
    return (
      <main className="min-h-screen bg-[#070b14] px-4 py-12 text-white">
        <div className="mx-auto max-w-7xl animate-pulse space-y-6">
          <div className="h-64 rounded-2xl bg-white/5" />
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2 h-96 rounded-2xl bg-white/5" />
            <div className="h-96 rounded-2xl bg-white/5" />
          </div>
        </div>
      </main>
    );
  }

  if (query.isError || !query.data || !query.data.tournament) {
    return (
      <main className="min-h-screen bg-[#070b14] px-4 py-12 text-white text-center">
        <div className="mx-auto max-w-md rounded-2xl border border-rose-500/30 bg-rose-950/20 p-8">
          <span className="text-3xl block mb-2">⚠️</span>
          <h2 className="text-lg font-bold text-white">Unable to load live tournament</h2>
          <p className="mt-1 text-xs text-arena-muted">
            The tournament data could not be fetched.
          </p>
          <Link
            href="/tournaments"
            className="mt-4 inline-block rounded-xl bg-white/10 px-4 py-2 text-xs font-semibold text-white hover:bg-white/20"
          >
            ← Back to Tournaments
          </Link>
        </div>
      </main>
    );
  }

  const liveData = query.data;
  const { tournament, matches, activity, stats, rounds } = liveData;
  const remainingSlots = Math.max(0, tournament.max_teams - tournament.registered_count);

  return (
    <main className="min-h-screen bg-[#070b14] px-4 py-8 sm:px-6 lg:px-8 text-white selection:bg-cyan-500/30">
      <div className="mx-auto max-w-7xl space-y-6">
        {/* Navigation & Realtime Status Bar */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <Link
            href={`/tournaments/${slug}`}
            className="text-xs font-semibold text-arena-accent hover:underline flex items-center gap-1.5"
          >
            <span>←</span> Back to Tournament Hub
          </Link>

          <div className="flex items-center gap-3">
            <Link
              href={`/tournaments/${slug}/spectate`}
              className="rounded-xl border border-purple-400/40 bg-purple-400/10 px-3.5 py-1.5 text-xs font-bold text-purple-300 hover:bg-purple-400/20 transition-colors flex items-center gap-1.5"
            >
              <span>👁️</span> Spectator Mode
            </Link>
            <Link
              href={`/tournaments/${slug}/bracket`}
              className="rounded-xl border border-cyan-400/40 bg-cyan-400/10 px-3.5 py-1.5 text-xs font-bold text-arena-accent hover:bg-cyan-400/20 transition-colors flex items-center gap-1.5"
            >
              <span>⚔️</span> Full Bracket
            </Link>
            <div className="flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-bold text-emerald-400">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="font-mono text-[11px]">
                {isConnected ? "REALTIME CONNECTED" : "RECONNECTING"}
              </span>
            </div>
          </div>
        </div>

        {/* Tournament Hero Banner */}
        <section className="glass-card overflow-hidden rounded-2xl border border-white/10 bg-[#0d1322]/90 backdrop-blur-xl shadow-xl">
          {tournament.banner_url ? (
            <div className="relative h-56 w-full">
              <img
                src={tournament.banner_url}
                alt={tournament.title}
                className="h-full w-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#0d1322] via-[#0d1322]/50 to-transparent" />
            </div>
          ) : (
            <div className="arena-grid-bg h-40 bg-cyan-400/10 border-b border-white/5" />
          )}

          <div className="p-6 sm:p-8">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-arena-accent">
                  {tournament.game} • {tournament.mode}
                </p>
                <h1 className="mt-2 font-display text-3xl sm:text-4xl font-black text-white">
                  {tournament.title}
                </h1>
              </div>
              <StatusBadge
                status={tournament.status}
                registeredCount={tournament.registered_count}
                maxTeams={tournament.max_teams}
              />
            </div>

            {/* Metrics Grid */}
            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <Metric label="Teams Registered" value={`${tournament.registered_count}/${tournament.max_teams}`} />
              <Metric label="Live Matches" value={String(stats.live)} highlight="emerald" />
              <Metric label="Matches Finished" value={String(stats.completed)} />
              <Metric label="Matches Left" value={String(stats.remaining)} />
              <Metric
                label="Current Round"
                value={currentRoundNumber ? `Round ${currentRoundNumber}` : "—"}
                highlight="amber"
              />
              <Metric label="Available Slots" value={String(remainingSlots)} />
            </div>
          </div>
        </section>

        {/* Main Content: Scoreboard, Round Progress & Live Feed */}
        <div className="grid gap-6 lg:grid-cols-[1.4fr_0.8fr]">
          {/* Live Scoreboard */}
          <LiveScoreboard
            slug={slug}
            matches={matches}
            rounds={rounds}
            currentRoundNumber={currentRoundNumber}
          />

          {/* Right Sidebar: Round Progress & Realtime Activity Feed */}
          <aside className="space-y-6">
            {/* Round Progress Tracker */}
            <section className="glass-card rounded-2xl border border-white/10 bg-[#0d1322]/80 p-5 backdrop-blur-xl shadow-xl">
              <h2 className="mb-4 font-display text-base font-bold text-white flex items-center gap-2">
                <span>📈</span> Round Progression
              </h2>
              {rounds.length ? (
                <div className="space-y-3.5">
                  {rounds.map((round) => {
                    const pct = round.total ? Math.round((round.completed / round.total) * 100) : 0;
                    const isDone = round.completed === round.total && round.total > 0;

                    return (
                      <div key={round.round} className="space-y-1.5">
                        <div className="flex justify-between text-xs text-white font-semibold">
                          <span className={isDone ? "text-emerald-400" : "text-white"}>
                            Round {round.round} {isDone ? "✓" : ""}
                          </span>
                          <span className="font-mono text-[11px] text-arena-muted">
                            {round.completed} / {round.total} ({pct}%)
                          </span>
                        </div>
                        <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${
                              isDone ? "bg-emerald-400" : "bg-cyan-400"
                            }`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs text-arena-muted">Bracket pending generation.</p>
              )}
            </section>

            {/* Live Realtime Event Feed */}
            <LiveEventFeed
              realtimeEvents={liveEvents}
              persistedActivity={activity}
              isConnected={isConnected}
              onClear={clearEvents}
            />
          </aside>
        </div>
      </div>
    </main>
  );
}

function Metric({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: "emerald" | "amber" | "cyan";
}) {
  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.03] p-3 text-center">
      <p className="text-[10px] uppercase tracking-wider text-arena-muted truncate">{label}</p>
      <p
        className={`mt-1 font-mono text-xl font-bold truncate ${
          highlight === "emerald"
            ? "text-emerald-400"
            : highlight === "amber"
              ? "text-amber-400"
              : highlight === "cyan"
                ? "text-cyan-400"
                : "text-white"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
