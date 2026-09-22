"use client";

import Link from "next/link";
import React from "react";

export function EmptyState({
  icon = "",
  title = "No items found",
  description = "There are no records to display at this time.",
  actionLabel,
  actionHref,
  onAction,
}: {
  icon?: string | React.ReactNode;
  title?: string;
  description?: string;
  actionLabel?: string;
  actionHref?: string;
  onAction?: () => void;
}) {
  return (
    <div
      role="status"
      className="flex flex-col items-center justify-center rounded-3xl border border-arena-border bg-white/[0.02] p-8 sm:p-12 text-center shadow-xl backdrop-blur-sm"
    >
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-arena-border bg-black/40 text-3xl shadow-inner mb-4">
        {icon}
      </div>

      <h3 className="font-display text-lg font-bold text-arena-text tracking-tight sm:text-xl">
        {title}
      </h3>

      <p className="mt-1.5 max-w-sm text-xs sm:text-sm text-arena-muted leading-relaxed">
        {description}
      </p>

      {actionLabel && actionHref ? (
        <Link
          href={actionHref}
          className="mt-6 inline-flex items-center gap-2 rounded-xl border border-cyan-400/40 bg-cyan-400/20 px-5 py-2.5 text-xs sm:text-sm font-semibold text-arena-accent hover:bg-cyan-400/30 focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:outline-none transition-all duration-150 hover:-translate-y-0.5 shadow-md shadow-cyan-950/30"
        >
          {actionLabel}
        </Link>
      ) : actionLabel && onAction ? (
        <button
          type="button"
          onClick={onAction}
          className="mt-6 inline-flex items-center gap-2 rounded-xl border border-cyan-400/40 bg-cyan-400/20 px-5 py-2.5 text-xs sm:text-sm font-semibold text-arena-accent hover:bg-cyan-400/30 focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:outline-none transition-all duration-150 hover:-translate-y-0.5 shadow-md shadow-cyan-950/30"
        >
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}

