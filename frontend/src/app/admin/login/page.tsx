import { AdminLoginForm } from "@/components/auth/AdminLoginForm";

export const dynamic = "force-dynamic";

export default function AdminLoginPage() {
  return (
    <main className="mx-auto max-w-lg px-4 py-16">
      <section className="glass-card rounded-2xl p-8">
        <p className="text-sm uppercase tracking-[0.25em] text-arena-accent">Brackify Arena</p>
        <h1 className="mt-3 font-display text-4xl font-bold text-white">Brackify Arena Admin Portal</h1>
        <div className="mt-6">
          <AdminLoginForm />
        </div>
      </section>
    </main>
  );
}
