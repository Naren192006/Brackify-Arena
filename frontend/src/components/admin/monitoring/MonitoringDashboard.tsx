"use client";

import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { adminApiFetch } from "@/lib/admin/auth";

// ---------------------------------------------------------------------------
// Types (mirror backend/app/schemas/monitoring.py)
// ---------------------------------------------------------------------------

export type MonitoringStatus =
  | "ok"
  | "degraded"
  | "unavailable"
  | "unconfigured"
  | "disabled";

export type MonitoringComponent = {
  status: MonitoringStatus;
  detail?: string | null;
};

export type MonitoringMetrics = {
  status: MonitoringStatus;
  total_requests: number | null;
  errors_5xx: number | null;
  status_breakdown: Record<string, number>;
  top_paths: { path: string; requests: number; errors: number }[];
};

export type MonitoringSummary = {
  generated_at: string;
  overall_status: "operational" | "degraded";
  environment: string;
  components: Record<string, MonitoringComponent>;
  metrics: MonitoringMetrics;
};

const COMPONENT_LABELS: Record<string, string> = {
  app: "Backend API",
  database: "Database (Postgres)",
  redis: "Redis Cache",
  request_metrics: "HTTP Metrics",
  aws_cloudwatch: "AWS CloudWatch",
};

// ---------------------------------------------------------------------------
// Status styling
// ---------------------------------------------------------------------------

const STATUS_DISPLAY: Record<MonitoringStatus, string> = {
  ok: "text-emerald-400 border-emerald-500/30 bg-emerald-500/10",
  degraded: "text-amber-300 border-amber-500/30 bg-amber-500/10",
  unavailable: "text-arena-danger border-red-500/30 bg-red-500/10",
  unconfigured: "text-slate-300 border-slate-500/30 bg-slate-500/10",
  disabled: "text-slate-300 border-slate-500/30 bg-slate-500/10",
};

const STATUS_DOT: Record<MonitoringStatus, string> = {
  ok: "bg-emerald-400",
  degraded: "bg-amber-400",
  unavailable: "bg-red-400",
  unconfigured: "bg-slate-400",
  disabled: "bg-slate-400",
};

