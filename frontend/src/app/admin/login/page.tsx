import { AdminLoginForm } from "@/components/auth/AdminLoginForm";

export const dynamic = "force-dynamic";

export default function AdminLoginPage() {
  return (
    <main className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-md flex-col justify-center px-4 py-6 sm:py-16">
      <section className="glass-card w-full rounded-2xl p-5 sm:p-8">
        <p className="text-xs sm:text-sm uppercase tracking-[0.25em] text-arena-accent">Brackify Arena</p>
        <h1 className="mt-2 sm:mt-3 font-display text-2xl sm:text-3xl lg:text-4xl font-bold text-arena-text">Brackify Arena Admin Portal</h1>
        <div className="mt-6">
          <AdminLoginForm />
        </div>
      </section>
    </main>
  );
}
