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
  const tournamentQuery = useQuery({ queryKey: ["tournament", slug], queryFn: () => getTournament(slug) });
  const tournamentId = tournamentQuery.data?.id;
  const bracketQuery = useQuery({ queryKey: ["bracket", tournamentId], queryFn: () => getBracket(tournamentId!), enabled: Boolean(tournamentId), refetchInterval: 5000, refetchOnWindowFocus: true });
  useEffect(() => { if (!tournamentId) return; void supabase.auth.getUser().then(async ({ data }) => { if (!data.user) return; const result = await supabase.from("tournament_admins").select("tournament_id").eq("tournament_id", tournamentId).eq("user_id", data.user.id).maybeSingle(); setAdmin(!result.error && Boolean(result.data)); }); }, [tournamentId]);
  const generate = useMutation({ mutationFn: () => generateBracket(tournamentId!), onSuccess: () => { toast.success("Bracket generated"); void queryClient.invalidateQueries({ queryKey: ["bracket", tournamentId] }); }, onError: (error: Error) => toast.error(error.message.replaceAll("_", " ")) });
  if (tournamentQuery.isLoading) return <main className="mx-auto max-w-7xl animate-pulse px-4 py-16 sm:px-6"><div className="h-10 w-1/2 rounded bg-white/5" /><div className="mt-8 h-96 rounded-2xl bg-white/5" /></main>;
  if (!tournamentQuery.data) return <main className="mx-auto max-w-7xl px-4 py-16 sm:px-6"><p className="text-arena-danger">Tournament not found.</p></main>;
  const bracket = bracketQuery.data;
  const currentRound = bracket ? bracket.rounds.find((round) => round.matches.some((match) => match.status !== "completed"))?.round_number ?? bracket.total_rounds : null;
  return <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6"><Link href={`/tournaments/${tournamentQuery.data.slug}`} className="text-sm text-arena-accent hover:underline">← Tournament details</Link><div className="mt-6 flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm uppercase tracking-[0.25em] text-arena-accent">{tournamentQuery.data.game} · {tournamentQuery.data.mode}</p><h1 className="mt-2 font-display text-4xl font-bold text-white">{tournamentQuery.data.title} bracket</h1></div>{bracket ? <span className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs uppercase text-arena-accent">Current round {currentRound ?? "—"}</span> : admin ? <button className="btn-primary" disabled={generate.isPending} onClick={() => generate.mutate()}>{generate.isPending ? "Generating…" : "Generate bracket"}</button> : null}</div>{bracketQuery.isLoading ? <div className="mt-8 h-96 animate-pulse rounded-2xl bg-white/5" /> : bracket ? <section className="glass-card mt-8 rounded-2xl p-6"><BracketView bracket={bracket as Bracket} tournamentSlug={slug} /></section> : <section className="glass-card mt-8 rounded-2xl p-10 text-center"><p className="font-display text-2xl font-semibold text-white">Bracket not generated yet</p><p className="mt-2 text-arena-muted">The tournament admin will publish the bracket after check-in closes.</p></section>}</main>;
}
