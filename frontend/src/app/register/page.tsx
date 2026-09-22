import { RegisterForm } from "@/components/auth/RegisterForm";

export default function RegisterPage() {
  return (
    <div className="ambient-bg mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-md flex-col justify-center px-4 py-6 sm:py-12">
      <div className="glass-panel-strong w-full rounded-2xl p-5 sm:p-8">
        <h1 className="font-display text-2xl sm:text-3xl font-bold">Join Brackify Arena</h1>
        <p className="mt-2 text-sm sm:text-base text-arena-muted">Create your account and start competing.</p>
        <div className="mt-6 sm:mt-8">
          <RegisterForm />
        </div>
      </div>
    </div>
  );
}
