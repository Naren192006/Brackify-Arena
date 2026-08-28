import { redirect } from "next/navigation";
import { AdminDashboard } from "@/components/admin/AdminDashboard";
import { getAdminRole } from "@/lib/admin/permissions";
import { createClient } from "@/lib/supabase/server";
export default async function AdminDashboardPage() { const client = await createClient(); const { data } = await client.auth.getUser(); if (!data.user) redirect("/admin/login"); if (!(await getAdminRole(client, data.user.id))) redirect("/dashboard"); return <AdminDashboard />; }
