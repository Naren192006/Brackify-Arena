"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAdminAuth } from "@/context/AdminAuthContext";

export function AdminLoginForm() {
  const router = useRouter();
  const { login } = useAdminAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      console.log("[AdminLoginForm] Login initiating for:", email);
      await login(email, password);
      console.log("[AdminLoginForm] Login successful, redirecting to /admin/dashboard");
      router.replace("/admin/dashboard");
    } catch (err: unknown) {
      console.error("[AdminLoginForm] Login error:", err);
      setError(err instanceof Error ? err.message : "Invalid admin credentials.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={handleLogin} className="space-y-5">
      <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-4 text-xs text-arena-muted">
        <p className="font-semibold text-cyan-300 uppercase tracking-wider mb-1">
          Restricted Portal Access
        </p>
        <p>
          Enter your authorized Brackify platform administrator credentials.
        </p>
      </div>

      {error ? (
        <div className="rounded-lg border border-arena-danger/30 bg-arena-danger/10 px-4 py-3 text-sm text-arena-danger flex items-center justify-between">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            className="text-arena-danger hover:text-arena-text ml-2 text-xs"
          >

          </button>
        </div>
      ) : null}

      <div>
        <label className="block text-xs font-semibold uppercase tracking-wider text-arena-muted mb-1.5">
          Administrator Email
        </label>
        <input
          className="input-field w-full"
          type="email"
          placeholder="admin@brackify.com"
          required
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </div>

      <div>
        <label className="block text-xs font-semibold uppercase tracking-wider text-arena-muted mb-1.5">
          Password
        </label>
        <input
          className="input-field w-full"
          type="password"
          placeholder="••••••••••••"
          required
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </div>

      <button className="btn-primary w-full py-3 text-sm font-semibold shadow-lg shadow-cyan-500/10" disabled={busy}>
        {busy ? "Authenticating Admin Session…" : "Sign In to Admin Portal"}
      </button>

      <div className="pt-2 text-center text-xs text-arena-muted flex flex-wrap items-center justify-center gap-1.5 sm:gap-2">
        <span>Player or Tournament Competitor?</span>
        <Link href="/login" className="text-arena-accent hover:underline font-medium">
          Player Sign In →
        </Link>
      </div>
    </form>
  );
}
