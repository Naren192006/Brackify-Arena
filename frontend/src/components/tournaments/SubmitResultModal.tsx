"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { submitMatchScore } from "@/lib/matches/data";

export function SubmitResultModal({ matchId, teamIsA = true, disabled = false }: { matchId: string; teamIsA?: boolean; disabled?: boolean }) {
  const client = useQueryClient();
  const [teamScore, setTeamScore] = useState("");
  const [opponentScore, setOpponentScore] = useState("");
  const submit = useMutation({ mutationFn: () => {
    const first = Number(teamScore); const second = Number(opponentScore);
    if (!Number.isInteger(first) || !Number.isInteger(second) || first < 0 || second < 0 || first === second) throw new Error("Scores must be whole numbers, non-negative, and cannot be tied.");
    return submitMatchScore(matchId, teamIsA ? first : second, teamIsA ? second : first);
  }, onSuccess: () => { toast.success("Result submitted for approval"); setTeamScore(""); setOpponentScore(""); void client.invalidateQueries({ queryKey: ["match", matchId] }); void client.invalidateQueries({ queryKey: ["current-match"] }); }, onError: (error: Error) => toast.error(error.message.replaceAll("_", " ")) });
  return <form className="mt-4 grid gap-2 sm:grid-cols-[1fr_1fr_auto]" onSubmit={(event) => { event.preventDefault(); submit.mutate(); }}><input aria-label="Your team score" inputMode="numeric" pattern="[0-9]*" value={teamScore} onChange={(event) => setTeamScore(event.target.value)} placeholder="Your score" disabled={disabled || submit.isPending} /><input aria-label="Opponent score" inputMode="numeric" pattern="[0-9]*" value={opponentScore} onChange={(event) => setOpponentScore(event.target.value)} placeholder="Opponent score" disabled={disabled || submit.isPending} /><button className="btn-primary px-3 py-2 text-sm" disabled={disabled || submit.isPending}>{submit.isPending ? "Submitting…" : "Submit result"}</button></form>;
}
