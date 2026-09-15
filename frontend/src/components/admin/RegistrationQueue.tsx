"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase/client";
import {
  adminCancelRegistrationApi,
  adminMarkPaidRegistrationApi,
  adminRefundRegistrationApi,
  adminRemindRegistrationApi,
  adminRemoveRegistrationApi,
  getAdminTournamentList,
} from "@/lib/admin/tournaments";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type AdminRegRow = {
  id: string;
  tournament_id: string;
  team_id: string;
  registered_by: string;
  status: string;
  payment_status: "paid" | "pending" | "created" | "failed" | "refunded" | "cancelled";
  checked_in: boolean;
  checked_in_at: string | null;
  created_at: string;
  // Joined fields
  tournament: {
    id: string;
    title: string;
    slug: string;
    status: string;
    start_time: string;
    registration_close_at: string;
    entry_fee_minor: number;
    entry_fee_currency: string;
  };
  team: {
    id: string;
    name: string;
    tag: string | null;
    logo_url: string | null;
    captain_id: string;
  };
  captain: {
    id: string;
    display_name: string | null;
    username: string | null;
  } | null;
  registrant: {
    id: string;
    display_name: string | null;
    username: string | null;
  } | null;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function PaymentBadge({ status }: { status: AdminRegRow["payment_status"] }) {
  switch (status) {
    case "paid":
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-400">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          Paid
        </span>
      );
    case "pending":
    case "created":
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-yellow-500/30 bg-yellow-500/10 px-2.5 py-0.5 text-xs font-semibold text-yellow-300">
          <span className="h-1.5 w-1.5 rounded-full bg-yellow-400 animate-pulse" />
          Pending
        </span>
      );
    case "failed":
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-red-500/30 bg-red-500/10 px-2.5 py-0.5 text-xs font-semibold text-red-400">
          <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
          Failed
        </span>
      );
    case "refunded":
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-purple-500/30 bg-purple-500/10 px-2.5 py-0.5 text-xs font-semibold text-purple-300">
          Refunded
        </span>
      );
    case "cancelled":
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-arena-border bg-arena-bg-elevated px-2.5 py-0.5 text-xs font-semibold text-arena-muted">
          Cancelled
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center rounded-full border border-arena-border bg-arena-bg-elevated px-2 py-0.5 text-xs text-arena-muted">
          {status}
        </span>
      );
  }
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function RegistrationQueue() {
  const queryClient = useQueryClient();

  const [selectedTournament, setSelectedTournament] = useState<string>("all");
  const [paymentFilter, setPaymentFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [page, setPage] = useState<number>(1);
  const pageSize = 20;

  // Modal states for destructive actions
  const [actionModal, setActionModal] = useState<{
    type: "cancel" | "refund" | "remove";
    reg: AdminRegRow;
  } | null>(null);

  // ── 1. Fetch Tournaments for Dropdown Filter ───────────────────────────────
  const tournamentsQuery = useQuery({
    queryKey: ["admin-registrations-tournaments"],
    queryFn: async () => {
      try {
        const res = await getAdminTournamentList({ pageSize: 100 });
        return (res.items || []).map((t) => ({
          id: t.id,
          title: t.title,
          slug: t.slug,
          status: t.status,
          start_time: t.start_time,
          registration_close_at: t.registration_close_at,
        }));
      } catch {
        const { data, error } = await supabase
          .from("tournaments")
          .select("id,title,slug,status,start_time,registration_close_at")
          .order("created_at", { ascending: false });
        if (error) throw error;
        return data ?? [];
      }
    },
  });

  // ── 2. Fetch All Registrations with Joined Teams & Profiles ────────────────
  const registrationsQuery = useQuery<AdminRegRow[]>({
    queryKey: ["admin-registrations-all"],
    queryFn: async () => {
      // 1. Fetch raw registrations
      const { data: rawRegs, error: rErr } = await supabase
        .from("tournament_registrations")
        .select("id,tournament_id,team_id,registered_by,status,payment_status,checked_in,checked_in_at,created_at")
        .order("created_at", { ascending: false });

      if (rErr) throw rErr;
      if (!rawRegs || !rawRegs.length) return [];

      // 2. Fetch tournaments
      const tournamentIds = [...new Set(rawRegs.map((r) => r.tournament_id))];
      const { data: tournamentsData, error: tErr } = await supabase
        .from("tournaments")
        .select("id,title,slug,status,start_time,registration_close_at,entry_fee_minor,entry_fee_currency")
        .in("id", tournamentIds);

      if (tErr) throw tErr;
      const tournamentMap = new Map((tournamentsData ?? []).map((t) => [t.id, t]));

      // 3. Fetch teams
      const teamIds = [...new Set(rawRegs.map((r) => r.team_id))];
      const { data: teamsData, error: tmErr } = await supabase
        .from("teams")
        .select("id,name,tag,logo_url,captain_id")
        .in("id", teamIds);

      if (tmErr) throw tmErr;
      const teamMap = new Map((teamsData ?? []).map((t) => [t.id, t]));

      // 4. Fetch user profiles for captains & registrants
      const captainUserIds = (teamsData ?? []).map((t) => t.captain_id).filter(Boolean);
      const registrantUserIds = rawRegs.map((r) => r.registered_by).filter(Boolean);
      const allUserIds = [...new Set([...captainUserIds, ...registrantUserIds])];

      const { data: profilesData, error: pErr } = await supabase
        .from("profiles")
        .select("id,display_name,username")
        .in("id", allUserIds);

      if (pErr) throw pErr;
      const profileMap = new Map((profilesData ?? []).map((p) => [p.id, p]));

      return rawRegs.map((r) => {
        const tournament = tournamentMap.get(r.tournament_id) ?? {
          id: r.tournament_id,
          title: "Unknown Tournament",
          slug: "",
          status: "open",
          start_time: "",
          registration_close_at: "",
          entry_fee_minor: 0,
          entry_fee_currency: "INR",
        };

        const team = teamMap.get(r.team_id) ?? {
          id: r.team_id,
          name: "Unknown Team",
          tag: null,
          logo_url: null,
          captain_id: "",
        };

        return {
          ...r,
          payment_status: r.payment_status || "pending",
          tournament,
          team,
          captain: profileMap.get(team.captain_id) ?? null,
          registrant: profileMap.get(r.registered_by) ?? null,
        } as AdminRegRow;
      });
    },
    refetchInterval: 8_000,
  });

  // ── 3. Mutations ──────────────────────────────────────────────────────────
  const invalidateAll = () => {
    void queryClient.invalidateQueries({ queryKey: ["admin-registrations-all"] });
    void queryClient.invalidateQueries({ queryKey: ["admin-control-room-metrics"] });
    void queryClient.invalidateQueries({ queryKey: ["admin-control-room-tournaments"] });
  };

  const cancelMutation = useMutation({
    mutationFn: async ({ tournamentId, regId }: { tournamentId: string; regId: string }) => {
      return adminCancelRegistrationApi(tournamentId, regId);
    },
    onSuccess: () => {
      toast.success("Registration cancelled successfully.");
      invalidateAll();
      setActionModal(null);
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to cancel registration.");
    },
  });

  const refundMutation = useMutation({
    mutationFn: async ({ tournamentId, regId }: { tournamentId: string; regId: string }) => {
      return adminRefundRegistrationApi(tournamentId, regId);
    },
    onSuccess: () => {
      toast.success("Registration refunded and cancelled.");
      invalidateAll();
      setActionModal(null);
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to refund registration.");
    },
  });

  const remindMutation = useMutation({
    mutationFn: async ({ tournamentId, regId }: { tournamentId: string; regId: string }) => {
      return adminRemindRegistrationApi(tournamentId, regId);
    },
    onSuccess: (data) => {
      toast.success(data.message || "Payment reminder sent to captain.");
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to send reminder.");
    },
  });

  const removeMutation = useMutation({
    mutationFn: async ({ tournamentId, regId }: { tournamentId: string; regId: string }) => {
      return adminRemoveRegistrationApi(tournamentId, regId);
    },
    onSuccess: () => {
      toast.success("Team removed from tournament.");
      invalidateAll();
      setActionModal(null);
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to remove team.");
    },
  });

  const manualMarkPaidMutation = useMutation({
    mutationFn: async ({ tournamentId, regId }: { tournamentId: string; regId: string }) => {
      return adminMarkPaidRegistrationApi(tournamentId, regId);
    },
    onSuccess: (data) => {
      toast.success(data?.message || "Registration manually marked as PAID. ✓");
      invalidateAll();
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to mark registration as paid.");
    },
  });

  const handleExportCSV = () => {
    const list = filteredRegistrations.length ? filteredRegistrations : (registrationsQuery.data ?? []);
    if (!list.length) {
      toast.error("No registrations to export");
      return;
    }
    const headers = ["Registration ID", "Team Name", "Tag", "Tournament", "Captain", "Payment Status", "Checked In", "Registered At"];
    const rows = list.map((r) => [
      r.id,
      `"${(r.team.name || "").replace(/"/g, '""')}"`,
      r.team.tag || "",
      `"${(r.tournament.title || "").replace(/"/g, '""')}"`,
      `"${(r.captain?.display_name || r.captain?.username || "").replace(/"/g, '""')}"`,
      r.payment_status,
      r.checked_in ? "Yes" : "No",
      r.created_at,
    ]);
    const csvContent = [headers.join(","), ...rows.map((row) => row.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `registrations_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Registrations exported as CSV! 📥");
  };

  // ── 4. Filtering Logic ────────────────────────────────────────────────────
  const now = Date.now();
  const allRegistrations = registrationsQuery.data ?? [];

  const filteredRegistrations = allRegistrations.filter((r) => {
    // Tournament filter
    if (selectedTournament !== "all" && r.tournament_id !== selectedTournament) {
      return false;
    }

    // Payment status filter
    if (paymentFilter !== "all" && r.payment_status !== paymentFilter) {
      return false;
    }

    // Search query
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const teamMatch = r.team.name.toLowerCase().includes(q) || (r.team.tag?.toLowerCase().includes(q) ?? false);
      const captainMatch =
        (r.captain?.display_name?.toLowerCase().includes(q) ?? false) ||
        (r.captain?.username?.toLowerCase().includes(q) ?? false);
      const registrantMatch =
        (r.registrant?.display_name?.toLowerCase().includes(q) ?? false) ||
        (r.registrant?.username?.toLowerCase().includes(q) ?? false);
      const tournamentMatch = r.tournament.title.toLowerCase().includes(q);

      if (!teamMatch && !captainMatch && !registrantMatch && !tournamentMatch) {
        return false;
      }
    }

    return true;
  });

  const totalCount = filteredRegistrations.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const paginatedRegistrations = filteredRegistrations.slice((page - 1) * pageSize, page * pageSize);

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 space-y-6">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-arena-border pb-5">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-arena-accent font-semibold">
            Admin Management
          </p>
          <h1 className="mt-1 font-display text-3xl font-bold text-arena-text tracking-tight">
            Tournament Registrations
          </h1>
          <p className="mt-1 text-sm text-arena-muted">
            Inspect team entries, audit payment statuses, enforce refund rules, and manage roster slots.
          </p>
        </div>

        <button
          onClick={invalidateAll}
          className="rounded-xl border border-arena-border bg-white/[0.04] px-3.5 py-2 text-xs font-semibold text-arena-muted hover:text-arena-text transition-colors"
        >
          ↻ Refresh Queue
        </button>
      </div>

      {/* ── Filters & Search ──────────────────────────────────────────────── */}
      <section className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-arena-border bg-white/[0.02] p-4">
        <div className="flex flex-wrap items-center gap-3">
          {/* Tournament Filter */}
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-arena-muted mb-1">
              Tournament
            </label>
            <select
              value={selectedTournament}
              onChange={(e) => {
                setSelectedTournament(e.target.value);
                setPage(1);
              }}
              className="rounded-xl border border-arena-border bg-[#0c101c] px-3 py-1.5 text-xs text-arena-text focus:border-cyan-400/50 focus:outline-none"
            >
              <option value="all">All Tournaments</option>
              {(tournamentsQuery.data ?? []).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
          </div>

          {/* Payment Status Filter */}
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-arena-muted mb-1">
              Payment Status
            </label>
            <select
              value={paymentFilter}
              onChange={(e) => {
                setPaymentFilter(e.target.value);
                setPage(1);
              }}
              className="rounded-xl border border-arena-border bg-[#0c101c] px-3 py-1.5 text-xs text-arena-text focus:border-cyan-400/50 focus:outline-none"
            >
              <option value="all">All Statuses</option>
              <option value="paid">Paid</option>
              <option value="pending">Pending</option>
              <option value="failed">Failed</option>
              <option value="refunded">Refunded</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
        </div>

        {/* Search & Export */}
        <div className="flex items-end gap-3 w-full sm:w-auto">
          <div className="w-full sm:w-72">
            <label className="block text-[10px] uppercase tracking-wider text-arena-muted mb-1">
              Search
            </label>
            <input
              type="text"
              placeholder="Search team, captain, or registrant..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(1);
              }}
              className="w-full rounded-xl border border-arena-border bg-[#0c101c] px-3 py-1.5 text-xs text-arena-text placeholder-arena-muted focus:border-cyan-400/50 focus:outline-none"
            />
          </div>

          <button
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3.5 py-2 text-xs font-semibold text-emerald-400 hover:bg-emerald-500/20 transition-all whitespace-nowrap shadow-sm"
          >
            <span>📥</span> Export CSV
          </button>
        </div>
      </section>

      {/* ── Registrations Table ──────────────────────────────────────────── */}
      <section className="overflow-x-auto rounded-2xl border border-arena-border bg-white/[0.02]">
        <table className="w-full min-w-[980px] text-left text-sm">
          <thead className="border-b border-arena-border bg-white/[0.02] text-xs font-semibold uppercase tracking-wider text-arena-muted">
            <tr>
              <th className="px-4 py-3.5">Team</th>
              <th className="px-4 py-3.5">Tournament</th>
              <th className="px-4 py-3.5">Captain</th>
              <th className="px-4 py-3.5">Registered By</th>
              <th className="px-4 py-3.5">Payment</th>
              <th className="px-4 py-3.5">Check-In</th>
              <th className="px-4 py-3.5">Registered At</th>
              <th className="px-4 py-3.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {registrationsQuery.isLoading ? (
              <tr>
                <td className="px-4 py-8 text-center text-arena-muted" colSpan={8}>
                  Loading registrations queue…
                </td>
              </tr>
            ) : filteredRegistrations.length === 0 ? (
              <tr>
                <td className="px-4 py-8 text-center text-arena-muted" colSpan={8}>
                  No registrations found matching criteria.
                </td>
              </tr>
            ) : (
              paginatedRegistrations.map((reg) => {
                const isPaid = reg.payment_status === "paid";
                const isPending = reg.payment_status === "pending" || reg.payment_status === "created";
                const isCancelled = reg.status === "cancelled" || reg.payment_status === "cancelled";

                // Tournament security rule evaluations
                const startTime = reg.tournament.start_time ? new Date(reg.tournament.start_time).getTime() : Infinity;
                const closeTime = reg.tournament.registration_close_at ? new Date(reg.tournament.registration_close_at).getTime() : Infinity;
                const isLive = reg.tournament.status === "ongoing" || reg.tournament.status === "live" || now >= startTime;
                const isClosed = now >= closeTime;

                // Cancellation button enabled states and tooltips
                const canCancel = isPending && !isLive && !isCancelled;
                const cancelTooltip = isLive
                  ? "Tournament is live. Registration changes are locked."
                  : isCancelled
                    ? "Registration is already cancelled."
                    : !isPending
                      ? "Only pending registrations can be cancelled."
                      : "";

                const canRefund = isPaid && !isCancelled;
                const refundTooltip = !isPaid
                  ? "Only paid registrations can be refunded."
                  : isCancelled
                    ? "Registration is already cancelled."
                    : "";

                return (
                  <tr key={reg.id} className="hover:bg-white/[0.02] transition-colors">
                    {/* Team logo + Name */}
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-3">
                        {reg.team.logo_url ? (
                          <img
                            src={reg.team.logo_url}
                            alt=""
                            className="h-9 w-9 rounded-lg object-cover border border-arena-border"
                          />
                        ) : (
                          <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-arena-accent bg-arena-bg-elevated font-display font-bold text-arena-accent text-xs">
                            {reg.team.name.slice(0, 1)}
                          </div>
                        )}
                        <div>
                          <p className="font-semibold text-arena-text">
                            {reg.team.name}{" "}
                            {reg.team.tag ? (
                              <span className="text-arena-accent font-normal">[{reg.team.tag}]</span>
                            ) : null}
                          </p>
                          <span className="text-[11px] text-arena-muted font-mono">
                            ID: {reg.team_id.slice(0, 8)}…
                          </span>
                        </div>
                      </div>
                    </td>

                    {/* Tournament */}
                    <td className="px-4 py-3.5">
                      <Link
                        href={`/tournaments/${reg.tournament.slug}`}
                        className="font-medium text-arena-text hover:text-arena-accent transition-colors"
                      >
                        {reg.tournament.title}
                      </Link>
                      <span className="block text-[11px] text-arena-muted capitalize">
                        {reg.tournament.status}
                      </span>
                    </td>

                    {/* Captain */}
                    <td className="px-4 py-3.5 text-xs text-arena-text">
                      {reg.captain?.display_name || reg.captain?.username || "—"}
                    </td>

                    {/* Registered By */}
                    <td className="px-4 py-3.5 text-xs text-arena-muted">
                      {reg.registrant?.display_name || reg.registrant?.username || "—"}
                    </td>

                    {/* Payment Status */}
                    <td className="px-4 py-3.5">
                      <PaymentBadge status={reg.payment_status} />
                    </td>

                    {/* Check-In Status */}
                    <td className="px-4 py-3.5">
                      {reg.checked_in ? (
                        <span className="inline-flex items-center gap-1 rounded border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-400">
                          ✓ Checked In
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded border border-arena-border bg-white/[0.02] px-2 py-0.5 text-[11px] text-arena-muted">
                          Pending
                        </span>
                      )}
                    </td>

                    {/* Registration Time */}
                    <td className="px-4 py-3.5 text-xs text-arena-muted whitespace-nowrap">
                      {new Date(reg.created_at).toLocaleString()}
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3.5 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-2">
                        {/* ── PAID ACTIONS ── */}
                        {isPaid ? (
                          <>
                            {/* Refund */}
                            <button
                              disabled={!canRefund || refundMutation.isPending}
                              title={refundTooltip}
                              onClick={() => setActionModal({ type: "refund", reg })}
                              className="rounded-lg border border-purple-400/30 bg-purple-400/10 px-2.5 py-1 text-xs font-semibold text-purple-300 hover:bg-purple-400/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                            >
                              Refund
                            </button>

                            {/* Remove Team */}
                            <button
                              disabled={isLive || removeMutation.isPending}
                              title={isLive ? "Cannot remove team while tournament is live." : "Remove team from tournament"}
                              onClick={() => setActionModal({ type: "remove", reg })}
                              className="rounded-lg border border-red-500/30 bg-red-500/10 px-2.5 py-1 text-xs font-semibold text-arena-danger hover:bg-red-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                            >
                              Remove Team
                            </button>
                          </>
                        ) : null}

                        {/* ── PENDING ACTIONS ── */}
                        {isPending && !isCancelled ? (
                          <>
                            {/* Manual Mark Paid (PART 14) */}
                            <button
                              disabled={manualMarkPaidMutation.isPending}
                              title="Manually mark this registration as paid"
                              onClick={() => manualMarkPaidMutation.mutate({ tournamentId: reg.tournament_id, regId: reg.id })}
                              className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-400 hover:bg-emerald-500/20 disabled:opacity-40 transition-colors"
                            >
                              Mark Paid
                            </button>

                            {/* Send Payment Reminder */}
                            <button
                              disabled={isLive || remindMutation.isPending}
                              title={isLive ? "Tournament is live." : "Send payment reminder to captain"}
                              onClick={() => remindMutation.mutate({ tournamentId: reg.tournament_id, regId: reg.id })}
                              className="rounded-lg border border-arena-accent bg-arena-bg-elevated px-2.5 py-1 text-xs font-semibold text-arena-accent hover:bg-cyan-400/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                            >
                              Remind
                            </button>

                            {/* Cancel Registration */}
                            <button
                              disabled={!canCancel || cancelMutation.isPending}
                              title={cancelTooltip}
                              onClick={() => setActionModal({ type: "cancel", reg })}
                              className="rounded-lg border border-red-500/30 bg-red-500/10 px-2.5 py-1 text-xs font-semibold text-arena-danger hover:bg-red-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                            >
                              Cancel
                            </button>
                          </>
                        ) : null}

                        {/* Cancelled / Refunded state note */}
                        {isCancelled ? (
                          <span className="text-[11px] italic text-arena-muted">Archived</span>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </section>

      {/* ── Pagination Controls ────────────────────────────────────────── */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-arena-border pt-4 px-2">
          <p className="text-xs text-arena-muted">
            Showing <span className="font-semibold text-arena-text font-mono">{paginatedRegistrations.length}</span> of{" "}
            <span className="font-semibold text-arena-text font-mono">{totalCount}</span> entries (Page{" "}
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

      {/* ── Action Confirmation Modal ────────────────────────────────────── */}
      {actionModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-arena-border bg-[#0d121f] p-6 shadow-2xl">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-red-500/20 bg-red-500/10 text-xl font-bold">
              {actionModal.type === "refund" ? "💳" : "⚠️"}
            </div>

            <h3 className="mt-4 font-display text-xl font-bold text-arena-text">
              {actionModal.type === "refund"
                ? "Refund Registration?"
                : actionModal.type === "remove"
                  ? "Remove Team from Tournament?"
                  : "Cancel Registration?"}
            </h3>

            <p className="mt-2 text-sm text-arena-muted leading-relaxed">
              {actionModal.type === "refund"
                ? `Are you sure you want to refund and cancel registration for team "${actionModal.reg.team.name}" in ${actionModal.reg.tournament.title}?`
                : actionModal.type === "remove"
                  ? `Are you sure you want to remove "${actionModal.reg.team.name}" from ${actionModal.reg.tournament.title}? Their reserved slot will be released.`
                  : `Are you sure you want to cancel the pending registration for "${actionModal.reg.team.name}"?`}
            </p>

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setActionModal(null)}
                className="rounded-lg border border-arena-border px-4 py-2 text-xs font-semibold text-arena-muted hover:text-arena-text transition-colors"
              >
                Close
              </button>

              <button
                type="button"
                onClick={() => {
                  const tId = actionModal.reg.tournament_id;
                  const rId = actionModal.reg.id;
                  if (actionModal.type === "cancel") {
                    cancelMutation.mutate({ tournamentId: tId, regId: rId });
                  } else if (actionModal.type === "refund") {
                    refundMutation.mutate({ tournamentId: tId, regId: rId });
                  } else if (actionModal.type === "remove") {
                    removeMutation.mutate({ tournamentId: tId, regId: rId });
                  }
                }}
                className="rounded-lg border border-red-500/40 bg-red-500/20 px-4 py-2 text-xs font-semibold text-arena-danger hover:bg-red-500/30 transition-colors"
              >
                Confirm Action
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
