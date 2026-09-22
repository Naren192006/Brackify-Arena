import Link from "next/link";

export default function NotFound() {
  return (
    <main
      id="main-content"
      className="arena-grid-bg relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-6 text-center"
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,var(--color-arena-bg)_75%)]" />
      <div className="relative">
        <p className="font-display text-sm uppercase tracking-[0.4em] text-arena-accent">Signal lost</p>
        <h1 className="font-display mt-4 bg-gradient-to-r from-arena-text via-cyan-300 to-arena-text bg-clip-text text-7xl font-bold text-transparent sm:text-9xl">
          404
        </h1>
        <p className="font-display mt-4 text-xl font-semibold text-arena-text sm:text-2xl">
          This map doesn&apos;t exist.
        </p>
        <p className="mt-2 max-w-md text-sm text-arena-muted">
          The page you&apos;re looking for was rotated out, moved, or never spawned. Head back to the arena and
          re-queue.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/"
            className="rounded-xl bg-arena-accent px-6 py-3 text-sm font-bold text-black transition-transform hover:scale-[1.03] focus-visible:outline-2"
          >
            Back to Home
          </Link>
          <Link
            href="/tournaments"
            className="rounded-xl border border-arena-border bg-white/[0.04] px-6 py-3 text-sm font-semibold text-arena-text-secondary transition-colors hover:text-arena-text focus-visible:outline-2"
          >
            Browse Tournaments
          </Link>
        </div>
      </div>
    </main>
  );
}
