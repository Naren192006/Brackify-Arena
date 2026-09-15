"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase/client";
import { useTournamentRealtime } from "@/hooks/useTournamentRealtime";
import { apiFetch } from "@/lib/api/client";

type TeamInfo = {
  id: string;
  name: string;
  tag: string | null;
  logo_url: string | null;
};

type MatchItem = {
  id: string;
  round_number: number;
  match_number: number;
  status: string;
  team_a_id: string | null;
  team_b_id: string | null;
  winner_team_id: string | null;
  team1_score: number | null;
  team2_score: number | null;
  scheduled_at: string | null;
  completed_at: string | null;
  team1?: TeamInfo | null;
  team2?: TeamInfo | null;
  winner?: TeamInfo | null;
};

type TournamentInfo = {
  id: string;
  title: string;
  slug: string;
  game: string;
  status: string;
  champion_team_id: string | null;
  banner_url: string | null;
  start_time: string | null;
};

export function PublicInteractiveBracket({ tournamentId }: { tournamentId: string }) {
  const [zoom, setZoom] = useState<number>(1);
  const [activeRoundFilter, setActiveRoundFilter] = useState<number | "all">("all");

  // 1. Fetch Tournament
  const tournamentQuery = useQuery<TournamentInfo | null>({
    queryKey: ["public-bracket-tournament", tournamentId],
    queryFn: async () => {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tournamentId);
      const column = isUuid ? "id" : "slug";
      const { data, error } = await supabase
        .from("tournaments")
        .select("id,title,slug,game,status,champion_team_id,banner_url,start_time")
        .eq(column, tournamentId)
        .neq("status", "cancelled")
        .maybeSingle();
      if (error) return null;
      return data;
    },
  });

  const tournament = tournamentQuery.data;
  const actualTournamentId = tournament?.id || tournamentId;

  // Realtime subscription (replaces polling)
  const { isConnected } = useTournamentRealtime({
    tournamentId: actualTournamentId,
    slug: tournament?.slug,
  });

  // 2. Fetch Matches & Teams
  const matchesQuery = useQuery<MatchItem[]>({
    queryKey: ["public-bracket-matches", actualTournamentId],
    enabled: Boolean(actualTournamentId),
    queryFn: async () => {
      return apiFetch<MatchItem[]>(`/api/v1/matches?tournament_id=${actualTournamentId}`);
    },
  });

  // 3. Fetch Champion details if crowned
  const championQuery = useQuery<TeamInfo | null>({
    queryKey: ["public-bracket-champion", tournament?.champion_team_id],
    enabled: Boolean(tournament?.champion_team_id),
    queryFn: async () => {
      if (!tournament?.champion_team_id) return null;
      const { data, error } = await supabase
        .from("teams")
        .select("id,name,tag,logo_url")
        .eq("id", tournament.champion_team_id)
        .single();
      if (error) return null;
      return data;
    },
  });

  const champion = championQuery.data;
  const matches = useMemo(() => matchesQuery.data ?? [], [matchesQuery.data]);

  // Group by round
  const groupedRounds = useMemo(() => {
    const grouped: Record<number, MatchItem[]> = {};
    matches.forEach((m) => {
      const r = m.round_number || 1;
      grouped[r] = grouped[r] || [];
      grouped[r].push(m);
    });
    return grouped;
  }, [matches]);

  const roundNumbers = Object.keys(groupedRounds)
    .map(Number)
    .sort((a, b) => a - b);
  const totalRounds = roundNumbers.length;

  const handleShare = () => {
    if (typeof window !== "undefined") {
      navigator.clipboard.writeText(window.location.href);
      toast.success("Bracket link copied to clipboard! 📋");
    }
  };

  const getRoundLabel = (rNum: number) => {
    if (rNum === totalRounds) return "Grand Finals";
    if (rNum === totalRounds - 1) return "Semifinals";
    if (rNum === totalRounds - 2) return "Quarterfinals";
    return `Round ${rNum}`;
  };

  return (
    <main className="min-h-screen bg-[#070b14] text-arena-text selection:bg-cyan-500/30">
      {/* Top Banner & Tournament Info */}
      <section className="border-b border-arena-border bg-gradient-to-b from-[#0e1628] to-[#070b14] px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div>
            <div className="flex items-center gap-2.5 text-xs text-arena-accent uppercase tracking-widest font-bold">
              <span>{tournament?.game || "Esports"} Tournament</span>
              <span className="text-white/20">•</span>
              <span className="text-emerald-400 font-semibold">{tournament?.status?.toUpperCase()}</span>
            </div>
            <h1 className="mt-2 font-display text-3xl sm:text-4xl font-black tracking-tight text-arena-text">
              {tournament?.title || "Tournament Bracket"}
            </h1>
            <p className="mt-1 text-xs text-arena-muted">
              Live official competitive bracket • Read-only spectator view
            </p>
          </div>

          {/* Controls: Zoom, Navigation, Share */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Zoom Controls */}
            <div className="flex items-center rounded-xl border border-arena-border bg-arena-bg-elevated p-1 text-xs">
              <button
                onClick={() => setZoom((z) => Math.max(0.6, z - 0.1))}
                className="px-2.5 py-1 text-arena-muted hover:text-arena-text transition-colors"
                title="Zoom Out"
              >
                −
              </button>
              <span className="px-2 font-mono text-[11px] text-arena-accent font-semibold">
                {Math.round(zoom * 100)}%
              </span>
              <button
                onClick={() => setZoom((z) => Math.min(1.4, z + 0.1))}
                className="px-2.5 py-1 text-arena-muted hover:text-arena-text transition-colors"
                title="Zoom In"
              >
                +
              </button>
              <button
                onClick={() => setZoom(1)}
                className="border-l border-arena-border ml-1 px-2 py-1 text-[10px] text-arena-muted hover:text-arena-text transition-colors"
                title="Reset Zoom"
              >
                Reset
              </button>
            </div>

            {/* Share Button */}
            <button
              onClick={handleShare}
              className="flex items-center gap-1.5 rounded-xl border border-cyan-400/40 bg-arena-bg-elevated px-3.5 py-2 text-xs font-semibold text-arena-accent hover:bg-cyan-400/20 transition-all shadow-sm"
            >
              <span>🔗</span> Share Bracket
            </button>
          </div>
        </div>

        {/* Champion Showcase Banner (PART 3 & 17) */}
        {champion ? (
          <div className="mx-auto max-w-7xl mt-6">
            <div className="relative overflow-hidden rounded-2xl border border-amber-400/40 bg-gradient-to-r from-amber-500/15 via-yellow-500/10 to-amber-500/20 p-6 text-center shadow-lg shadow-amber-950/30">
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <span className="text-4xl animate-bounce">🏆</span>
                <div className="text-center sm:text-left">
                  <span className="text-[11px] font-bold uppercase tracking-widest text-amber-400">
                    Tournament Champion
                  </span>
                  <h2 className="text-2xl sm:text-3xl font-black text-arena-text">
                    {champion.name} {champion.tag ? `[${champion.tag}]` : ""}
                  </h2>
                </div>
                {champion.logo_url ? (
                  <img
                    src={champion.logo_url}
                    alt={champion.name}
                    className="h-14 w-14 rounded-full border-2 border-amber-400/80 object-cover shadow-md"
                  />
                ) : null}
              </div>
            </div>
          </div>
        ) : null}
      </section>

      {/* Round Filter Tabs */}
      {roundNumbers.length > 1 ? (
        <section className="border-b border-arena-border bg-black/20 px-4 py-2 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-7xl flex items-center gap-2 overflow-x-auto pb-1 text-xs">
            <button
              onClick={() => setActiveRoundFilter("all")}
              className={`rounded-lg px-3 py-1 font-semibold transition-colors ${
                activeRoundFilter === "all"
                  ? "bg-arena-accent text-black shadow-sm font-bold"
                  : "bg-arena-bg-elevated text-arena-muted hover:text-arena-text"
              }`}
            >
              Full Bracket
            </button>
            {roundNumbers.map((rNum) => (
              <button
                key={rNum}
                onClick={() => setActiveRoundFilter(rNum)}
                className={`rounded-lg px-3 py-1 font-semibold transition-colors whitespace-nowrap ${
                  activeRoundFilter === rNum
                    ? "bg-arena-accent text-black shadow-sm font-bold"
                    : "bg-arena-bg-elevated text-arena-muted hover:text-arena-text"
                }`}
              >
                {getRoundLabel(rNum)}
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {/* Bracket Board Canvas */}
      <section className="overflow-x-auto px-4 py-10 sm:px-6 lg:px-8">
        <div
          className="mx-auto flex justify-center transition-transform origin-top"
          style={{ transform: `scale(${zoom})` }}
        >
          {matches.length === 0 ? (
            <div className="rounded-2xl border border-arena-border bg-arena-bg-elevated p-12 text-center max-w-md">
              <span className="text-3xl block mb-2">⚔️</span>
              <h3 className="text-lg font-bold text-arena-text">Bracket Pending Generation</h3>
              <p className="mt-1 text-xs text-arena-muted">
                Matches and seeding will appear here as soon as the tournament administrator starts the event.
              </p>
            </div>
          ) : (
            <div className="flex gap-8 lg:gap-12 items-stretch">
              {roundNumbers
                .filter((rNum) => activeRoundFilter === "all" || activeRoundFilter === rNum)
                .map((rNum) => {
                  const roundMatches = groupedRounds[rNum] || [];
                  return (
                    <div key={rNum} className="flex-1 min-w-[280px] max-w-[340px] flex flex-col space-y-4">
                      {/* Round Header */}
                      <div className="rounded-xl border border-arena-border bg-white/[0.03] p-3 text-center">
                        <h3 className="font-display text-xs font-bold uppercase tracking-wider text-arena-accent">
                          {getRoundLabel(rNum)}
                        </h3>
                        <span className="text-[10px] text-arena-muted font-mono">
                          {roundMatches.length} {roundMatches.length === 1 ? "Match" : "Matches"}
                        </span>
                      </div>

                      {/* Matches in Round */}
                      <div className="flex flex-col justify-around flex-1 space-y-6 py-2">
                        {roundMatches.map((match) => (
                          <PublicMatchCard key={match.id} match={match} />
                        ))}
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

function PublicMatchCard({ match }: { match: MatchItem }) {
  const isCompleted = match.status === "completed";
  const isLive = match.status === "live" || match.status === "in_progress";

  const t1 = match.team1;
  const t2 = match.team2;
  const isT1Winner = isCompleted && match.winner && t1 && match.winner.id === t1.id;
  const isT2Winner = Boolean(isCompleted && match.winner && t2 && match.winner.id === t2.id);

  return (
    <div
      className={`rounded-2xl border p-3.5 transition-all shadow-md relative overflow-hidden ${
        isLive
          ? "border-emerald-500/70 bg-gradient-to-br from-[#0c1e28] via-[#08151f] to-[#050c14] ring-2 ring-emerald-500/30 shadow-emerald-950/40"
          : isCompleted
            ? "border-arena-border bg-black/40"
            : "border-arena-border bg-white/[0.02]"
      }`}
    >
      {isLive ? (
        <div className="absolute top-0 right-0 h-16 w-16 bg-emerald-500/10 blur-xl rounded-full pointer-events-none" />
      ) : null}

      <div className="flex items-center justify-between border-b border-arena-border pb-2 text-[10px]">
        <span className="font-mono font-semibold text-arena-accent">
          Match #{match.match_number}
        </span>
        {isLive ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/50 bg-emerald-500/20 px-2.5 py-0.5 text-[9px] font-bold text-arena-success animate-pulse">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            LIVE NOW
          </span>
        ) : isCompleted ? (
          <span className="text-purple-300 font-semibold text-[9px] uppercase tracking-wider">FINAL</span>
        ) : (
          <span className="text-arena-muted text-[9px] uppercase tracking-wider">UPCOMING</span>
        )}
      </div>

      <div className="mt-2.5 space-y-1.5 text-xs">
        {/* Team 1 */}
        <div
          className={`flex items-center justify-between rounded-xl border p-2 transition-colors ${
            isT1Winner
              ? "border-emerald-500/50 bg-emerald-500/15 text-arena-text font-bold shadow-sm"
              : isCompleted
                ? "border-transparent text-arena-muted opacity-60"
                : "border-arena-border bg-white/[0.02] text-arena-text"
          }`}
        >
          <div className="flex items-center gap-2 truncate">
            {t1?.logo_url ? (
              <img src={t1.logo_url} alt="" className="h-5 w-5 rounded object-cover" />
            ) : (
              <div className="flex h-5 w-5 items-center justify-center rounded bg-cyan-400/20 text-[9px] font-bold text-arena-accent">
                {t1 ? t1.name.slice(0, 1) : "?"}
              </div>
            )}
            <span className="truncate">{t1?.name || "TBD"}</span>
            {isT1Winner ? <span className="text-xs">🏆</span> : null}
          </div>
          <span className="font-mono text-xs font-bold text-arena-accent">{match.team1_score ?? "—"}</span>
        </div>

        {/* Team 2 */}
        <div
          className={`flex items-center justify-between rounded-xl border p-2 transition-colors ${
            isT2Winner
              ? "border-emerald-500/50 bg-emerald-500/15 text-arena-text font-bold shadow-sm"
              : isCompleted
                ? "border-transparent text-arena-muted opacity-60"
                : "border-arena-border bg-white/[0.02] text-arena-text"
          }`}
        >
          <div className="flex items-center gap-2 truncate">
            {t2?.logo_url ? (
              <img src={t2.logo_url} alt="" className="h-5 w-5 rounded object-cover" />
            ) : (
              <div className="flex h-5 w-5 items-center justify-center rounded bg-cyan-400/20 text-[9px] font-bold text-arena-accent">
                {t2 ? t2.name.slice(0, 1) : "?"}
              </div>
            )}
            <span className="truncate">{t2?.name || "TBD"}</span>
            {isT2Winner ? <span className="text-xs">🏆</span> : null}
          </div>
          <span className="font-mono text-xs font-bold text-arena-accent">{match.team2_score ?? "—"}</span>
        </div>
      </div>
    </div>
  );
}
