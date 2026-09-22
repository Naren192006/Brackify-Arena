import { LoginForm } from "@/components/auth/LoginForm";

export default function LoginPage() {
  return (
    <div className="ambient-bg mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-md flex-col justify-center px-4 py-6 sm:py-12">
      <div className="glass-panel-strong w-full rounded-2xl p-5 sm:p-8">
        <h1 className="font-display text-2xl sm:text-3xl font-bold">Welcome to Brackify Arena</h1>
        <p className="mt-2 text-sm sm:text-base text-arena-muted">Sign in to manage your teams and registrations.</p>
        <div className="mt-6 sm:mt-8">
          <LoginForm />
        </div>
      </div>
    </div>
  );
}