function StatusPill({ status }: { status: MonitoringStatus }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider ${STATUS_DISPLAY[status]}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[status]}`} />
      {status}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Dark tooltip matching the analytics dashboard
// ---------------------------------------------------------------------------

function MonitoringTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color?: string }>;
  label?: string;
}) {
  if (!active || !payload || !payload.length) return null;

  return (
    <div className="rounded-xl border border-white/15 bg-[#090d16] p-3 text-xs shadow-2xl backdrop-blur-xl">
      {label ? <p className="mb-1.5 font-semibold text-arena-text">{label}</p> : null}
      <div className="space-y-1">
        {payload.map((entry, index) => (
          <div key={index} className="flex items-center gap-2">
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: entry.color || "#06b6d4" }}
            />
            <span className="text-arena-muted">{entry.name}:</span>
            <span className="font-mono font-bold text-arena-text">{entry.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main dashboard
// ---------------------------------------------------------------------------

export function MonitoringDashboard() {
  const summaryQuery = useQuery({
    queryKey: ["admin-monitoring-summary"],
    queryFn: () =>
      adminApiFetch<MonitoringSummary>("/api/v1/admin/monitoring/summary"),
    refetchInterval: 30_000,
  });

  const { data, isLoading, isError, error, refetch } = summaryQuery;

  const statusBreakdownChart =
    data && data.metrics.status === "ok"
      ? Object.entries(data.metrics.status_breakdown).map(([status, count]) => ({
          status,
          count,
        }))
      : [];

  const topPathsChart =
    data && data.metrics.status === "ok" ? data.metrics.top_paths.slice(0, 10) : [];

  return (
    <div className="space-y-8 pb-12">
      {/* Page header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-arena-border pb-6">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="flex h-2.5 w-2.5 rounded-full bg-arena-accent" />
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-arena-accent">
              CloudOps Sentinel
            </p>
          </div>
          <h1 className="mt-1 font-display text-3xl font-bold tracking-tight text-arena-text">
            System Monitoring
          </h1>
          <p className="mt-1 text-sm text-arena-muted">
            Read-only health, dependency readiness, and cumulative HTTP request
            metrics. Counts are aggregates since backend start.
          </p>
        </div>
        <button
          onClick={() => refetch()}
          className="rounded-xl border border-arena-border bg-white/[0.04] px-3.5 py-2 text-xs font-semibold text-arena-muted transition-colors hover:text-arena-text"
        >
          ↻ Refresh
        </button>
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="flex h-40 items-center justify-center text-xs uppercase tracking-widest text-arena-muted">
          Loading monitoring snapshot…
        </div>
      )}

      {/* Error state (e.g. backend unreachable) */}
      {isError && !isLoading && (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-6">
          <StatusPill status="unavailable" />
          <p className="mt-3 font-display text-lg font-bold text-arena-text">
            Monitoring backend unreachable
          </p>
          <p className="mt-1 text-sm text-arena-muted">
            {error instanceof Error ? error.message : "Failed to load monitoring summary."}
          </p>
        </div>
      )}

      {/* Data loaded */}
      {data && !isError && (
        <>
          {/* Overall status banner */}
          <section
            className={`rounded-2xl border p-6 ${
              data.overall_status === "operational"
                ? "border-emerald-500/30 bg-emerald-500/10"
                : "border-amber-500/30 bg-amber-500/10"
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-arena-muted">
                  Overall Status
                </p>
                <p
                  className={`mt-1 font-display text-2xl font-bold ${
                    data.overall_status === "operational"
                      ? "text-emerald-400"
                      : "text-amber-300"
                  }`}
                >
                  {data.overall_status === "operational"
                    ? "Operational"
                    : "Degraded — check components below"}
                </p>
                <p className="mt-1 text-xs text-arena-muted">
                  Snapshot taken at {new Date(data.generated_at).toLocaleString()} ·
                  environment: {data.environment}
                </p>
              </div>
              {/* Traffic metric cards only when real counters exist */}
              <div className="flex gap-3">
                <div className="rounded-xl border border-arena-border bg-white/[0.03] px-4 py-3 text-center">
                  <p className="font-mono text-xl font-bold text-arena-text">
                    {data.metrics.total_requests ?? "—"}
                  </p>
                  <p className="mt-1 text-[11px] text-arena-muted">Total Requests</p>
                </div>
                <div className="rounded-xl border border-arena-border bg-white/[0.03] px-4 py-3 text-center">
                  <p
                    className={`font-mono text-xl font-bold ${
                      (data.metrics.errors_5xx ?? 0) > 0
                        ? "text-arena-danger"
                        : "text-arena-text"
                    }`}
                  >
                    {data.metrics.errors_5xx ?? "—"}
                  </p>
                  <p className="mt-1 text-[11px] text-arena-muted">5xx Errors</p>
                </div>
              </div>
            </div>
          </section>

          {/* Component status cards */}
          <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Object.entries(data.components).map(([key, component]) => (
              <div
                key={key}
                className="rounded-2xl border border-arena-border bg-white/[0.02] p-5 shadow-xl"
              >
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-display text-sm font-bold text-arena-text">
                    {COMPONENT_LABELS[key] ?? key}
                  </h3>
                  <StatusPill status={component.status} />
                </div>
                {component.detail ? (
                  <p className="mt-3 text-xs leading-relaxed text-arena-muted">
                    {component.detail}
                  </p>
                ) : null}
              </div>
            ))}
          </section>

          {/* Charts — only rendered when the backend reports real metrics */}
          <section className="grid gap-6 lg:grid-cols-2">
            {/* HTTP status code breakdown */}
            <div className="space-y-4 rounded-2xl border border-arena-border bg-white/[0.02] p-6 shadow-xl">
              <div>
                <h3 className="font-display text-base font-bold text-arena-text">
                  Requests by HTTP Status
                </h3>
                <p className="text-xs text-arena-muted">
                  Cumulative counts from the Prometheus middleware
                </p>
              </div>
              <div className="h-64 w-full pt-2">
                {data.metrics.status === "ok" && statusBreakdownChart.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={statusBreakdownChart}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#ffffff0d" />
                      <XAxis
                        dataKey="status"
                        stroke="#94a3b8"
                        fontSize={11}
                        tickLine={false}
                      />
                      <YAxis
                        stroke="#94a3b8"
                        fontSize={11}
                        tickLine={false}
                        allowDecimals={false}
                      />
                      <Tooltip content={<MonitoringTooltip />} />
                      <Bar
                        dataKey="count"
                        name="requests"
                        fill="#38bdf8"
                        radius={[6, 6, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-xs text-arena-muted">
                    <div className="text-center">
                      <p>No HTTP request metrics recorded yet.</p>
                      <p className="mt-1 text-[11px]">
                        Charts appear automatically once real traffic flows through
                        the backend.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Top paths */}
            <div className="space-y-4 rounded-2xl border border-arena-border bg-white/[0.02] p-6 shadow-xl">
              <div>
                <h3 className="font-display text-base font-bold text-arena-text">
                  Top Request Paths
                </h3>
                <p className="text-xs text-arena-muted">
                  Busiest routes since backend process start
                </p>
              </div>
              <div className="h-64 w-full pt-2">
                {data.metrics.status === "ok" && topPathsChart.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={topPathsChart} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="#ffffff0d" />
                      <XAxis
                        type="number"
                        stroke="#94a3b8"
                        fontSize={11}
                        tickLine={false}
                        allowDecimals={false}
                      />
                      <YAxis
                        type="category"
                        dataKey="path"
                        stroke="#94a3b8"
                        fontSize={10}
                        tickLine={false}
                        width={180}
                      />
                      <Tooltip content={<MonitoringTooltip />} />
                      <Bar
                        dataKey="requests"
                        name="requests"
                        fill="#06b6d4"
                        radius={[0, 6, 6, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-xs text-arena-muted">
                    <div className="text-center">
                      <p>No path traffic recorded yet.</p>
                      <p className="mt-1 text-[11px]">
                        This dashboard never fabricates data — real counters appear
                        once requests are served.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* AWS Phase status note */}
          <section className="rounded-2xl border border-slate-500/30 bg-slate-500/5 p-6">
            <StatusPill status="unconfigured" />
            <p className="mt-3 text-sm text-arena-muted">
              AWS CloudWatch, SageMaker anomaly detection, and S3 log/incident
              archival are planned for a later CloudOps Sentinel phase. This page
              currently shows the live local service telemetry only.
            </p>
          </section>
        </>
      )}
    </div>
  );
}
