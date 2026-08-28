import { redirect } from "next/navigation";

import { DashboardContent } from "@/components/dashboard/DashboardContent";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    const isExpectedSignedOutState = error?.name === "AuthSessionMissingError" || error?.message === "Auth session missing!";
    if (process.env.NODE_ENV !== "production" && error && !isExpectedSignedOutState) {
      console.warn("[supabase] unexpected dashboard user lookup failure", {
        code: error.code,
        message: error.message,
      });
    }
    redirect("/login?next=%2Fdashboard");
  }

  const user = data.user;
  return <DashboardContent userId={user.id} email={user.email ?? ""} metadata={user.user_metadata ?? {}} />;
}
