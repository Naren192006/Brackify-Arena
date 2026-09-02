import { redirect } from "next/navigation";
import { TournamentCreateForm } from "@/components/admin/TournamentCreateForm";
import { getAdminRole } from "@/lib/admin/permissions";
import { createClient } from "@/lib/supabase/server";

export default async function CreateTournamentPage() {
  const client = await createClient();
  const { data } = await client.auth.getUser();
  if (!data.user) redirect("/admin/login");
  if (!(await getAdminRole(client, data.user.id))) redirect("/dashboard");

  return (
    <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <p className="text-sm uppercase tracking-[0.25em] text-arena-accent">Admin portal</p>
      <h1 className="mt-2 font-display text-4xl font-bold text-white">Create tournament</h1>
      <section className="glass-card mt-6 rounded-2xl p-6">
        <TournamentCreateForm />
      </section>
    </main>
  );
}
