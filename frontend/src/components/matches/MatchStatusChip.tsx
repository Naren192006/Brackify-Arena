"use client";

import React from "react";

export type MatchLifecycleState =
  | "upcoming"
  | "scheduled"
  | "pending"
  | "live"
  | "waiting_verification"
  | "awaiting_approval"
  | "reported"
  | "verified"
  | "completed"
  | "paused"
  | "cancelled";

interface MatchStatusChipProps {
  status: MatchLifecycleState | string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function MatchStatusChip({
  status,
  size = "md",
  className = "",
}: MatchStatusChipProps) {
  const norm = String(status || "").toLowerCase();

  let state: "upcoming" | "live" | "waiting_verification" | "verified" | "completed" | "paused" | "cancelled" =
    "upcoming";

  if (norm === "live") {
    state = "live";
  } else if (norm === "waiting_verification" || norm === "awaiting_approval" || norm === "reported") {
    state = "waiting_verification";
  } else if (norm === "verified") {
    state = "verified";
  } else if (norm === "completed") {
    state = "completed";
  } else if (norm === "paused") {
    state = "paused";
  } else if (norm === "cancelled") {
    state = "cancelled";
  } else {
    state = "upcoming";
  }

  const sizeClasses = {
    sm: "px-2 py-0.5 text-[10px]",
    md: "px-2.5 py-1 text-xs",
    lg: "px-3.5 py-1.5 text-sm",
  }[size];

  switch (state) {
    case "live":
      return (
        <span
          className={`inline-flex items-center gap-1.5 rounded-full border border-emerald-500/50 bg-emerald-500/15 font-bold text-emerald-400 animate-pulse shadow-sm shadow-emerald-950/40 ${sizeClasses} ${className}`}
        >
          <span className="h-2 w-2 rounded-full bg-emerald-400" />
          Live
        </span>
      );

    case "waiting_verification":
      return (
        <span
          className={`inline-flex items-center gap-1.5 rounded-full border border-amber-400/50 bg-amber-400/15 font-semibold text-amber-300 shadow-sm shadow-amber-950/30 ${sizeClasses} ${className}`}
        >
          <span className="h-2 w-2 rounded-full bg-amber-400 animate-ping" />
          Waiting Verification
        </span>
      );

    case "verified":
      return (
        <span
          className={`inline-flex items-center gap-1.5 rounded-full border border-cyan-400/40 bg-arena-bg-elevated font-semibold text-cyan-300 ${sizeClasses} ${className}`}
        >
          <span className="text-cyan-400">✓</span>
          Verified
        </span>
      );

    case "completed":
      return (
        <span
          className={`inline-flex items-center gap-1.5 rounded-full border border-purple-400/40 bg-purple-400/15 font-semibold text-purple-300 ${sizeClasses} ${className}`}
        >
          <span>🏆</span>
          Completed
        </span>
      );

    case "paused":
      return (
        <span
          className={`inline-flex items-center gap-1.5 rounded-full border border-yellow-500/40 bg-yellow-500/15 font-semibold text-yellow-300 ${sizeClasses} ${className}`}
        >
          <span>⏸</span>
          Paused
        </span>
      );

    case "cancelled":
      return (
        <span
          className={`inline-flex items-center gap-1.5 rounded-full border border-red-500/40 bg-red-500/15 font-semibold text-arena-danger ${sizeClasses} ${className}`}
        >
          Cancelled
        </span>
      );

    case "upcoming":
    default:
      return (
        <span
          className={`inline-flex items-center gap-1.5 rounded-full border border-arena-border bg-arena-bg-elevated font-semibold text-arena-muted ${sizeClasses} ${className}`}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-white/40" />
          Upcoming
        </span>
      );
  }
}
