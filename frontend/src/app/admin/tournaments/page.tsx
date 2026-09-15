"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAdminAuth } from "@/context/AdminAuthContext";
import {
  AdminTournamentItem,
  getAdminTournamentList,
  listAdminTournamentsApi,
  transitionAdminTournamentLifecycleApi,
} from "@/lib/admin/tournaments";
import { DeleteTournamentModal } from "@/components/admin/DeleteTournamentModal";

const STATUS_OPTIONS = [
  { label: "All Statuses", value: "all" },
  { label: "Draft", value: "draft" },
  { label: "Published", value: "published" },
  { label: "Registration Open", value: "registration_open" },
  { label: "Registration Closed", value: "registration_closed" },
  { label: "Live", value: "live" },
  { label: "Paused", value: "paused" },
  { label: "Completed", value: "completed" },
  { label: "Cancelled", value: "cancelled" },
];

function getStatusBadgeClass(status: string) {
  const s = status.toLowerCase();
  switch (s) {
    case "draft":
      return "bg-zinc-500/15 text-zinc-300 border-zinc-500/30";
    case "published":
      return "bg-blue-500/15 text-blue-300 border-blue-500/30";
    case "registration_open":
    case "open":
      return "bg-emerald-500/15 text-arena-success border-emerald-500/30";
    case "registration_closed":
      return "bg-amber-500/15 text-amber-300 border-amber-500/30";
    case "live":
    case "ongoing":
      return "bg-rose-500/15 text-rose-300 border-rose-500/30 animate-pulse";
    case "paused":
      return "bg-orange-500/15 text-orange-300 border-orange-500/30";
    case "completed":
      return "bg-purple-500/15 text-purple-300 border-purple-500/30";
    case "cancelled":
      return "bg-red-900/20 text-red-400 border-red-800/30";
    default:
      return "bg-zinc-500/15 text-zinc-300 border-zinc-500/30";
  }
}

function formatStatusLabel(status: string) {
  return status.replace(/_/g, " ").toUpperCase();
}

