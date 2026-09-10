"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase/client";
import { apiFetch } from "@/lib/api/client";
import { useTournamentRealtime } from "@/hooks/useTournamentRealtime";
import { MatchStatusChip } from "@/components/matches/MatchStatusChip";

type TeamInfo = {
  id: string;
  name: string;
  tag: string | null;
  logo_url: string | null;
  captain_name?: string | null;
  seed?: number | null;
};

type MatchDetails = {
  id: string;
  tournament_id: string;
  tournament_title: string;
  tournament_slug: string;
  tournament_game: string;
  tournament_mode: string;
  tournament_status: string;
  tournament_banner_url: string | null;
  round: number;
  round_name: string;
  match_number: number;
  status: "scheduled" | "live" | "completed" | "paused" | "cancelled" | "awaiting_approval" | "reported" | "pending";
  scheduled_at: string | null;
  completed_at: string | null;
  map_name: string;
  team1: TeamInfo | null;
  team2: TeamInfo | null;
  winner: TeamInfo | null;
  team1_score: number | null;
  team2_score: number | null;
};

type ReportItem = {
  id: string;
  team1_score: number;
  team2_score: number;
  notes: string | null;
  evidence_url: string | null;
  status: "pending" | "submitted" | "approved" | "rejected" | "resubmission_requested";
  created_at: string;
};

