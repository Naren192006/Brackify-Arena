"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAdminAuth } from "@/context/AdminAuthContext";
import {
  deleteTournamentApi,
  getAdminAnalytics,
  getAdminMatches,
  getAdminRegistrations,
  getAdminTournament,
  transitionAdminTournamentLifecycleApi,
} from "@/lib/admin/tournaments";
import { getBracket } from "@/lib/brackets/data";
import { TournamentSettings } from "@/components/admin/TournamentSettings";
import { RegistrationManager } from "@/components/admin/RegistrationManager";
import { BracketControls } from "@/components/admin/BracketControls";
import { MatchManager } from "@/components/admin/MatchManager";
import { ChampionPanel } from "@/components/admin/ChampionPanel";
import { AnalyticsPanel } from "@/components/admin/AnalyticsPanel";
import { AdminAssignment } from "@/components/admin/AdminAssignment";
import { CheckInManager } from "@/components/admin/CheckInManager";

const card = "rounded-2xl border border-white/10 bg-arena-surface/80 p-5 shadow-2xl shadow-black/10 backdrop-blur-md";

function getStatusBadgeClass(status: string) {
  const s = status.toLowerCase();
  switch (s) {
    case "draft":
      return "bg-zinc-500/15 text-zinc-300 border-zinc-500/30";
    case "published":
      return "bg-blue-500/15 text-blue-300 border-blue-500/30";
    case "registration_open":
    case "open":
      return "bg-emerald-500/15 text-emerald-300 border-emerald-500/30";
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

export function AdminTournamentPage({ slug }: { slug: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { admin } = useAdminAuth();
  const isSuperAdmin = admin?.role === "super_admin" || admin?.permissions?.includes("delete_tournaments");

  const [activeTab, setActiveTab] = useState<"operations" | "settings" | "registrations" | "brackets" | "matches">("operations");
  const [lifecycleBusy, setLifecycleBusy] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [confirmTitle, setConfirmTitle] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);

  // Queries
  const tournamentQuery = useQuery({
    queryKey: ["admin-tournament-detail", slug],
    queryFn: () => getAdminTournament(slug),
  });

  const tournament = tournamentQuery.data;
  const tournamentId = tournament?.id;

  // If deleted or not found, redirect back to tournaments directory
  useEffect(() => {
    if (!tournamentQuery.isLoading && !tournament) {
      router.replace("/admin/tournaments");
    }
  }, [tournamentQuery.isLoading, tournament, router]);

  const registrations = useQuery({
    queryKey: ["admin-registrations", tournamentId],
    queryFn: () => getAdminRegistrations(tournamentId!),
    enabled: Boolean(tournamentId),
  });

  const matches = useQuery({
    queryKey: ["admin-matches", tournamentId],
    queryFn: () => getAdminMatches(tournamentId!),
    enabled: Boolean(tournamentId),
  });

  const analytics = useQuery({
    queryKey: ["admin-analytics", tournamentId],
    queryFn: () => getAdminAnalytics(tournamentId!),
    enabled: Boolean(tournamentId),
  });

  const bracket = useQuery({
    queryKey: ["admin-bracket", tournamentId],
    queryFn: () => getBracket(tournamentId!),
    enabled: Boolean(tournamentId),
  });

  const refreshAll = () => {
    void queryClient.invalidateQueries({ queryKey: ["admin-tournament-detail", slug] });
    void queryClient.invalidateQueries({ queryKey: ["admin-analytics", tournamentId] });
    void queryClient.invalidateQueries({ queryKey: ["admin-registrations", tournamentId] });
    void queryClient.invalidateQueries({ queryKey: ["admin-matches", tournamentId] });
    void queryClient.invalidateQueries({ queryKey: ["admin-bracket", tournamentId] });
    void queryClient.invalidateQueries({ queryKey: ["admin-tournaments-list"] });
  };

  const handleLifecycleTransition = async (
    action: "publish" | "open_registration" | "close_registration" | "start_live" | "pause" | "resume" | "complete" | "cancel"
  ) => {
    if (action === "cancel" && !window.confirm(`Are you sure you want to CANCEL this tournament?`)) {
      return;
    }
    setLifecycleBusy(true);
    try {
      await transitionAdminTournamentLifecycleApi(tournamentId || slug, action);
      toast.success(`Lifecycle transitioned: ${action.replace(/_/g, " ").toUpperCase()}`);
      refreshAll();
    } catch (err: any) {
      toast.error(err?.message || "Failed to transition tournament lifecycle.");
    } finally {
      setLifecycleBusy(false);
    }
  };

  const handleDeleteTournament = async () => {
    if (!tournamentId || confirmTitle.trim() !== tournament?.title.trim()) return;
    setDeleteBusy(true);
    try {
      const res = await deleteTournamentApi(tournamentId);
      toast.success(res.message || `Tournament "${tournament.title}" permanently deleted.`);
      queryClient.removeQueries({ queryKey: ["tournament", slug] });
      queryClient.removeQueries({ queryKey: ["tournament", tournamentId] });
      queryClient.removeQueries({ queryKey: ["admin-tournament-detail", slug] });
      queryClient.removeQueries({ queryKey: ["admin-tournament-detail", tournamentId] });
      queryClient.invalidateQueries({ queryKey: ["tournaments"] });
      queryClient.invalidateQueries({ queryKey: ["admin-tournaments"] });
      queryClient.invalidateQueries({ queryKey: ["admin-tournaments-list"] });
      queryClient.invalidateQueries({ queryKey: ["public-tournaments"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["managed-tournaments"] });
      router.push("/admin/tournaments");
    } catch (err: any) {
      toast.error(err?.message || "Failed to delete tournament.");
    } finally {
      setDeleteBusy(false);
    }
  };

  if (tournamentQuery.isLoading) {
    return (
      <main className="mx-auto max-w-7xl animate-pulse space-y-6">
        <div className="h-8 w-1/3 rounded-lg bg-white/5" />
        <div className="grid grid-cols-4 gap-4">
          <div className="h-24 rounded-2xl bg-white/5" />
          <div className="h-24 rounded-2xl bg-white/5" />
          <div className="h-24 rounded-2xl bg-white/5" />
          <div className="h-24 rounded-2xl bg-white/5" />
        </div>
        <div className="h-96 rounded-2xl bg-white/5" />
      </main>
    );
  }

  if (!tournament || !tournamentId) {
    return (
      <main className="mx-auto max-w-7xl py-12 text-center">
        <p className="text-arena-danger font-semibold">Tournament not found or deleted.</p>
        <Link href="/admin/tournaments" className="btn-primary mt-4 inline-block px-4 py-2 text-xs">
          Back to Tournaments
        </Link>
      </main>
    );
  }

  const statusNormalized = tournament.status.toLowerCase();
  const champion = bracket.data?.champion_team_id
    ? registrations.data?.find((item) => item.team_id === bracket.data?.champion_team_id)?.teams?.name
    : null;

  return (
    <main className="space-y-6">
      {/* Back Link & Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href="/admin/tournaments"
            className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-arena-muted hover:text-white transition-colors"
          >
            ← Tournaments
          </Link>
          <a
            href={`/tournaments/${tournament.slug}`}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-arena-accent hover:underline flex items-center gap-1"
          >
            <span>Public Arena Page</span>
            <span>↗</span>
          </a>
        </div>

        <div className="flex items-center gap-2">
          {/* Super Admin Delete */}
          {isSuperAdmin && (
            <button
              onClick={() => {
                setShowDeleteModal(true);
                setConfirmTitle("");
              }}
              className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs font-semibold text-red-400 hover:bg-red-500/20 transition-colors"
            >
              Delete Tournament
            </button>
          )}
        </div>
      </div>

      {/* Main Title Banner & Lifecycle Toolbar */}
      <div className="rounded-2xl border border-white/10 bg-arena-surface/80 p-6 backdrop-blur-md shadow-2xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="font-display text-3xl font-bold text-white">{tournament.title}</h1>
              <span
                className={`rounded-full border px-3 py-0.5 text-xs font-bold uppercase tracking-wider ${getStatusBadgeClass(
                  tournament.status
                )}`}
              >
                {tournament.status.replace(/_/g, " ")}
              </span>
            </div>
            <p className="text-xs text-arena-muted mt-1">
              {tournament.game} • {tournament.mode} • Entry Fee:{" "}
              <strong className="text-white">
                {tournament.entry_fee_minor ? `₹${(tournament.entry_fee_minor / 100).toFixed(2)}` : "Free"}
              </strong>
            </p>
          </div>

          {/* Lifecycle Action Bar */}
          <div className="flex flex-wrap items-center gap-2">
            {statusNormalized === "draft" && (
              <button
                disabled={lifecycleBusy}
                onClick={() => handleLifecycleTransition("publish")}
                className="btn-primary px-4 py-2 text-xs font-semibold"
              >
                {lifecycleBusy ? "Updating…" : "Publish Tournament"}
              </button>
            )}

            {statusNormalized === "published" && (
              <button
                disabled={lifecycleBusy}
                onClick={() => handleLifecycleTransition("open_registration")}
                className="rounded-xl border border-emerald-500/40 bg-emerald-500/20 px-4 py-2 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/30 transition-colors"
              >
                {lifecycleBusy ? "Updating…" : "Open Registrations"}
              </button>
            )}

            {(statusNormalized === "open" || statusNormalized === "registration_open") && (
              <button
                disabled={lifecycleBusy}
                onClick={() => handleLifecycleTransition("close_registration")}
                className="rounded-xl border border-amber-500/40 bg-amber-500/20 px-4 py-2 text-xs font-semibold text-amber-300 hover:bg-amber-500/30 transition-colors"
              >
                {lifecycleBusy ? "Updating…" : "Close Registrations"}
              </button>
            )}

            {statusNormalized === "registration_closed" && (
              <button
                disabled={lifecycleBusy}
                onClick={() => handleLifecycleTransition("start_live")}
                className="rounded-xl border border-rose-500/40 bg-rose-500/20 px-4 py-2 text-xs font-semibold text-rose-300 hover:bg-rose-500/30 transition-colors shadow-lg shadow-rose-500/20"
              >
                {lifecycleBusy ? "Updating…" : "Start Live Tournament"}
              </button>
            )}

            {(statusNormalized === "live" || statusNormalized === "ongoing") && (
              <>
                <button
                  disabled={lifecycleBusy}
                  onClick={() => handleLifecycleTransition("pause")}
                  className="rounded-xl border border-orange-500/40 bg-orange-500/20 px-4 py-2 text-xs font-semibold text-orange-300 hover:bg-orange-500/30 transition-colors"
                >
                  {lifecycleBusy ? "Updating…" : "Pause Tournament"}
                </button>
                <button
                  disabled={lifecycleBusy}
                  onClick={() => handleLifecycleTransition("complete")}
                  className="rounded-xl border border-purple-500/40 bg-purple-500/20 px-4 py-2 text-xs font-semibold text-purple-300 hover:bg-purple-500/30 transition-colors"
                >
                  {lifecycleBusy ? "Updating…" : "Mark Completed"}
                </button>
              </>
            )}

            {statusNormalized === "paused" && (
              <>
                <button
                  disabled={lifecycleBusy}
                  onClick={() => handleLifecycleTransition("resume")}
                  className="rounded-xl border border-emerald-500/40 bg-emerald-500/20 px-4 py-2 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/30 transition-colors"
                >
                  {lifecycleBusy ? "Updating…" : "Resume Tournament"}
                </button>
                <button
                  disabled={lifecycleBusy}
                  onClick={() => handleLifecycleTransition("complete")}
                  className="rounded-xl border border-purple-500/40 bg-purple-500/20 px-4 py-2 text-xs font-semibold text-purple-300 hover:bg-purple-500/30 transition-colors"
                >
                  {lifecycleBusy ? "Updating…" : "Mark Completed"}
                </button>
              </>
            )}

            {statusNormalized !== "completed" && statusNormalized !== "cancelled" && (
              <button
                disabled={lifecycleBusy}
                onClick={() => handleLifecycleTransition("cancel")}
                className="rounded-xl border border-zinc-700 bg-zinc-800/60 px-3 py-2 text-xs font-medium text-zinc-400 hover:text-red-400 hover:border-red-500/40 transition-colors"
              >
                Cancel Tournament
              </button>
            )}
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 pt-2">
          <StatCard
            label="Registered Teams"
            value={`${analytics.data?.registeredTeams ?? tournament.registered_count} / ${tournament.max_teams}`}
            subtext={`${analytics.data?.approvedTeams ?? 0} approved`}
          />
          <StatCard
            label="Checked-In Teams"
            value={String(analytics.data?.checkedInTeams ?? 0)}
            subtext="Ready for bracket"
          />
          <StatCard
            label="Current Round"
            value={analytics.data?.currentRound ? `Round ${analytics.data.currentRound}` : "Not Started"}
            subtext={`${analytics.data?.matchesCompleted ?? 0} matches completed`}
          />
          <StatCard
            label="Tournament Champion"
            value={champion ?? "Undecided"}
            subtext={statusNormalized === "completed" ? "Finalized" : "In contention"}
          />
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="flex flex-wrap gap-2 border-b border-white/10 pb-3">
        {[
          ["operations", "Operations & Control"],
          ["settings", "Edit Configuration"],
          ["registrations", `Registrations (${analytics.data?.registeredTeams ?? tournament.registered_count})`],
          ["brackets", "Brackets"],
          ["matches", `Matches (${matches.data?.length ?? 0})`],
        ].map(([tabId, label]) => (
          <button
            key={tabId}
            onClick={() => setActiveTab(tabId as any)}
            className={`rounded-xl px-4 py-2 text-xs font-semibold transition-colors ${
              activeTab === tabId
                ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30"
                : "text-arena-muted hover:bg-white/5 hover:text-white"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Tab: Operations & Control */}
      {activeTab === "operations" && (
        <div className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            <section className={card}>
              <h2 className="mb-4 font-display text-xl font-semibold text-white">Analytics Telemetry</h2>
              {analytics.data ? <AnalyticsPanel analytics={analytics.data} /> : <p className="text-xs text-arena-muted">Loading telemetry…</p>}
            </section>

            {admin?.role === "super_admin" && (
              <section className={card}>
                <h2 className="mb-4 font-display text-xl font-semibold text-white">Sub-Admin Access Assignment</h2>
                <AdminAssignment tournamentId={tournamentId} />
              </section>
            )}
          </div>

          <section className={card}>
            <h2 className="mb-4 font-display text-xl font-semibold text-white">Champion Crowning</h2>
            <ChampionPanel tournamentId={tournamentId} championName={champion} completed={tournament.status === "completed"} />
          </section>
        </div>
      )}

      {/* Tab: Edit Configuration */}
      {activeTab === "settings" && (
        <section className={card}>
          <h2 className="mb-4 font-display text-xl font-semibold text-white">Tournament Configuration</h2>
          <TournamentSettings tournament={tournament} onSaved={refreshAll} />
        </section>
      )}

      {/* Tab: Registrations & Check-In */}
      {activeTab === "registrations" && (
        <div className="space-y-6">
          <section className={card}>
            <h2 className="mb-4 font-display text-xl font-semibold text-white">Check-in Manager</h2>
            <CheckInManager tournamentId={tournamentId} registrations={registrations.data ?? []} />
          </section>

          <section className={card}>
            <h2 className="mb-4 font-display text-xl font-semibold text-white">Registration Roster</h2>
            {registrations.isLoading ? (
              <p className="text-xs text-arena-muted">Loading roster…</p>
            ) : (
              <RegistrationManager tournamentId={tournamentId} registrations={registrations.data ?? []} />
            )}
          </section>
        </div>
      )}

      {/* Tab: Brackets */}
      {activeTab === "brackets" && (
        <section className={card}>
          <h2 className="mb-4 font-display text-xl font-semibold text-white">Bracket Generator & Seeding</h2>
          <BracketControls
            tournament={tournament}
            registeredCount={analytics.data?.checkedInTeams ?? 0}
            hasBracket={Boolean(bracket.data)}
          />
        </section>
      )}

      {/* Tab: Matches */}
      {activeTab === "matches" && (
        <section className={card}>
          <h2 className="mb-4 font-display text-xl font-semibold text-white">Match Progression Manager</h2>
          <MatchManager tournamentId={tournamentId} matches={matches.data ?? []} />
        </section>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md animate-in fade-in duration-200">
          <div className="relative w-full max-w-lg rounded-2xl border border-red-500/30 bg-zinc-950 p-6 shadow-2xl">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-red-500/10 text-red-400">
                ⚠️
              </div>
              <div>
                <h3 className="font-display text-xl font-bold text-white">Delete Tournament Permanently</h3>
                <p className="text-xs text-arena-muted">Super Admin Action</p>
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-200">
              <p className="font-medium">
  Are you sure you want to permanently delete this tournament:
  <strong className="ml-1">{tournament.title}</strong>?
</p>
              <p className="mt-1 opacity-90">
                All matches, brackets, notes, and team registrations will be removed. Payments are preserved as <strong>cancelled_admin</strong>.
              </p>
            </div>

            <div className="mt-4">
              <label className="block text-xs font-medium text-arena-muted">
                Type <strong className="text-white select-all">{tournament.title}</strong> to confirm:
              </label>
              <input
                type="text"
                className="input-field mt-1.5 w-full font-mono text-sm"
                placeholder={tournament.title}
                value={confirmTitle}
                onChange={(e) => setConfirmTitle(e.target.value)}
                disabled={deleteBusy}
                autoFocus
              />
            </div>

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowDeleteModal(false)}
                disabled={deleteBusy}
                className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-white transition hover:bg-white/10 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteTournament}
                disabled={confirmTitle.trim() !== tournament.title.trim() || deleteBusy}
                className="rounded-xl bg-red-600 px-4 py-2 text-xs font-semibold text-white shadow-lg shadow-red-600/30 transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {deleteBusy ? "Purging…" : "Permanently Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function StatCard({ label, value, subtext }: { label: string; value: string; subtext?: string }) {
  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.03] p-3.5">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-arena-muted">{label}</p>
      <p className="mt-1 truncate font-display text-xl font-bold text-white">{value}</p>
      {subtext && <p className="mt-0.5 text-[10px] text-arena-muted">{subtext}</p>}
    </div>
  );
}
