"use client";

import type { ControlRoomSnapshot } from "@/types/controlRoom";

export function HealthCards({ snapshot }: { snapshot: ControlRoomSnapshot }) {
  const activeRegistrations = snapshot.registrations.filter((r) =>
    ["registered", "checked_in"].includes(r.status)
  );
  const registeredCount = snapshot.tournament.registered_count || activeRegistrations.length;
  const checkedInCount = snapshot.registrations.filter(
    (r) => r.checked_in || r.status === "checked_in"
  ).length;
  const liveMatchesCount = snapshot.matches.filter((m) => m.status === "live").length;
  const completedMatchesCount = snapshot.matches.filter((m) => m.status === "completed").length;
  const pendingReportsCount =
    snapshot.reportsPending ??
    snapshot.matches.filter((m) => ["reported", "awaiting_approval"].includes(m.status)).length;

  const cards = [
    {
      label: "Registered Teams",
      value: registeredCount,
      subtext: `Max ${snapshot.tournament.max_teams} teams`,
      icon: "📋",
      color: "cyan",
      isLive: false,
    },
    {
      label: "Checked-in Teams",
      value: checkedInCount,
      subtext: `${Math.round((checkedInCount / Math.max(1, registeredCount)) * 100)}% attendance`,
      icon: "🛡️",
      color: "emerald",
      isLive: false,
    },
    {
      label: "Live Matches",
      value: liveMatchesCount,
      subtext: liveMatchesCount > 0 ? "Active in arena" : "None active",
      icon: "⚡",
      color: "amber",
      isLive: liveMatchesCount > 0,
    },
    {
      label: "Completed Matches",
      value: completedMatchesCount,
      subtext: `Total ${snapshot.matches.length} bracket matches`,
      icon: "🏆",
      color: "purple",
      isLive: false,
    },
    {
      label: "Pending Reports",
      value: pendingReportsCount,
      subtext: pendingReportsCount > 0 ? "Awaiting referee review" : "All clean",
      icon: "🚩",
      color: pendingReportsCount > 0 ? "red" : "gray",
      isLive: pendingReportsCount > 0,
    },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-cyan-400 animate-pulse" />
          <h3 className="text-xs uppercase tracking-wider text-arena-muted font-bold">
            Realtime Tournament Health
          </h3>
        </div>
        <span className="text-[11px] text-arena-muted font-mono">Synced Live</span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {cards.map((card) => {
          const colorStyles: Record<string, string> = {
            cyan: "border-cyan-400/30 bg-cyan-400/5 text-arena-accent",
            emerald: "border-emerald-400/30 bg-emerald-400/5 text-emerald-400",
            amber: "border-amber-400/40 bg-amber-400/10 text-amber-300",
            purple: "border-purple-400/30 bg-purple-400/5 text-purple-300",
            red: "border-red-400/40 bg-red-400/10 text-red-300",
            gray: "border-white/10 bg-white/[0.03] text-arena-muted",
          };

          return (
            <div
              key={card.label}
              className={`rounded-2xl border p-4 backdrop-blur-sm transition-all hover:bg-white/[0.06] ${
                colorStyles[card.color] || colorStyles.gray
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-lg">{card.icon}</span>
                {card.isLive ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-400/20 px-2 py-0.5 text-[10px] font-bold text-amber-300 animate-pulse">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                    LIVE
                  </span>
                ) : null}
              </div>

              <div className="mt-3">
                <p className="text-xs font-semibold text-arena-muted uppercase tracking-wider line-clamp-1">
                  {card.label}
                </p>
                <p className="mt-1 font-display text-3xl font-black text-white tracking-tight">
                  {card.value}
                </p>
                <p className="mt-1 text-[11px] text-arena-muted line-clamp-1">{card.subtext}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
