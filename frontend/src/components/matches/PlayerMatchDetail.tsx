"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { getMatchDetailApi } from "@/lib/admin/tournaments";
import { createReportApi } from "@/lib/reports/fair_play";
import { useTournamentRealtime } from "@/hooks/useTournamentRealtime";
import { MatchStatusChip } from "@/components/matches/MatchStatusChip";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TeamDetail = {
  id: string;
  name: string;
  tag: string | null;
  logo_url: string | null;
};

type MatchDetailResponse = {
  id: string;
  tournament_id: string;
  tournament_title: string;
  tournament_slug: string;
  tournament_game: string;
  tournament_mode: string;
  tournament_status: string;
  tournament_banner_url: string | null;
  round: number;
  round_number: number;
  round_name: string;
  match_number: number;
  status: "scheduled" | "live" | "paused" | "completed" | "cancelled" | "pending" | "awaiting_approval" | "reported";
  scheduled_at: string | null;
  completed_at: string | null;
  map_name: string;
  team1: TeamDetail | null;
  team2: TeamDetail | null;
  winner: TeamDetail | null;
  loser: TeamDetail | null;
  team1_score: number | null;
  team2_score: number | null;
};

// ---------------------------------------------------------------------------
// Countdown Component
// ---------------------------------------------------------------------------

