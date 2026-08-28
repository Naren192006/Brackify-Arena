"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { approveMatchResult, editMatchScore, endMatch, forceMatchWinner, rejectMatchResult, resetMatch, startMatch } from "@/lib/matches/data";
import type { AdminMatch } from "@/types/admin";

type Action = "approve" | "reject" | "start" | "end" | "reset" | "force_a" | "force_b";

export function MatchManager({ tournamentId, matches }: { tournamentId: string; matches: AdminMatch[] }) {
  const client = useQueryClient();
  const [editing, setEditing] = useState<string | null>(null);
  const [scores, setScores] = useState({ team1: "", team2: "" });
  const review = useMutation({
    mutationFn: async ({ id, action }: { id: string; action: Action }) => {
      const match = matches.find((item) => item.id === id);
      if (!match) throw new Error("match_not_found");
      if (action === "approve") return approveMatchResult(id);
      if (action === "reject") return rejectMatchResult(id);
      if (action === "start") return startMatch(id);
      if (action === "end") return endMatch(id);
      if (action === "reset") return resetMatch(id);
      return forceMatchWinner(id, action === "force_a" ? match.team_a_id ?? "" : match.team_b_id ?? "");
    },
    onSuccess: () => { toast.success("Match updated"); refreshQueries(client, tournamentId); },
    onError: (error: Error) => toast.error(error.message.replaceAll("_", " ")),
  });
  const edit = useMutation({
    mutationFn: ({ id, team1, team2 }: { id: string; team1: number; team2: number }) => editMatchScore(id, team1, team2),
    onSuccess: () => { toast.success("Score updated"); setEditing(null); refreshQueries(client, tournamentId); },
    onError: (error: Error) => toast.error(error.message.replaceAll("_", " ")),
  });
  return <div className="space-y-3">{matches.length ? matches.map((match) => {
    const canStart = (match.status === "scheduled" || match.status === "pending") && Boolean(match.team_a_id && match.team_b_id);
    const canEnd = match.status === "live" && match.team1_score !== null && match.team2_score !== null;
    const awaiting = match.status === "reported" || match.status === "awaiting_approval";
    const isEditing = editing === match.id;
    return <article className="rounded-xl border border-white/10 bg-white/[0.04] p-4" key={match.id}>
      <div className="flex flex-wrap items-center justify-between gap-3"><p className="font-semibold text-white">Round {match.round_number} · Match {match.match_number}</p><span className="text-xs uppercase text-arena-accent">{match.status.replaceAll("_", " ")}</span></div>
      <div className="mt-2 grid gap-1 text-sm text-white sm:grid-cols-2"><span>Team A: {match.team_a?.name ?? shortId(match.team_a_id)}</span><span>Team B: {match.team_b?.name ?? shortId(match.team_b_id)}</span></div>
      <p className="mt-2 text-sm text-arena-muted">Score: {match.team1_score ?? "–"} : {match.team2_score ?? "–"}{match.winner_team_id ? ` · Winner: ${match.winner_team_id === match.team_a_id ? "Team A" : "Team B"}` : ""}</p>
      {isEditing ? <form className="mt-3 flex flex-wrap gap-2" onSubmit={(event) => { event.preventDefault(); edit.mutate({ id: match.id, team1: Number(scores.team1), team2: Number(scores.team2) }); }}><input className="w-24" inputMode="numeric" value={scores.team1} onChange={(event) => setScores((value) => ({ ...value, team1: event.target.value }))} placeholder="Team A" /><input className="w-24" inputMode="numeric" value={scores.team2} onChange={(event) => setScores((value) => ({ ...value, team2: event.target.value }))} placeholder="Team B" /><button className="btn-primary px-3 py-1.5 text-xs" disabled={edit.isPending}>Save score</button><button type="button" className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-arena-muted" onClick={() => setEditing(null)}>Cancel</button></form> : <div className="mt-3 flex flex-wrap gap-2">{canStart ? <ActionButton label="Start match" disabled={review.isPending} onClick={() => review.mutate({ id: match.id, action: "start" })} /> : null}{canEnd ? <ActionButton label="End match" disabled={review.isPending} onClick={() => review.mutate({ id: match.id, action: "end" })} /> : null}{awaiting ? <><ActionButton label="Approve result" disabled={review.isPending} onClick={() => review.mutate({ id: match.id, action: "approve" })} /><ActionButton label="Reject result" muted disabled={review.isPending} onClick={() => review.mutate({ id: match.id, action: "reject" })} /></> : null}{match.status !== "completed" && match.team_a_id && match.team_b_id ? <><ActionButton label="Force Team A" muted disabled={review.isPending} onClick={() => review.mutate({ id: match.id, action: "force_a" })} /><ActionButton label="Force Team B" muted disabled={review.isPending} onClick={() => review.mutate({ id: match.id, action: "force_b" })} /></> : null}{match.status !== "completed" ? <ActionButton label="Edit score" muted disabled={review.isPending} onClick={() => { setEditing(match.id); setScores({ team1: match.team1_score?.toString() ?? "", team2: match.team2_score?.toString() ?? "" }); }} /> : <ActionButton label="Reset" muted disabled={review.isPending} onClick={() => review.mutate({ id: match.id, action: "reset" })} />}</div>}
    </article>;
  }) : <p className="text-sm text-arena-muted">No bracket matches yet.</p>}</div>;
}

function ActionButton({ label, onClick, disabled, muted = false }: { label: string; onClick: () => void; disabled: boolean; muted?: boolean }) { return <button className={muted ? "rounded-lg border border-white/10 px-3 py-1.5 text-xs text-arena-muted hover:text-white" : "btn-primary px-3 py-1.5 text-xs"} disabled={disabled} onClick={onClick}>{label}</button>; }
function shortId(id: string | null) { return id ? `${id.slice(0, 8)}…` : "TBD"; }
function refreshQueries(client: ReturnType<typeof useQueryClient>, tournamentId: string) { for (const key of [["admin-matches", tournamentId], ["admin-analytics", tournamentId], ["admin-bracket", tournamentId], ["bracket", tournamentId], ["current-match"], ["match"], ["notifications"], ["activity"]]) void client.invalidateQueries({ queryKey: key }); }
