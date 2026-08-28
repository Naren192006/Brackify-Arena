"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { finishTournament } from "@/lib/admin/tournaments";

export function ChampionPanel({ tournamentId, championName, completed }: { tournamentId: string; championName?: string | null; completed: boolean }) {
  const client = useQueryClient();
  const finish = useMutation({ mutationFn: () => finishTournament(tournamentId), onSuccess: () => { toast.success("Tournament finished"); void client.invalidateQueries({ queryKey: ["admin", tournamentId] }); }, onError: (error: Error) => toast.error(error.message.replaceAll("_", " ")) });
  return <div><p className="font-display text-2xl font-semibold text-white">{championName ?? "Champion not decided"}</p>{completed ? <p className="mt-2 text-sm text-arena-muted">Tournament completed.</p> : <button className="btn-primary mt-4" disabled={finish.isPending || !championName} onClick={() => finish.mutate()}>{finish.isPending ? "Finishing…" : "Finish tournament"}</button>}</div>;
}
