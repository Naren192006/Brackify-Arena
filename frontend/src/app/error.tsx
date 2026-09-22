"use client";

import { useEffect } from "react";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[app-error]", error);
  }, [error]);

  return (
    <main
      id="main-content"
      className="arena-grid-bg relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-6 text-center"
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,var(--color-arena-bg)_75%)]" />
      <div className="relative">
        <p className="font-display text-sm uppercase tracking-[0.4em] text-arena-danger">Server disconnect</p>
        <h1 className="font-display mt-4 text-5xl font-bold text-arena-text sm:text-7xl">LAG SPIKE</h1>
        <p className="mt-4 max-w-md text-sm text-arena-muted">
          Something broke on our side — not your aim. The team has been pinged. Try re-entering the arena.
        </p>
        <button
          onClick={reset}
          className="mt-8 rounded-xl bg-arena-accent px-6 py-3 text-sm font-bold text-black transition-transform hover:scale-[1.03] focus-visible:outline-2"
        >
          Retry
        </button>
        {error.digest && <p className="mt-6 font-mono text-xs text-arena-muted/60">ref: {error.digest}</p>}
      </div>
    </main>
  );
}
