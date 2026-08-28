type StatusBadgeProps = { status: string; registeredCount?: number; maxTeams?: number; registrationOpenAt?: string; registrationCloseAt?: string };

export function StatusBadge({ status, registeredCount, maxTeams, registrationOpenAt, registrationCloseAt }: StatusBadgeProps) {
  const count = registeredCount ?? 0;
  const isFull = maxTeams !== undefined && maxTeams > 0 && count >= maxTeams;
  let displayStatus = status;
  if ((status === "open" || status === "full") && isFull) displayStatus = "full";
  else if (status === "full") displayStatus = "open";
  if (displayStatus === "ongoing") displayStatus = "live";
  if (displayStatus === "check_in") displayStatus = "check-in open";
  if (displayStatus === "registration_closed") displayStatus = "registration closed";
  return <span className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-arena-accent">{displayStatus.replaceAll("_", " ")}</span>;
}
