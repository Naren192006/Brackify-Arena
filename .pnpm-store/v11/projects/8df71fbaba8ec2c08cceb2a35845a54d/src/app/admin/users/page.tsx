import { redirect } from "next/navigation";
import { SuperAdminDashboard } from "@/components/admin/SuperAdminDashboard";
import { isSuperAdmin } from "@/lib/admin/permissions";
import { createClient } from "@/lib/supabase/server";
export default async function AdminUsersPage(){const client=await createClient();const {data}=await client.auth.getUser();if(!data.user)redirect("/admin/login");if(!(await isSuperAdmin(client,data.user.id)))redirect("/dashboard");return <SuperAdminDashboard/>}
