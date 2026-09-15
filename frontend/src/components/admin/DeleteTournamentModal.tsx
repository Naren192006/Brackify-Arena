"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { deleteTournamentApi } from "@/lib/admin/tournaments";

type DeleteTournamentModalProps = {
  isOpen: boolean;
  onClose: () => void;
  tournament: {
    id: string;
    slug: string;
    title: string;
  } | null;
  onDeleted: (tournamentId: string) => void;
};

export function DeleteTournamentModal({
  isOpen,
  onClose,
  tournament,
  onDeleted,
}: DeleteTournamentModalProps) {
  const queryClient = useQueryClient();
  const [confirmTitle, setConfirmTitle] = useState("");
  const [reason, setReason] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  if (!isOpen || !tournament) return null;

  const isTitleMatch =
    confirmTitle.trim().toLowerCase() === tournament.title.trim().toLowerCase();

  const handleDelete = async () => {
    if (!isTitleMatch || isDeleting) return;

    setIsDeleting(true);
    try {
      const result = await deleteTournamentApi(
        tournament.slug || tournament.id,
        reason.trim() || "Admin operational deletion",
        confirmTitle.trim()
      );

      // Remove individual tournament cache entries immediately
      queryClient.removeQueries({ queryKey: ["tournament", tournament.slug] });
      queryClient.removeQueries({ queryKey: ["tournament", tournament.id] });
      queryClient.removeQueries({ queryKey: ["live-bracket", tournament.slug] });
      queryClient.removeQueries({ queryKey: ["complete-bracket", tournament.slug] });
      queryClient.removeQueries({ queryKey: ["admin-tournament-detail", tournament.slug] });
      queryClient.removeQueries({ queryKey: ["admin-tournament-detail", tournament.id] });

      // Invalidate list queries across all admin and public pages
      queryClient.invalidateQueries({ queryKey: ["tournaments"] });
      queryClient.invalidateQueries({ queryKey: ["admin-tournaments"] });
      queryClient.invalidateQueries({ queryKey: ["admin-tournaments-list"] });
      queryClient.invalidateQueries({ queryKey: ["public-tournaments"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["managed-tournaments"] });
      queryClient.invalidateQueries({ queryKey: ["tournament"] });
      queryClient.invalidateQueries({ queryKey: ["registered-tournaments"] });
      queryClient.invalidateQueries({ queryKey: ["live-bracket"] });
      queryClient.invalidateQueries({ queryKey: ["complete-bracket"] });

      toast.success(
        result.message || `Tournament "${tournament.title}" was successfully deleted.`
      );
      setConfirmTitle("");
      setReason("");
      onDeleted(tournament.id);
      onClose();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to delete tournament. Super Admin privileges required.");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleClose = () => {
    if (isDeleting) return;
    setConfirmTitle("");
    setReason("");
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      {/* Backdrop */}
      <div
        onClick={handleClose}
        className="fixed inset-0 bg-black/80 backdrop-blur-sm transition-opacity"
      />

      {/* Modal Card */}
      <div className="relative w-full max-w-lg rounded-2xl border border-red-500/30 bg-zinc-950/95 p-4 sm:p-6 shadow-2xl backdrop-blur-xl space-y-4 sm:space-y-6 my-auto">
        {/* Header */}
        <div className="flex items-start gap-3 sm:gap-3.5">
          <div className="flex h-9 w-9 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-xl border border-red-500/30 bg-red-500/10 text-red-400">
            <svg
              className="h-4 w-4 sm:h-5 sm:w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-bold text-arena-text">Delete Tournament</h2>
            <p className="text-[11px] sm:text-xs text-zinc-400">
              This action requires Super Admin authorization and is irreversible.
            </p>
          </div>
        </div>

        {/* Warning Banner */}
        <div className="rounded-xl border border-red-500/20 bg-red-950/30 p-3 sm:p-3.5 text-xs text-red-300/90 leading-relaxed space-y-1.5">
          <p className="font-semibold text-red-200">Warning: Permanent Deletion</p>
          <ul className="list-disc list-inside space-y-1 text-red-300/80 text-[11px] sm:text-xs">
            <li>
              Tournament <strong className="text-arena-text">&ldquo;{tournament.title}&rdquo;</strong> and all associated brackets, matches, and registrations will be permanently deleted.
            </li>
            <li>Pending and paid payments will be cancelled with audit records maintained.</li>
            <li>This action cannot be undone.</li>
          </ul>
        </div>

        {/* Confirmation Input */}
        <div className="space-y-3 sm:space-y-4">
          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1.5">
              To confirm, type <span className="font-semibold text-red-400 select-all">&ldquo;{tournament.title}&rdquo;</span> below:
            </label>
            <input
              type="text"
              value={confirmTitle}
              onChange={(e) => setConfirmTitle(e.target.value)}
              placeholder="Enter exact tournament title"
              disabled={isDeleting}
              className="w-full rounded-xl border border-arena-border bg-arena-bg-elevated px-3.5 py-2 sm:py-2.5 text-xs sm:text-sm text-arena-text placeholder-zinc-500 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500 transition-colors"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1.5">
              Reason for Deletion (Optional)
            </label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g., Organizer request, scheduling conflict"
              disabled={isDeleting}
              className="w-full rounded-xl border border-arena-border bg-arena-bg-elevated px-3.5 py-2 sm:py-2.5 text-xs sm:text-sm text-arena-text placeholder-zinc-500 focus:border-white/20 focus:outline-none transition-colors"
            />
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col-reverse sm:flex-row items-center justify-end gap-2 sm:gap-3 pt-2">
          <button
            type="button"
            onClick={handleClose}
            disabled={isDeleting}
            className="w-full sm:w-auto rounded-xl border border-arena-border bg-arena-bg-elevated px-4 py-2.5 sm:py-2 text-xs font-semibold text-zinc-300 hover:bg-arena-bg-elevated hover:text-arena-text transition-colors disabled:opacity-50 text-center"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={!isTitleMatch || isDeleting}
            className="w-full sm:w-auto flex items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 sm:py-2 text-xs font-semibold text-arena-text hover:bg-red-500 transition-colors disabled:cursor-not-allowed disabled:bg-red-900/40 disabled:text-red-300/40 text-center"
          >
            {isDeleting ? (
              <>
                <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-arena-text border-t-transparent" />
                <span>Deleting Tournament…</span>
              </>
            ) : (
              <span>Delete this tournament</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
