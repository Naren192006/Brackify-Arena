"use client";

import { useMemo } from "react";
import type { RealtimeFeedEvent } from "@/hooks/useTournamentRealtime";
import type { TournamentActivity } from "@/types/live";

interface LiveEventFeedProps {
  realtimeEvents?: RealtimeFeedEvent[];
  persistedActivity?: TournamentActivity[];
  isConnected?: boolean;
  onClear?: () => void;
  maxEvents?: number;
}

export function LiveEventFeed({
  realtimeEvents = [],
  persistedActivity = [],
  isConnected = true,
  onClear,
  maxEvents = 30,
}: LiveEventFeedProps) {
  // Combine realtime broadcast events and persisted tournament activity
  const mergedEvents = useMemo(() => {
    const combined: Array<{
      id: string;
      title: string;
      description: string;
      timestamp: string;
      icon: string;
      badgeColor: string;
      isLive?: boolean;
    }> = [];

    // Add realtime events first
    realtimeEvents.forEach((evt) => {
      combined.push({
        id: evt.id,
        title: evt.title,
        description: evt.description,
        timestamp: evt.timestamp,
        icon: evt.icon || "",
        badgeColor: evt.badgeColor || "cyan",
        isLive: true,
      });
    });

    // Add persisted activity if not already duplicated
    persistedActivity.forEach((act) => {
      if (!combined.some((c) => c.timestamp === act.created_at)) {
        let icon = "";
        let badgeColor = "cyan";
        let title = "Tournament Activity";

        if (act.event_type.includes("match")) {
          icon = "";
          title = "Match Event";
          badgeColor = "purple";
        } else if (act.event_type.includes("score")) {
          icon = "";
          title = "Score Update";
          badgeColor = "amber";
        } else if (act.event_type.includes("champion") || act.event_type.includes("complete")) {
          icon = "";
          title = "Champion Crowned";
          badgeColor = "amber";
        }

        combined.push({
          id: act.id,
          title,
          description: act.message,
          timestamp: act.created_at,
          icon,
          badgeColor,
          isLive: false,
        });
      }
    });

    // Sort descending by timestamp
    combined.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return combined.slice(0, maxEvents);
  }, [realtimeEvents, persistedActivity, maxEvents]);

  const formatTime = (ts: string) => {
    try {
      const d = new Date(ts);
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    } catch {
      return ts;
    }
  };

  return (
    <section className="glass-card flex flex-col rounded-2xl border border-arena-border bg-[#0d1322]/80 p-5 backdrop-blur-xl shadow-xl shadow-black/40">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-arena-border pb-3.5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-arena-bg-elevated text-arena-accent font-bold text-sm">

          </div>
          <div>
            <h2 className="font-display text-base font-bold text-arena-text flex items-center gap-2">
              Live Event Feed
              {isConnected ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 text-[9px] font-semibold text-emerald-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping" />
                  REALTIME
                </span>
              ) : (
                <span className="rounded-full bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 text-[9px] font-semibold text-amber-400">
                  CONNECTING
                </span>
              )}
            </h2>
            <p className="text-[11px] text-arena-muted">Chronological match & tournament updates</p>
          </div>
        </div>

        {onClear && mergedEvents.length > 0 ? (
          <button
            onClick={onClear}
            className="rounded-lg border border-arena-border bg-arena-bg-elevated px-2.5 py-1 text-[10px] text-arena-muted hover:text-arena-text transition-colors"
          >
            Clear
          </button>
        ) : null}
      </div>

      {/* Feed List */}
      <div className="mt-4 flex-1 space-y-2.5 overflow-y-auto max-h-[460px] pr-1 scrollbar-thin scrollbar-thumb-white/10">
        {mergedEvents.length === 0 ? (
          <div className="rounded-xl border border-dashed border-arena-border bg-white/[0.02] p-8 text-center">
            <span className="text-2xl block mb-1">⏳</span>
            <p className="text-xs font-semibold text-arena-text">Awaiting live events...</p>
            <p className="mt-1 text-[11px] text-arena-muted">
              Live matches, score submissions, and tournament updates will stream here in real-time.
            </p>
          </div>
        ) : (
          mergedEvents.map((evt) => {
            const isChamp = evt.badgeColor === "amber" && (evt.title.includes("Champion") || evt.description.includes(""));

            return (
              <div
                key={evt.id}
                className={`group relative flex items-start gap-3 rounded-xl border p-3 transition-all ${
                  isChamp
                    ? "border-amber-400/40 bg-gradient-to-r from-amber-500/15 to-yellow-500/5 shadow-md shadow-amber-950/30 animate-pulse"
                    : evt.isLive
                      ? "border-cyan-500/30 bg-cyan-950/15 hover:border-cyan-500/50"
                      : "border-arena-border bg-white/[0.02] hover:bg-white/[0.04]"
                }`}
              >
                {/* Icon Badge */}
                <div
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-base ${
                    isChamp
                      ? "bg-amber-400/20 text-amber-300"
                      : evt.badgeColor === "emerald"
                        ? "bg-emerald-500/20 text-emerald-400"
                        : evt.badgeColor === "amber"
                          ? "bg-amber-500/20 text-amber-400"
                          : evt.badgeColor === "purple"
                            ? "bg-purple-500/20 text-purple-400"
                            : "bg-cyan-500/20 text-cyan-400"
                  }`}
                >
                  {evt.icon}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`text-xs font-bold truncate ${
                        isChamp ? "text-amber-300" : "text-arena-text"
                      }`}
                    >
                      {evt.title}
                    </span>
                    <span className="shrink-0 font-mono text-[10px] text-arena-muted">
                      {formatTime(evt.timestamp)}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-white/80 break-words leading-relaxed">
                    {evt.description}
                  </p>
                </div>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
