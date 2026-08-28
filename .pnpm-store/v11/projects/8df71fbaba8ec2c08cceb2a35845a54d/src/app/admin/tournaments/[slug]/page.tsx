import { redirect } from "next/navigation";
import { AdminTournamentPage } from "@/components/admin/AdminTournamentPage";
import { isTournamentAdmin } from "@/lib/admin/permissions";
import { createClient } from "@/lib/supabase/server";

export default async function AdminTournamentRoute({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) redirect(`/login?next=${encodeURIComponent(`/admin/tournaments/${slug}`)}`);
  const { data: tournament } = await supabase.from("tournaments").select("id").eq("slug", slug).maybeSingle();
  if (!tournament) redirect(`/tournaments/${slug}`);
  if (!(await isTournamentAdmin(supabase, user.user.id, tournament.id))) redirect(`/tournaments/${slug}`);
  return <AdminTournamentPage slug={slug} />;
}