function CountdownClock({ targetIso }: { targetIso: string }) {
  const [timeLeft, setTimeLeft] = useState<{
    hours: number;
    minutes: number;
    seconds: number;
    isPast: boolean;
  }>({ hours: 0, minutes: 0, seconds: 0, isPast: false });

  useEffect(() => {
    const calculateTime = () => {
      const diff = new Date(targetIso).getTime() - Date.now();
      if (diff <= 0) {
        setTimeLeft({ hours: 0, minutes: 0, seconds: 0, isPast: true });
        return;
      }
      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);
      setTimeLeft({ hours, minutes, seconds, isPast: false });
    };

    calculateTime();
    const timer = setInterval(calculateTime, 1000);
    return () => clearInterval(timer);
  }, [targetIso]);

  if (timeLeft.isPast) {
    return (
      <div className="flex items-center gap-1.5 font-mono text-xs font-semibold text-arena-accent animate-pulse">
        <span>⏰ Match scheduled time reached</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 font-mono">
      <div className="flex flex-col items-center rounded-lg border border-arena-border bg-black/40 px-3 py-1.5">
        <span className="text-lg font-bold text-arena-text leading-none">
          {String(timeLeft.hours).padStart(2, "0")}
        </span>
        <span className="text-[9px] uppercase tracking-wider text-arena-muted mt-0.5">Hours</span>
      </div>
      <span className="text-arena-accent font-bold text-lg">:</span>
      <div className="flex flex-col items-center rounded-lg border border-arena-border bg-black/40 px-3 py-1.5">
        <span className="text-lg font-bold text-arena-text leading-none">
          {String(timeLeft.minutes).padStart(2, "0")}
        </span>
        <span className="text-[9px] uppercase tracking-wider text-arena-muted mt-0.5">Mins</span>
      </div>
      <span className="text-arena-accent font-bold text-lg">:</span>
      <div className="flex flex-col items-center rounded-lg border border-arena-border bg-black/40 px-3 py-1.5">
        <span className="text-lg font-bold text-cyan-400 leading-none">
          {String(timeLeft.seconds).padStart(2, "0")}
        </span>
        <span className="text-[9px] uppercase tracking-wider text-arena-muted mt-0.5">Secs</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Player Match Component
// ---------------------------------------------------------------------------

export function PlayerMatchDetail({ matchId }: { matchId: string }) {
  const [isReportOpen, setIsReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState("Cheating / Third-Party Software");
  const [reportDescription, setReportDescription] = useState("");

  // 1. Fetch match details without polling
  const matchQuery = useQuery<MatchDetailResponse>({
    queryKey: ["player-match-detail", matchId],
    queryFn: async () => {
      return getMatchDetailApi(matchId);
    },
  });

  const m = matchQuery.data;

  // 2. Realtime Event Hook with Offline Recovery
  const { isConnected, isReconnecting, reconnect } = useTournamentRealtime({
    tournamentId: m?.tournament_id,
    slug: m?.tournament_slug,
    matchId,
    enableToasts: true,
  });

  const reportMutation = useMutation({
    mutationFn: async (payload: {
      tournament_id: string;
      match_id: string;
      reason: string;
      description: string;
    }) => {
      return createReportApi(payload);
    },
    onSuccess: () => {
      toast.success("Fair play report submitted to tournament moderators.");
      setIsReportOpen(false);
      setReportDescription("");
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to submit report");
    },
  });

  if (matchQuery.isLoading) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-16 text-center animate-pulse">
        <div className="h-10 w-48 mx-auto rounded-lg bg-arena-bg-elevated mb-4" />
        <div className="h-64 rounded-3xl bg-arena-bg-elevated border border-arena-border" />
      </div>
    );
  }

  if (matchQuery.isError || !m) {
    return (
      <div className="mx-auto max-w-xl px-4 py-20 text-center">
        <span className="text-4xl"></span>
        <h2 className="mt-4 font-display text-2xl font-bold text-arena-text">Match Not Found</h2>
        <p className="mt-2 text-sm text-arena-muted">
          The requested match could not be found or you may not have permission to view it.
        </p>
        <Link
          href="/dashboard"
          className="mt-6 inline-block rounded-xl border border-cyan-400/40 bg-cyan-400/20 px-5 py-2.5 text-sm font-semibold text-arena-accent hover:bg-cyan-400/30"
        >
          Return to Dashboard →
        </Link>
      </div>
    );
  }

  const isLive = m.status === "live";
  const isCompleted = m.status === "completed";
  const isScheduled = m.status === "scheduled" || m.status === "pending";
  const isAwaitingVerification = m.status === "awaiting_approval" || m.status === "reported";

  const t1 = m.team1;
  const t2 = m.team2;
  const winner = m.winner;
  const loser = m.loser;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 space-y-8">
      {/* ── Offline Recovery & Realtime Sync Indicator ───────────────────── */}
      {!isConnected ? (
        <div
          className={`rounded-2xl px-4 py-2.5 text-center text-xs font-semibold ${
            isReconnecting ? "bg-amber-500/20 text-amber-300" : "bg-red-500/20 text-arena-danger"
          }`}
        >
          {isReconnecting ? (
            <span className="flex items-center justify-center gap-2">
              <span className="h-2 w-2 rounded-full bg-amber-400 animate-ping" />
              Reconnecting to match server…
            </span>
          ) : (
            <div className="flex items-center justify-center gap-3">
              <span> Realtime disconnected.</span>
              <button onClick={reconnect} className="underline hover:text-arena-text">
                Reconnect
              </button>
            </div>
          )}
        </div>
      ) : null}

      {/* ── Top Navigation / Tournament Breadcrumb ───────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-arena-border pb-5">
        <div>
          <div className="flex items-center gap-2 text-xs text-arena-muted">
            <Link href="/dashboard" className="hover:text-arena-text transition-colors">
              Dashboard
            </Link>
            <span>/</span>
            <Link
              href={`/tournaments/${m.tournament_slug}`}
              className="text-arena-accent hover:underline font-medium"
            >
              {m.tournament_title}
            </Link>
            <span>/</span>
            <span className="text-arena-text font-mono">Match #{m.match_number}</span>
          </div>
          <h1 className="mt-2 font-display text-3xl font-bold text-arena-text tracking-tight flex items-center gap-3">
            {m.round_name} · Match #{m.match_number}
          </h1>
        </div>

        {/* Status Chip */}
        <div className="flex items-center gap-3">
          <MatchStatusChip status={m.status} size="lg" />
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Live Sync
          </span>
        </div>
      </div>

      {/* ── Match Face-Off Arena Card ────────────────────────────────────── */}
      <section
        className={`relative overflow-hidden rounded-3xl border p-6 sm:p-10 shadow-2xl transition-all ${
          isLive
            ? "border-red-500/50 bg-gradient-to-b from-red-950/30 via-[#0a0f1d] to-[#060a14] shadow-red-950/30"
            : isCompleted
              ? "border-purple-500/40 bg-gradient-to-b from-purple-950/20 via-[#0a0f1d] to-[#060a14]"
              : "border-cyan-500/30 bg-gradient-to-b from-cyan-950/20 via-[#0a0f1d] to-[#060a14]"
        }`}
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-cyan-500/10 via-transparent to-transparent opacity-60" />

        <div className="relative z-10 grid grid-cols-1 items-center gap-8 md:grid-cols-7">
          {/* Team 1 Side */}
          <div className="flex flex-col items-center md:items-start text-center md:text-left md:col-span-3 space-y-3">
            <div className="relative">
              {t1?.logo_url ? (
                <img
                  src={t1.logo_url}
                  alt=""
                  className="h-24 w-24 rounded-2xl border-2 border-cyan-400/40 bg-black/60 object-cover shadow-xl"
                />
              ) : (
                <div className="flex h-24 w-24 items-center justify-center rounded-2xl border-2 border-cyan-400/40 bg-arena-bg-elevated font-display text-3xl font-bold text-arena-accent shadow-xl">
                  {t1 ? t1.name.slice(0, 1) : "?"}
                </div>
              )}
              {isCompleted && winner && t1 && winner.id === t1.id ? (
                <span className="absolute -top-2 -right-2 rounded-full border border-amber-400 bg-amber-400 px-2 py-0.5 text-[10px] font-bold text-black shadow-lg">
                   WINNER
                </span>
              ) : null}
            </div>

            <div>
              <div className="flex items-center justify-center md:justify-start gap-2">
                <h2 className="font-display text-2xl font-bold text-arena-text tracking-tight">
                  {t1?.name || "TBD (Waiting for winner)"}
                </h2>
                {t1?.tag ? (
                  <span className="rounded border border-arena-accent bg-arena-bg-elevated px-2 py-0.5 text-xs font-semibold text-arena-accent">
                    {t1.tag}
                  </span>
                ) : null}
              </div>
              <p className="text-xs text-arena-muted mt-0.5">Team 1 Slot</p>
            </div>

            {/* Score */}
            <div className="font-mono text-4xl font-black text-arena-text">
              {m.team1_score ?? (isCompleted ? "0" : "—")}
            </div>
          </div>

          {/* Center VS Indicator & Countdown */}
          <div className="flex flex-col items-center justify-center text-center md:col-span-1 space-y-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-arena-border bg-black/60 font-display text-xl font-black text-arena-accent shadow-xl">
              VS
            </div>

            {isScheduled ? (
              <div className="space-y-1.5">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-300">
                  Waiting for start
                </p>
                {m.scheduled_at ? <CountdownClock targetIso={m.scheduled_at} /> : null}
              </div>
            ) : isAwaitingVerification ? (
              <div className="space-y-1">
                <span className="text-lg animate-pulse">⏳</span>
                <p className="text-[10px] font-bold text-amber-300 uppercase tracking-wide">
                  Waiting Verification
                </p>
              </div>
            ) : isLive ? (
              <div className="space-y-1">
                <span className="inline-flex h-3 w-3 rounded-full bg-red-400 animate-ping" />
                <p className="text-xs font-bold text-red-400 tracking-wide">MATCH LIVE</p>
              </div>
            ) : isCompleted ? (
              <div className="space-y-1">
                <span className="text-xl"></span>
                <p className="text-xs font-bold text-purple-300 uppercase tracking-wide">Final Result</p>
              </div>
            ) : null}
          </div>

          {/* Team 2 Side */}
          <div className="flex flex-col items-center md:items-end text-center md:text-right md:col-span-3 space-y-3">
            <div className="relative">
              {t2?.logo_url ? (
                <img
                  src={t2.logo_url}
                  alt=""
                  className="h-24 w-24 rounded-2xl border-2 border-cyan-400/40 bg-black/60 object-cover shadow-xl"
                />
              ) : (
                <div className="flex h-24 w-24 items-center justify-center rounded-2xl border-2 border-cyan-400/40 bg-arena-bg-elevated font-display text-3xl font-bold text-arena-accent shadow-xl">
                  {t2 ? t2.name.slice(0, 1) : "—"}
                </div>
              )}
              {isCompleted && winner && t2 && winner.id === t2.id ? (
                <span className="absolute -top-2 -right-2 rounded-full border border-amber-400 bg-amber-400 px-2 py-0.5 text-[10px] font-bold text-black shadow-lg">
                   WINNER
                </span>
              ) : null}
            </div>

            <div>
              <div className="flex items-center justify-center md:justify-end gap-2">
                {t2?.tag ? (
                  <span className="rounded border border-arena-accent bg-arena-bg-elevated px-2 py-0.5 text-xs font-semibold text-arena-accent">
                    {t2.tag}
                  </span>
                ) : null}
                <h2 className="font-display text-2xl font-bold text-arena-text tracking-tight">
                  {t2?.name || "TBD (Waiting for winner)"}
                </h2>
              </div>
              <p className="text-xs text-arena-muted mt-0.5">Team 2 Slot</p>
            </div>

            {/* Score */}
            <div className="font-mono text-4xl font-black text-arena-text">
              {m.team2_score ?? (isCompleted ? "0" : "—")}
            </div>
          </div>
        </div>
      </section>

      {/* ── Completion Winner Podium Banner ──────────────────────────────── */}
      {isCompleted && winner ? (
        <section className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-emerald-500/50 bg-gradient-to-r from-emerald-950/40 to-black/60 p-5 shadow-lg flex items-center gap-4">
            <span className="flex h-12 w-12 items-center justify-center rounded-xl border border-emerald-400/50 bg-emerald-400/20 text-2xl">

            </span>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-400">
                Match Winner
              </span>
              <h3 className="font-display text-xl font-bold text-arena-text">
                {winner.name} {winner.tag ? `[${winner.tag}]` : ""}
              </h3>
              <p className="text-xs text-arena-success mt-0.5">Advances to Next Stage</p>
            </div>
          </div>

          {loser ? (
            <div className="rounded-2xl border border-arena-border bg-white/[0.02] p-5 flex items-center gap-4 opacity-70">
              <span className="flex h-12 w-12 items-center justify-center rounded-xl border border-arena-border bg-arena-bg-elevated text-2xl">

              </span>
              <div>
                <span className="text-[10px] font-bold uppercase tracking-widest text-arena-muted">
                  Defeated
                </span>
                <h3 className="font-display text-xl font-bold text-arena-text">
                  {loser.name} {loser.tag ? `[${loser.tag}]` : ""}
                </h3>
                <p className="text-xs text-arena-muted mt-0.5">Eliminated</p>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      {/* ── Match Arena Info & Map ───────────────────────────────────────── */}
      <section className="grid gap-6 md:grid-cols-3">
        <div className="rounded-2xl border border-arena-border bg-white/[0.03] p-5 space-y-3 md:col-span-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-arena-accent">
              Battleground
            </span>
            <span className="rounded-full border border-arena-border bg-arena-bg-elevated px-2 py-0.5 text-[10px] text-arena-muted">
              Standard Tournament Map
            </span>
          </div>

          <div className="relative h-44 rounded-xl border border-arena-border bg-gradient-to-tr from-cyan-950/60 via-black to-[#0d1627] overflow-hidden flex flex-col justify-end p-4">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-cyan-500/20 via-transparent to-black/80 pointer-events-none" />
            <div className="relative z-10">
              <span className="text-[10px] uppercase tracking-widest text-cyan-300 font-bold">
                {m.tournament_game} Competitive
              </span>
              <h3 className="font-display text-2xl font-black text-arena-text">{m.map_name}</h3>
              <p className="text-xs text-arena-muted">Server Location: Mumbai, India (Low Latency)</p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-arena-border bg-white/[0.03] p-5 space-y-4">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-arena-accent">
            Match Protocol
          </span>

          <div className="space-y-3 text-xs">
            <div>
              <span className="text-arena-muted block text-[10px] uppercase">Tournament</span>
              <Link
                href={`/tournaments/${m.tournament_slug}`}
                className="font-semibold text-arena-text hover:text-arena-accent transition-colors"
              >
                {m.tournament_title}
              </Link>
            </div>

            <div>
              <span className="text-arena-muted block text-[10px] uppercase">Format</span>
              <span className="font-semibold text-arena-text">Single Elimination · Best of 1</span>
            </div>

            <div>
              <span className="text-arena-muted block text-[10px] uppercase">Lobby Rules</span>
              <span className="text-arena-muted leading-relaxed block mt-0.5">
                Join in-game lobby 10 mins prior. Both team captains must report scores after completion.
              </span>
            </div>

            <div className="pt-2 border-t border-arena-border flex items-center justify-between">
              <Link
                href={`/tournaments/${m.tournament_slug}/bracket`}
                className="text-xs text-arena-accent hover:underline font-medium"
              >
                View Tournament Bracket →
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── Fair Play Reporting Bar ──────────────────────────────────────── */}
      <section className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-red-500/20 bg-red-950/10 p-4 text-xs">
        <div className="flex items-center gap-3">
          <span className="text-xl"></span>
          <div>
            <p className="font-semibold text-arena-text">Fair Play & Anti-Cheat Protection</p>
            <p className="text-[11px] text-arena-muted">
              Report toxicity, cheating, unauthorized substitutions, or no-shows to tournament arbiters.
            </p>
          </div>
        </div>

        <button
          onClick={() => setIsReportOpen(true)}
          className="rounded-xl border border-red-500/40 bg-red-500/15 px-4 py-2 text-xs font-semibold text-arena-danger hover:bg-red-500/25 transition-colors shadow-sm"
        >
           Report Fair Play Issue
        </button>
      </section>

      {/* ── Report Issue Modal ───────────────────────────────────────────── */}
      {isReportOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-3xl border border-white/15 bg-[#0d121f] p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-arena-border pb-4">
              <div className="flex items-center gap-2.5">
                <span className="text-xl"></span>
                <h3 className="font-display text-lg font-bold text-arena-text">
                  Submit Fair Play Report
                </h3>
              </div>
              <button
                onClick={() => setIsReportOpen(false)}
                className="rounded-lg p-1 text-arena-muted hover:text-arena-text"
              >

              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div>
                <label className="block text-arena-muted mb-1 font-semibold uppercase tracking-wider text-[10px]">
                  Match & Opponent
                </label>
                <div className="rounded-xl border border-arena-border bg-white/[0.03] p-3 text-arena-text">
                  <p className="font-semibold">
                    {m.round_name} · Match #{m.match_number} ({m.tournament_title})
                  </p>
                  <p className="text-[11px] text-arena-muted mt-0.5">
                    Opponent: {t2?.name || "Opponent Slot"} vs {t1?.name || "Your Slot"}
                  </p>
                </div>
              </div>

              <div>
                <label className="block text-arena-muted mb-1 font-semibold uppercase tracking-wider text-[10px]">
                  Violation Reason
                </label>
                <select
                  value={reportReason}
                  onChange={(e) => setReportReason(e.target.value)}
                  className="w-full rounded-xl border border-arena-border bg-[#090d16] px-3.5 py-2.5 text-xs text-arena-text focus:border-cyan-400/50 focus:outline-none"
                >
                  <option value="Cheating / Third-Party Software">
                    Cheating / Third-Party Software / Aim Assist
                  </option>
                  <option value="Toxicity / Harassment">
                    Toxicity / Harassment / Offensive Communication
                  </option>
                  <option value="No-Show / Intentional Delay">
                    No-Show / Intentional Delay / Unresponsive
                  </option>
                  <option value="Smurfing / Unauthorized Roster">
                    Smurfing / Account Sharing / Unauthorized Roster
                  </option>
                  <option value="Match Fixing / Collusion">
                    Match Fixing / Collusion / Fake Score Submission
                  </option>
                  <option value="General Tournament Rule Violation">
                    General Tournament Rule Violation
                  </option>
                </select>
              </div>

              <div>
                <label className="block text-arena-muted mb-1 font-semibold uppercase tracking-wider text-[10px]">
                  Incident Description & Evidence
                </label>
                <textarea
                  rows={4}
                  value={reportDescription}
                  onChange={(e) => setReportDescription(e.target.value)}
                  placeholder="Provide detailed context, timestamps, or screenshot/video links..."
                  className="w-full rounded-xl border border-arena-border bg-[#090d16] p-3 text-xs text-arena-text placeholder-arena-muted focus:border-cyan-400/50 focus:outline-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-arena-border">
              <button
                type="button"
                onClick={() => setIsReportOpen(false)}
                className="rounded-xl border border-arena-border px-4 py-2 text-xs font-semibold text-arena-muted hover:text-arena-text"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={reportMutation.isPending || !reportDescription.trim()}
                onClick={() =>
                  reportMutation.mutate({
                    tournament_id: m.tournament_id,
                    match_id: m.id,
                    reason: reportReason,
                    description: reportDescription.trim(),
                  })
                }
                className="rounded-xl border border-red-500/40 bg-red-500/20 px-5 py-2 text-xs font-semibold text-arena-danger hover:bg-red-500/30 disabled:opacity-50 transition-colors shadow-sm"
              >
                {reportMutation.isPending ? "Submitting…" : "Submit Report"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
