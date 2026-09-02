"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { matchReportsApi, ApiRequestError } from "@/lib/api/client";
import type { MatchReport } from "@/types/match";

const statusBadges: Record<string, { label: string; cls: string }> = {
  submitted: { label: "Pending Review", cls: "border-amber-400/30 bg-amber-400/10 text-amber-300" },
  approved: { label: "Approved", cls: "border-cyan-400/30 bg-cyan-400/10 text-arena-accent font-semibold" },
  rejected: { label: "Rejected", cls: "border-red-400/30 bg-red-400/10 text-red-300" },
};

export function MatchReportHistoryTable({
  matchId,
  currentUserId,
  isAdmin,
}: {
  matchId: string;
  currentUserId: string | null;
  isAdmin: boolean;
}) {
  const queryClient = useQueryClient();
  const [editingReport, setEditingReport] = useState<MatchReport | null>(null);
  const [editScore1, setEditScore1] = useState("");
  const [editScore2, setEditScore2] = useState("");
  const [editNotes, setEditNotes] = useState("");

  const reportsQuery = useQuery({
    queryKey: ["match-reports", matchId],
    queryFn: () => matchReportsApi.getByMatch(matchId),
    refetchInterval: 6000,
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!editingReport || !currentUserId) return;
      const s1 = Number(editScore1);
      const s2 = Number(editScore2);
      if (!Number.isInteger(s1) || !Number.isInteger(s2) || s1 < 0 || s2 < 0 || s1 === s2) {
        throw new Error("Scores must be non-negative whole numbers and cannot be tied.");
      }
      return matchReportsApi.update(editingReport.id, {
        user_id: currentUserId,
        team1_score: s1,
        team2_score: s2,
        notes: editNotes.trim() || null,
      });
    },
    onSuccess: () => {
      toast.success("Match report updated");
      setEditingReport(null);
      void queryClient.invalidateQueries({ queryKey: ["match-reports", matchId] });
      void queryClient.invalidateQueries({ queryKey: ["match"] });
    },
    onError: (err) => {
      const msg = err instanceof ApiRequestError ? err.message : err instanceof Error ? err.message : "Failed to update report";
      toast.error(msg);
    },
  });

  const reports = reportsQuery.data ?? [];

  if (reportsQuery.isLoading) {
    return (
      <div className="mt-6 rounded-xl border border-white/10 bg-white/[0.02] p-6 text-center text-sm text-arena-muted">
        Loading match reports…
      </div>
    );
  }

  if (!reports.length) {
    return null;
  }

  return (
    <section className="mt-8">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-display text-lg font-semibold tracking-wide text-white">
          Match Report Log
        </h2>
        <span className="text-xs text-arena-muted">
          {reports.length} {reports.length === 1 ? "submission" : "submissions"}
        </span>
      </div>

      <div className="overflow-x-auto rounded-xl border border-white/10 bg-white/[0.02]">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead className="border-b border-white/10 bg-white/[0.04] text-xs uppercase tracking-wider text-arena-muted">
            <tr>
              <th className="px-4 py-3">Submitted</th>
              <th className="px-4 py-3">Score (T1 vs T2)</th>
              <th className="px-4 py-3">Winner</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Notes / Evidence</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5 text-white">
            {reports.map((report) => {
              const badge = statusBadges[report.status] ?? {
                label: report.status,
                cls: "border-white/10 bg-white/5 text-arena-muted",
              };
              const canEdit =
                report.status === "submitted" &&
                (isAdmin || (currentUserId && report.reported_by === currentUserId));

              return (
                <tr key={report.id} className="transition-colors hover:bg-white/[0.02]">
                  <td className="px-4 py-3 text-xs text-arena-muted whitespace-nowrap">
                    {new Date(report.created_at).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}{" "}
                    · {new Date(report.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 font-mono font-bold text-arena-accent">
                    {report.team1_score} – {report.team2_score}
                  </td>
                  <td className="px-4 py-3 font-semibold text-white">
                    {report.winner_team ? (
                      <span>
                        {report.winner_team.name}
                        {report.winner_team.tag ? ` [${report.winner_team.tag}]` : ""}
                      </span>
                    ) : (
                      "Calculated"
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider ${badge.cls}`}
                    >
                      {badge.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-arena-muted max-w-[200px] truncate">
                    {report.notes ? <span>{report.notes} </span> : null}
                    {report.evidence_url ? (
                      <a
                        href={report.evidence_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-arena-accent hover:underline inline-block"
                      >
                        [Proof]
                      </a>
                    ) : null}
                    {!report.notes && !report.evidence_url ? "—" : null}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {canEdit ? (
                      <button
                        type="button"
                        className="rounded-lg border border-white/10 px-2.5 py-1 text-xs text-arena-muted hover:border-cyan-400/40 hover:text-white transition-colors"
                        onClick={() => {
                          setEditingReport(report);
                          setEditScore1(String(report.team1_score));
                          setEditScore2(String(report.team2_score));
                          setEditNotes(report.notes ?? "");
                        }}
                      >
                        Edit
                      </button>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Edit Modal Dialog */}
      {editingReport ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0d121f] p-6 shadow-2xl">
            <h3 className="font-display text-xl font-bold text-white">Edit Match Report</h3>
            <p className="mt-1 text-xs text-arena-muted">
              Update submitted score and details before official review.
            </p>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                updateMutation.mutate();
              }}
              className="mt-4 space-y-4"
            >
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-xs uppercase text-arena-muted">Team 1 Score</span>
                  <input
                    type="number"
                    min="0"
                    required
                    value={editScore1}
                    onChange={(e) => setEditScore1(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white font-mono text-base focus:border-cyan-400 focus:outline-none"
                  />
                </label>

                <label className="block">
                  <span className="text-xs uppercase text-arena-muted">Team 2 Score</span>
                  <input
                    type="number"
                    min="0"
                    required
                    value={editScore2}
                    onChange={(e) => setEditScore2(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white font-mono text-base focus:border-cyan-400 focus:outline-none"
                  />
                </label>
              </div>

              <label className="block">
                <span className="text-xs uppercase text-arena-muted">Notes (Optional)</span>
                <textarea
                  rows={2}
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  placeholder="Additional context or comments..."
                  className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:border-cyan-400 focus:outline-none"
                />
              </label>

              <div className="mt-6 flex justify-end gap-2">
                <button
                  type="button"
                  className="rounded-lg border border-white/10 px-4 py-2 text-xs text-arena-muted hover:text-white"
                  onClick={() => setEditingReport(null)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={updateMutation.isPending}
                  className="btn-primary px-4 py-2 text-xs"
                >
                  {updateMutation.isPending ? "Saving…" : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </section>
  );
}

