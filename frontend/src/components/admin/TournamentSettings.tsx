"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { updateAdminTournamentApi } from "@/lib/admin/tournaments";
import { useAdminAuth } from "@/context/AdminAuthContext";
import { DeleteTournamentModal } from "@/components/admin/DeleteTournamentModal";
import type { Tournament } from "@/types/tournament";

export function TournamentSettings({
  tournament,
  onSaved,
}: {
  tournament: Tournament & {
    platform?: string;
    team_size?: number;
    format?: string;
    timezone?: string;
  };
  onSaved: () => void;
}) {
  const isLiveOrCompleted = ["live", "ongoing", "completed"].includes(tournament.status.toLowerCase());

  const initialValues = useMemo(
  () => ({
    title: tournament.title,
    description: tournament.description ?? "",
    banner_url: tournament.banner_url ?? "",
    rules: tournament.rules ?? "",
    platform: tournament.platform ?? "PC",
    team_size: tournament.team_size ?? 5,
    max_teams: tournament.max_teams,
    entry_fee: tournament.entry_fee_minor
      ? tournament.entry_fee_minor / 100
      : 0,
    format: tournament.format ?? "single_elimination",
    timezone: tournament.timezone ?? "Asia/Kolkata",
    registration_open_at: tournament.registration_open_at
      ? tournament.registration_open_at.slice(0, 16)
      : "",
    registration_close_at: tournament.registration_close_at
      ? tournament.registration_close_at.slice(0, 16)
      : "",
    start_time: tournament.start_time
      ? tournament.start_time.slice(0, 16)
      : "",
  }),
  [tournament]
);

  const router = useRouter();
  const { admin } = useAdminAuth();
  const canDelete = admin?.role === "super_admin" || admin?.permissions?.includes("delete_tournaments") || admin?.permissions?.includes("all");

  const [values, setValues] = useState(initialValues);
  const [busy, setBusy] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  // Track dirty state
  useEffect(() => {
    const changed = JSON.stringify(values) !== JSON.stringify(initialValues);
    setIsDirty(changed);
  }, [values, initialValues]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!values.title.trim() || values.title.trim().length < 3) {
      toast.error("Tournament title must be at least 3 characters.");
      return;
    }

    setBusy(true);
    try {
      await updateAdminTournamentApi(tournament.id, {
        title: values.title.trim(),
        description: values.description.trim() || null,
        banner_url: values.banner_url.trim() || null,
        rules: values.rules.trim() || null,
        platform: values.platform,
        team_size: Number(values.team_size),
        max_teams: Number(values.max_teams),
        entry_fee: Number(values.entry_fee),
        format: values.format,
        timezone: values.timezone,
        registration_open_at: values.registration_open_at ? new Date(values.registration_open_at).toISOString() : undefined,
        registration_close_at: values.registration_close_at ? new Date(values.registration_close_at).toISOString() : undefined,
        start_time: values.start_time ? new Date(values.start_time).toISOString() : undefined,
      });

      toast.success("Tournament configuration saved successfully.");
      setIsDirty(false);
      onSaved();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to update tournament settings.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={handleSave} className="space-y-5">
      {/* Live/Completed Lock Warning */}
      {isLiveOrCompleted && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5 text-xs text-amber-200">
          <p className="font-semibold flex items-center gap-1.5">
            <span>🔒 Tournament is {tournament.status.toUpperCase()}</span>
          </p>
          <p className="mt-1 opacity-90">
            Core properties (capacity, entry fee, team format, and match structure) are locked to maintain competition and payment integrity. You can update description, rules, banner, and scheduling notes.
          </p>
        </div>
      )}

      {/* Unsaved Changes Indicator */}
      {isDirty && (
        <div className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-xs text-cyan-300 flex items-center justify-between animate-pulse">
          <span>⚠️ You have unsaved configuration changes.</span>
          <button
            type="button"
            onClick={() => setValues(initialValues)}
            className="text-[11px] underline hover:text-arena-text"
          >
            Reset
          </button>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {/* Title */}
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-arena-muted mb-1.5">
            Tournament Title *
          </label>
          <input
            type="text"
            required
            className="input-field w-full"
            value={values.title}
            onChange={(e) => setValues((v) => ({ ...v, title: e.target.value }))}
          />
        </div>

        {/* Platform */}
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-arena-muted mb-1.5">
            Platform {isLiveOrCompleted && "(Locked)"}
          </label>
          <select
            disabled={isLiveOrCompleted}
            className="input-field w-full bg-arena-bg text-arena-text disabled:opacity-50 disabled:cursor-not-allowed"
            value={values.platform}
            onChange={(e) => setValues((v) => ({ ...v, platform: e.target.value }))}
          >
            <option value="PC">PC</option>
            <option value="Mobile">Mobile</option>
            <option value="PlayStation">PlayStation</option>
            <option value="Xbox">Xbox</option>
            <option value="Cross-Platform">Cross-Platform</option>
          </select>
        </div>

        {/* Max Teams */}
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-arena-muted mb-1.5">
            Max Teams {isLiveOrCompleted && "(Locked)"}
          </label>
          <input
            type="number"
            min={2}
            max={512}
            disabled={isLiveOrCompleted}
            className="input-field w-full font-mono disabled:opacity-50 disabled:cursor-not-allowed"
            value={values.max_teams}
            onChange={(e) => setValues((v) => ({ ...v, max_teams: Number(e.target.value) }))}
          />
        </div>

        {/* Entry Fee (INR) */}
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-arena-muted mb-1.5">
            Entry Fee (₹ INR) {isLiveOrCompleted && "(Locked)"}
          </label>
          <input
            type="number"
            min={0}
            disabled={isLiveOrCompleted}
            className="input-field w-full font-mono disabled:opacity-50 disabled:cursor-not-allowed"
            value={values.entry_fee}
            onChange={(e) => setValues((v) => ({ ...v, entry_fee: Number(e.target.value) }))}
          />
        </div>

        {/* Format */}
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-arena-muted mb-1.5">
            Format {isLiveOrCompleted && "(Locked)"}
          </label>
          <select
            disabled={isLiveOrCompleted}
            className="input-field w-full bg-arena-bg text-arena-text disabled:opacity-50 disabled:cursor-not-allowed"
            value={values.format}
            onChange={(e) => setValues((v) => ({ ...v, format: e.target.value }))}
          >
            <option value="single_elimination">Single Elimination</option>
            <option value="double_elimination">Double Elimination</option>
            <option value="round_robin">Round Robin</option>
          </select>
        </div>

        {/* Timezone */}
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-arena-muted mb-1.5">
            Timezone
          </label>
          <input
            type="text"
            className="input-field w-full text-xs font-mono"
            value={values.timezone}
            onChange={(e) => setValues((v) => ({ ...v, timezone: e.target.value }))}
          />
        </div>

        {/* Banner URL */}
        <div className="sm:col-span-2">
          <label className="block text-xs font-semibold uppercase tracking-wider text-arena-muted mb-1.5">
            Banner Image URL
          </label>
          <input
            type="url"
            className="input-field w-full font-mono text-xs"
            value={values.banner_url}
            onChange={(e) => setValues((v) => ({ ...v, banner_url: e.target.value }))}
          />
        </div>

        {/* Schedule Dates */}
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-arena-muted mb-1.5">
            Registration Opens
          </label>
          <input
            type="datetime-local"
            className="input-field w-full text-xs"
            value={values.registration_open_at}
            onChange={(e) => setValues((v) => ({ ...v, registration_open_at: e.target.value }))}
          />
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-arena-muted mb-1.5">
            Registration Closes
          </label>
          <input
            type="datetime-local"
            className="input-field w-full text-xs"
            value={values.registration_close_at}
            onChange={(e) => setValues((v) => ({ ...v, registration_close_at: e.target.value }))}
          />
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-arena-muted mb-1.5">
            Tournament Starts {isLiveOrCompleted && "(Locked)"}
          </label>
          <input
            type="datetime-local"
            disabled={isLiveOrCompleted}
            className="input-field w-full text-xs disabled:opacity-50 disabled:cursor-not-allowed"
            value={values.start_time}
            onChange={(e) => setValues((v) => ({ ...v, start_time: e.target.value }))}
          />
        </div>

        {/* Description */}
        <div className="sm:col-span-2">
          <label className="block text-xs font-semibold uppercase tracking-wider text-arena-muted mb-1.5">
            Description
          </label>
          <textarea
            rows={3}
            className="input-field w-full text-xs"
            value={values.description}
            onChange={(e) => setValues((v) => ({ ...v, description: e.target.value }))}
          />
        </div>

        {/* Rules */}
        <div className="sm:col-span-2">
          <label className="block text-xs font-semibold uppercase tracking-wider text-arena-muted mb-1.5">
            Rules & Regulations
          </label>
          <textarea
            rows={4}
            className="input-field w-full font-mono text-xs"
            value={values.rules}
            onChange={(e) => setValues((v) => ({ ...v, rules: e.target.value }))}
          />
        </div>
      </div>

      <div className="flex justify-end pt-2">
        <button
          type="submit"
          disabled={busy || !isDirty}
          className="btn-primary px-6 py-2.5 text-xs font-semibold shadow-lg shadow-cyan-500/10 disabled:opacity-40"
        >
          {busy ? "Saving Settings…" : isDirty ? "Save Settings" : "No Changes"}
        </button>
      </div>

      {/* Danger Zone */}
      {canDelete && (
        <div className="mt-8 rounded-2xl border border-red-500/30 bg-red-950/10 p-6 space-y-4">
          <div>
            <h3 className="text-sm font-bold text-red-400 uppercase tracking-wider">Danger Zone</h3>
            <p className="text-xs text-zinc-400 mt-1">
              Permanently soft-delete this tournament. All active player registrations will be closed and pending/paid payments will be marked as <code className="text-arena-danger bg-red-950 px-1 py-0.5 rounded">cancelled_admin</code>.
            </p>
          </div>
          <div className="flex justify-start">
            <button
              type="button"
              onClick={() => setShowDeleteModal(true)}
              className="rounded-xl border border-red-500/40 bg-red-600/10 px-4 py-2 text-xs font-semibold text-arena-danger hover:bg-red-600 hover:text-arena-text transition-colors"
            >
              Delete this Tournament
            </button>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      <DeleteTournamentModal
        isOpen={showDeleteModal}
        tournament={{ id: tournament.id, slug: tournament.slug, title: tournament.title }}
        onClose={() => setShowDeleteModal(false)}
        onDeleted={() => {
          router.push("/admin/tournaments");
        }}
      />
    </form>
  );
}
