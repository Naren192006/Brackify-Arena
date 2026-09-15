"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase/client";
import {
  getAdminTournamentList,
  startTournamentApi,
  pauseTournamentApi,
  resumeTournamentApi,
  completeTournamentApi,
} from "@/lib/admin/tournaments";

// ---------------------------------------------------------------------------
// Types & Helpers
// ---------------------------------------------------------------------------

type DashboardMetrics = {
  totalTournaments: number;
  liveTournaments: number;
  openTournaments: number;
  pendingRegistrations: number;
  totalPlayers: number;
  totalTeams: number;
  openReports: number;
  pendingApprovals: number;
};

type TournamentOpItem = {
  id: string;
  title: string;
  slug: string;
  game: string;
  mode: string;
  status: string;
  entry_fee_minor: number;
  entry_fee_currency: string;
  max_teams: number;
  start_time: string;
  registration_open_at: string;
  registration_close_at: string;
  registered_count: number;
  paid_count: number;
  pending_count: number;
  current_round: string;
  prize_pool_collected: number;
};

function formatCurrency(minor: number, currency = "INR"): string {
  return (minor / 100).toLocaleString("en-IN", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
  });
}

function getStatusBadge(status: string) {
  switch (status.toLowerCase()) {
    case "ongoing":
    case "live":
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-500/15 px-2.5 py-0.5 text-xs font-semibold text-emerald-400 animate-pulse">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          Live
        </span>
      );
    case "open":
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-arena-accent bg-arena-bg-elevated px-2.5 py-0.5 text-xs font-semibold text-arena-accent">
          <span className="h-1.5 w-1.5 rounded-full bg-arena-accent" />
          Registration Open
        </span>
      );
    case "paused":
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/40 bg-amber-400/15 px-2.5 py-0.5 text-xs font-semibold text-amber-300">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
          Paused
        </span>
      );
    case "completed":
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-purple-400/30 bg-purple-400/10 px-2.5 py-0.5 text-xs font-semibold text-purple-300">
          <span className="h-1.5 w-1.5 rounded-full bg-purple-400" />
          Completed
        </span>
      );
    case "registration_closed":
    case "full":
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-yellow-500/30 bg-yellow-500/10 px-2.5 py-0.5 text-xs font-semibold text-yellow-300">
          Registration Closed
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-arena-border bg-arena-bg-elevated px-2.5 py-0.5 text-xs font-semibold text-arena-muted">
          {status.charAt(0).toUpperCase() + status.slice(1)}
        </span>
      );
  }
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function AdminControlRoom() {
  const queryClient = useQueryClient();
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [activeActionId, setActiveActionId] = useState<string | null>(null);
  const [isRealtimeActive, setIsRealtimeActive] = useState<boolean>(true);

  // ── 1. Fetch Real Dashboard Metrics from Supabase ─────────────────────────
  const metricsQuery = useQuery<DashboardMetrics>({
    queryKey: ["admin-control-room-metrics"],
    queryFn: async () => {
      const [
        totalTournamentsRes,
        liveTournamentsRes,
        openTournamentsRes,
        pendingRegistrationsRes,
        playersRes,
        teamsRes,
        reportsRes,
        pendingApprovalsRes,
      ] = await Promise.all([
        supabase.from("tournaments").select("id", { count: "exact", head: true }),
        supabase.from("tournaments").select("id", { count: "exact", head: true }).in("status", ["ongoing", "live"]),
        supabase.from("tournaments").select("id", { count: "exact", head: true }).eq("status", "open"),
        supabase.from("tournament_registrations").select("id", { count: "exact", head: true }).in("payment_status", ["pending", "created"]),
        supabase.from("profiles").select("id", { count: "exact", head: true }),
        supabase.from("teams").select("id", { count: "exact", head: true }),
        supabase.from("user_reports").select("id", { count: "exact", head: true }).in("status", ["pending", "open", "investigating"]),
        supabase.from("matches").select("id", { count: "exact", head: true }).in("status", ["awaiting_approval", "reported"]),
      ]);

      return {
        totalTournaments: totalTournamentsRes.count ?? 0,
        liveTournaments: liveTournamentsRes.count ?? 0,
        openTournaments: openTournamentsRes.count ?? 0,
        pendingRegistrations: pendingRegistrationsRes.count ?? 0,
        totalPlayers: playersRes.count ?? 0,
        totalTeams: teamsRes.count ?? 0,
        openReports: reportsRes.count ?? 0,
        pendingApprovals: pendingApprovalsRes.count ?? 0,
      };
    },
  });

  // ── 2. Fetch Tournament Operations Data ────────────────────────────────────
  const tournamentsQuery = useQuery<TournamentOpItem[]>({
    queryKey: ["admin-control-room-tournaments"],
    queryFn: async () => {
      const res = await getAdminTournamentList({ page: 1, pageSize: 100 });
      const tournaments = res.items;

      if (!tournaments || !tournaments.length) return [];

      const tournamentIds = tournaments.map((t) => t.id);

      const { data: registrations, error: rErr } = await supabase
        .from("tournament_registrations")
        .select("id,tournament_id,status,payment_status")
        .in("tournament_id", tournamentIds);

      if (rErr) throw rErr;

      const { data: matches, error: mErr } = await supabase
        .from("matches")
        .select("id,tournament_id,round_number,status")
        .in("tournament_id", tournamentIds);

      if (mErr) throw mErr;

      const regsByTournament: Record<string, typeof registrations> = {};
      (registrations ?? []).forEach((r) => {
        regsByTournament[r.tournament_id] = regsByTournament[r.tournament_id] || [];
        regsByTournament[r.tournament_id].push(r);
      });

      const matchesByTournament: Record<string, typeof matches> = {};
      (matches ?? []).forEach((m) => {
        matchesByTournament[m.tournament_id] = matchesByTournament[m.tournament_id] || [];
        matchesByTournament[m.tournament_id].push(m);
      });

      return tournaments.map((t) => {
        const tRegs = regsByTournament[t.id] ?? [];
        const tMatches = matchesByTournament[t.id] ?? [];

        const activeRegs = tRegs.filter((r) => r.status !== "cancelled");
        const paidCount = activeRegs.filter((r) => r.payment_status === "paid").length;
        const pendingCount = activeRegs.filter(
          (r) => r.payment_status === "pending" || r.payment_status === "created"
        ).length;

        const entryFee = Number(t.entry_fee_minor ?? 0);
        const collectedPool = paidCount * entryFee;

        let currentRound = "Not Started";
        if (tMatches.length > 0) {
          const liveOrPendingMatches = tMatches.filter((m) => m.status !== "completed" && m.status !== "cancelled");
          if (liveOrPendingMatches.length > 0) {
            const minRound = Math.min(...liveOrPendingMatches.map((m) => m.round_number));
            currentRound = `Round ${minRound}`;
          } else {
            const maxRound = Math.max(...tMatches.map((m) => m.round_number));
            currentRound = `Final (Round ${maxRound})`;
          }
        }

        return {
          id: t.id,
          title: t.title,
          slug: t.slug,
          game: t.game,
          mode: t.mode || (t.team_size ? `${t.team_size}v${t.team_size}` : "1v1"),
          status: t.status,
          entry_fee_minor: entryFee,
          entry_fee_currency: t.entry_fee_currency || "INR",
          max_teams: t.max_teams,
          start_time: t.start_time,
          registration_open_at: t.registration_open_at,
          registration_close_at: t.registration_close_at,
          registered_count: activeRegs.length,
          paid_count: paidCount,
          pending_count: pendingCount,
          current_round: currentRound,
          prize_pool_collected: collectedPool,
        };
      });
    },
  });

  // ── 3. Realtime Channel Subscription for Global Admin Control Room ────────
  useEffect(() => {
    const channel = supabase.channel(`admin-control-room-${Date.now()}`);

    channel
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tournaments" },
        () => {
          void queryClient.invalidateQueries({ queryKey: ["admin-control-room-metrics"] });
          void queryClient.invalidateQueries({ queryKey: ["admin-control-room-tournaments"] });
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "matches" },
        () => {
          void queryClient.invalidateQueries({ queryKey: ["admin-control-room-metrics"] });
          void queryClient.invalidateQueries({ queryKey: ["admin-control-room-tournaments"] });
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tournament_registrations" },
        () => {
          void queryClient.invalidateQueries({ queryKey: ["admin-control-room-metrics"] });
          void queryClient.invalidateQueries({ queryKey: ["admin-control-room-tournaments"] });
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "user_reports" },
        () => {
          void queryClient.invalidateQueries({ queryKey: ["admin-control-room-metrics"] });
        }
      );

    channel.subscribe((status) => {
      setIsRealtimeActive(status === "SUBSCRIBED");
    });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [queryClient]);

  // ── 4. Mutations for Admin Operations ──────────────────────────────────────
  const invalidateAll = () => {
    void queryClient.invalidateQueries({ queryKey: ["admin-control-room-metrics"] });
    void queryClient.invalidateQueries({ queryKey: ["admin-control-room-tournaments"] });
    void queryClient.invalidateQueries({ queryKey: ["tournament"] });
  };

  const startMutation = useMutation({
    mutationFn: async (id: string) => {
      setActiveActionId(id);
      return startTournamentApi(id);
    },
    onSuccess: (data) => {
      toast.success(`Tournament started! Generated ${data.matches_created || "Round 1"} matches.`);
      invalidateAll();
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to start tournament");
    },
    onSettled: () => setActiveActionId(null),
  });

  const pauseMutation = useMutation({
    mutationFn: async (id: string) => {
      setActiveActionId(id);
      return pauseTournamentApi(id);
    },
    onSuccess: () => {
      toast.success("Tournament paused.");
      invalidateAll();
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to pause tournament");
    },
    onSettled: () => setActiveActionId(null),
  });

  const resumeMutation = useMutation({
    mutationFn: async (id: string) => {
      setActiveActionId(id);
      return resumeTournamentApi(id);
    },
    onSuccess: () => {
      toast.success("Tournament resumed.");
      invalidateAll();
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to resume tournament");
    },
    onSettled: () => setActiveActionId(null),
  });

  const completeMutation = useMutation({
    mutationFn: async (id: string) => {
      setActiveActionId(id);
      return completeTournamentApi(id);
    },
    onSuccess: () => {
      toast.success("Tournament marked as completed.");
      invalidateAll();
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to complete tournament");
    },
    onSettled: () => setActiveActionId(null),
  });

  // ── Filter & Search Logic ──────────────────────────────────────────────────
  const allTournaments = tournamentsQuery.data ?? [];
  const filteredTournaments = allTournaments.filter((t) => {
    const matchesFilter =
      filterStatus === "all" ||
      (filterStatus === "live" && (t.status === "ongoing" || t.status === "live")) ||
      (filterStatus === "open" && t.status === "open") ||
      (filterStatus === "paused" && t.status === "paused") ||
      (filterStatus === "completed" && t.status === "completed");

    const matchesSearch =
      !searchQuery ||
      t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.game.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.mode.toLowerCase().includes(searchQuery.toLowerCase());

    return matchesFilter && matchesSearch;
  });

  const m = metricsQuery.data ?? {
    totalTournaments: 0,
    liveTournaments: 0,
    openTournaments: 0,
    pendingRegistrations: 0,
    totalPlayers: 0,
    totalTeams: 0,
    openReports: 0,
    pendingApprovals: 0,
  };

  return (
    <div className="space-y-8 pb-12">
      {/* ── Page Header ──────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-arena-border pb-6">
        <div>
          <div className="flex items-center gap-2">
            <span
              className={`flex h-2.5 w-2.5 rounded-full ${
                isRealtimeActive ? "bg-emerald-400 animate-ping" : "bg-amber-400"
              }`}
            />
            <p className="text-xs uppercase tracking-[0.25em] text-arena-accent font-semibold truncate">
              Live Operations Command · {isRealtimeActive ? "Realtime Active" : "Connecting…"}
            </p>
          </div>
          <h1 className="mt-1 font-display text-2xl sm:text-3xl font-bold text-arena-text tracking-tight">
            Tournament Control Room
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-arena-muted">
            Live tournament monitoring, bracket coordination, and automated real-time status synchronization.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <Link
            href="/admin/tournaments/create"
            className="rounded-xl border border-cyan-400/40 bg-cyan-400/20 px-3.5 py-2 text-xs sm:text-sm font-semibold text-arena-accent hover:bg-cyan-400/30 transition-colors shadow-lg shadow-cyan-950/40"
          >
            + Create Tournament
          </Link>
          <span className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-400">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            Live Sync
          </span>
        </div>
      </div>

      {/* ── 1. Real Dashboard Metrics Cards ───────────────────────────────── */}
      <section>
        <h2 className="text-xs uppercase tracking-wider text-arena-muted font-semibold mb-3.5">
          System Overview
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:gap-4 sm:grid-cols-4 lg:grid-cols-8">
          <MetricCard label="Total Tournaments" value={m.totalTournaments} icon="🏆" />
          <MetricCard
            label="Live Tournaments"
            value={m.liveTournaments}
            icon="⚡"
            highlight={m.liveTournaments > 0}
            color="emerald"
          />
          <MetricCard
            label="Registration Open"
            value={m.openTournaments}
            icon="📝"
            highlight={m.openTournaments > 0}
            color="cyan"
          />
          <MetricCard
            label="Pending Registrations"
            value={m.pendingRegistrations}
            icon="⏳"
            highlight={m.pendingRegistrations > 0}
            color="amber"
          />
          <MetricCard label="Total Players" value={m.totalPlayers} icon="👤" />
          <MetricCard label="Total Teams" value={m.totalTeams} icon="🛡️" />
          <MetricCard
            label="Open Reports"
            value={m.openReports}
            icon="🚩"
            highlight={m.openReports > 0}
            color="red"
          />
          <MetricCard
            label="Pending Approvals"
            value={m.pendingApprovals}
            icon="⚖️"
            highlight={m.pendingApprovals > 0}
            color="purple"
          />
        </div>
      </section>

      {/* ── 2. Tournament Operations Section ──────────────────────────────── */}
      <section className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-xl sm:text-2xl font-bold text-arena-text tracking-tight">
              Tournament Operations
            </h2>
            <p className="text-xs text-arena-muted">
              Live bracket generation, match coordination, and real-time lifecycle controls.
            </p>
          </div>

          {/* Filter tabs & Search */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 sm:gap-3">
            <input
              type="text"
              placeholder="Search tournaments..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="rounded-xl border border-arena-border bg-white/[0.04] px-3 py-1.5 text-xs text-arena-text placeholder-arena-muted focus:border-cyan-400/50 focus:outline-none w-full sm:w-64"
            />
            <div className="flex flex-wrap rounded-xl border border-arena-border bg-white/[0.03] p-0.5 text-xs">
              {["all", "live", "open", "paused", "completed"].map((tab) => (
                <button
                  key={tab}
                  onClick={() => setFilterStatus(tab)}
                  className={`rounded-lg px-3 py-1 font-medium capitalize transition-colors ${
                    filterStatus === tab
                      ? "bg-cyan-400/20 text-arena-accent shadow-sm"
                      : "text-arena-muted hover:text-arena-text"
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── Tournament Cards Grid ────────────────────────────────────────── */}
        {tournamentsQuery.isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 animate-pulse">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-64 rounded-2xl bg-arena-bg-elevated border border-arena-border" />
            ))}
          </div>
        ) : filteredTournaments.length === 0 ? (
          <div className="rounded-2xl border border-arena-border bg-white/[0.02] p-12 text-center">
            <p className="text-arena-muted">No tournaments matching the selected criteria.</p>
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {filteredTournaments.map((t) => {
              const isOngoing = t.status === "ongoing" || t.status === "live";
              const isPaused = t.status === "paused";
              const isCompleted = t.status === "completed";
              const canStart = !isOngoing && !isPaused && !isCompleted;
              const isActionBusy = activeActionId === t.id;

              return (
                <div
                  key={t.id}
                  className={`relative flex flex-col justify-between rounded-2xl border p-5 transition-all ${
                    isOngoing
                      ? "border-emerald-500/40 bg-gradient-to-b from-emerald-950/20 to-white/[0.02] shadow-lg shadow-emerald-950/30"
                      : isPaused
                        ? "border-amber-500/40 bg-gradient-to-b from-amber-950/20 to-white/[0.02]"
                        : "border-arena-border bg-white/[0.03] hover:border-arena-accent hover:bg-white/[0.05]"
                  }`}
                >
                  <div>
                    {/* Header: Game mode & Status badge */}
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-arena-accent">
                        {t.game} · {t.mode}
                      </span>
                      {getStatusBadge(t.status)}
                    </div>

                    {/* Title */}
                    <h3 className="mt-2.5 font-display text-lg font-bold text-arena-text line-clamp-1">
                      <Link href={`/tournaments/${t.slug}`} className="hover:text-arena-accent transition-colors">
                        {t.title}
                      </Link>
                    </h3>

                    {/* Operational Stats Grid */}
                    <div className="mt-4 grid grid-cols-2 gap-2.5 rounded-xl border border-arena-border bg-black/20 p-3 text-xs">
                      <div>
                        <span className="text-arena-muted block text-[10px] uppercase">Registered</span>
                        <span className="font-semibold text-arena-text">
                          {t.registered_count} / {t.max_teams}
                        </span>
                      </div>
                      <div>
                        <span className="text-arena-muted block text-[10px] uppercase">Paid Teams</span>
                        <span className="font-semibold text-emerald-400">
                          {t.paid_count} teams
                        </span>
                      </div>
                      <div>
                        <span className="text-arena-muted block text-[10px] uppercase">Pending</span>
                        <span className="font-semibold text-yellow-400">
                          {t.pending_count} teams
                        </span>
                      </div>
                      <div>
                        <span className="text-arena-muted block text-[10px] uppercase">Current Round</span>
                        <span className="font-semibold text-arena-accent">
                          {t.current_round}
                        </span>
                      </div>
                      <div className="col-span-2 border-t border-arena-border pt-2 mt-0.5 flex items-center justify-between">
                        <span className="text-arena-muted text-[10px] uppercase">Prize Pool Collected</span>
                        <span className="font-semibold text-emerald-400 font-mono">
                          {formatCurrency(t.prize_pool_collected, t.entry_fee_currency)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* ── Admin Action Buttons ──────────────────────────────── */}
                  <div className="mt-5 space-y-2 pt-2 border-t border-arena-border">
                    <div className="grid grid-cols-2 gap-2">
                      {canStart ? (
                        <button
                          disabled={isActionBusy || startMutation.isPending}
                          onClick={() => startMutation.mutate(t.id)}
                          className="col-span-2 rounded-xl border border-emerald-500/40 bg-emerald-500/20 py-2 text-xs font-semibold text-arena-success hover:bg-emerald-500/30 disabled:opacity-50 transition-colors shadow-md shadow-emerald-950/40 flex items-center justify-center gap-1.5"
                        >
                          {isActionBusy && startMutation.isPending ? "Starting…" : "▶ Start Tournament"}
                        </button>
                      ) : null}

                      {isOngoing ? (
                        <button
                          disabled={isActionBusy || pauseMutation.isPending}
                          onClick={() => pauseMutation.mutate(t.id)}
                          className="rounded-xl border border-amber-500/40 bg-amber-500/15 py-2 text-xs font-semibold text-amber-300 hover:bg-amber-500/25 disabled:opacity-50 transition-colors flex items-center justify-center gap-1.5"
                        >
                          {isActionBusy && pauseMutation.isPending ? "Pausing…" : "⏸ Pause"}
                        </button>
                      ) : null}

                      {isPaused ? (
                        <button
                          disabled={isActionBusy || resumeMutation.isPending}
                          onClick={() => resumeMutation.mutate(t.id)}
                          className="rounded-xl border border-emerald-500/40 bg-emerald-500/20 py-2 text-xs font-semibold text-arena-success hover:bg-emerald-500/30 disabled:opacity-50 transition-colors flex items-center justify-center gap-1.5"
                        >
                          {isActionBusy && resumeMutation.isPending ? "Resuming…" : "▶ Resume"}
                        </button>
                      ) : null}

                      {isOngoing || isPaused ? (
                        <button
                          disabled={isActionBusy || completeMutation.isPending}
                          onClick={() => {
                            if (window.confirm(`Mark ${t.title} as completed?`)) {
                              completeMutation.mutate(t.id);
                            }
                          }}
                          className="rounded-xl border border-red-500/40 bg-red-500/15 py-2 text-xs font-semibold text-arena-danger hover:bg-red-500/25 disabled:opacity-50 transition-colors flex items-center justify-center gap-1.5"
                        >
                          {isActionBusy && completeMutation.isPending ? "Ending…" : "⏹ End Tournament"}
                        </button>
                      ) : null}

                      {isCompleted ? (
                        <div className="col-span-2 rounded-xl border border-purple-500/20 bg-purple-500/10 py-1.5 text-center text-xs font-medium text-purple-300">
                          ✓ Tournament Completed
                        </div>
                      ) : null}
                    </div>

                    <div className="flex items-center justify-between pt-1 text-[11px] text-arena-muted">
                      <Link
                        href={`/tournaments/${t.slug}/bracket`}
                        className="hover:text-arena-accent transition-colors"
                      >
                        View Bracket →
                      </Link>
                      <Link
                        href={`/admin/control-room/${t.slug}`}
                        className="text-arena-accent hover:underline font-medium"
                      >
                        Match Operations →
                      </Link>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Metric Card Component
// ---------------------------------------------------------------------------

function MetricCard({
  label,
  value,
  icon,
  highlight = false,
  color = "cyan",
}: {
  label: string;
  value: number;
  icon: string;
  highlight?: boolean;
  color?: "cyan" | "emerald" | "amber" | "purple" | "red";
}) {
  const colorClasses = {
    cyan: "border-arena-accent bg-arena-bg-elevated text-arena-accent",
    emerald: "border-emerald-400/30 bg-emerald-400/10 text-emerald-400",
    amber: "border-amber-400/30 bg-amber-400/10 text-amber-300",
    purple: "border-purple-400/30 bg-purple-400/10 text-purple-300",
    red: "border-red-400/30 bg-red-400/10 text-arena-danger",
  };

  return (
    <div
      className={`rounded-2xl border p-3.5 transition-colors ${
        highlight
          ? colorClasses[color]
          : "border-arena-border bg-white/[0.03] text-arena-text"
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="text-base">{icon}</span>
        <span className="font-mono text-xl font-bold tracking-tight">{value}</span>
      </div>
      <p className="mt-2 text-[11px] font-medium text-arena-muted leading-snug line-clamp-2">
        {label}
      </p>
    </div>
  );
}
