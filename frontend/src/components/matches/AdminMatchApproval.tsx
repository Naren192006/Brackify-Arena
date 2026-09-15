"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { approveMatchResult, rejectMatchResult } from "@/lib/matches/data";

export function AdminMatchApproval({ matchId }: { matchId: string }) {
  const queryClient = useQueryClient();
  const review = useMutation({ mutationFn: async (decision: "approve" | "reject") => decision === "approve" ? approveMatchResult(matchId) : rejectMatchResult(matchId), onSuccess: (_, decision) => { toast.success(decision === "approve" ? "Match result approved" : "Match result rejected"); void queryClient.invalidateQueries({ queryKey: ["match", matchId] }); void queryClient.invalidateQueries({ queryKey: ["bracket"] }); }, onError: (error: Error) => toast.error(error.message.replaceAll("_", " ")) });
  return <div className="mt-5 flex flex-wrap gap-3"><button className="btn-primary" disabled={review.isPending} onClick={() => review.mutate("approve")}>Approve result</button><button className="rounded-lg border border-arena-border px-4 py-2 text-sm text-arena-muted hover:text-arena-text" disabled={review.isPending} onClick={() => review.mutate("reject")}>Reject result</button></div>;
}
