"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getMyAdminRole, listManagedTournaments } from "@/lib/admin/roles";
import { deleteTournamentApi } from "@/lib/admin/tournaments";

type ManagedTournament = {
  id: string;
  title: string;
  slug: string;
  game: string;
  status: string;
  max_teams: number;
  registration_open_at: string;
  registration_close_at: string;
  start_time: string;
  created_by: string;
  banner_url?: string | null;
  entry_fee_minor?: number;
  entry_fee_currency?: string;
  registered_count: number;
};

export default function AdminTournamentsPage() {
  const [search, setSearch] = useState("");
  const [selectedTournament, setSelectedTournament] = useState<ManagedTournament | null>(null);
  const [confirmTitle, setConfirmTitle] = useState("");
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const queryClient = useQueryClient();

  // 1. Fetch user role
  const roleQuery = useQuery({
    queryKey: ["my-admin-role"],
    queryFn: getMyAdminRole,
  });

  const isAdmin = roleQuery.data === "super_admin" || roleQuery.data === "sub_admin";

  // 2. Fetch tournaments
  const tournamentsQuery = useQuery({
    queryKey: ["managed-tournaments"],
    queryFn: listManagedTournaments,
  });

  // 3. Delete mutation with optimistic update
  const deleteMutation = useMutation({
    mutationFn: async (tournament: ManagedTournament) => {
      return await deleteTournamentApi(tournament.id);
    },
    onMutate: async (tournamentToDelete) => {
      await queryClient.cancelQueries({ queryKey: ["managed-tournaments"] });
      const previousTournaments = queryClient.getQueryData<ManagedTournament[]>(["managed-tournaments"]);

      if (previousTournaments) {
        queryClient.setQueryData<ManagedTournament[]>(
          ["managed-tournaments"],
          previousTournaments.filter((t) => t.id !== tournamentToDelete.id)
        );
      }

      return { previousTournaments };
    },
    onError: (err: any, _tournament, context) => {
      if (context?.previousTournaments) {
        queryClient.setQueryData(["managed-tournaments"], context.previousTournaments);
      }
      setFeedback({
        type: "error",
        message: err?.message || "Failed to delete tournament. Please try again.",
      });
    },
    onSuccess: (_data, tournament) => {
      setFeedback({
        type: "success",
        message: `Tournament "${tournament.title}" was permanently deleted.`,
      });
      setSelectedTournament(null);
      setConfirmTitle("");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["managed-tournaments"] });
    },
  });

  const tournaments = ((tournamentsQuery.data as ManagedTournament[]) ?? []).filter((item) =>
    item.title.toLowerCase().includes(search.toLowerCase())
  );

  const isDeleteConfirmed = selectedTournament && confirmTitle.trim() === selectedTournament.title.trim();

  const handleOpenDeleteModal = (tournament: ManagedTournament) => {
    setSelectedTournament(tournament);
    setConfirmTitle("");
    setFeedback(null);
  };

  const handleCloseDeleteModal = () => {
    if (deleteMutation.isPending) return;
    setSelectedTournament(null);
    setConfirmTitle("");
  };

  const handleConfirmDelete = () => {
    if (!selectedTournament || !isDeleteConfirmed || deleteMutation.isPending) return;
    deleteMutation.mutate(selectedTournament);
  };

  return (
    <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-[0.25em] text-arena-accent">Manage</p>
          <h1 className="mt-2 font-display text-4xl font-bold text-white">Tournaments</h1>
        </div>
        <Link href="/admin/tournaments/create" className="btn-primary px-4 py-2">
          Create tournament
        </Link>
      </div>

      {/* Feedback Banner */}
      {feedback && (
        <div
          className={`mt-6 flex items-center justify-between rounded-xl p-4 text-sm ${
            feedback.type === "success"
              ? "border border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
              : "border border-red-500/30 bg-red-500/10 text-red-400"
          }`}
        >
          <span>{feedback.message}</span>
          <button
            onClick={() => setFeedback(null)}
            className="text-xs font-semibold uppercase tracking-wider opacity-70 hover:opacity-100"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Search Input */}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
        <input
          className="input-field max-w-sm"
          placeholder="Search tournaments..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <div className="text-xs text-arena-muted">
          Showing {tournaments.length} tournament{tournaments.length === 1 ? "" : "s"}
        </div>
      </div>

      {/* Tournaments Table */}
      <div className="mt-6 overflow-x-auto rounded-2xl border border-white/10 bg-arena-card/40 backdrop-blur-sm">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="bg-white/[0.04] text-arena-muted">
            <tr>
              <th className="p-4">Tournament</th>
              <th>Game</th>
              <th>Status</th>
              <th>Registered</th>
              <th>Start Date</th>
              <th className="p-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {tournaments.map((item) => (
              <tr className="border-t border-white/10 text-white transition hover:bg-white/[0.02]" key={item.id}>
                <td className="p-4">
                  <div className="flex items-center gap-3">
                    {item.banner_url ? (
                      <div className="relative h-10 w-16 flex-shrink-0 overflow-hidden rounded-lg border border-white/10 bg-black/40">
                        <Image
                          src={item.banner_url}
                          alt={item.title}
                          fill
                          sizes="64px"
                          className="object-cover"
                          unoptimized
                        />
                      </div>
                    ) : (
                      <div className="flex h-10 w-16 flex-shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-xs text-arena-muted">
                        🎮
                      </div>
                    )}
                    <div>
                      <div className="font-semibold text-white">{item.title}</div>
                      <div className="text-xs text-arena-muted">/{item.slug}</div>
                    </div>
                  </div>
                </td>
                <td className="font-medium text-arena-muted">{item.game}</td>
                <td>
                  <span className="inline-flex rounded-full bg-arena-accent/10 px-2.5 py-0.5 text-xs font-semibold uppercase text-arena-accent">
                    {item.status}
                  </span>
                </td>
                <td className="text-arena-muted">
                  <span className="font-medium text-white">{item.registered_count}</span>/{item.max_teams}
                </td>
                <td className="text-arena-muted">{new Date(item.start_time).toLocaleDateString()}</td>
                <td className="p-4 text-right">
                  <div className="flex items-center justify-end gap-3">
                    <Link
                      className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-arena-accent transition hover:bg-white/10 hover:text-white"
                      href={`/admin/tournaments/${item.slug}`}
                    >
                      Control Room
                    </Link>

                    {isAdmin && (
                      <button
                        type="button"
                        onClick={() => handleOpenDeleteModal(item)}
                        className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-400 transition hover:bg-red-500/20 hover:text-red-300"
                        title="Delete Tournament (Admin Only)"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {!tournaments.length && (
          <div className="p-12 text-center text-arena-muted">
            {tournamentsQuery.isLoading ? "Loading tournaments..." : "No tournaments found."}
          </div>
        )}
      </div>

      {/* Destructive Confirmation Modal */}
      {selectedTournament && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md animate-in fade-in duration-200">
          <div className="relative w-full max-w-lg rounded-2xl border border-red-500/30 bg-zinc-950 p-6 shadow-2xl">
            {/* Modal Header */}
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-red-500/10 text-red-400">
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                  />
                </svg>
              </div>
              <div>
                <h3 className="font-display text-xl font-bold text-white">Delete Tournament</h3>
                <p className="text-xs text-arena-muted">Permanent administrative deletion</p>
              </div>
            </div>

            {/* Tournament Details Card */}
            <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.02] p-4">
              {selectedTournament.banner_url && (
                <div className="relative mb-3 h-28 w-full overflow-hidden rounded-lg border border-white/10 bg-black/40">
                  <Image
                    src={selectedTournament.banner_url}
                    alt={selectedTournament.title}
                    fill
                    sizes="(max-width: 768px) 100vw, 512px"
                    className="object-cover"
                    unoptimized
                  />
                </div>
              )}
              <div className="flex items-center justify-between text-sm">
                <span className="font-semibold text-white">{selectedTournament.title}</span>
                <span className="rounded bg-white/10 px-2 py-0.5 text-xs text-arena-accent uppercase">
                  {selectedTournament.game}
                </span>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-arena-muted">
                <div>
                  Registered Teams:{" "}
                  <span className="text-white font-medium">
                    {selectedTournament.registered_count} / {selectedTournament.max_teams}
                  </span>
                </div>
                <div>
                  Entry Fee:{" "}
                  <span className="text-white font-medium">
                    {selectedTournament.entry_fee_minor
                      ? `₹${(selectedTournament.entry_fee_minor / 100).toFixed(2)}`
                      : "Free"}
                  </span>
                </div>
              </div>
            </div>

            {/* Warning Message */}
            <div className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-200">
              <p className="font-medium">⚠️ This action cannot be undone.</p>
              <p className="mt-1 opacity-90">
                All matches, match reports, brackets, announcements, notes, and participant registrations will be
                permanently purged. Payment records will be safely preserved as <strong>cancelled_admin</strong> for audit
                and financial compliance.
              </p>
            </div>

            {/* Confirmation Input */}
            <div className="mt-4">
              <label className="block text-xs font-medium text-arena-muted">
                Please type <strong className="text-white select-all">{selectedTournament.title}</strong> to confirm:
              </label>
              <input
                type="text"
                className="input-field mt-1.5 w-full font-mono text-sm"
                placeholder={selectedTournament.title}
                value={confirmTitle}
                onChange={(e) => setConfirmTitle(e.target.value)}
                disabled={deleteMutation.isPending}
                autoFocus
              />
            </div>

            {/* Error Message inside modal */}
            {deleteMutation.isError && (
              <div className="mt-3 text-xs text-red-400">
                {(deleteMutation.error as any)?.message || "Failed to delete tournament."}
              </div>
            )}

            {/* Modal Actions */}
            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={handleCloseDeleteModal}
                disabled={deleteMutation.isPending}
                className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-white transition hover:bg-white/10 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={!isDeleteConfirmed || deleteMutation.isPending}
                className="rounded-xl bg-red-600 px-4 py-2 text-xs font-semibold text-white shadow-lg shadow-red-600/30 transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {deleteMutation.isPending ? (
                  <span className="flex items-center gap-2">
                    <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                    Deleting...
                  </span>
                ) : (
                  "Delete Forever"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
