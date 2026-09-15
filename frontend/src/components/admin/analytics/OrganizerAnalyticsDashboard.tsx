"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { supabase } from "@/lib/supabase/client";

// ---------------------------------------------------------------------------
// Helpers & Types
// ---------------------------------------------------------------------------

function formatCurrency(amount: number, currency = "INR"): string {
  return amount.toLocaleString("en-IN", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

const PIE_COLORS: Record<string, string> = {
  Paid: "#10b981", // Emerald
  Pending: "#f59e0b", // Amber
  Failed: "#ef4444", // Red
  Refunded: "#a855f7", // Purple
  Cancelled: "#64748b", // Slate
};

// ---------------------------------------------------------------------------
// Custom Dark Tooltip
// ---------------------------------------------------------------------------

function CustomDarkTooltip({
  active,
  payload,
  label,
  isCurrency = false,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color?: string }>;
  label?: string;
  isCurrency?: boolean;
}) {
  if (!active || !payload || !payload.length) return null;

  return (
    <div className="rounded-xl border border-white/15 bg-[#090d16] p-3 text-xs shadow-2xl backdrop-blur-xl">
      {label ? <p className="font-semibold text-arena-text mb-1.5">{label}</p> : null}
      <div className="space-y-1">
        {payload.map((entry, index) => (
          <div key={index} className="flex items-center gap-2">
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: entry.color || "#06b6d4" }}
            />
            <span className="text-arena-muted">{entry.name}:</span>
            <span className="font-mono font-bold text-arena-text">
              {isCurrency ? formatCurrency(entry.value) : entry.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function OrganizerAnalyticsDashboard() {
  const [timeRange, setTimeRange] = useState<"all" | "30d" | "7d">("all");

  // ── 1. Fetch Real Database Telemetry from Supabase ─────────────────────────
  const analyticsQuery = useQuery({
    queryKey: ["admin-analytics-data"],
    queryFn: async () => {
      const [
        tournamentsRes,
        registrationsRes,
        paymentsRes,
        matchesRes,
      ] = await Promise.all([
        supabase
          .from("tournaments")
          .select("id,title,status,entry_fee_minor,prize_pool_minor,created_at"),
        supabase
          .from("tournament_registrations")
          .select("id,tournament_id,payment_status,status,created_at"),
        supabase
          .from("payments")
          .select("id,amount_minor,status,paid_at,created_at"),
        supabase
          .from("matches")
          .select("id,tournament_id,status,created_at"),
      ]);

      if (tournamentsRes.error) throw tournamentsRes.error;
      if (registrationsRes.error) throw registrationsRes.error;
      if (paymentsRes.error) throw paymentsRes.error;
      if (matchesRes.error) throw matchesRes.error;

      const tournaments = tournamentsRes.data ?? [];
      const registrations = registrationsRes.data ?? [];
      const payments = paymentsRes.data ?? [];
      const matches = matchesRes.data ?? [];

      return { tournaments, registrations, payments, matches };
    },
    refetchInterval: 15_000,
  });

  const { data, isLoading, refetch } = analyticsQuery;

  // ── 2. Process Metrics & Chart Datasets ────────────────────────────────────
  const processed = useMemo(() => {
    if (!data) return null;

    const { tournaments, registrations, payments, matches } = data;

    // Filter by time range if selected
    const now = Date.now();
    const cutoff =
      timeRange === "7d"
        ? now - 7 * 24 * 60 * 60 * 1000
        : timeRange === "30d"
          ? now - 30 * 24 * 60 * 60 * 1000
          : 0;

    const filteredRegs = registrations.filter(
      (r) => new Date(r.created_at).getTime() >= cutoff
    );
    const filteredPayments = payments.filter(
      (p) => new Date(p.created_at).getTime() >= cutoff
    );
    const filteredTournaments = tournaments.filter(
      (t) => new Date(t.created_at).getTime() >= cutoff
    );

    // ── Metric Cards ──
    // Revenue: sum of paid registrations * entry fee, or sum of payments
    let totalRevenue = 0;
    const tournamentFeeMap = new Map(
      tournaments.map((t) => [t.id, Number(t.entry_fee_minor || 0) / 100])
    );

    filteredRegs.forEach((r) => {
      if (r.payment_status === "paid") {
        totalRevenue += tournamentFeeMap.get(r.tournament_id) || 0;
      }
    });

    // Fallback to payments table if tournament registrations are 0 fee
    if (totalRevenue === 0) {
      filteredPayments.forEach((p) => {
        if (p.status === "paid") {
          totalRevenue += Number(p.amount_minor || 0) / 100;
        }
      });
    }

    const paidRegsCount = filteredRegs.filter((r) => r.payment_status === "paid").length;
    const pendingRegsCount = filteredRegs.filter(
      (r) => r.payment_status === "pending" || r.payment_status === "created"
    ).length;

    const liveMatchesCount = matches.filter((m) => m.status === "live").length;
    const completedMatchesCount = matches.filter((m) => m.status === "completed").length;
    const activeTournamentsCount = filteredTournaments.filter((t) =>
      ["ongoing", "live", "open", "registration_closed"].includes(t.status)
    ).length;

    const totalPrizePool = filteredTournaments.reduce(
      (sum, t) => sum + Number(t.prize_pool_minor || 0) / 100,
      0
    );

    // ── 1. Registration Trend by Date ──
    const regDatesMap = new Map<string, number>();
    filteredRegs.forEach((r) => {
      const d = new Date(r.created_at).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      });
      regDatesMap.set(d, (regDatesMap.get(d) || 0) + 1);
    });

    const registrationTrend = Array.from(regDatesMap.entries()).map(([date, count]) => ({
      date,
      registrations: count,
    }));

    // ── 2. Revenue Trend by Date ──
    const revDatesMap = new Map<string, number>();
    filteredRegs.forEach((r) => {
      if (r.payment_status === "paid") {
        const d = new Date(r.created_at).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        });
        const fee = tournamentFeeMap.get(r.tournament_id) || 0;
        revDatesMap.set(d, (revDatesMap.get(d) || 0) + fee);
      }
    });

    const revenueTrend = Array.from(revDatesMap.entries()).map(([date, revenue]) => ({
      date,
      revenue,
    }));

    // ── 3. Payment Status Breakdown (Pie) ──
    const statusCounts: Record<string, number> = {
      Paid: 0,
      Pending: 0,
      Failed: 0,
      Refunded: 0,
      Cancelled: 0,
    };

    filteredRegs.forEach((r) => {
      if (r.payment_status === "paid") statusCounts.Paid++;
      else if (r.payment_status === "pending" || r.payment_status === "created")
        statusCounts.Pending++;
      else if (r.payment_status === "failed") statusCounts.Failed++;
      else if (r.payment_status === "refunded") statusCounts.Refunded++;
      else if (r.payment_status === "cancelled" || r.status === "cancelled")
        statusCounts.Cancelled++;
      else statusCounts.Pending++;
    });

    const paymentStatusPie = Object.entries(statusCounts)
      .map(([name, value]) => ({ name, value }))
      .filter((item) => item.value > 0);

    // ── 4. Tournament Completion / Status Breakdown (Bar) ──
    const tStatusCounts: Record<string, number> = {
      Open: 0,
      Live: 0,
      Completed: 0,
      Paused: 0,
      Draft: 0,
    };

    filteredTournaments.forEach((t) => {
      if (t.status === "open") tStatusCounts.Open++;
      else if (t.status === "ongoing" || t.status === "live") tStatusCounts.Live++;
      else if (t.status === "completed") tStatusCounts.Completed++;
      else if (t.status === "paused") tStatusCounts.Paused++;
      else if (t.status === "draft") tStatusCounts.Draft++;
      else tStatusCounts.Open++;
    });

    const tournamentStatusBar = Object.entries(tStatusCounts).map(([status, count]) => ({
      status,
      count,
    }));

    return {
      totalRevenue,
      paidRegsCount,
      pendingRegsCount,
      liveMatchesCount,
      completedMatchesCount,
      activeTournamentsCount,
      totalPrizePool,
      registrationTrend,
      revenueTrend,
      paymentStatusPie,
      tournamentStatusBar,
    };
  }, [data, timeRange]);

  return (
    <div className="space-y-8 pb-12">
      {/* ── Page Header ──────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-arena-border pb-6">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="flex h-2.5 w-2.5 rounded-full bg-arena-accent" />
            <p className="text-xs uppercase tracking-[0.25em] text-arena-accent font-semibold">
              Organizer Telemetry
            </p>
          </div>
          <h1 className="mt-1 font-display text-3xl font-bold text-arena-text tracking-tight">
            Tournament Analytics & Revenue
          </h1>
          <p className="mt-1 text-sm text-arena-muted">
            Track entry fee receipts, registration conversion trends, tournament progression, and match statistics.
          </p>
        </div>

        {/* Time Filter & Refresh */}
        <div className="flex items-center gap-3">
          <div className="flex rounded-xl border border-arena-border bg-white/[0.03] p-1 text-xs">
            {[
              ["all", "All Time"],
              ["30d", "Last 30 Days"],
              ["7d", "Last 7 Days"],
            ].map(([val, label]) => (
              <button
                key={val}
                onClick={() => setTimeRange(val as "all" | "30d" | "7d")}
                className={`rounded-lg px-3 py-1 font-medium transition-colors ${
                  timeRange === val
                    ? "bg-cyan-400/20 text-arena-accent font-semibold shadow-sm"
                    : "text-arena-muted hover:text-arena-text"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <button
            onClick={() => refetch()}
            className="rounded-xl border border-arena-border bg-white/[0.04] px-3.5 py-2 text-xs font-semibold text-arena-muted hover:text-arena-text transition-colors"
          >
            ↻ Refresh
          </button>
        </div>
      </div>

      {/* ── 1. Top Metrics Cards ─────────────────────────────────────────── */}
      <section>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-7">
          <MetricSummaryCard
            label="Total Revenue"
            value={processed ? formatCurrency(processed.totalRevenue) : "—"}
            icon="💰"
            highlight
            color="emerald"
          />
          <MetricSummaryCard
            label="Paid Registrations"
            value={processed ? String(processed.paidRegsCount) : "—"}
            icon="✅"
            highlight
            color="cyan"
          />
          <MetricSummaryCard
            label="Pending Registrations"
            value={processed ? String(processed.pendingRegsCount) : "—"}
            icon="⏳"
            highlight
            color="amber"
          />
          <MetricSummaryCard
            label="Live Matches"
            value={processed ? String(processed.liveMatchesCount) : "—"}
            icon="⚡"
            highlight={Boolean(processed && processed.liveMatchesCount > 0)}
            color="red"
          />
          <MetricSummaryCard
            label="Completed Matches"
            value={processed ? String(processed.completedMatchesCount) : "—"}
            icon="🏁"
            highlight
            color="purple"
          />
          <MetricSummaryCard
            label="Active Tournaments"
            value={processed ? String(processed.activeTournamentsCount) : "—"}
            icon="🏆"
          />
          <MetricSummaryCard
            label="Total Prize Pool"
            value={processed ? formatCurrency(processed.totalPrizePool) : "—"}
            icon="🎁"
          />
        </div>
      </section>

      {/* ── 2. Charts Grid (Recharts) ─────────────────────────────────────── */}
      <section className="grid gap-6 lg:grid-cols-2">
        {/* Chart 1: Registration Trend */}
        <div className="rounded-2xl border border-arena-border bg-white/[0.02] p-6 shadow-xl space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-display text-base font-bold text-arena-text">Registration Trend</h3>
              <p className="text-xs text-arena-muted">Team entries registered over time</p>
            </div>
            <span className="rounded-lg border border-arena-accent bg-arena-bg-elevated px-2.5 py-1 text-xs font-semibold text-arena-accent">
              Registrations
            </span>
          </div>

          <div className="h-64 w-full pt-2">
            {isLoading ? (
              <div className="h-full w-full flex items-center justify-center text-xs text-arena-muted animate-pulse">
                Loading registration data…
              </div>
            ) : processed?.registrationTrend.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={processed.registrationTrend}>
                  <defs>
                    <linearGradient id="regGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#06b6d4" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff0d" />
                  <XAxis dataKey="date" stroke="#94a3b8" fontSize={11} tickLine={false} />
                  <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} allowDecimals={false} />
                  <Tooltip content={<CustomDarkTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="registrations"
                    stroke="#06b6d4"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#regGradient)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full w-full flex items-center justify-center text-xs text-arena-muted">
                No registration records in this timeframe.
              </div>
            )}
          </div>
        </div>

        {/* Chart 2: Revenue Trend */}
        <div className="rounded-2xl border border-arena-border bg-white/[0.02] p-6 shadow-xl space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-display text-base font-bold text-arena-text">Revenue Trend</h3>
              <p className="text-xs text-arena-muted">Entry fee revenue collected over time (INR)</p>
            </div>
            <span className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-400">
              Revenue (₹)
            </span>
          </div>

          <div className="h-64 w-full pt-2">
            {isLoading ? (
              <div className="h-full w-full flex items-center justify-center text-xs text-arena-muted animate-pulse">
                Loading revenue data…
              </div>
            ) : processed?.revenueTrend.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={processed.revenueTrend}>
                  <defs>
                    <linearGradient id="revGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff0d" />
                  <XAxis dataKey="date" stroke="#94a3b8" fontSize={11} tickLine={false} />
                  <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} tickFormatter={(val) => `₹${val}`} />
                  <Tooltip content={<CustomDarkTooltip isCurrency />} />
                  <Area
                    type="monotone"
                    dataKey="revenue"
                    stroke="#10b981"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#revGradient)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full w-full flex items-center justify-center text-xs text-arena-muted">
                No revenue records in this timeframe.
              </div>
            )}
          </div>
        </div>

        {/* Chart 3: Payment Status Breakdown (Pie) */}
        <div className="rounded-2xl border border-arena-border bg-white/[0.02] p-6 shadow-xl space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-display text-base font-bold text-arena-text">Payment Status Distribution</h3>
              <p className="text-xs text-arena-muted">Registration payment verification ratios</p>
            </div>
          </div>

          <div className="h-64 w-full pt-2">
            {isLoading ? (
              <div className="h-full w-full flex items-center justify-center text-xs text-arena-muted animate-pulse">
                Loading payment breakdown…
              </div>
            ) : processed?.paymentStatusPie.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={processed.paymentStatusPie}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={85}
                    paddingAngle={4}
                    dataKey="value"
                  >
                    {processed.paymentStatusPie.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={PIE_COLORS[entry.name] || "#06b6d4"}
                      />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomDarkTooltip />} />
                  <Legend
                    verticalAlign="bottom"
                    height={36}
                    formatter={(value) => <span className="text-xs text-arena-muted">{value}</span>}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full w-full flex items-center justify-center text-xs text-arena-muted">
                No payment status records found.
              </div>
            )}
          </div>
        </div>

        {/* Chart 4: Tournament Status Breakdown (Bar) */}
        <div className="rounded-2xl border border-arena-border bg-white/[0.02] p-6 shadow-xl space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-display text-base font-bold text-arena-text">Tournament Completion Stages</h3>
              <p className="text-xs text-arena-muted">Distribution of tournaments by lifecycle status</p>
            </div>
          </div>

          <div className="h-64 w-full pt-2">
            {isLoading ? (
              <div className="h-full w-full flex items-center justify-center text-xs text-arena-muted animate-pulse">
                Loading tournament lifecycle stages…
              </div>
            ) : processed?.tournamentStatusBar.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={processed.tournamentStatusBar}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff0d" />
                  <XAxis dataKey="status" stroke="#94a3b8" fontSize={11} tickLine={false} />
                  <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} allowDecimals={false} />
                  <Tooltip content={<CustomDarkTooltip />} />
                  <Bar dataKey="count" fill="#38bdf8" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full w-full flex items-center justify-center text-xs text-arena-muted">
                No tournaments found.
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Metric Summary Card Component
// ---------------------------------------------------------------------------

function MetricSummaryCard({
  label,
  value,
  icon,
  highlight = false,
  color = "cyan",
}: {
  label: string;
  value: string;
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
      className={`rounded-2xl border p-4 transition-colors ${
        highlight
          ? colorClasses[color]
          : "border-arena-border bg-white/[0.03] text-arena-text"
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="text-lg">{icon}</span>
        <span className="font-mono text-lg font-bold tracking-tight">{value}</span>
      </div>
      <p className="mt-2 text-[11px] font-medium text-arena-muted leading-snug line-clamp-2">
        {label}
      </p>
    </div>
  );
}
