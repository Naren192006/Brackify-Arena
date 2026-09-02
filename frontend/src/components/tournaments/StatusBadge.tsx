type StatusBadgeProps = {
  status: string;
  computedStatus?: string;
  registeredCount?: number;
  maxTeams?: number;
  registrationOpenAt?: string;
  registrationCloseAt?: string;
  startTime?: string;
};

export function StatusBadge({
  status,
  computedStatus,
  registeredCount,
  maxTeams,
  registrationOpenAt,
  registrationCloseAt,
  startTime,
}: StatusBadgeProps) {
  const count = registeredCount ?? 0;
  const isFull = maxTeams !== undefined && maxTeams > 0 && count >= maxTeams;

  // Determine computed status if not explicitly passed
  let resolvedStatus = computedStatus ?? status;
  const now = Date.now();

  if (!computedStatus && registrationOpenAt && registrationCloseAt && startTime) {
    const openTime = new Date(registrationOpenAt).getTime();
    const closeTime = new Date(registrationCloseAt).getTime();
    const start = new Date(startTime).getTime();

    if (status === "completed") {
      resolvedStatus = "COMPLETED";
    } else if (status === "ongoing" || now >= start) {
      resolvedStatus = "LIVE";
    } else if (now >= openTime && now < closeTime) {
      resolvedStatus = isFull ? "FULL" : "REGISTRATION_OPEN";
    } else {
      resolvedStatus = "UPCOMING";
    }
  } else if (isFull && (resolvedStatus === "open" || resolvedStatus === "REGISTRATION_OPEN")) {
    resolvedStatus = "FULL";
  }

  const normalized = resolvedStatus.toUpperCase().replace(/\s+/g, "_");

  switch (normalized) {
    case "REGISTRATION_OPEN":
    case "OPEN":
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-emerald-400">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          Registration Open
        </span>
      );

    case "FULL":
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/30 bg-amber-400/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-amber-300">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
          Tournament Full
        </span>
      );

    case "LIVE":
    case "ONGOING":
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-red-500/40 bg-red-500/15 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-red-400 animate-pulse">
          <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
          Live
        </span>
      );

    case "COMPLETED":
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-purple-400/30 bg-purple-400/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-purple-300">
          Completed
        </span>
      );

    case "UPCOMING":
    default:
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-cyan-400/30 bg-cyan-400/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-arena-accent">
          Upcoming
        </span>
      );
  }
}
