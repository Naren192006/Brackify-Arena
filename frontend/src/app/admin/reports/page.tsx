import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAdminRole } from "@/lib/admin/permissions";
import { ReportsQueue } from "@/components/admin/ReportsQueue";

export default async function AdminReportsPage() { const client = await createClient(); const { data } = await client.auth.getUser(); if (!data.user) redirect("/admin/login"); if (!(await getAdminRole(client, data.user.id))) redirect("/dashboard"); return <ReportsQueue />; }
