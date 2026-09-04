"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase/client";
import { useLiveBracket } from "@/hooks/useLiveBracket";
import {
  finishMatchApi,
  getMatchesApi,
  pauseMatchApi,
  progressTournamentApi,
  resetMatchApi,
  setMatchWinnerApi,
  startMatchApi,
} from "@/lib/admin/tournaments";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TeamItem = {
  id: string;
  name: string;
  tag: string | null;
  logo_url: string | null;
};

type MatchItem = {
  id: string;
  tournament_id: string;
  bracket_id?: string;
  round: number;
  round_number: number;
  match_number: number;
  status: "scheduled" | "live" | "paused" | "completed" | "cancelled" | "pending";
  team1: TeamItem | null;
  team2: TeamItem | null;
  winner: TeamItem | null;
  team1_score: number | null;
  team2_score: number | null;
  scheduled_at: string | null;
  completed_at: string | null;
};

type TournamentChoice = {
  id: string;
  title: string;
  slug: string;
  status: string;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getRoundLabel(roundNumber: number, totalRounds: number): string {
  if (roundNumber === totalRounds) return "Grand Finals";
  if (roundNumber === totalRounds - 1) return "Semifinals";
  if (roundNumber === totalRounds - 2) return "Quarterfinals";
  return `Round ${roundNumber}`;
}

function MatchStatusBadge({ status }: { status: MatchItem["status"] }) {
  switch (status) {
    case "live":
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-400 animate-pulse">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          Live
        </span>
      );
    case "completed":
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-purple-400/30 bg-purple-400/10 px-2 py-0.5 text-[10px] font-semibold text-purple-300">
          Completed
        </span>
      );
    case "paused":
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/30 bg-amber-400/10 px-2 py-0.5 text-[10px] font-semibold text-amber-300">
          Paused
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-semibold text-arena-muted">
          Scheduled
        </span>
      );
  }
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function AdminBracketView({ initialTournamentId }: { initialTournamentId?: string } = {}) {
  const queryClient = useQueryClient();
  const [selectedTournamentId, setSelectedTournamentId] = useState<string>(initialTournamentId || "");
  const [activeActionId, setActiveActionId] = useState<string | null>(null);

  // ── 1. Fetch Tournaments for Selector ──────────────────────────────────────
  const tournamentsQuery = useQuery<TournamentChoice[]>({
    queryKey: ["admin-brackets-tournaments-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tournaments")
        .select("id,title,slug,status")
        .order("created_at", { ascending: false });
      if (error) throw error;
      const list = data ?? [];
      if (list.length > 0 && !selectedTournamentId && !initialTournamentId) {
        setSelectedTournamentId(list[0].id);
      }
      return list;
    },
  });

  const activeTournamentId = selectedTournamentId || initialTournamentId || tournamentsQuery.data?.[0]?.id || "";

  // ── 2. Fetch Matches for Selected Tournament ──────────────────────────────
  // Realtime subscription handles match & tournament updates instantly — polling removed
  const matchesQuery = useQuery<MatchItem[]>({
    queryKey: ["admin-matches", activeTournamentId],
    enabled: Boolean(activeTournamentId),
    queryFn: async () => {
      return getMatchesApi(activeTournamentId);
    },
    refetchOnWindowFocus: true,
  });

  // Enable live Supabase Realtime synchronization for active admin tournament
  useLiveBracket({
    tournamentId: activeTournamentId,
    enableNotifications: false,
  });

  // ── 3. Action Mutations ───────────────────────────────────────────────────
  const invalidateMatches = () => {
    void queryClient.invalidateQueries({ queryKey: ["admin-matches", activeTournamentId] });
    void queryClient.invalidateQueries({ queryKey: ["admin-control-room-metrics"] });
    void queryClient.invalidateQueries({ queryKey: ["admin-control-room-tournaments"] });
  };

  const startMatchMutation = useMutation({
    mutationFn: async (matchId: string) => {
      setActiveActionId(matchId);
      return startMatchApi(matchId);
    },
    onSuccess: () => {
      toast.success("Match marked as LIVE.");
      invalidateMatches();
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to start match");
    },
    onSettled: () => setActiveActionId(null),
  });

  const pauseMatchMutation = useMutation({
    mutationFn: async (matchId: string) => {
      setActiveActionId(matchId);
      return pauseMatchApi(matchId);
    },
    onSuccess: () => {
      toast.success("Match paused.");
      invalidateMatches();
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to pause match");
    },
    onSettled: () => setActiveActionId(null),
  });

  const finishMatchMutation = useMutation({
    mutationFn: async (matchId: string) => {
      setActiveActionId(matchId);
      return finishMatchApi(matchId);
    },
    onSuccess: () => {
      toast.success("Match completed.");
      invalidateMatches();
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to complete match");
    },
    onSettled: () => setActiveActionId(null),
  });

  const setWinnerMutation = useMutation({
    mutationFn: async ({
      matchId,
      choice,
      teamId,
    }: {
      matchId: string;
      choice: "team1" | "team2";
      teamId?: string;
    }) => {
      setActiveActionId(matchId);
      return setMatchWinnerApi(matchId, choice, teamId);
    },
    onSuccess: (data) => {
      if (data.champion_crowned) {
        toast.success("🏆 Final match complete! Champion crowned!");
      } else if (data.advanced_to_round) {
        toast.success(`Winner advanced to Round ${data.advanced_to_round}, Match ${data.advanced_to_match}!`);
      } else {
        toast.success("Winner recorded & match marked complete.");
      }
      invalidateMatches();
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to advance winner");
    },
    onSettled: () => setActiveActionId(null),
  });

  const progressMutation = useMutation({
    mutationFn: async (tId: string) => {
      return progressTournamentApi(tId);
    },
    onSuccess: (data) => {
      if (data.champion) {
        toast.success(`🏆 Tournament completed! Champion: ${data.champion.name}`);
      } else {
        toast.success(`Bracket progressed! Current Round: ${data.current_round}`);
      }
      invalidateMatches();
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to auto-progress tournament");
    },
  });

  const resetMatchMutation = useMutation({
    mutationFn: async (matchId: string) => {
      setActiveActionId(matchId);
      return resetMatchApi(matchId);
    },
    onSuccess: () => {
      toast.success("Match reset successfully. Scores, timestamps & winner cleared.");
      invalidateMatches();
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to reset match");
    },
    onSettled: () => setActiveActionId(null),
  });

  // ── 4. Group Matches by Round ─────────────────────────────────────────────
  const matches = matchesQuery.data ?? [];
  const roundsGrouped = useMemo(() => {
    const grouped: Record<number, MatchItem[]> = {};
    matches.forEach((m) => {
      const r = m.round_number || m.round || 1;
      grouped[r] = grouped[r] || [];
      grouped[r].push(m);
    });
    return grouped;
  }, [matches]);

  const roundNumbers = Object.keys(roundsGrouped)
    .map(Number)
    .sort((a, b) => a - b);
  const totalRounds = roundNumbers.length > 0 ? Math.max(...roundNumbers) : 1;

  // Selected tournament details
  const currentTournament = (tournamentsQuery.data ?? []).find(
    (t) => t.id === activeTournamentId
  );

  const completedMatchesCount = matches.filter((m) => m.status === "completed").length;
  const liveMatchesCount = matches.filter((m) => m.status === "live").length;
  const remainingMatchesCount = matches.length - completedMatchesCount;

  // Find champion if final match completed
  const finalMatch = matches.find(
    (m) => (m.round_number === totalRounds || m.round === totalRounds) && m.match_number === 1
  );
  const championTeam = finalMatch?.status === "completed" ? finalMatch.winner : null;

  // Compute current round
  const uncompletedRounds = matches
    .filter((m) => m.status !== "completed")
    .map((m) => m.round_number || m.round || 1);
  const currentActiveRound = uncompletedRounds.length > 0 ? Math.min(...uncompletedRounds) : totalRounds;

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 space-y-6">
      {/* ── Page Header ──────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-5">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-arena-accent font-semibold">
            Admin Management
          </p>
          <h1 className="mt-1 font-display text-3xl font-bold text-white tracking-tight">
            Brackets & Match Coordination
          </h1>
          <p className="mt-1 text-sm text-arena-muted">
            Live match progression, score arbitration, winner advancement, and bracket generation.
          </p>
        </div>

        {/* Tournament Selector & Actions */}
        <div className="flex items-center gap-3">
          <select
            value={activeTournamentId}
            onChange={(e) => setSelectedTournamentId(e.target.value)}
            className="rounded-xl border border-white/10 bg-[#0c101c] px-3.5 py-2 text-xs font-semibold text-white focus:border-cyan-400/50 focus:outline-none"
          >
            {(tournamentsQuery.data ?? []).map((t) => (
              <option key={t.id} value={t.id}>
                {t.title} ({t.status})
              </option>
            ))}
          </select>

          <button
            disabled={progressMutation.isPending || !activeTournamentId}
            onClick={() => progressMutation.mutate(activeTournamentId)}
            className="rounded-xl border border-cyan-400/40 bg-cyan-400/15 px-3.5 py-2 text-xs font-semibold text-arena-accent hover:bg-cyan-400/25 disabled:opacity-50 transition-colors shadow-sm"
          >
            {progressMutation.isPending ? "Syncing…" : "⚡ Auto-Progress"}
          </button>

          <button
            onClick={() => invalidateMatches()}
            className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-arena-muted hover:text-white transition-colors"
          >
            ↻ Refresh
          </button>
        </div>
      </div>

      {/* ── Champion Podium Banner (When Crowned) ─────────────────────────── */}
      {championTeam ? (
        <section className="rounded-2xl border border-amber-400/40 bg-gradient-to-r from-amber-950/40 via-purple-950/30 to-black/60 p-5 shadow-xl shadow-amber-950/20">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-amber-400/50 bg-amber-400/20 text-2xl shadow-lg">
                🏆
              </span>
              <div>
                <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-amber-300">
                  Tournament Champion Crowned
                </span>
                <h2 className="font-display text-2xl font-bold text-white">
                  {championTeam.name}{" "}
                  {championTeam.tag ? (
                    <span className="text-arena-accent font-normal">[{championTeam.tag}]</span>
                  ) : null}
                </h2>
              </div>
            </div>
            <span className="rounded-full border border-purple-400/30 bg-purple-400/20 px-3 py-1 text-xs font-semibold text-purple-200">
              ✓ Tournament Completed
            </span>
          </div>
        </section>
      ) : null}

      {/* ── Bracket Summary Bar ───────────────────────────────────────────── */}
      {currentTournament ? (
        <section className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/[0.02] p-4 text-xs">
          <div className="flex items-center gap-3">
            <span className="font-semibold text-white text-sm">{currentTournament.title}</span>
            <span className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-2.5 py-0.5 font-mono text-[11px] text-arena-accent uppercase">
              {currentTournament.status}
            </span>
            <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 font-mono text-[11px] text-white">
              Round {currentActiveRound} of {totalRounds}
            </span>
          </div>

          <div className="flex items-center gap-6 text-arena-muted">
            <div>
              Total: <span className="font-semibold text-white font-mono">{matches.length}</span>
            </div>
            <div>
              Live:{" "}
              <span className="font-semibold text-emerald-400 font-mono">{liveMatchesCount}</span>
            </div>
            <div>
              Completed:{" "}
              <span className="font-semibold text-purple-300 font-mono">{completedMatchesCount}</span>
            </div>
            <div>
              Remaining:{" "}
              <span className="font-semibold text-yellow-300 font-mono">{remainingMatchesCount}</span>
            </div>
            <Link
              href={`/tournaments/${currentTournament.slug}/bracket`}
              className="text-arena-accent hover:underline font-medium"
            >
              Public Bracket →
            </Link>
          </div>
        </section>
      ) : null}

      {/* ── Interactive Bracket Board ─────────────────────────────────────── */}
      <section className="space-y-4">
        {matchesQuery.isLoading ? (
          <div className="h-96 rounded-2xl border border-white/10 bg-white/[0.02] flex items-center justify-center text-arena-muted animate-pulse">
            Loading bracket matches…
          </div>
        ) : matches.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-12 text-center">
            <p className="text-white font-semibold">No matches generated for this tournament yet.</p>
            <p className="text-xs text-arena-muted mt-1">
              Start the tournament from the Control Room to generate Round 1 single-elimination matches.
            </p>
            <Link
              href="/admin/control-room"
              className="mt-4 inline-block rounded-xl border border-cyan-400/40 bg-cyan-400/20 px-4 py-2 text-xs font-semibold text-arena-accent hover:bg-cyan-400/30"
            >
              Go to Control Room →
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto pb-6">
            <div className="flex min-w-[900px] items-stretch gap-8">
              {roundNumbers.map((rNum) => {
                const roundMatches = roundsGrouped[rNum] ?? [];
                const label = getRoundLabel(rNum, totalRounds);

                return (
                  <div key={rNum} className="flex-1 min-w-[320px] max-w-[380px] flex flex-col space-y-4">
                    {/* Round Header */}
                    <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3 text-center shadow-sm">
                      <h3 className="font-display text-sm font-bold uppercase tracking-wider text-white">
                        {label}
                      </h3>
                      <p className="text-[10px] text-arena-muted font-mono mt-0.5">
                        {roundMatches.length} {roundMatches.length === 1 ? "Match" : "Matches"}
                      </p>
                    </div>

                    {/* Round Match Cards */}
                    <div className="flex flex-col justify-around flex-1 space-y-5 py-2">
                      {roundMatches.map((match) => (
                        <AdminMatchCard
                          key={match.id}
                          match={match}
                          isBusy={activeActionId === match.id}
                          onStart={() => startMatchMutation.mutate(match.id)}
                          onPause={() => pauseMatchMutation.mutate(match.id)}
                          onFinish={() => finishMatchMutation.mutate(match.id)}
                          onReset={() => resetMatchMutation.mutate(match.id)}
                          onSelectWinner={(choice, teamId) =>
                            setWinnerMutation.mutate({ matchId: match.id, choice, teamId })
                          }
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>
    </main>
  );
}

// ---------------------------------------------------------------------------
// Admin Match Card Component
// ---------------------------------------------------------------------------

function AdminMatchCard({
  match,
  isBusy,
  onStart,
  onPause,
  onFinish,
  onReset,
  onSelectWinner,
}: {
  match: MatchItem;
  isBusy: boolean;
  onStart: () => void;
  onPause: () => void;
  onFinish: () => void;
  onReset: () => void;
  onSelectWinner: (choice: "team1" | "team2", teamId?: string) => void;
}) {
  const isCompleted = match.status === "completed";
  const isLive = match.status === "live";
  const isPaused = match.status === "paused";

  const t1 = match.team1;
  const t2 = match.team2;
  const isT1Winner = isCompleted && match.winner && t1 && match.winner.id === t1.id;
  const isT2Winner = Boolean(isCompleted && match.winner && t2 && match.winner.id === t2.id);
  const isBye = Boolean(t1 && !t2);

  return (
    <div
      className={`rounded-2xl border p-4 transition-all shadow-md ${
        isLive
          ? "border-emerald-500/50 bg-gradient-to-b from-emerald-950/20 to-black/40 shadow-emerald-950/30"
          : isCompleted
            ? "border-white/10 bg-black/40"
            : isPaused
              ? "border-amber-500/40 bg-black/40"
              : "border-white/10 bg-white/[0.03] hover:border-cyan-400/30"
      }`}
    >
      {/* Header: Match #, Round, and Status */}
      <div className="flex items-center justify-between border-b border-white/5 pb-2.5">
        <div>
          <span className="text-[11px] font-mono font-semibold text-arena-accent">
            Round {match.round_number || match.round} • M#{match.match_number}
          </span>
          {match.scheduled_at ? (
            <span className="block text-[9px] text-arena-muted font-mono">
              Started: {new Date(match.scheduled_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
          ) : null}
        </div>
        <div className="flex flex-col items-end gap-1">
          <MatchStatusBadge status={match.status} />
          {match.completed_at ? (
            <span className="text-[9px] text-purple-300 font-mono">
              Done: {new Date(match.completed_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
          ) : null}
        </div>
      </div>

      {/* Teams Slot Board */}
      <div className="mt-3 space-y-2 text-xs">
        {/* Team 1 Slot */}
        <div
          className={`flex items-center justify-between rounded-xl border p-2.5 transition-colors ${
            isT1Winner
              ? "border-emerald-500/50 bg-emerald-500/10 text-white font-bold shadow-sm"
              : isCompleted && !isT1Winner
                ? "border-transparent bg-white/[0.01] text-arena-muted opacity-60"
                : "border-white/5 bg-white/[0.02] text-white"
          }`}
        >
          <div className="flex items-center gap-2.5 truncate">
            {t1?.logo_url ? (
              <img src={t1.logo_url} alt="" className="h-6 w-6 rounded object-cover" />
            ) : (
              <div className="flex h-6 w-6 items-center justify-center rounded bg-cyan-400/20 text-[10px] font-bold text-arena-accent">
                {t1 ? t1.name.slice(0, 1) : "?"}
              </div>
            )}
            <div className="truncate">
              <span className="truncate">{t1?.name || "TBD (Awaiting Match)"}</span>
              {t1?.tag ? <span className="ml-1 text-[10px] text-arena-accent font-normal">[{t1.tag}]</span> : null}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isT1Winner ? (
              <span className="text-[11px] font-bold text-emerald-400">WINNER ✓</span>
            ) : null}
            <span className="font-mono text-sm font-semibold">{match.team1_score ?? "—"}</span>
          </div>
        </div>

        {/* Team 2 Slot */}
        <div
          className={`flex items-center justify-between rounded-xl border p-2.5 transition-colors ${
            isT2Winner
              ? "border-emerald-500/50 bg-emerald-500/10 text-white font-bold shadow-sm"
              : isCompleted && !isT2Winner
                ? "border-transparent bg-white/[0.01] text-arena-muted opacity-60"
                : "border-white/5 bg-white/[0.02] text-white"
          }`}
        >
          <div className="flex items-center gap-2.5 truncate">
            {t2?.logo_url ? (
              <img src={t2.logo_url} alt="" className="h-6 w-6 rounded object-cover" />
            ) : (
              <div className="flex h-6 w-6 items-center justify-center rounded bg-cyan-400/20 text-[10px] font-bold text-arena-accent">
                {t2 ? t2.name.slice(0, 1) : "—"}
              </div>
            )}
            <div className="truncate">
              <span className="truncate">{t2?.name || (isBye ? "BYE" : "TBD (Awaiting Match)")}</span>
              {t2?.tag ? <span className="ml-1 text-[10px] text-arena-accent font-normal">[{t2.tag}]</span> : null}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isT2Winner ? (
              <span className="text-[11px] font-bold text-emerald-400">WINNER ✓</span>
            ) : null}
            <span className="font-mono text-sm font-semibold">{match.team2_score ?? "—"}</span>
          </div>
        </div>
      </div>

      {/* Admin Action Controls & Winner Selection */}
      <div className="mt-3.5 pt-3 border-t border-white/5 space-y-2">
        {/* Match State Controls */}
        <div className="flex items-center gap-1.5 text-xs">
          {!isLive && !isCompleted ? (
            <button
              disabled={isBusy || !t1}
              onClick={onStart}
              className="flex-1 rounded-lg border border-emerald-500/40 bg-emerald-500/15 py-1.5 text-[11px] font-semibold text-emerald-300 hover:bg-emerald-500/25 disabled:opacity-40 transition-colors"
            >
              {isBusy ? "Starting…" : "▶ Start Match"}
            </button>
          ) : null}

          {isLive ? (
            <>
              <button
                disabled={isBusy}
                onClick={onPause}
                className="flex-1 rounded-lg border border-amber-500/40 bg-amber-500/15 py-1.5 text-[11px] font-semibold text-amber-300 hover:bg-amber-500/25 disabled:opacity-40 transition-colors"
              >
                ⏸ Pause
              </button>
              <button
                disabled={isBusy}
                onClick={onFinish}
                className="flex-1 rounded-lg border border-purple-500/40 bg-purple-500/15 py-1.5 text-[11px] font-semibold text-purple-300 hover:bg-purple-500/25 disabled:opacity-40 transition-colors"
              >
                ⏹ Finish
              </button>
            </>
          ) : null}

          {isPaused ? (
            <button
              disabled={isBusy}
              onClick={onStart}
              className="flex-1 rounded-lg border border-emerald-500/40 bg-emerald-500/15 py-1.5 text-[11px] font-semibold text-emerald-300 hover:bg-emerald-500/25 disabled:opacity-40 transition-colors"
            >
              ▶ Resume Match
            </button>
          ) : null}
        </div>

        {/* Winner Selection Buttons */}
        {!isCompleted && t1 ? (
          <div>
            <span className="block text-[10px] uppercase tracking-wider text-arena-muted mb-1 font-medium">
              Select Winner & Advance:
            </span>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                disabled={isBusy || !t1}
                onClick={() => onSelectWinner("team1", t1?.id)}
                className="rounded-lg border border-cyan-400/30 bg-cyan-400/10 px-2 py-1.5 text-[11px] font-semibold text-arena-accent hover:bg-cyan-400/20 disabled:opacity-40 truncate transition-colors text-center"
                title={`Advance ${t1?.name}`}
              >
                {t1?.name || "Team 1"} Wins
              </button>

              <button
                disabled={isBusy || !t2 || isBye}
                onClick={() => onSelectWinner("team2", t2?.id)}
                className="rounded-lg border border-cyan-400/30 bg-cyan-400/10 px-2 py-1.5 text-[11px] font-semibold text-arena-accent hover:bg-cyan-400/20 disabled:opacity-40 truncate transition-colors text-center"
                title={t2 ? `Advance ${t2.name}` : "No opponent"}
              >
                {t2?.name || "Team 2"} Wins
              </button>
            </div>
          </div>
        ) : null}

        {/* Reset Match (Admin only) */}
        <button
          disabled={isBusy}
          onClick={onReset}
          className="w-full rounded-lg border border-red-500/20 bg-red-500/5 py-1 text-[10px] font-medium text-red-400 hover:bg-red-500/15 disabled:opacity-40 transition-colors"
          title="Reset match scores, timestamps, and downstream advancement"
        >
          ↺ Reset Match (Admin only)
        </button>
      </div>
    </div>
  );
}
