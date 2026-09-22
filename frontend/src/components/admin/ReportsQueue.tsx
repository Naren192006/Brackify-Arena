"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  FairPlayReport,
  countAdminReportsApi,
  listAdminReportsApi,
  updateReportStatusApi,
} from "@/lib/reports/fair_play";
import { MatchReportsReviewQueue } from "./MatchReportsReviewQueue";

const STATUS_FILTERS = [
  ["all", "All Reports"],
  ["pending", "Pending Review"],
  ["investigating", "Investigating"],
  ["resolved", "Resolved"],
  ["rejected", "Rejected"],
  ["banned", "Banned"],
];

function getStatusBadge(status: string) {
  switch (status) {
    case "pending":
      return "border-amber-400/40 bg-amber-400/15 text-amber-300";
    case "investigating":
      return "border-cyan-400/40 bg-arena-bg-elevated text-arena-accent";
    case "resolved":
      return "border-emerald-400/40 bg-emerald-400/15 text-emerald-400";
    case "rejected":
      return "border-arena-border bg-arena-bg-elevated text-arena-muted";
    case "banned":
      return "border-red-500/50 bg-red-500/20 text-arena-danger font-bold";
    default:
      return "border-arena-border bg-arena-bg-elevated text-arena-text";
  }
}

export function ReportsQueue() {
  const queryClient = useQueryClient();
  const [activeFilter, setActiveFilter] = useState<string>("pending");
  const [page, setPage] = useState<number>(1);
  const pageSize = 15;
  const [activeSection, setActiveSection] = useState<"results" | "fairplay">("results");
  const [selectedReportForNotes, setSelectedReportForNotes] = useState<FairPlayReport | null>(null);
  const [noteContent, setNoteContent] = useState("");
  const [banConfirmReport, setBanConfirmReport] = useState<FairPlayReport | null>(null);

  // ── 1. Fetch Paginated Reports & Total Count ──────────────────────────────
  const filterVal = activeFilter === "all" ? undefined : activeFilter;

  const countQuery = useQuery<number>({
    queryKey: ["admin-fair-play-reports-count", activeFilter],
    queryFn: () => countAdminReportsApi(filterVal),
  });

  const reportsQuery = useQuery<FairPlayReport[]>({
    queryKey: ["admin-fair-play-reports", activeFilter, page],
    queryFn: async () => {
      return listAdminReportsApi(filterVal, page, pageSize);
    },
    refetchInterval: 12_000,
  });

  // ── 2. Update Status Mutation ─────────────────────────────────────────────
  const statusMutation = useMutation({
    mutationFn: async ({
      id,
      status,
      notes,
    }: {
      id: string;
      status: "pending" | "investigating" | "resolved" | "rejected" | "banned";
      notes?: string;
    }) => {
      return updateReportStatusApi(id, status, notes);
    },
    onSuccess: (_, variables) => {
      toast.success(`Report status updated to ${variables.status.toUpperCase()}.`);
      setSelectedReportForNotes(null);
      setBanConfirmReport(null);
      void queryClient.invalidateQueries({ queryKey: ["admin-fair-play-reports"] });
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to update report status");
    },
  });

  const reports = reportsQuery.data ?? [];
  const totalCount = countQuery.data ?? reports.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 space-y-6">
      {/* ── Page Header ──────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-arena-border pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="flex h-2.5 w-2.5 rounded-full bg-arena-accent animate-pulse" />
            <p className="text-xs uppercase tracking-[0.25em] text-arena-accent font-semibold">
              Tournament Administration
            </p>
          </div>
          <h1 className="mt-1 font-display text-3xl font-bold text-arena-text tracking-tight">
            Reports & Results Review
          </h1>
          <p className="mt-1 text-sm text-arena-muted">
            Verify submitted match results, review screenshot evidence, advance brackets, and investigate fair play incidents.
          </p>
        </div>

        <button
          onClick={() => reportsQuery.refetch()}
          className="rounded-xl border border-arena-border bg-white/[0.04] px-3.5 py-2 text-xs font-semibold text-arena-muted hover:text-arena-text transition-colors"
        >
          ↻ Refresh Queue
        </button>
      </div>

      {/* ── Section Switcher: Match Results vs Fair Play ──────────────────── */}
      <div className="flex items-center gap-3 border-b border-arena-border pb-4">
        <button
          onClick={() => setActiveSection("results")}
          className={`flex items-center gap-2 rounded-xl px-5 py-2.5 text-xs font-bold transition-all ${
            activeSection === "results"
              ? "bg-arena-accent text-black shadow-md shadow-cyan-950/40"
              : "border border-arena-border bg-arena-bg-elevated text-arena-muted hover:text-arena-text"
          }`}
        >
          <span></span> Match Score Reports & Evidence
        </button>
        <button
          onClick={() => setActiveSection("fairplay")}
          className={`flex items-center gap-2 rounded-xl px-5 py-2.5 text-xs font-bold transition-all ${
            activeSection === "fairplay"
              ? "bg-arena-accent text-black shadow-md shadow-cyan-950/40"
              : "border border-arena-border bg-arena-bg-elevated text-arena-muted hover:text-arena-text"
          }`}
        >
          <span></span> Fair Play & Disputes
        </button>
      </div>

      {activeSection === "results" ? (
        <MatchReportsReviewQueue />
      ) : (
        <>
          {/* ── Status Tabs ──────────────────────────────────────────────────── */}
          <div className="flex flex-wrap items-center gap-2">
            {STATUS_FILTERS.map(([val, label]) => (
              <button
                key={val}
                onClick={() => {
                  setActiveFilter(val);
                  setPage(1);
                }}
                className={`rounded-xl px-4 py-2 text-xs font-semibold transition-colors ${
                  activeFilter === val
                    ? "bg-cyan-400/20 border border-cyan-400/40 text-arena-accent shadow-sm"
                    : "border border-arena-border bg-white/[0.02] text-arena-muted hover:text-arena-text"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

      {/* ── Reports Table ────────────────────────────────────────────────── */}
      <section className="overflow-x-auto rounded-3xl border border-arena-border bg-[#0a0e1a]/80 shadow-2xl backdrop-blur-xl">
        <table className="w-full min-w-[950px] text-left text-xs">
          <thead className="border-b border-arena-border bg-white/[0.02] text-arena-muted font-mono uppercase tracking-wider text-[10px]">
            <tr>
              <th className="px-5 py-3.5">Reporter</th>
              <th className="px-5 py-3.5">Accused</th>
              <th className="px-5 py-3.5">Reason & Details</th>
              <th className="px-5 py-3.5">Match</th>
              <th className="px-5 py-3.5">Tournament</th>
              <th className="px-5 py-3.5">Status</th>
              <th className="px-5 py-3.5 text-right">Actions</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-white/5">
            {reportsQuery.isLoading ? (
              <tr>
                <td colSpan={7} className="px-5 py-12 text-center text-arena-muted animate-pulse">
                  Loading incident reports…
                </td>
              </tr>
            ) : reports.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-5 py-16 text-center text-arena-muted">
                  <span className="text-3xl block mb-2"></span>
                  <p className="font-semibold text-arena-text">No reports found in this status queue.</p>
                  <p className="text-xs text-arena-muted mt-0.5">
                    All matches in this filter are currently clean and in compliance.
                  </p>
                </td>
              </tr>
            ) : (
              reports.map((report) => (
                <tr key={report.id} className="hover:bg-white/[0.02] transition-colors">
                  {/* Reporter */}
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      {report.reporter_team?.logo_url ? (
                        <img
                          src={report.reporter_team.logo_url}
                          alt=""
                          className="h-8 w-8 rounded-lg border border-arena-border bg-black/40 object-cover"
                        />
                      ) : (
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-arena-border bg-arena-bg-elevated font-bold text-arena-text">
                          {report.reporter_team?.name?.slice(0, 1) || "R"}
                        </div>
                      )}
                      <div>
                        <p className="font-semibold text-arena-text">
                          {report.reporter_team?.name || "Player / Team"}
                        </p>
                        {report.reporter_team?.tag ? (
                          <span className="text-[10px] text-arena-accent font-mono">
                            [{report.reporter_team.tag}]
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </td>

                  {/* Accused */}
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      {report.accused_team?.logo_url ? (
                        <img
                          src={report.accused_team.logo_url}
                          alt=""
                          className="h-8 w-8 rounded-lg border border-red-500/30 bg-black/40 object-cover"
                        />
                      ) : (
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-red-500/30 bg-red-500/10 font-bold text-red-400">
                          {report.accused_team?.name?.slice(0, 1) || "A"}
                        </div>
                      )}
                      <div>
                        <p className="font-semibold text-red-200">
                          {report.accused_team?.name || "Opponent Slot"}
                        </p>
                        {report.accused_team?.tag ? (
                          <span className="text-[10px] text-red-400 font-mono">
                            [{report.accused_team.tag}]
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </td>

                  {/* Reason & Details */}
                  <td className="px-5 py-4 max-w-xs">
                    <span className="inline-block rounded-md border border-arena-border bg-arena-bg-elevated px-2 py-0.5 text-[11px] font-semibold text-arena-text">
                      {report.reason}
                    </span>
                    <p className="mt-1 text-[11px] text-arena-muted line-clamp-2 leading-relaxed">
                      {report.description}
                    </p>
                    {report.admin_notes ? (
                      <div className="mt-1 rounded border border-arena-accent bg-cyan-400/5 p-1.5 text-[10px] text-cyan-300">
                        <span className="font-semibold text-arena-accent uppercase">Note:</span>{" "}
                        {report.admin_notes}
                      </div>
                    ) : null}
                  </td>

                  {/* Match */}
                  <td className="px-5 py-4 whitespace-nowrap">
                    {report.match_id ? (
                      <Link
                        href={`/dashboard/matches/${report.match_id}`}
                        className="text-arena-accent hover:underline font-mono font-semibold"
                      >
                        Round {report.match?.round_number ?? 1} · Match #{report.match?.match_number ?? 1} →
                      </Link>
                    ) : (
                      <span className="text-arena-muted">—</span>
                    )}
                  </td>

                  {/* Tournament */}
                  <td className="px-5 py-4">
                    {report.tournament ? (
                      <Link
                        href={`/tournaments/${report.tournament.slug}`}
                        className="font-semibold text-arena-text hover:text-arena-accent transition-colors line-clamp-1"
                      >
                        {report.tournament.title}
                      </Link>
                    ) : (
                      <span className="text-arena-muted">—</span>
                    )}
                    <span className="text-[10px] text-arena-muted/70 font-mono block mt-0.5">
                      {new Date(report.created_at).toLocaleDateString([], {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </td>

                  {/* Status */}
                  <td className="px-5 py-4 whitespace-nowrap">
                    <span
                      className={`inline-block rounded-full border px-2.5 py-0.5 font-mono text-[10px] uppercase font-semibold ${getStatusBadge(
                        report.status
                      )}`}
                    >
                      {report.status}
                    </span>
                  </td>

                  {/* Actions */}
                  <td className="px-5 py-4 text-right whitespace-nowrap">
                    <div className="flex items-center justify-end gap-1.5">
                      {report.status !== "resolved" ? (
                        <button
                          disabled={statusMutation.isPending}
                          onClick={() =>
                            statusMutation.mutate({ id: report.id, status: "resolved" })
                          }
                          className="rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-2.5 py-1 text-[11px] font-semibold text-arena-success hover:bg-emerald-500/25 transition-colors disabled:opacity-50"
                          title="Mark Resolved"
                        >
                          Resolve
                        </button>
                      ) : null}

                      {report.status !== "rejected" ? (
                        <button
                          disabled={statusMutation.isPending}
                          onClick={() =>
                            statusMutation.mutate({ id: report.id, status: "rejected" })
                          }
                          className="rounded-lg border border-arena-border bg-white/[0.04] px-2.5 py-1 text-[11px] font-semibold text-arena-muted hover:text-arena-text transition-colors disabled:opacity-50"
                          title="Reject Report"
                        >
                          Reject
                        </button>
                      ) : null}

                      {report.status !== "banned" ? (
                        <button
                          disabled={statusMutation.isPending}
                          onClick={() => setBanConfirmReport(report)}
                          className="rounded-lg border border-red-500/40 bg-red-500/15 px-2.5 py-1 text-[11px] font-semibold text-arena-danger hover:bg-red-500/25 transition-colors disabled:opacity-50"
                          title="Ban / Disqualify Team"
                        >
                          Ban Team
                        </button>
                      ) : null}

                      <button
                        onClick={() => {
                          setSelectedReportForNotes(report);
                          setNoteContent(report.admin_notes || "");
                        }}
                        className="rounded-lg border border-arena-accent bg-arena-bg-elevated px-2.5 py-1 text-[11px] font-semibold text-arena-accent hover:bg-cyan-400/20 transition-colors"
                        title="Add Moderator Notes"
                      >
                        Notes
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>

      {/* ── Pagination Controls ────────────────────────────────────────── */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-arena-border pt-4 px-2">
          <p className="text-xs text-arena-muted">
            Showing <span className="font-semibold text-arena-text font-mono">{reports.length}</span> of{" "}
            <span className="font-semibold text-arena-text font-mono">{totalCount}</span> reports (Page{" "}
            <span className="font-semibold text-arena-text font-mono">{page}</span> of{" "}
            <span className="font-semibold text-arena-text font-mono">{totalPages}</span>)
          </p>
          <div className="flex items-center gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="rounded-xl border border-arena-border bg-white/[0.04] px-3.5 py-1.5 text-xs font-semibold text-arena-text-secondary hover:text-arena-text disabled:opacity-30 disabled:pointer-events-none transition-colors"
            >
              ← Previous
            </button>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="rounded-xl border border-arena-border bg-white/[0.04] px-3.5 py-1.5 text-xs font-semibold text-arena-text-secondary hover:text-arena-text disabled:opacity-30 disabled:pointer-events-none transition-colors"
            >
              Next →
            </button>
          </div>
        </div>
      )}

      {/* ── Add Notes Modal ──────────────────────────────────────────────── */}
      {selectedReportForNotes ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-3xl border border-white/15 bg-[#0d121f] p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-arena-border pb-3">
              <h3 className="font-display text-base font-bold text-arena-text">
                Moderator Arbitration Notes
              </h3>
              <button
                onClick={() => setSelectedReportForNotes(null)}
                className="rounded-lg p-1 text-arena-muted hover:text-arena-text"
              >

              </button>
            </div>

            <div className="space-y-3 text-xs">
              <p className="text-arena-muted">
                Report #{selectedReportForNotes.id.slice(0, 8)} · Reason:{" "}
                <span className="text-arena-text font-semibold">{selectedReportForNotes.reason}</span>
              </p>

              <textarea
                rows={4}
                value={noteContent}
                onChange={(e) => setNoteContent(e.target.value)}
                placeholder="Add internal investigation findings, discord communications, or ruling rationale..."
                className="w-full rounded-xl border border-arena-border bg-[#090d16] p-3 text-xs text-arena-text placeholder-arena-muted focus:border-cyan-400/50 focus:outline-none"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setSelectedReportForNotes(null)}
                className="rounded-xl border border-arena-border px-4 py-2 text-xs text-arena-muted hover:text-arena-text"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={statusMutation.isPending}
                onClick={() =>
                  statusMutation.mutate({
                    id: selectedReportForNotes.id,
                    status: selectedReportForNotes.status,
                    notes: noteContent.trim(),
                  })
                }
                className="rounded-xl border border-cyan-400/40 bg-cyan-400/20 px-5 py-2 text-xs font-semibold text-arena-accent hover:bg-cyan-400/30 disabled:opacity-50"
              >
                {statusMutation.isPending ? "Saving…" : "Save Notes"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* ── Ban Team Confirmation Modal (Placeholder Action) ──────────────── */}
      {banConfirmReport ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-3xl border border-red-500/40 bg-[#0d121f] p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3 border-b border-arena-border pb-3">
              <span className="text-2xl"></span>
              <div>
                <h3 className="font-display text-base font-bold text-arena-text">
                  Confirm Team Disqualification & Ban
                </h3>
                <p className="text-[11px] text-red-400">Competitive Integrity Action</p>
              </div>
            </div>

            <div className="space-y-2 text-xs text-arena-muted">
              <p>
                Are you sure you want to flag and ban the accused team for:
              </p>
              <div className="rounded-xl border border-red-500/20 bg-red-950/20 p-3 text-arena-text">
                <p className="font-bold text-arena-danger">
                  {banConfirmReport.accused_team?.name || "Accused Team Slot"}
                </p>
                <p className="text-[11px] text-arena-muted mt-1">
                  Violation: {banConfirmReport.reason}
                </p>
              </div>
              <p className="text-[11px]">
                This will mark the fair play report as <span className="text-arena-danger font-bold uppercase">BANNED</span> and notify tournament arbiters.
              </p>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-arena-border">
              <button
                type="button"
                onClick={() => setBanConfirmReport(null)}
                className="rounded-xl border border-arena-border px-4 py-2 text-xs text-arena-muted hover:text-arena-text"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={statusMutation.isPending}
                onClick={() =>
                  statusMutation.mutate({
                    id: banConfirmReport.id,
                    status: "banned",
                    notes: `Team banned by admin: ${banConfirmReport.reason}`,
                  })
                }
                className="rounded-xl border border-red-500/50 bg-red-600 px-5 py-2 text-xs font-bold text-arena-text hover:bg-red-500 disabled:opacity-50 transition-colors shadow-lg shadow-red-950/50"
              >
                {statusMutation.isPending ? "Applying Ban…" : "Confirm Ban"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
        </>
      )}
    </main>
  );
}
