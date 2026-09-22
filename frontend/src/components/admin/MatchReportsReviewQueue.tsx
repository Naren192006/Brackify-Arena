"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase/client";
import { apiFetch } from "@/lib/api/client";

type MatchReportReviewItem = {
  id: string;
  match_id: string;
  team1_score: number;
  team2_score: number;
  notes: string | null;
  evidence_url: string | null;
  status: string;
  created_at: string;
  reported_by?: string | null;
  reporter?: { username: string; email: string } | null;
  match?: {
    id: string;
    tournament_id: string;
    round_number: number;
    match_number: number;
    tournaments?: { title: string } | null;
    team1?: { id: string; name: string; tag: string | null; logo_url: string | null } | null;
    team2?: { id: string; name: string; tag: string | null; logo_url: string | null } | null;
  } | null;
};

export function MatchReportsReviewQueue() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<string>("pending");
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  // Fetch match reports with match and team details
  const reportsQuery = useQuery<MatchReportReviewItem[]>({
    queryKey: ["admin-match-score-reports", filter],
    queryFn: async () => {
      let query = supabase
        .from("match_reports")
        .select(`
          id, match_id, team1_score, team2_score, notes, evidence_url, status, created_at, reported_by,
          match:matches(id, tournament_id, round_number, match_number,
            tournaments:tournament_id(title),
            team1:team_a_id(id, name, tag, logo_url),
            team2:team_b_id(id, name, tag, logo_url)
          ),
          reporter:reported_by(username, email)
        `)
        .order("created_at", { ascending: false });

      if (filter === "pending") {
        query = query.in("status", ["pending", "submitted"]);
      } else if (filter !== "all") {
        query = query.eq("status", filter);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data as any) || [];
    },
    refetchInterval: 10000,
  });

  // Action Mutation
  const actionMutation = useMutation({
    mutationFn: async ({
      reportId,
      action,
      reason,
    }: {
      reportId: string;
      action: "approve" | "reject" | "resubmit";
      reason?: string;
    }) => {
      return apiFetch<{ ok: boolean; message: string }>(
        `/api/v1/match-reports/${reportId}/${action}`,
        {
          method: "PATCH",
          body: { reason },
        }
      );
    },
    onSuccess: (_, vars) => {
      if (vars.action === "approve") {
        toast.success("Match report approved! Match completed and winner advanced in bracket. ");
      } else if (vars.action === "reject") {
        toast.success("Match report rejected. Match remains pending.");
      } else {
        toast.success("Resubmission requested from reporting captain.");
      }
      void queryClient.invalidateQueries({ queryKey: ["admin-match-score-reports"] });
      void queryClient.invalidateQueries({ queryKey: ["admin-matches"] });
    },
    onError: (err: Error) => {
      toast.error(err.message || "Action failed");
    },
  });

  const reports = reportsQuery.data ?? [];

  return (
    <div className="space-y-6">
      {/* Filters Bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {["pending", "approved", "rejected", "resubmission_requested", "all"].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-xl px-3.5 py-1.5 text-xs font-semibold uppercase tracking-wider transition-colors ${
                filter === f
                  ? "bg-arena-accent text-black shadow-sm font-bold"
                  : "border border-arena-border bg-arena-bg-elevated text-arena-muted hover:text-arena-text"
              }`}
            >
              {f.replace("_", " ")}
            </button>
          ))}
        </div>

        <button
          onClick={() => reportsQuery.refetch()}
          className="rounded-xl border border-arena-border bg-white/[0.04] px-3 py-1.5 text-xs font-semibold text-arena-muted hover:text-arena-text transition-colors"
        >
          ↻ Refresh
        </button>
      </div>

      {/* Reports List */}
      {reports.length === 0 ? (
        <div className="rounded-2xl border border-arena-border bg-white/[0.02] p-12 text-center">
          <span className="text-3xl block mb-2"></span>
          <h3 className="text-sm font-bold text-arena-text">No match score reports</h3>
          <p className="mt-1 text-xs text-arena-muted">
            Player match submissions requiring admin verification will appear here.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {reports.map((report) => {
            const m = report.match;
            const t1 = m?.team1;
            const t2 = m?.team2;
            const isPending = report.status === "pending" || report.status === "submitted";
            const screenshots = report.evidence_url ? report.evidence_url.split(",").map((s) => s.trim()) : [];

            return (
              <div
                key={report.id}
                className="overflow-hidden rounded-2xl border border-arena-border bg-white/[0.02] p-5 shadow-lg space-y-4"
              >
                {/* Header */}
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-arena-border pb-3">
                  <div>
                    <span className="text-xs text-arena-accent font-semibold">
                      {m?.tournaments?.title || "Tournament"} • Round {m?.round_number || 1} • Match #{m?.match_number || 1}
                    </span>
                    <span className="ml-3 font-mono text-[10px] text-arena-muted">
                      Reported: {new Date(report.created_at).toLocaleString()}
                    </span>
                  </div>

                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                      report.status === "approved"
                        ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                        : report.status === "rejected"
                          ? "bg-red-500/20 text-arena-danger border border-red-500/30"
                          : report.status === "resubmission_requested"
                            ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                            : "bg-cyan-400/20 text-arena-accent border border-arena-accent animate-pulse"
                    }`}
                  >
                    {report.status}
                  </span>
                </div>

                {/* Match Score & Teams */}
                <div className="grid grid-cols-1 md:grid-cols-3 items-center gap-6">
                  {/* Teams and Score */}
                  <div className="md:col-span-2 flex items-center justify-around rounded-xl border border-arena-border bg-black/40 p-4">
                    <div className="text-center">
                      <p className="font-bold text-arena-text text-sm">{t1?.name || "Team 1"}</p>
                      <p className="font-mono text-2xl font-black text-arena-accent mt-1">
                        {report.team1_score}
                      </p>
                    </div>
                    <span className="text-sm font-black text-white/30">VS</span>
                    <div className="text-center">
                      <p className="font-bold text-arena-text text-sm">{t2?.name || "Team 2"}</p>
                      <p className="font-mono text-2xl font-black text-arena-accent mt-1">
                        {report.team2_score}
                      </p>
                    </div>
                  </div>

                  {/* Reporter & Notes */}
                  <div className="text-xs space-y-1">
                    <p className="text-arena-muted">
                      <span className="text-white/40">Reporter:</span>{" "}
                      {report.reporter?.username || report.reporter?.email || report.reported_by || "Player"}
                    </p>
                    {report.notes ? (
                      <p className="text-white/80 bg-arena-bg-elevated p-2 rounded-lg border border-arena-border text-[11px]">
                        &ldquo;{report.notes}&rdquo;
                      </p>
                    ) : null}
                  </div>
                </div>

                {/* Uploaded Screenshots */}
                {screenshots.length > 0 ? (
                  <div>
                    <span className="block text-[11px] uppercase tracking-wider text-arena-muted mb-2 font-semibold">
                      Uploaded Scoreboard Evidence ({screenshots.length}):
                    </span>
                    <div className="flex flex-wrap gap-3">
                      {screenshots.map((url, i) => (
                        <button
                          key={i}
                          onClick={() => setSelectedImage(url)}
                          className="group relative h-20 w-32 overflow-hidden rounded-xl border border-arena-border hover:border-cyan-400 transition-all"
                        >
                          <img src={url} alt="Evidence" className="h-full w-full object-cover group-hover:scale-105 transition-transform" />
                          <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 flex items-center justify-center text-[10px] font-bold text-arena-text transition-opacity">
                            View
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}

                {/* Admin Actions: Approve, Reject, Resubmit (PART 5) */}
                {isPending ? (
                  <div className="flex flex-wrap items-center justify-end gap-2.5 pt-3 border-t border-arena-border">
                    <button
                      disabled={actionMutation.isPending}
                      onClick={() =>
                        actionMutation.mutate({
                          reportId: report.id,
                          action: "resubmit",
                          reason: "Scoreboard unclear or missing required rounds.",
                        })
                      }
                      className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-3.5 py-1.5 text-xs font-semibold text-amber-300 hover:bg-amber-500/20 disabled:opacity-40 transition-colors"
                    >
                      Request Resubmission
                    </button>

                    <button
                      disabled={actionMutation.isPending}
                      onClick={() =>
                        actionMutation.mutate({
                          reportId: report.id,
                          action: "reject",
                          reason: "Evidence does not match reported scores.",
                        })
                      }
                      className="rounded-xl border border-red-500/40 bg-red-500/10 px-3.5 py-1.5 text-xs font-semibold text-arena-danger hover:bg-red-500/20 disabled:opacity-40 transition-colors"
                    >
                      Reject
                    </button>

                    <button
                      disabled={actionMutation.isPending}
                      onClick={() =>
                        actionMutation.mutate({
                          reportId: report.id,
                          action: "approve",
                        })
                      }
                      className="rounded-xl border border-emerald-500/50 bg-emerald-500/20 px-4 py-1.5 text-xs font-bold text-emerald-400 hover:bg-emerald-500/30 disabled:opacity-40 transition-all shadow-md shadow-emerald-950/40"
                    >
                       Approve (Complete & Advance)
                    </button>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      {/* Image Preview Modal */}
      {selectedImage ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 backdrop-blur-md"
          onClick={() => setSelectedImage(null)}
        >
          <div className="relative max-w-4xl max-h-[90vh]">
            <img src={selectedImage} alt="Enlarged evidence" className="max-h-[85vh] w-auto rounded-2xl border border-white/20 object-contain shadow-2xl" />
            <button
              onClick={() => setSelectedImage(null)}
              className="absolute top-3 right-3 rounded-full bg-black/80 px-3 py-1 text-xs text-arena-text font-bold border border-white/20"
            >
               Close
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
