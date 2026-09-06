import { TournamentCreateForm } from "@/components/admin/TournamentCreateForm";

export const dynamic = "force-dynamic";

export default function CreateTournamentPage() {
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
