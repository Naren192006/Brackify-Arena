"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { submitMatchScore } from "@/lib/matches/data";

export function MatchReport({ matchId, disabled = false }: { matchId: string; disabled?: boolean }) {
  const queryClient = useQueryClient();
  const [team1Score, setTeam1Score] = useState("");
  const [team2Score, setTeam2Score] = useState("");
  const report = useMutation({ mutationFn: () => { const first = Number(team1Score); const second = Number(team2Score); if (!Number.isInteger(first) || !Number.isInteger(second) || first < 0 || second < 0 || first === second) throw new Error("Scores must be whole numbers and cannot be tied."); return submitMatchScore(matchId, first, second); }, onSuccess: () => { toast.success("Score submitted for review"); setTeam1Score(""); setTeam2Score(""); void queryClient.invalidateQueries({ queryKey: ["match", matchId] }); }, onError: (error: Error) => toast.error(error.message.replaceAll("_", " ")) });
  return <form className="mt-5 grid gap-3 sm:grid-cols-[1fr_1fr_auto]" onSubmit={(event) => { event.preventDefault(); report.mutate(); }}><input aria-label="Team one score" inputMode="numeric" pattern="[0-9]*" value={team1Score} onChange={(event) => setTeam1Score(event.target.value)} placeholder="Team 1 score" disabled={disabled || report.isPending} /><input aria-label="Team two score" inputMode="numeric" pattern="[0-9]*" value={team2Score} onChange={(event) => setTeam2Score(event.target.value)} placeholder="Team 2 score" disabled={disabled || report.isPending} /><button className="btn-primary" disabled={disabled || report.isPending}>{report.isPending ? "Submitting…" : "Report score"}</button></form>;
}
