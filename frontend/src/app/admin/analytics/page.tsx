import { redirect } from "next/navigation";
import { OrganizerAnalyticsDashboard } from "@/components/admin/analytics/OrganizerAnalyticsDashboard";
import { getAdminRole } from "@/lib/admin/permissions";
import { createClient } from "@/lib/supabase/server";

export const metadata = {
  title: "Organizer Analytics — Brackify Arena Admin",
  description: "Real-time tournament revenue, registration conversion trends, and match telemetry.",
};

export default async function AdminAnalyticsPage() {
  const client = await createClient();
  const { data } = await client.auth.getUser();

  if (!data.user) {
    redirect("/admin/login");
  }

  const role = await getAdminRole(client, data.user.id);
  if (!role) {
    redirect("/dashboard");
  }

  return <OrganizerAnalyticsDashboard />;
}

