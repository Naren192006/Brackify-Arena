import { redirect } from "next/navigation";
import { NotificationsPageContent } from "@/components/notifications/NotificationsPageContent";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Notifications — Brackify Arena",
  description: "View and manage your tournament notifications, match schedules, and payment alerts.",
};

export default async function NotificationsPage() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    redirect("/login?next=%2Fnotifications");
  }

  return <NotificationsPageContent userId={data.user.id} />;
}

