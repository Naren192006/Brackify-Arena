"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import type { Match } from "@/types/match";
import { StatusBadge } from "@/components/tournaments/StatusBadge";
import { SubmitResultModal } from "@/components/tournaments/SubmitResultModal";

export function CurrentMatchCard({ match, teamId, tournamentSlug }: { match: Match; teamId: string; tournamentSlug: string }) {
  const opponentId = match.team_a_id === teamId ? match.team_b_id : match.team_a_id;
  const opponent = useQuery({ queryKey: ["match-opponent", opponentId], queryFn: async () => { if (!opponentId) return null; const { data, error } = await supabase.from("teams").select("name,tag").eq("id", opponentId).maybeSingle(); if (error) throw error; return data; }, enabled: Boolean(opponentId) });
  const awaiting = match.status === "awaiting_approval" || match.status === "reported";
  return <article className="rounded-xl border border-cyan-400/20 bg-cyan-400/10 p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs uppercase tracking-wider text-arena-accent">Round {match.round_number} · Current match</p><p className="mt-1 font-display text-xl font-semibold text-white">vs {opponent.data?.name ?? "TBD"}{opponent.data?.tag ? ` [${opponent.data.tag}]` : ""}</p><p className="mt-2 text-xs text-arena-muted">{match.scheduled_at ? new Date(match.scheduled_at).toLocaleString() : "Schedule to be announced"}</p></div><StatusBadge status={awaiting ? "awaiting_approval" : match.status} /></div>{match.team1_score !== null && match.team2_score !== null ? <p className="mt-4 font-display text-2xl text-white">{match.team_a_id === teamId ? match.team1_score : match.team2_score} : {match.team_a_id === teamId ? match.team2_score : match.team1_score}</p> : null}{awaiting ? <p className="mt-4 text-sm text-arena-muted">Waiting for opponent or admin approval.</p> : match.status === "live" ? <SubmitResultModal matchId={match.id} teamIsA={match.team_a_id === teamId} /> : match.status === "scheduled" || match.status === "pending" ? <p className="mt-4 text-sm text-arena-muted">Waiting for the admin to start this match.</p> : null}<Link href={`/tournaments/${tournamentSlug}/matches/${match.id}`} className="mt-3 inline-block text-xs text-arena-accent hover:underline">Open match</Link></article>;
}
