"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { getTournament } from "@/lib/tournaments/data";
import { generateBracket, getBracket } from "@/lib/brackets/data";
import { supabase } from "@/lib/supabase/client";
import { BracketView } from "@/components/brackets/BracketView";
import type { Bracket } from "@/types/bracket";

export function BracketPage({ slug }: { slug: string }) {
  const queryClient = useQueryClient();
  const [admin, setAdmin] = useState(false);

  const tournamentQuery = useQuery({
    queryKey: ["tournament", slug],
    queryFn: () => getTournament(slug),
  });

  const tournamentId = tournamentQuery.data?.id;

  const bracketQuery = useQuery({
    queryKey: ["bracket", tournamentId],
    queryFn: () => getBracket(tournamentId!),
    enabled: Boolean(tournamentId),
    refetchInterval: 5000,
    refetchOnWindowFocus: true,
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
      void queryClient.invalidateQueries({ queryKey: ["bracket", tournamentId] });
      void queryClient.invalidateQueries({ queryKey: ["tournament", slug] });
    },
    onError: (error: Error) => toast.error(error.message.replaceAll("_", " ")),
  });

  if (tournamentQuery.isLoading) {
    return (
      <main className="mx-auto max-w-7xl animate-pulse px-4 py-16 sm:px-6">
        <div className="h-6 w-36 rounded bg-white/5" />
        <div className="mt-4 h-12 w-2/3 rounded bg-white/5" />
        <div className="mt-8 h-96 rounded-2xl bg-white/5" />
      </main>
    );
  }

  if (!tournamentQuery.data) {
    return (
      <main className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
        <p className="text-arena-danger">Tournament not found.</p>
      </main>
    );
  }

  const tournament = tournamentQuery.data;
  const bracket = bracketQuery.data;
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

        <div className="flex items-center gap-3">
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
      {bracketQuery.isLoading ? (
        <div className="mt-8 h-96 animate-pulse rounded-2xl border border-white/5 bg-white/[0.02]" />
      ) : bracket ? (
        <section className="glass-card mt-8 rounded-2xl p-6 sm:p-8">
          <BracketView bracket={bracket as Bracket} tournamentSlug={tournament.slug} />
        </section>
      ) : (
        <section className="glass-card mt-8 rounded-2xl p-12 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-2xl text-arena-accent">
            🏆
          </div>
          <p className="font-display text-2xl font-semibold text-white">
            Bracket not generated yet
          </p>
          <p className="mt-2 text-sm text-arena-muted">
            The tournament admin will publish the single elimination bracket once registration closes.
          </p>
          {admin ? (
            <button
              className="btn-primary mt-6 px-6 py-2.5 text-sm"
              disabled={generate.isPending}
              onClick={() => generate.mutate()}
            >
              {generate.isPending ? "Generating…" : "Generate bracket now"}
            </button>
          ) : null}
        </section>
      )}
    </main>
  );
}