export function PlayerMatchCenter({ matchId }: { matchId: string }) {
  const queryClient = useQueryClient();
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [team1ScoreInput, setTeam1ScoreInput] = useState<number>(0);
  const [team2ScoreInput, setTeam2ScoreInput] = useState<number>(0);
  const [notesInput, setNotesInput] = useState("");
  const [screenshotFiles, setScreenshotFiles] = useState<File[]>([]);
  const [uploadingScreenshots, setUploadingScreenshots] = useState(false);
  const [timeLeft, setTimeLeft] = useState<string>("");
  const [showCelebration, setShowCelebration] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user) setCurrentUser(data.user);
    });
  }, []);

  // 1. Fetch Match Details (Pure real-time: No polling)
  const matchQuery = useQuery<MatchDetails>({
    queryKey: ["player-match-center", matchId],
    queryFn: async () => {
      return apiFetch<MatchDetails>(`/api/v1/matches/${matchId}`);
    },
  });

  // 2. Fetch Match Reports
  const reportsQuery = useQuery<ReportItem[]>({
    queryKey: ["match-reports", matchId],
    queryFn: async () => {
      try {
        return await apiFetch<ReportItem[]>(`/api/v1/match-reports/match/${matchId}`);
      } catch {
        return [];
      }
    },
  });

  const match = matchQuery.data;
  const tournamentId = match?.tournament_id;
  const slug = match?.tournament_slug;

  // 3. Realtime Subscription & Offline Recovery (No polling)
  const { connectionStatus, isConnected, isReconnecting, reconnect } = useTournamentRealtime({
    tournamentId,
    slug,
    matchId,
    enableToasts: true,
  });

  // Countdown timer calculation
  useEffect(() => {
    if (!match?.scheduled_at) {
      setTimeLeft("");
      return;
    }

    const calculateCountdown = () => {
      const diff = new Date(match.scheduled_at!).getTime() - Date.now();
      if (diff <= 0) {
        setTimeLeft("00:00:00 (LIVE)");
      } else {
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);
        setTimeLeft(
          `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`
        );
      }
    };

    calculateCountdown();
    const interval = setInterval(calculateCountdown, 1000);
    return () => clearInterval(interval);
  }, [match?.scheduled_at]);

  // Trigger celebration effect when match completes
  useEffect(() => {
    if (match?.status === "completed" && match.winner) {
      setShowCelebration(true);
    }
  }, [match?.status, match?.winner]);

  // Submit Result Mutation
  const submitReportMutation = useMutation({
    mutationFn: async () => {
      if (!currentUser) throw new Error("Please log in to submit match results.");
      setUploadingScreenshots(true);

      const uploadedUrls: string[] = [];
      for (const file of screenshotFiles) {
        const fileExt = file.name.split(".").pop();
        const filePath = `${matchId}/${Date.now()}_${Math.random().toString(36).slice(2)}.${fileExt}`;
        const { error: uploadError } = await supabase.storage
          .from("match-evidence")
          .upload(filePath, file);

        if (!uploadError) {
          const { data: publicUrlData } = supabase.storage
            .from("match-evidence")
            .getPublicUrl(filePath);
          uploadedUrls.push(publicUrlData.publicUrl);
        }
      }

      return apiFetch("/api/v1/match-reports", {
        method: "POST",
        body: {
          match_id: matchId,
          team1_score: team1ScoreInput,
          team2_score: team2ScoreInput,
          notes: notesInput || null,
          screenshot_urls: uploadedUrls,
          evidence_url: uploadedUrls.join(","),
        },
      });
    },
    onSuccess: () => {
      toast.success("Score and evidence submitted for referee verification! 🎮");
      setShowUploadModal(false);
      setScreenshotFiles([]);
      setNotesInput("");
      void queryClient.invalidateQueries({ queryKey: ["match-reports", matchId] });
      void queryClient.invalidateQueries({ queryKey: ["player-match-center", matchId] });
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to submit match report");
    },
    onSettled: () => {
      setUploadingScreenshots(false);
    },
  });

  if (matchQuery.isLoading) {
    return (
      <main className="min-h-screen bg-[#070b14] px-4 py-16 text-center text-white">
        <div className="mx-auto max-w-md animate-pulse space-y-4">
          <div className="h-8 rounded bg-white/5" />
          <div className="h-48 rounded-2xl bg-white/5" />
        </div>
      </main>
    );
  }

  if (!match) {
    return (
      <main className="min-h-screen bg-[#070b14] px-4 py-16 text-center text-white">
        <h2 className="text-xl font-bold">Match Not Found</h2>
        <Link href="/tournaments" className="mt-4 inline-block text-xs text-arena-accent underline">
          Browse Tournaments
        </Link>
      </main>
    );
  }

  const reports = reportsQuery.data ?? [];
  const latestReport = reports[0];
  const isAwaitingVerification =
    match.status === "awaiting_approval" ||
    match.status === "reported" ||
    Boolean(latestReport && (latestReport.status === "pending" || latestReport.status === "submitted"));
  const isCompleted = match.status === "completed";
  const isLive = match.status === "live";
  const isVerified = isCompleted || (latestReport && latestReport.status === "approved");

  // Determine current display status for the status chip
  const currentChipStatus = isCompleted
    ? "completed"
    : isAwaitingVerification
      ? "waiting_verification"
      : isLive
        ? "live"
        : "upcoming";

  return (
    <main className="min-h-screen bg-[#070b14] text-white selection:bg-cyan-500/30">
      {/* ── Offline Recovery & Realtime Sync Indicator Bar ─────────────────── */}
      {!isConnected ? (
        <div
          className={`px-4 py-2 text-center text-xs font-semibold ${
            isReconnecting ? "bg-amber-500/20 text-amber-300" : "bg-red-500/20 text-red-300"
          }`}
        >
          {isReconnecting ? (
            <span className="flex items-center justify-center gap-2">
              <span className="h-2 w-2 rounded-full bg-amber-400 animate-ping" />
              Reconnecting to match arena & syncing latest scores…
            </span>
          ) : (
            <div className="flex items-center justify-center gap-3">
              <span>⚠️ Realtime connection interrupted.</span>
              <button
                onClick={reconnect}
                className="underline hover:text-white transition-colors"
              >
                Reconnect Now
              </button>
            </div>
          )}
        </div>
      ) : null}

      {/* ── Match Header Bar ─────────────────────────────────────────────── */}
      <section className="border-b border-white/10 bg-gradient-to-b from-[#0d1629] to-[#070b14] px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-xs text-arena-accent font-semibold uppercase tracking-wider">
                <Link href={`/tournaments/${match.tournament_slug}`} className="hover:underline">
                  {match.tournament_title}
                </Link>
                <span className="text-white/20">•</span>
                <span>{match.round_name || `Round ${match.round}`}</span>
                <span className="text-white/20">•</span>
                <span>Match #{match.match_number}</span>
              </div>
              <h1 className="mt-2 font-display text-3xl sm:text-4xl font-black tracking-tight text-white flex items-center gap-3">
                Player Match Center
              </h1>
            </div>

            {/* Status Chip & Countdown */}
            <div className="flex flex-col items-end gap-2">
              <div className="flex items-center gap-2">
                <MatchStatusChip status={currentChipStatus} size="lg" />
              </div>

              {match.status === "scheduled" && timeLeft ? (
                <div className="flex items-center gap-1.5 font-mono text-xs font-bold text-arena-accent">
                  <span>⏱ Match Start:</span>
                  <span className="rounded bg-cyan-400/10 px-2 py-0.5 border border-cyan-400/30">
                    {timeLeft}
                  </span>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      {/* ── Celebration Animation (When Match Completes & Winner Crowned) ── */}
      {showCelebration && isCompleted && match.winner ? (
        <section className="relative overflow-hidden border-b border-amber-400/40 bg-gradient-to-r from-amber-950/40 via-purple-950/40 to-amber-950/40 px-4 py-6 text-center shadow-2xl">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-amber-400/20 via-transparent to-transparent animate-pulse" />
          <div className="relative z-10 mx-auto max-w-5xl flex flex-col sm:flex-row items-center justify-center gap-4">
            <span className="text-4xl sm:text-5xl animate-bounce">🏆</span>
            <div>
              <span className="inline-block rounded-full bg-amber-400/20 px-3 py-0.5 text-[11px] font-extrabold uppercase tracking-widest text-amber-300 border border-amber-400/40">
                Match Verified & Completed
              </span>
              <h2 className="font-display text-2xl sm:text-3xl font-black text-white mt-1">
                🎉 VICTORY! <span className="text-amber-300">{match.winner.name}</span>{" "}
                {match.winner.tag ? `[${match.winner.tag}]` : ""}
              </h2>
              <p className="text-xs text-amber-200/80 mt-0.5">
                Advances to the next round in the tournament bracket.
              </p>
            </div>
          </div>
        </section>
      ) : null}

      {/* ── Waiting Verification State Banner ────────────────────────────── */}
      {isAwaitingVerification && !isCompleted ? (
        <section className="border-b border-amber-500/40 bg-amber-950/20 px-4 py-4">
          <div className="mx-auto max-w-5xl flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-amber-400/40 bg-amber-400/20 text-xl">
                ⏳
              </span>
              <div>
                <h3 className="font-display text-sm font-bold text-amber-300">
                  Waiting for Referee Verification
                </h3>
                <p className="text-xs text-amber-200/70 mt-0.5">
                  A match score report has been submitted with evidence and is pending tournament admin approval.
                </p>
              </div>
            </div>

            {latestReport ? (
              <div className="rounded-xl border border-amber-400/30 bg-black/40 px-3 py-1.5 font-mono text-xs font-bold text-white">
                Reported Score: {latestReport.team1_score} - {latestReport.team2_score}
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      {/* ── Verified State Banner (If result verified before complete) ───── */}
      {isVerified && !showCelebration ? (
        <section className="border-b border-cyan-500/30 bg-cyan-950/20 px-4 py-3">
          <div className="mx-auto max-w-5xl flex items-center justify-center gap-2 text-xs font-bold text-cyan-300">
            <span>✓</span> Official scoreline verified and confirmed by tournament referee.
          </div>
        </section>
      ) : null}

      {/* ── Teams Faceoff & Opponent Cards Section ───────────────────────── */}
      <section className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8 space-y-6">
        <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.02] p-6 sm:p-10 shadow-2xl backdrop-blur-sm">
          <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] items-center gap-8 text-center">
            {/* Team 1 / Player Card */}
            <div className="flex flex-col items-center p-4 rounded-2xl border border-white/5 bg-white/[0.01]">
              <div className="relative">
                {match.team1?.logo_url ? (
                  <img
                    src={match.team1.logo_url}
                    alt={match.team1.name}
                    className="h-24 w-24 rounded-2xl border-2 border-cyan-400/40 object-cover shadow-lg"
                  />
                ) : (
                  <div className="flex h-24 w-24 items-center justify-center rounded-2xl border-2 border-cyan-400/40 bg-cyan-400/20 text-3xl font-black text-arena-accent shadow-lg">
                    {match.team1?.name?.slice(0, 1) || "T1"}
                  </div>
                )}
                {isCompleted && match.winner && match.team1 && match.winner.id === match.team1.id ? (
                  <span className="absolute -top-2 -right-2 rounded-full border border-amber-400 bg-amber-400 px-2 py-0.5 text-[10px] font-extrabold text-black shadow-lg">
                    👑 WINNER
                  </span>
                ) : null}
              </div>

              <h3 className="mt-4 text-xl font-bold text-white">
                {match.team1?.name || "TBD (Slot 1)"}
              </h3>
              {match.team1?.tag ? (
                <span className="text-xs text-arena-accent font-semibold mt-0.5">
                  [{match.team1.tag}]
                </span>
              ) : null}
              <span className="mt-1 text-[11px] text-arena-muted">
                Captain: {match.team1?.captain_name || "Team Captain"}
              </span>

              {/* Realtime Live Score */}
              <div className="mt-4 flex flex-col items-center">
                <span className="text-[10px] uppercase font-bold tracking-wider text-arena-muted">
                  Score
                </span>
                <span className="font-mono text-5xl font-black text-white mt-1">
                  {match.team1_score ?? "—"}
                </span>
              </div>
            </div>

            {/* Versus & Map Battleground */}
            <div className="flex flex-col items-center space-y-3">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-white/10 bg-black/60 font-display text-2xl font-black text-arena-accent shadow-xl">
                VS
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 px-3.5 py-1.5 text-center text-xs font-mono text-arena-muted">
                <span className="text-[10px] uppercase block text-arena-muted">Battleground</span>
                <span className="text-white font-bold">{match.map_name || "Standard Arena"}</span>
              </div>
            </div>

            {/* Team 2 / Opponent Card */}
            <div className="flex flex-col items-center p-4 rounded-2xl border border-white/5 bg-white/[0.01]">
              <div className="relative">
                {match.team2?.logo_url ? (
                  <img
                    src={match.team2.logo_url}
                    alt={match.team2.name}
                    className="h-24 w-24 rounded-2xl border-2 border-cyan-400/40 object-cover shadow-lg"
                  />
                ) : (
                  <div className="flex h-24 w-24 items-center justify-center rounded-2xl border-2 border-cyan-400/40 bg-cyan-400/20 text-3xl font-black text-arena-accent shadow-lg">
                    {match.team2?.name?.slice(0, 1) || "T2"}
                  </div>
                )}
                {isCompleted && match.winner && match.team2 && match.winner.id === match.team2.id ? (
                  <span className="absolute -top-2 -right-2 rounded-full border border-amber-400 bg-amber-400 px-2 py-0.5 text-[10px] font-extrabold text-black shadow-lg">
                    👑 WINNER
                  </span>
                ) : null}
              </div>

              <h3 className="mt-4 text-xl font-bold text-white">
                {match.team2?.name || "TBD (Slot 2)"}
              </h3>
              {match.team2?.tag ? (
                <span className="text-xs text-arena-accent font-semibold mt-0.5">
                  [{match.team2.tag}]
                </span>
              ) : null}
              <span className="mt-1 text-[11px] text-arena-muted">
                Captain: {match.team2?.captain_name || "Team Captain"}
              </span>

              {/* Realtime Live Score */}
              <div className="mt-4 flex flex-col items-center">
                <span className="text-[10px] uppercase font-bold tracking-wider text-arena-muted">
                  Score
                </span>
                <span className="font-mono text-5xl font-black text-white mt-1">
                  {match.team2_score ?? "—"}
                </span>
              </div>
            </div>
          </div>

          {/* Player Match Actions */}
          <div className="mt-10 pt-6 border-t border-white/5 flex flex-wrap items-center justify-center gap-4">
            <a
              href="https://discord.gg/brackifyarena"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-xl border border-indigo-500/40 bg-indigo-500/15 px-4 py-2.5 text-xs font-semibold text-indigo-300 hover:bg-indigo-500/25 transition-all shadow-sm"
            >
              <span>💬</span> Join Discord Match Lobby
            </a>

            {!isCompleted ? (
              <button
                onClick={() => setShowUploadModal(true)}
                className="flex items-center gap-2 rounded-xl border border-cyan-400/50 bg-cyan-400/20 px-5 py-2.5 text-xs font-bold text-arena-accent hover:bg-cyan-400/30 transition-all shadow-md shadow-cyan-950/30"
              >
                <span>📸</span> Upload Score & Evidence
              </button>
            ) : null}
          </div>
        </div>

        {/* Match Score Submissions & Evidence History */}
        {reports.length > 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6">
            <h4 className="text-sm font-bold uppercase tracking-wider text-white">
              Submitted Score Reports & Evidence
            </h4>
            <div className="mt-4 space-y-3">
              {reports.map((r) => (
                <div
                  key={r.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-xl border border-white/5 bg-white/[0.01] p-4 text-xs"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-white">
                        Score: {r.team1_score} - {r.team2_score}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                          r.status === "approved"
                            ? "bg-emerald-500/20 text-emerald-400"
                            : r.status === "rejected"
                              ? "bg-red-500/20 text-red-300"
                              : "bg-amber-500/20 text-amber-300"
                        }`}
                      >
                        {r.status}
                      </span>
                    </div>
                    {r.notes ? <p className="mt-1 text-arena-muted">{r.notes}</p> : null}
                  </div>

                  {r.evidence_url ? (
                    <div className="flex items-center gap-2">
                      {r.evidence_url.split(",").map((url, i) => (
                        <a
                          key={i}
                          href={url.trim()}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded-lg border border-white/10 overflow-hidden hover:border-cyan-400/50 transition-colors"
                        >
                          <img src={url.trim()} alt="Evidence" className="h-10 w-14 object-cover" />
                        </a>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </section>

      {/* Upload Result Modal */}
      {showUploadModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl border border-white/10 bg-[#0c1322] p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-white">Submit Match Result</h3>
            <p className="mt-1 text-xs text-arena-muted">
              Enter the final match score and attach in-game victory screenshot(s) for referee verification.
            </p>

            <div className="mt-4 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] text-arena-muted mb-1">
                    {match.team1?.name || "Team 1"} Score
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={team1ScoreInput}
                    onChange={(e) => setTeam1ScoreInput(Number(e.target.value))}
                    className="w-full rounded-xl border border-white/10 bg-black/40 p-2.5 text-center font-mono text-lg font-bold text-white focus:border-cyan-400 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-arena-muted mb-1">
                    {match.team2?.name || "Team 2"} Score
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={team2ScoreInput}
                    onChange={(e) => setTeam2ScoreInput(Number(e.target.value))}
                    className="w-full rounded-xl border border-white/10 bg-black/40 p-2.5 text-center font-mono text-lg font-bold text-white focus:border-cyan-400 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] text-arena-muted mb-1">
                  Upload Scoreboard Screenshot(s)
                </label>
                <input
                  type="file"
                  multiple
                  accept="image/*"
                  onChange={(e) => {
                    if (e.target.files) {
                      setScreenshotFiles(Array.from(e.target.files));
                    }
                  }}
                  className="w-full text-xs text-arena-muted file:mr-3 file:rounded-lg file:border-0 file:bg-white/10 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white hover:file:bg-white/20"
                />
                <span className="text-[10px] text-white/40 block mt-1">
                  {screenshotFiles.length} file(s) selected
                </span>
              </div>

              <div>
                <label className="block text-[11px] text-arena-muted mb-1">Match Notes (Optional)</label>
                <textarea
                  value={notesInput}
                  onChange={(e) => setNotesInput(e.target.value)}
                  placeholder="e.g. Overtime 15-13, Ascent map, opponent disconnect at round 10"
                  rows={2}
                  className="w-full rounded-xl border border-white/10 bg-black/40 p-2.5 text-xs text-white placeholder:text-white/20 focus:border-cyan-400 focus:outline-none"
                />
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-2">
              <button
                disabled={uploadingScreenshots}
                onClick={() => setShowUploadModal(false)}
                className="rounded-xl border border-white/10 px-4 py-2 text-xs font-semibold text-arena-muted hover:bg-white/5 transition-colors"
              >
                Cancel
              </button>
              <button
                disabled={uploadingScreenshots || submitReportMutation.isPending}
                onClick={() => submitReportMutation.mutate()}
                className="rounded-xl border border-cyan-400/50 bg-cyan-400 px-4 py-2 text-xs font-bold text-black hover:bg-cyan-300 disabled:opacity-50 transition-all shadow-md"
              >
                {uploadingScreenshots ? "Uploading Evidence…" : "Submit Result"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
