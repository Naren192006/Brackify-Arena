import type { AdminMatch, AdminRegistration } from "@/types/admin";
import type { Tournament } from "@/types/tournament";
export type ControlRoomSnapshot = { tournament: Tournament; registrations: AdminRegistration[]; matches: AdminMatch[]; reportsPending: number; activity: { id: string; description: string; created_at: string }[]; paused: boolean };
