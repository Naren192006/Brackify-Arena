"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { generateBracket, getCompleteTournamentBracket } from "@/lib/brackets/data";
import { supabase } from "@/lib/supabase/client";
import { BracketView } from "@/components/brackets/BracketView";
import { BracketSkeleton } from "@/components/ui/SkeletonLoader";
import { EmptyState } from "@/components/ui/EmptyState";
import { useLiveBracket } from "@/hooks/useLiveBracket";
import type { Bracket } from "@/types/bracket";

export function BracketPage({ slug }: { slug: string }) {
  const queryClient = useQueryClient();
  const [admin, setAdmin] = useState(false);

  // Single network request populates tournament, bracket, matches, and team registrations
  const completeBracketQuery = useQuery({
    queryKey: ["complete-bracket", slug],
    queryFn: () => getCompleteTournamentBracket(slug),
    refetchOnWindowFocus: true,
  });

  const tournament = completeBracketQuery.data?.tournament;
  const bracket = completeBracketQuery.data?.bracket;
  const tournamentId = tournament?.id;

  // Supabase Realtime for matches, tournaments, brackets with auto-reconnect
  const { connectionStatus, isLive } = useLiveBracket({
    tournamentId,
    slug,
  });

  useEffect(() => {
    if (!tournamentId) return;
    void supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      const result = await supabase
        .from("tournament_admins")
        .select("tournament_id")
        .eq("tournament_id", tournamentId)
        .eq("user_id", data.user.id)
        .maybeSingle();
      setAdmin(!result.error && Boolean(result.data));
    });
  }, [tournamentId]);

  const generate = useMutation({
    mutationFn: () => generateBracket(tournamentId!),
    onSuccess: () => {
      toast.success("Bracket generated");
      void queryClient.invalidateQueries({ queryKey: ["complete-bracket", slug] });
      void queryClient.invalidateQueries({ queryKey: ["bracket", tournamentId] });
      void queryClient.invalidateQueries({ queryKey: ["tournament", slug] });
    },
    onError: (error: Error) => toast.error(error.message.replaceAll("_", " ")),
  });

  if (completeBracketQuery.isLoading) {
    return (
      <main className="mx-auto max-w-7xl animate-pulse px-4 py-16 sm:px-6">
        <div className="h-6 w-36 rounded bg-white/5" />
        <div className="mt-4 h-12 w-2/3 rounded bg-white/5" />
        <div className="mt-8 h-96 rounded-2xl bg-white/5" />
      </main>
    );
  }

  if (!tournament) {
    return (
      <main className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
        <p className="text-arena-danger">Tournament not found.</p>
      </main>
    );
  }
  const currentRound = bracket
    ? bracket.rounds.find((round) => round.matches.some((match) => match.status !== "completed"))
        ?.round_number ?? bracket.total_rounds
    : null;

  return (
    <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      {/* Back link */}
      <Link
        href={`/tournaments/${tournament.slug}`}
        className="inline-flex items-center gap-1.5 text-sm text-arena-accent transition-colors hover:underline"
      >
        <span>←</span>
        <span>Tournament details</span>
      </Link>

      {/* Header */}
      <div className="mt-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-arena-accent">
            {tournament.game} · {tournament.mode}
          </p>
          <h1 className="mt-1.5 font-display text-3xl font-bold tracking-tight text-white sm:text-4xl">
            {tournament.title} Bracket
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Realtime Live Sync Badge */}
          {connectionStatus === "connected" ? (
            <span
              className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-400 shadow-sm shadow-emerald-950/20"
              title="Live Realtime Subscriptions Active (matches, tournaments)"
            >
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
              Live Sync
            </span>
          ) : (
            <span
              className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-400"
              title="Reconnecting Supabase Realtime..."
            >
              <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
              Reconnecting...
            </span>
          )}

          {/* Tournament Status Badge */}
          {tournament.status && (
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-arena-text-secondary">
              Status: {tournament.status.replace("_", " ")}
            </span>
          )}

          {bracket ? (
            <span className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3.5 py-1 text-xs font-semibold uppercase tracking-wider text-arena-accent">
              Current Round: {currentRound ?? "—"}
            </span>
          ) : admin ? (
            <button
              className="btn-primary"
              disabled={generate.isPending}
              onClick={() => generate.mutate()}
            >
              {generate.isPending ? "Generating…" : "Generate bracket"}
            </button>
          ) : null}
        </div>
      </div>

      {/* Bracket Canvas */}
      {completeBracketQuery.isLoading ? (
        <section className="glass-card mt-8 rounded-3xl p-6 sm:p-8">
          <BracketSkeleton />
        </section>
      ) : bracket ? (
        <section className="glass-card mt-8 rounded-3xl p-6 sm:p-8 space-y-4">
          <div className="flex items-center justify-between text-xs text-arena-muted sm:hidden">
            <span className="flex items-center gap-1 text-[11px] text-arena-accent font-semibold">
              ⇄ Swipe sideways to navigate rounds
            </span>
            <span className="font-mono text-[10px]">{bracket.total_rounds} Rounds</span>
          </div>

          <div className="overflow-x-auto pb-4 focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:outline-none rounded-2xl" tabIndex={0} aria-label="Tournament Single Elimination Bracket">
            <BracketView bracket={bracket as Bracket} tournamentSlug={tournament.slug} />
          </div>
        </section>
      ) : (
        <div className="mt-8">
          <EmptyState
            icon="🏆"
            title="Bracket Not Generated Yet"
            description="The tournament organizer will publish the single elimination bracket once registration closes and teams are locked in."
            actionLabel={admin ? (generate.isPending ? "Generating…" : "⚡ Generate Bracket Now") : "← Back to Tournament"}
            actionHref={admin ? undefined : `/tournaments/${tournament.slug}`}
            onAction={admin ? () => generate.mutate() : undefined}
          />
        </div>
      )}
    </main>
  );
}
