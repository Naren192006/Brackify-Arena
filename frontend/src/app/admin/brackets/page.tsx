import { redirect } from "next/navigation";
import { AdminBracketView } from "@/components/admin/brackets/AdminBracketView";
import { getAdminRole } from "@/lib/admin/permissions";
import { createClient } from "@/lib/supabase/server";

export const metadata = {
  title: "Bracket & Match Operations — Brackify Arena Admin",
  description: "Manage tournament brackets, match progressions, live scoring, and winner advancement.",
};

export default async function AdminBracketsPage() {
  const client = await createClient();
  const { data } = await client.auth.getUser();

  if (!data.user) {
    redirect("/admin/login");
  }

  const role = await getAdminRole(client, data.user.id);
  if (!role) {
    redirect("/dashboard");
  }

  return <AdminBracketView />;
}

