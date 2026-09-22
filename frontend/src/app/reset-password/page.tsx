"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { authApi } from "@/lib/api/client";

function ResetPasswordForm() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setPending(true);
    try {
      await authApi.confirmPasswordReset(token, password);
      setDone(true);
      setTimeout(() => router.push("/login"), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reset failed — the link may have expired.");
    } finally {
      setPending(false);
    }
  }

  if (!token) {
    return (
      <>
        <p className="mt-3 text-sm text-arena-muted">
          This reset link is missing its token. Request a fresh one from the{" "}
          <Link href="/forgot-password" className="text-arena-accent hover:underline">
            forgot password page
          </Link>
          .
        </p>
        <p className="mt-6 text-center text-sm text-arena-muted">
          <Link href="/login" className="text-arena-accent hover:underline">
            Back to sign in
          </Link>
        </p>
      </>
    );
  }

  if (done) {
    return (
      <>
        <div className="mt-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-400">
          Password updated. Redirecting you to sign in…
        </div>
        <p className="mt-6 text-center text-sm text-arena-muted">
          <Link href="/login" className="text-arena-accent hover:underline">
            Sign in now
          </Link>
        </p>
      </>
    );
  }

  return (
    <>
      <p className="mt-2 text-sm sm:text-base text-arena-muted">
        Choose a new password for your account.
      </p>
      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        {error && (
          <div className="rounded-lg border border-arena-danger/30 bg-arena-danger/10 px-4 py-3 text-sm text-arena-danger">
            {error}
          </div>
        )}
        <div>
          <label htmlFor="password" className="mb-1 block text-sm text-arena-muted">
            New password
          </label>
          <input
            id="password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            className="input-field w-full"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="confirm" className="mb-1 block text-sm text-arena-muted">
            Confirm new password
          </label>
          <input
            id="confirm"
            type="password"
            required
            autoComplete="new-password"
            className="input-field w-full"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </div>
        <button type="submit" disabled={pending} className="btn-primary w-full">
          {pending ? "Updating..." : "Update password"}
        </button>
      </form>
      <p className="mt-6 text-center text-sm text-arena-muted">
        <Link href="/login" className="text-arena-accent hover:underline">
          Back to sign in
        </Link>
      </p>
    </>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-md flex-col justify-center px-4 py-6 sm:py-12">
      <div className="glass-card w-full rounded-2xl p-5 sm:p-8">
        <h1 className="font-display text-2xl sm:text-3xl font-bold">Set a new password</h1>
        <Suspense fallback={<p className="mt-4 text-sm text-arena-muted">Loading…</p>}>
          <ResetPasswordForm />
        </Suspense>
      </div>
    </div>
  );
}
