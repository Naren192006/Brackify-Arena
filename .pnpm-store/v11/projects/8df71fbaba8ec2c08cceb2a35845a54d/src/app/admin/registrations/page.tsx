import { redirect } from "next/navigation";
import { RegistrationQueue } from "@/components/admin/RegistrationQueue";
import { createClient } from "@/lib/supabase/server";
import { getAdminRole } from "@/lib/admin/permissions";

export default async function AdminRegistrationsPage() { const client = await createClient(); const { data } = await client.auth.getUser(); if (!data.user) redirect("/admin/login"); if (!(await getAdminRole(client, data.user.id))) redirect("/dashboard"); return <RegistrationQueue />; }
