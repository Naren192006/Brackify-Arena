"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { supabase } from "@/lib/supabase/client";
import { matchReportsApi, ApiRequestError } from "@/lib/api/client";
import { submitMatchScore } from "@/lib/matches/data";

export function MatchReport({ matchId, disabled = false }: { matchId: string; disabled?: boolean }) {
  const queryClient = useQueryClient();
  const [team1Score, setTeam1Score] = useState("");
  const [team2Score, setTeam2Score] = useState("");
  const [notes, setNotes] = useState("");
  const [evidenceUrl, setEvidenceUrl] = useState("");
  const [showExtra, setShowExtra] = useState(false);

  const report = useMutation({
    mutationFn: async () => {
      const first = Number(team1Score);
      const second = Number(team2Score);
      if (!Number.isInteger(first) || !Number.isInteger(second) || first < 0 || second < 0 || first === second) {
        throw new Error("Scores must be whole numbers and cannot be tied.");
      }

      const { data } = await supabase.auth.getUser();
      const userId = data.user?.id;

      if (userId) {
        try {
          return await matchReportsApi.submit({
            match_id: matchId,
            team1_score: first,
            team2_score: second,
            user_id: userId,
            notes: notes.trim() || null,
            evidence_url: evidenceUrl.trim() || null,
          });
        } catch {
          // Fallback to Supabase RPC if FastAPI service is unreachable
          return await submitMatchScore(matchId, first, second);
        }
      }

      return await submitMatchScore(matchId, first, second);
    },
    onSuccess: () => {
      toast.success("Score submitted for review");
      setTeam1Score("");
      setTeam2Score("");
      setNotes("");
      setEvidenceUrl("");
      setShowExtra(false);
      void queryClient.invalidateQueries({ queryKey: ["match"] });
      void queryClient.invalidateQueries({ queryKey: ["match-reports", matchId] });
    },
    onError: (error: Error) => {
      const msg = error instanceof ApiRequestError ? error.message : error.message.replaceAll("_", " ");
      toast.error(msg || "Could not submit report.");
    },
  });

  return (
    <div className="mt-6 rounded-xl border border-white/10 bg-white/[0.02] p-4 sm:p-5">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-base font-semibold text-white">Submit Match Result</h3>
        <button
          type="button"
          onClick={() => setShowExtra(!showExtra)}
          className="text-xs text-arena-accent hover:underline"
        >
          {showExtra ? "Simple Form" : "+ Add Proof / Notes"}
        </button>
      </div>

      <form
        className="mt-4 space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          report.mutate();
        }}
      >
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
          <input
            aria-label="Team one score"
            inputMode="numeric"
            pattern="[0-9]*"
            value={team1Score}
            onChange={(event) => setTeam1Score(event.target.value)}
            placeholder="Team 1 score"
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white font-mono placeholder:text-arena-muted focus:border-cyan-400 focus:outline-none"
            disabled={disabled || report.isPending}
            required
          />
          <input
            aria-label="Team two score"
            inputMode="numeric"
            pattern="[0-9]*"
            value={team2Score}
            onChange={(event) => setTeam2Score(event.target.value)}
            placeholder="Team 2 score"
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white font-mono placeholder:text-arena-muted focus:border-cyan-400 focus:outline-none"
            disabled={disabled || report.isPending}
            required
          />
          <button className="btn-primary px-5 py-2 text-sm" disabled={disabled || report.isPending}>
            {report.isPending ? "Submitting…" : "Report score"}
          </button>
        </div>

        {showExtra ? (
          <div className="mt-3 grid gap-3 border-t border-white/10 pt-3 sm:grid-cols-2">
            <input
              type="url"
              placeholder="Screenshot / VOD Link (optional)"
              value={evidenceUrl}
              onChange={(e) => setEvidenceUrl(e.target.value)}
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white placeholder:text-arena-muted focus:border-cyan-400 focus:outline-none"
            />
            <input
              type="text"
              placeholder="Notes or comments (optional)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white placeholder:text-arena-muted focus:border-cyan-400 focus:outline-none"
            />
          </div>
        ) : null}
      </form>
    </div>
  );
}
