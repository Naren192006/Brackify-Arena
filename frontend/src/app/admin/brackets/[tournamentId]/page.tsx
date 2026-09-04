import { redirect } from "next/navigation";
import { AdminBracketView } from "@/components/admin/brackets/AdminBracketView";
import { getAdminRole } from "@/lib/admin/permissions";
import { createClient } from "@/lib/supabase/server";

export const metadata = {
  title: "Bracket Control Room — Brackify Arena Admin",
  description: "Manage tournament matches, real-time live scoring, and automatic bracket advancement.",
};

type Props = {
  params: Promise<{ tournamentId: string }>;
};

export default async function AdminTournamentBracketPage({ params }: Props) {
  const { tournamentId } = await params;
  const client = await createClient();
  const { data } = await client.auth.getUser();

  if (!data.user) {
    redirect("/admin/login");
  }

  const role = await getAdminRole(client, data.user.id);
  if (!role) {
    redirect("/dashboard");
  }

  return <AdminBracketView initialTournamentId={tournamentId} />;
}

