"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { getMatch } from "@/lib/matches/data";
import { getTournament } from "@/lib/tournaments/data";
import { supabase } from "@/lib/supabase/client";
import { MatchReport } from "@/components/matches/MatchReport";
import { MatchReportHistoryTable } from "@/components/matches/MatchReportHistoryTable";
import { AdminMatchApproval } from "@/components/matches/AdminMatchApproval";
import { MatchStatusChip } from "@/components/matches/MatchStatusChip";
import { confirmMatchResult, disputeMatchResult } from "@/lib/matches/data";
import { ReportPlayerModal } from "@/components/reports/ReportPlayerModal";
import { useTournamentRealtime } from "@/hooks/useTournamentRealtime";

export function MatchPage({ slug, matchId }: { slug: string; matchId: string }) {
  const queryClient = useQueryClient();
  const [admin, setAdmin] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const tournamentQuery = useQuery({ queryKey: ["tournament", slug], queryFn: () => getTournament(slug) });
  const matchQuery = useQuery({ queryKey: ["match", slug, matchId], queryFn: () => getMatch(matchId, slug) });

  const tournament = tournamentQuery.data;
  const match = matchQuery.data;

  // Realtime hook with offline recovery (No polling)
  const { isConnected, isReconnecting, reconnect } = useTournamentRealtime({
    tournamentId: tournament?.id,
    slug,
    matchId,
    enableToasts: true,
  });

  useEffect(() => {
    void supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      setCurrentUserId(data.user.id);
      const tournamentId = tournamentQuery.data?.id;
      if (!tournamentId) return;
      const result = await supabase
        .from("tournament_admins")
        .select("tournament_id")
        .eq("tournament_id", tournamentId)
        .eq("user_id", data.user.id)
        .maybeSingle();
      setAdmin(!result.error && Boolean(result.data));
    });
  }, [tournamentQuery.data?.id]);

  useEffect(() => {
    if (tournamentQuery.isError) toast.error(tournamentQuery.error instanceof Error ? tournamentQuery.error.message : "Unable to load tournament.");
    if (matchQuery.isError) toast.error(matchQuery.error instanceof Error ? matchQuery.error.message : "Unable to load match.");
  }, [matchQuery.error, matchQuery.isError, tournamentQuery.error, tournamentQuery.isError]);

  if (tournamentQuery.isLoading || matchQuery.isLoading) {
    return (
      <main className="mx-auto max-w-3xl animate-pulse px-4 py-16 sm:px-6">
        <div className="h-10 w-2/3 rounded bg-arena-bg-elevated" />
        <div className="mt-8 h-64 rounded-2xl bg-arena-bg-elevated" />
      </main>
    );
  }

  if (!tournament || !match) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        <p className="text-arena-danger">Match not found.</p>
      </main>
    );
  }

  const reported = match.status === "reported" || match.status === "awaiting_approval";
  const completed = match.status === "completed";

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      {/* Realtime Connection Offline Notification */}
      {!isConnected ? (
        <div
          className={`mb-4 rounded-xl px-4 py-2 text-center text-xs font-semibold ${
            isReconnecting ? "bg-amber-500/20 text-amber-300" : "bg-red-500/20 text-arena-danger"
          }`}
        >
          {isReconnecting ? (
            <span className="flex items-center justify-center gap-2">
              <span className="h-2 w-2 rounded-full bg-amber-400 animate-ping" />
              Reconnecting to match arena…
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

      <Link href={`/tournaments/${slug}/bracket`} className="text-sm text-arena-accent hover:underline">
        ← Bracket
      </Link>

      <section className="glass-card mt-6 rounded-2xl p-6 sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm uppercase tracking-[0.25em] text-arena-accent">
              {tournament.title} · Round {match.round_number}
            </p>
            <h1 className="mt-2 font-display text-3xl font-bold text-arena-text">
              Match {match.match_number}
            </h1>
          </div>
          <MatchStatusChip status={match.status} size="lg" />
        </div>

        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          <ScoreRow label="Team 1" teamId={match.team_a_id} score={match.team1_score} winner={match.winner_team_id === match.team_a_id} />
          <ScoreRow label="Team 2" teamId={match.team_b_id} score={match.team2_score} winner={match.winner_team_id === match.team_b_id} />
        </div>

        <MatchOpponentReport matchId={match.id} tournamentId={match.tournament_id} teamAId={match.team_a_id} teamBId={match.team_b_id} />

        {completed ? (
          <p className="mt-6 text-sm text-arena-muted">This result is approved and the bracket has advanced.</p>
        ) : reported ? (
          <>
            <p className="mt-6 text-sm text-arena-muted">Score submitted and awaiting opponent or tournament admin approval.</p>
            <ResultDecision
              matchId={match.id}
              onDone={() => {
                void queryClient.invalidateQueries({ queryKey: ["match"] });
                void queryClient.invalidateQueries({ queryKey: ["bracket"] });
                void queryClient.invalidateQueries({ queryKey: ["current-match"] });
                void queryClient.invalidateQueries({ queryKey: ["match-reports", match.id] });
              }}
            />
          </>
        ) : match.status === "live" ? (
          <MatchReport matchId={match.id} />
        ) : (
          <p className="mt-6 text-sm text-arena-muted">This match is scheduled and waiting for the admin to start it.</p>
        )}

        {admin && reported ? <AdminMatchApproval matchId={match.id} /> : null}

        {/* ── Match Report Table ────────────────────────────────────────── */}
        <MatchReportHistoryTable matchId={match.id} currentUserId={currentUserId} isAdmin={admin} />
      </section>
    </main>
  );
}

function MatchOpponentReport({ matchId, tournamentId, teamAId, teamBId }: { matchId: string; tournamentId: string; teamAId: string | null; teamBId: string | null }) {
  const captains = useQuery({
    queryKey: ["match-captains", matchId],
    queryFn: async () => {
      const ids = [teamAId, teamBId].filter((id): id is string => Boolean(id));
      if (!ids.length) return [];
      const { data, error } = await supabase.from("teams").select("id,captain_id").in("id", ids);
      if (error) throw error;
      return data ?? [];
    },
    enabled: Boolean(teamAId || teamBId),
  });
  const currentUser = useQuery({ queryKey: ["match-report-user", matchId], queryFn: async () => (await supabase.auth.getUser()).data.user?.id ?? null });
  const opponent = captains.data?.find((team) => team.captain_id !== currentUser.data)?.captain_id;
  return opponent ? <div className="mt-5"><ReportPlayerModal reportedUserId={opponent} tournamentId={tournamentId} matchId={matchId} /></div> : null;
}

function ResultDecision({ matchId, onDone }: { matchId: string; onDone: () => void }) {
  const decision = useMutation({
    mutationFn: (action: "confirm" | "dispute") => (action === "confirm" ? confirmMatchResult(matchId) : disputeMatchResult(matchId)),
    onSuccess: (_, action) => {
      toast.success(action === "confirm" ? "Result confirmed" : "Result disputed");
      onDone();
    },
    onError: (error: Error) => toast.error(error.message.replaceAll("_", " ")),
  });
  return (
    <div className="mt-4 flex flex-wrap gap-2">
      <button className="btn-primary px-3 py-2 text-sm" disabled={decision.isPending} onClick={() => decision.mutate("confirm")}>
        Confirm result
      </button>
      <button className="rounded-lg border border-arena-border px-3 py-2 text-sm text-arena-muted hover:text-arena-text" disabled={decision.isPending} onClick={() => decision.mutate("dispute")}>
        Dispute result
      </button>
    </div>
  );
}

function ScoreRow({ label, teamId, score, winner }: { label: string; teamId: string | null; score: number | null; winner: boolean }) {
  const teamQuery = useQuery({
    queryKey: ["match-team", teamId],
    queryFn: async () => {
      if (!teamId) return null;
      const { data } = await supabase.from("teams").select("name,tag").eq("id", teamId).maybeSingle();
      return data;
    },
    enabled: Boolean(teamId),
  });
  return (
    <div className={winner ? "rounded-xl border border-arena-accent bg-arena-bg-elevated p-4" : "rounded-xl border border-arena-border bg-white/[0.04] p-4"}>
      <p className="text-xs uppercase tracking-wider text-arena-muted">{label}</p>
      <p className="mt-1 font-display text-xl font-semibold text-arena-text">{teamQuery.data?.name ?? "TBD"}{teamQuery.data?.tag ? ` [${teamQuery.data.tag}]` : ""}</p>
      <p className="mt-2 font-display text-4xl text-arena-accent">{score ?? "–"}</p>
    </div>
  );
}
