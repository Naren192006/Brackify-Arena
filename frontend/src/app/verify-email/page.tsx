"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { authApi } from "@/lib/api/client";

function VerifyEmailInner() {
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const [state, setState] = useState<"pending" | "ok" | "error">("pending");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!token) {
      setState("error");
      setMessage("This verification link is missing its token.");
      return;
    }
    let cancelled = false;
    authApi
      .confirmEmailVerification(token)
      .then((res) => {
        if (!cancelled) {
          setState("ok");
          setMessage(res.message || "Email verified successfully.");
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setState("error");
          setMessage(err instanceof Error ? err.message : "Verification failed — the link may have expired.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <>
      {state === "pending" && <p className="mt-4 text-sm text-arena-muted">Verifying your email…</p>}
      {state === "ok" && (
        <div className="mt-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-400">
          ✅ {message} You&apos;re all set.
        </div>
      )}
      {state === "error" && (
        <div className="mt-4 rounded-lg border border-arena-danger/30 bg-arena-danger/10 px-4 py-3 text-sm text-arena-danger">
          {message}{" "}
          <Link href="/dashboard" className="text-arena-accent hover:underline">
            Request a new link from your dashboard.
          </Link>
        </div>
      )}
      <p className="mt-6 text-center text-sm text-arena-muted">
        <Link href="/dashboard" className="text-arena-accent hover:underline">
          Go to dashboard
        </Link>
      </p>
    </>
  );
}

export default function VerifyEmailPage() {
  return (
    <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-md flex-col justify-center px-4 py-6 sm:py-12">
      <div className="glass-card w-full rounded-2xl p-5 sm:p-8">
        <h1 className="font-display text-2xl sm:text-3xl font-bold">Email verification</h1>
        <Suspense fallback={<p className="mt-4 text-sm text-arena-muted">Loading…</p>}>
          <VerifyEmailInner />
        </Suspense>
      </div>
    </div>
  );
}
