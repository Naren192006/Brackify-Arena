import { LoginForm } from "@/components/auth/LoginForm";

export default function LoginPage() {
  return (
    <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-md flex-col justify-center px-4 py-12">
      <div className="glass-card rounded-2xl p-8">
        <h1 className="font-display text-3xl font-bold">Welcome to Brackify Arena</h1>
        <p className="mt-2 text-arena-muted">Sign in to manage your teams and registrations.</p>
        <div className="mt-8">
          <LoginForm />
        </div>
      </div>
    </div>
  );
}
