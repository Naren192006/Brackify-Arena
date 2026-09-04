"use client";

import React from "react";

export function ErrorState({
  title = "Failed to load data",
  message = "An unexpected error occurred while fetching information.",
  onRetry,
  retryLabel = "Try Again",
}: {
  title?: string;
  message?: string;
  onRetry?: () => void;
  retryLabel?: string;
}) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center rounded-3xl border border-red-500/30 bg-gradient-to-b from-red-950/20 via-[#0a0f1d] to-[#060a14] p-8 sm:p-12 text-center shadow-xl shadow-red-950/20"
    >
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-red-500/40 bg-red-500/10 text-2xl shadow-inner mb-4">
        ⚠️
      </div>

      <h3 className="font-display text-lg font-bold text-white tracking-tight sm:text-xl">
        {title}
      </h3>

      <p className="mt-1.5 max-w-sm text-xs sm:text-sm text-red-300/80 leading-relaxed">
        {message}
      </p>

      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="mt-6 inline-flex items-center gap-2 rounded-xl border border-red-500/40 bg-red-500/20 px-5 py-2.5 text-xs sm:text-sm font-semibold text-red-300 hover:bg-red-500/30 focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:outline-none transition-all duration-150 hover:-translate-y-0.5 shadow-md shadow-red-950/40"
        >
          ↻ {retryLabel}
        </button>
      ) : null}
    </div>
  );
}

