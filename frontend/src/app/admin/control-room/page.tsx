import { redirect } from "next/navigation";
import { AdminControlRoom } from "@/components/admin/control-room/AdminControlRoom";
import { getAdminRole } from "@/lib/admin/permissions";
import { createClient } from "@/lib/supabase/server";

export const metadata = {
  title: "Tournament Control Room — Brackify Arena Admin",
  description: "Manage real-time tournament operations, bracket progression, and match actions.",
};

export default async function AdminControlRoomPage() {
  const client = await createClient();
  const { data } = await client.auth.getUser();

  if (!data.user) {
    redirect("/admin/login");
  }

  const role = await getAdminRole(client, data.user.id);
  if (!role) {
    redirect("/dashboard");
  }

  return <AdminControlRoom />;
}