export default function AdminTournamentsPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize] = useState(15);
  const [busySlug, setBusySlug] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; slug: string; title: string } | null>(null);

  const { admin } = useAdminAuth();
  const canDelete = admin?.role === "super_admin" || admin?.permissions?.includes("delete_tournaments") || admin?.permissions?.includes("all");

  const queryClient = useQueryClient();

  // Fetch paginated admin tournaments using unified getAdminTournamentList
  const tournamentsQuery = useQuery({
    queryKey: ["admin-tournaments-list", search, statusFilter, page, pageSize],
    queryFn: () =>
      getAdminTournamentList({
        search,
        status: statusFilter,
        page,
        pageSize,
      }),
  });

  // Lifecycle mutation
  const lifecycleMutation = useMutation({
    mutationFn: async ({
      slug,
      action,
    }: {
      slug: string;
      action: "publish" | "open_registration" | "close_registration" | "start_live" | "pause" | "resume" | "complete" | "cancel";
    }) => {
      setBusySlug(slug);
      return await transitionAdminTournamentLifecycleApi(slug, action);
    },
    onSuccess: (data) => {
      toast.success(`Tournament "${data.title}" transitioned to ${formatStatusLabel(data.status)}.`);
      queryClient.invalidateQueries({ queryKey: ["admin-tournaments-list"] });
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to update lifecycle.");
    },
    onSettled: () => {
      setBusySlug(null);
    },
  });

  const handleAction = (slug: string, action: "publish" | "open_registration" | "close_registration" | "start_live" | "pause" | "resume" | "complete" | "cancel", title: string) => {
    if (action === "cancel" && !window.confirm(`Are you sure you want to cancel tournament "${title}"?`)) {
      return;
    }
    lifecycleMutation.mutate({ slug, action });
  };

  const data = tournamentsQuery.data;
  const items = data?.items ?? [];
  const totalPages = data?.total_pages ?? 1;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-arena-accent">Operations Portal</p>
          <h1 className="mt-1 font-display text-3xl font-bold text-arena-text">Tournament Dashboard</h1>
          <p className="text-xs text-arena-muted mt-0.5">
            Admin directory, tournament discovery, and competitive arenas.
          </p>
        </div>
        <Link
          href="/admin/tournaments/create"
          className="btn-primary flex items-center gap-2 px-4 py-2.5 text-sm font-semibold shadow-lg shadow-cyan-500/10"
        >
          <span>+ Create Tournament</span>
        </Link>
      </div>

      {/* Search and Status Filter Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-arena-border bg-arena-surface/80 p-4 backdrop-blur-md">
        <div className="flex flex-1 flex-wrap items-center gap-3">
          {/* Search Bar */}
          <div className="relative min-w-[240px] max-w-sm flex-1">
            <input
              type="text"
              className="input-field w-full pl-9 text-xs"
              placeholder="Search by tournament name, slug, game…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
            <span className="absolute left-3 top-2.5 text-arena-muted text-xs">🔍</span>
          </div>

          {/* Status Filter Dropdown */}
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-arena-muted whitespace-nowrap">Status:</label>
            <select
              className="input-field bg-arena-bg text-arena-text text-xs py-2 px-3"
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="text-xs text-arena-muted">
          Showing <span className="font-semibold text-arena-text">{items.length}</span> of{" "}
          <span className="font-semibold text-arena-text">{data?.total ?? 0}</span> tournaments
        </div>
      </div>

      {/* Tournament Table */}
      <div className="overflow-x-auto rounded-2xl border border-arena-border bg-arena-surface/80 backdrop-blur-md shadow-2xl">
        <table className="w-full min-w-[960px] text-left text-sm">
          <thead className="border-b border-arena-border bg-white/[0.03] text-xs uppercase tracking-wider text-arena-muted">
            <tr>
              <th className="p-4 font-semibold w-16">Banner</th>
              <th className="p-4 font-semibold">Tournament</th>
              <th className="p-4 font-semibold">Game</th>
              <th className="p-4 font-semibold">Platform</th>
              <th className="p-4 font-semibold">Status</th>
              <th className="p-4 font-semibold">Entry Fee</th>
              <th className="p-4 font-semibold">Registered Teams</th>
              <th className="p-4 font-semibold">Start Date</th>
              <th className="p-4 text-right font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {items.map((t) => {
              const statusNormalized = t.status.toLowerCase();
              const isItemBusy = busySlug === t.slug || busySlug === t.id;

              return (
                <tr key={t.id} className="text-white/90 transition-colors hover:bg-white/[0.02]">
                  {/* Banner */}
                  <td className="p-4">
                    {t.banner_url ? (
                      <div className="relative h-10 w-16 flex-shrink-0 overflow-hidden rounded-lg border border-arena-border bg-black/40">
                        <Image
                          src={t.banner_url}
                          alt={t.title}
                          fill
                          sizes="64px"
                          className="object-cover"
                          unoptimized
                        />
                      </div>
                    ) : (
                      <div className="flex h-10 w-16 flex-shrink-0 items-center justify-center rounded-lg border border-arena-border bg-arena-bg-elevated text-sm">
                        🎮
                      </div>
                    )}
                  </td>

                  {/* Tournament */}
                  <td className="p-4">
                    <Link
                      href={`/admin/tournaments/${t.slug}`}
                      className="font-semibold text-arena-text hover:text-arena-accent transition-colors block"
                    >
                      {t.title}
                    </Link>
                    <span className="text-xs text-arena-muted font-mono">/{t.slug}</span>
                  </td>

                  {/* Game */}
                  <td className="p-4 font-medium text-arena-text">{t.game}</td>

                  {/* Platform */}
                  <td className="p-4">
                    <span className="rounded bg-arena-bg-elevated px-2 py-1 text-xs text-arena-muted border border-arena-border">
                      {t.platform}
                    </span>
                  </td>

                  {/* Status */}
                  <td className="p-4">
                    <span
                      className={`inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider ${getStatusBadgeClass(
                        t.status
                      )}`}
                    >
                      {formatStatusLabel(t.status)}
                    </span>
                  </td>

                  {/* Entry Fee */}
                  <td className="p-4 font-medium">
                    {t.entry_fee_minor > 0 ? (
                      <span className="text-emerald-400">₹{(t.entry_fee_minor / 100).toFixed(2)}</span>
                    ) : (
                      <span className="text-arena-muted">Free</span>
                    )}
                  </td>

                  {/* Registered Teams */}
                  <td className="p-4">
                    <span className="font-semibold text-arena-text">{t.registered_count}</span>
                    <span className="text-arena-muted"> / {t.max_teams}</span>
                    {t.checked_in_count > 0 && (
                      <span className="ml-1 text-[10px] text-cyan-400">({t.checked_in_count} in)</span>
                    )}
                  </td>

                  {/* Start Date */}
                  <td className="p-4 text-xs text-arena-muted">
                    <div className="text-arena-text font-medium">
                      {new Date(t.start_time).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </div>
                    <div>{new Date(t.start_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
                  </td>

                  {/* Actions (View, Edit, Publish, Pause, Resume, Cancel) */}
                  <td className="p-4 text-right">
                    <div className="flex items-center justify-end gap-1.5 flex-wrap">
                      {/* View */}
                      <Link
                        href={`/admin/tournaments/${t.slug}`}
                        className="rounded-lg border border-arena-border bg-arena-bg-elevated px-2 py-1 text-xs font-medium text-arena-accent hover:bg-arena-bg-elevated hover:text-arena-text transition-colors"
                      >
                        View
                      </Link>

                      {/* Edit */}
                      <Link
                        href={`/admin/tournaments/${t.slug}?tab=settings`}
                        className="rounded-lg border border-arena-border bg-arena-bg-elevated px-2 py-1 text-xs font-medium text-white/80 hover:bg-arena-bg-elevated hover:text-arena-text transition-colors"
                      >
                        Edit
                      </Link>

                      {/* Publish */}
                      {statusNormalized === "draft" && (
                        <button
                          disabled={isItemBusy}
                          onClick={() => handleAction(t.slug, "publish", t.title)}
                          className="rounded-lg border border-blue-500/30 bg-blue-500/10 px-2 py-1 text-xs font-medium text-blue-300 hover:bg-blue-500/20 transition-colors disabled:opacity-50"
                        >
                          {isItemBusy ? "…" : "Publish"}
                        </button>
                      )}

                      {/* Pause */}
                      {(statusNormalized === "live" || statusNormalized === "ongoing") && (
                        <button
                          disabled={isItemBusy}
                          onClick={() => handleAction(t.slug, "pause", t.title)}
                          className="rounded-lg border border-orange-500/30 bg-orange-500/10 px-2 py-1 text-xs font-medium text-orange-300 hover:bg-orange-500/20 transition-colors disabled:opacity-50"
                        >
                          {isItemBusy ? "…" : "Pause"}
                        </button>
                      )}

                      {/* Resume */}
                      {statusNormalized === "paused" && (
                        <button
                          disabled={isItemBusy}
                          onClick={() => handleAction(t.slug, "resume", t.title)}
                          className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-xs font-medium text-arena-success hover:bg-emerald-500/20 transition-colors disabled:opacity-50"
                        >
                          {isItemBusy ? "…" : "Resume"}
                        </button>
                      )}

                      {/* Cancel */}
                      {statusNormalized !== "completed" && statusNormalized !== "cancelled" && (
                        <button
                          disabled={isItemBusy}
                          onClick={() => handleAction(t.slug, "cancel", t.title)}
                          className="rounded-lg border border-zinc-700 bg-zinc-800/40 px-2 py-1 text-[11px] font-medium text-zinc-400 hover:text-arena-danger hover:border-red-500/30 transition-colors disabled:opacity-50"
                        >
                          Cancel
                        </button>
                      )}

                      {/* Delete (Super Admin only or delegated permission) */}
                      {canDelete && (
                        <button
                          disabled={isItemBusy}
                          onClick={() => setDeleteTarget({ id: t.id, slug: t.slug, title: t.title })}
                          className="rounded-lg border border-red-500/30 bg-red-500/10 px-2 py-1 text-[11px] font-medium text-red-400 hover:bg-red-500/20 hover:text-arena-danger transition-colors disabled:opacity-50"
                          title="Delete tournament (Super Admin)"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* Empty State */}
        {!items.length && (
          <div className="p-12 text-center text-arena-muted">
            {tournamentsQuery.isLoading ? (
              <div className="flex flex-col items-center justify-center gap-2">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-arena-accent border-t-transparent" />
                <p className="text-xs">Loading tournament directory…</p>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-base font-semibold text-arena-text">No tournaments found</p>
                <p className="text-xs text-arena-muted">
                  {search || statusFilter !== "all"
                    ? "Try adjusting your search query or status filter."
                    : "No competitive arenas available yet."}
                </p>
                <Link href="/admin/tournaments/create" className="btn-primary inline-block mt-3 px-4 py-2 text-xs">
                  Create Tournament
                </Link>
              </div>
            )}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-arena-border bg-white/[0.02] px-4 py-3 text-xs text-arena-muted">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="rounded-lg border border-arena-border px-3 py-1.5 font-medium text-arena-text hover:bg-arena-bg-elevated disabled:opacity-40"
            >
              ← Previous
            </button>
            <span>
              Page <strong className="text-arena-text">{page}</strong> of <strong className="text-arena-text">{totalPages}</strong>
            </span>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="rounded-lg border border-arena-border px-3 py-1.5 font-medium text-arena-text hover:bg-arena-bg-elevated disabled:opacity-40"
            >
              Next →
            </button>
          </div>
        )}
      </div>

      {/* Delete Tournament Modal */}
      <DeleteTournamentModal
        isOpen={!!deleteTarget}
        tournament={deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onDeleted={() => {
          queryClient.invalidateQueries({ queryKey: ["admin-tournaments-list"] });
        }}
      />
    </div>
  );
}

