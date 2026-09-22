export default function Loading() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center" role="status" aria-label="Loading">
      <div className="relative h-12 w-12">
        <div className="absolute inset-0 animate-spin rounded-full border-2 border-arena-border border-t-arena-accent" />
        <div
          className="absolute inset-2 animate-spin rounded-full border-2 border-transparent border-b-indigo-400"
          style={{ animationDirection: "reverse", animationDuration: "1.2s" }}
        />
      </div>
      <span className="sr-only">Loading…</span>
    </div>
  );
}
