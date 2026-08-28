import { redirect } from "next/navigation";
import { SuperAdminDashboard } from "@/components/admin/SuperAdminDashboard";
import { isSuperAdmin } from "@/lib/admin/permissions";
import { createClient } from "@/lib/supabase/server";

export default async function AdminPage() {
  const supabase = await createClient(); const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login?next=%2Fadmin");
  if (!(await isSuperAdmin(supabase, data.user.id))) redirect("/dashboard");
  return <SuperAdminDashboard />;
}
