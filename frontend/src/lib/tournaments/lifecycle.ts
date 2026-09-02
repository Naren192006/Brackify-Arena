export type ComputedLifecycleStatus = "UPCOMING" | "REGISTRATION_OPEN" | "LIVE" | "COMPLETED";

export function getComputedTournamentStatus(tournament: {
  status: string;
  registration_open_at: string;
  registration_close_at: string;
  start_time: string;
  champion_team_id?: string | null;
}): ComputedLifecycleStatus {
  const now = Date.now();
  const openTime = new Date(tournament.registration_open_at).getTime();
  const closeTime = new Date(tournament.registration_close_at).getTime();
  const startTime = new Date(tournament.start_time).getTime();

  if (tournament.status === "completed" || Boolean(tournament.champion_team_id)) {
    return "COMPLETED";
  }
  if (tournament.status === "ongoing" || now >= startTime) {
    return "LIVE";
  }
  if (now >= openTime && now < closeTime) {
    return "REGISTRATION_OPEN";
  }
  return "UPCOMING";
}

export function formatCountdown(targetDateIso: string): string {
  const diffMs = new Date(targetDateIso).getTime() - Date.now();
  if (diffMs <= 0) return "0m";

  const totalMinutes = Math.floor(diffMs / (1000 * 60));
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) {
    return `${days}d ${hours}h ${minutes}m`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

