"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { generateAdminBracket, validateBracketTeamCount, BRACKET_TEAM_COUNTS, BRACKET_TEAM_COUNT_ERROR } from "@/lib/admin/brackets";
import type { Tournament } from "@/types/tournament";

export function BracketControls({ tournament, registeredCount, hasBracket }: { tournament: Tournament; registeredCount: number; hasBracket: boolean }) {
  const client = useQueryClient();
  const minimumMet = (BRACKET_TEAM_COUNTS as readonly number[]).includes(registeredCount);
  const closed = new Date(tournament.registration_close_at).getTime() <= Date.now() || tournament.status === "ongoing" || tournament.status === "completed";
  const generate = useMutation({ mutationFn: () => { validateBracketTeamCount(registeredCount); return generateAdminBracket(tournament.id, hasBracket); }, onSuccess: () => { toast.success(hasBracket ? "Bracket regenerated" : "Bracket generated"); void client.invalidateQueries({ queryKey: ["admin"] }); void client.invalidateQueries({ queryKey: ["admin-bracket", tournament.id] }); }, onError: (error: Error) => toast.error(error.message === BRACKET_TEAM_COUNT_ERROR ? BRACKET_TEAM_COUNT_ERROR : error.message.replaceAll("_", " ")) });
  const run = () => { if (hasBracket && !window.confirm("Regenerate this bracket? Existing bracket matches will be replaced.")) return; generate.mutate(); };
  return <div><p className="text-sm text-arena-muted">{hasBracket ? "A bracket is already generated." : closed && minimumMet ? "Ready to generate from checked-in teams." : "Close registration and check in 2, 4, 8, 16, or 32 teams first."}</p><button className="btn-primary mt-4" disabled={generate.isPending || !closed || !minimumMet} onClick={run}>{generate.isPending ? "Generating…" : hasBracket ? "Regenerate bracket" : "Generate bracket"}</button></div>;
}
