import type { AdminRole } from "@/lib/admin/permissions";

export type AdminUser = { user_id: string; email: string | null; role: AdminRole | null; display_name: string | null; username: string | null; avatar_url: string | null };
