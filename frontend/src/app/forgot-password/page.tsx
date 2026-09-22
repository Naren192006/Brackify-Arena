"use client";

import { useState } from "react";
import Link from "next/link";
import { authApi } from "@/lib/api/client";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      await authApi.requestPasswordReset(email.trim());
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="ambient-bg mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-md flex-col justify-center px-4 py-6 sm:py-12">
      <div className="glass-panel-strong w-full rounded-2xl p-5 sm:p-8">
        <h1 className="font-display text-2xl sm:text-3xl font-bold">Reset your password</h1>
        {sent ? (
          <>
            <p className="mt-3 text-sm sm:text-base text-arena-muted">
              If an account exists for <strong className="text-arena-text">{email}</strong>, a
              reset link is on its way. It expires in one hour.
            </p>
            <p className="mt-4 text-sm text-arena-muted">
              Didn&apos;t get it? Check your spam folder, or{" "}
              <button type="button" className="text-arena-accent hover:underline" onClick={() => setSent(false)}>
                try again
              </button>
              .
            </p>
          </>
        ) : (
          <>
            <p className="mt-2 text-sm sm:text-base text-arena-muted">
              Enter your account email and we&apos;ll send you a reset link.
            </p>
            <form onSubmit={onSubmit} className="mt-6 space-y-4">
              {error && (
                <div className="rounded-lg border border-arena-danger/30 bg-arena-danger/10 px-4 py-3 text-sm text-arena-danger">
                  {error}
                </div>
              )}
              <div>
                <label htmlFor="email" className="mb-1 block text-sm text-arena-muted">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  autoComplete="email"
                  className="input-field w-full"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <button type="submit" disabled={pending} className="btn-primary w-full">
                {pending ? "Sending..." : "Send reset link"}
              </button>
            </form>
          </>
        )}
        <p className="mt-6 text-center text-sm text-arena-muted">
          Remembered it?{" "}
          <Link href="/login" className="text-arena-accent hover:underline">
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
