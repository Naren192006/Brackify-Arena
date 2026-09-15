"use client";

import type { Team } from "@/types/arena";

type DeleteTeamModalProps = {
  isOpen: boolean;
  onClose: () => void;
  team: Team | null;
  onConfirm: (teamId: string) => Promise<void>;
  isDeleting: boolean;
};

export function DeleteTeamModal({
  isOpen,
  onClose,
  team,
  onConfirm,
  isDeleting,
}: DeleteTeamModalProps) {
  if (!isOpen || !team) return null;

  const handleClose = () => {
    if (isDeleting) return;
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
      <div className="relative w-full max-w-md rounded-2xl border border-red-500/30 bg-zinc-950/95 p-5 sm:p-6 shadow-2xl backdrop-blur-xl space-y-4 sm:space-y-5 my-auto">
        {/* Header */}
        <div className="flex items-start gap-3.5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-red-500/30 bg-red-500/10 text-red-400">
            <svg
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
              />
            </svg>
          </div>
          <div>
            <h2 className="text-lg sm:text-xl font-bold text-arena-text">Delete Team</h2>
            <p className="mt-1 text-xs sm:text-sm text-zinc-300">
              Are you sure you want to permanently delete &ldquo;<span className="font-semibold text-arena-text">{team.name}</span>&rdquo;?
            </p>
          </div>
        </div>

        {/* Warning Banner */}
        <div className="rounded-xl border border-red-500/20 bg-red-950/30 p-3 sm:p-3.5 text-xs text-red-300/90 leading-relaxed">
          <p className="font-semibold text-red-200">This action cannot be undone.</p>
          <p className="mt-1 text-[11px] sm:text-xs text-red-300/80">
            All team rosters and pending invitations will be permanently removed.
          </p>
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
            onClick={() => onConfirm(team.id)}
            disabled={isDeleting}
            className="w-full sm:w-auto flex items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 sm:py-2 text-xs font-semibold text-arena-text hover:bg-red-500 transition-colors disabled:cursor-not-allowed disabled:bg-red-900/40 disabled:text-red-300/40 text-center"
          >
            {isDeleting ? (
              <>
                <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-arena-text border-t-transparent" />
                <span>Deleting Team…</span>
              </>
            ) : (
              <span>Delete Team</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
