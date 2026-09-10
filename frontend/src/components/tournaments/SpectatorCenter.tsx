"use client";

import Link from "next/link";
import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getLiveTournament } from "@/lib/tournaments/live";
import { useTournamentRealtime } from "@/hooks/useTournamentRealtime";
import { LiveScoreboard } from "@/components/tournaments/LiveScoreboard";
import { LiveEventFeed } from "@/components/realtime/LiveEventFeed";
import { PublicInteractiveBracket } from "@/components/brackets/PublicInteractiveBracket";

interface SpectatorCenterProps {
  slug: string;
}

export function SpectatorCenter({ slug }: SpectatorCenterProps) {
  const [activeTab, setActiveTab] = useState<"overview" | "bracket" | "feed">("overview");
  const [viewerCount, setViewerCount] = useState<number>(148);

  // 1. Fetch initial live tournament state (no polling, pure realtime updates)
  const query = useQuery({
    queryKey: ["live-tournament", slug],
    queryFn: () => getLiveTournament(slug),
  });

  const tournament = query.data?.tournament;
  const actualTournamentId = tournament?.id || "";

  // 2. Realtime subscription (no polling, real-time events)
  const { isConnected, liveEvents, clearEvents } = useTournamentRealtime({
    tournamentId: actualTournamentId,
    slug,
  });

  // Simulated natural live spectator viewer count drift
  useEffect(() => {
    const interval = setInterval(() => {
      setViewerCount((prev) => {
        const delta = Math.floor(Math.random() * 7) - 3;
        return Math.max(85, prev + delta);
      });
    }, 4500);
    return () => clearInterval(interval);
  }, []);

  // Compute current round
  const currentRoundNumber = useMemo(() => {
    if (!query.data?.rounds) return null;
    const current = query.data.rounds.find((r) => r.completed < r.total);
    return current?.round ?? null;
  }, [query.data?.rounds]);

  if (query.isLoading) {
    return (
      <main className="min-h-screen bg-[#070b14] px-4 py-12 text-white">
        <div className="mx-auto max-w-7xl animate-pulse space-y-6">
          <div className="h-48 rounded-2xl bg-white/5" />
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2 h-96 rounded-2xl bg-white/5" />
            <div className="h-96 rounded-2xl bg-white/5" />
          </div>
        </div>
      </main>
    );
  }

  if (query.isError || !query.data) {
    return (
      <main className="min-h-screen bg-[#070b14] px-4 py-12 text-white text-center">
        <div className="mx-auto max-w-md rounded-2xl border border-rose-500/30 bg-rose-950/20 p-8">
          <span className="text-3xl block mb-2">⚠️</span>
          <h2 className="text-lg font-bold text-white">Unable to load spectator stream</h2>
          <p className="mt-1 text-xs text-arena-muted">
            The tournament could not be found or has not been scheduled yet.
          </p>
          <Link
            href="/tournaments"
            className="mt-4 inline-block rounded-xl bg-white/10 px-4 py-2 text-xs font-semibold text-white hover:bg-white/20"
          >
            Browse Tournaments
          </Link>
        </div>
      </main>
    );
  }

  const { matches, activity, stats, rounds } = query.data;

  return (
    <main className="min-h-screen bg-[#070b14] text-white selection:bg-cyan-500/30">
      {/* ── Top Spectator Control & Live Bar ────────────────────────────── */}
      <section className="border-b border-white/10 bg-[#0c1322] px-4 py-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link
              href={`/tournaments/${slug}`}
              className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-arena-muted hover:text-white transition-colors"
            >
              ← Tournament Hub
            </Link>
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-ping" />
              <span className="font-display text-sm font-black uppercase tracking-wider text-white">
                Spectator Mode
              </span>
            </div>
          </div>

          {/* Realtime Badges: Viewers, Connection, Status */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Live Viewer Counter Placeholder */}
            <div className="flex items-center gap-1.5 rounded-full border border-purple-500/30 bg-purple-500/10 px-3 py-1 text-xs font-bold text-purple-300">
              <span className="text-sm">👁️</span>
              <span className="font-mono">{viewerCount.toLocaleString()}</span>
              <span className="text-[10px] uppercase text-purple-400 font-semibold tracking-wider">
                Spectators
              </span>
            </div>

            {/* Realtime Connected Badge */}
            <div className="flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-bold text-emerald-300">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="font-mono text-[11px]">
                {isConnected ? "REALTIME SYNC" : "CONNECTING..."}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ── Tournament Banner & Quick Stats ─────────────────────────────── */}
      <section className="relative overflow-hidden border-b border-white/10 bg-gradient-to-b from-[#0e1628] to-[#070b14] px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
            <div>
              <div className="flex items-center gap-2 text-xs text-arena-accent font-bold uppercase tracking-widest">
                <span>{tournament?.game || "VALORANT"}</span>
                <span>•</span>
                <span>{tournament?.mode || "5v5"}</span>
                <span>•</span>
                <span className="text-emerald-400">{tournament?.status?.toUpperCase()}</span>
              </div>
              <h1 className="mt-2 font-display text-3xl sm:text-4xl font-black text-white">
                {tournament?.title}
              </h1>
            </div>

            {/* Tournament Metrics Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-center">
                <p className="text-[10px] uppercase tracking-wider text-arena-muted">Live Matches</p>
                <p className="font-mono text-xl font-bold text-emerald-400">{stats.live}</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-center">
                <p className="text-[10px] uppercase tracking-wider text-arena-muted">Finished</p>
                <p className="font-mono text-xl font-bold text-white">{stats.completed}</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-center">
                <p className="text-[10px] uppercase tracking-wider text-arena-muted">Remaining</p>
                <p className="font-mono text-xl font-bold text-cyan-400">{stats.remaining}</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-center">
                <p className="text-[10px] uppercase tracking-wider text-arena-muted">Current Round</p>
                <p className="font-mono text-xl font-bold text-amber-400">
                  {currentRoundNumber ? `R${currentRoundNumber}` : "—"}
                </p>
              </div>
            </div>
          </div>

          {/* Navigation View Switcher Tabs */}
          <div className="mt-8 flex gap-2 border-t border-white/5 pt-4">
            <button
              onClick={() => setActiveTab("overview")}
              className={`rounded-xl px-4 py-2 text-xs font-bold transition-colors ${
                activeTab === "overview"
                  ? "bg-cyan-400 text-black shadow-md font-black"
                  : "bg-white/5 text-arena-muted hover:text-white"
              }`}
            >
              📊 Live Overview & Feed
            </button>
            <button
              onClick={() => setActiveTab("bracket")}
              className={`rounded-xl px-4 py-2 text-xs font-bold transition-colors ${
                activeTab === "bracket"
                  ? "bg-cyan-400 text-black shadow-md font-black"
                  : "bg-white/5 text-arena-muted hover:text-white"
              }`}
            >
              ⚔️ Full Bracket View
            </button>
            <button
              onClick={() => setActiveTab("feed")}
              className={`rounded-xl px-4 py-2 text-xs font-bold transition-colors ${
                activeTab === "feed"
                  ? "bg-cyan-400 text-black shadow-md font-black"
                  : "bg-white/5 text-arena-muted hover:text-white"
              }`}
            >
              📡 Live Activity Stream
            </button>
          </div>
        </div>
      </section>

      {/* ── Main Tab Content ────────────────────────────────────────────── */}
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {activeTab === "overview" ? (
          <div className="grid gap-8 lg:grid-cols-[1.4fr_0.8fr]">
            {/* Live Scoreboard */}
            <LiveScoreboard
              slug={slug}
              matches={matches}
              rounds={rounds}
              currentRoundNumber={currentRoundNumber}
              spectatorMode
            />

            {/* Realtime Event Feed */}
            <LiveEventFeed
              realtimeEvents={liveEvents}
              persistedActivity={activity}
              isConnected={isConnected}
              onClear={clearEvents}
            />
          </div>
        ) : activeTab === "bracket" ? (
          <div className="rounded-2xl border border-white/10 bg-[#0d1322]/60 p-4">
            <PublicInteractiveBracket tournamentId={actualTournamentId} />
          </div>
        ) : (
          <div className="max-w-2xl mx-auto">
            <LiveEventFeed
              realtimeEvents={liveEvents}
              persistedActivity={activity}
              isConnected={isConnected}
              onClear={clearEvents}
              maxEvents={50}
            />
          </div>
        )}
      </div>
    </main>
  );
}
