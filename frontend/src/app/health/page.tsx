"use client";

import { useEffect, useState } from "react";

import { supabase } from "@/lib/supabase";

type ConnectionState = "checking" | "connected" | "failed";

export default function HealthPage() {
  const [connectionState, setConnectionState] = useState<ConnectionState>("checking");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function checkConnection() {
      const { error } = await supabase.auth.getSession();

      if (!mounted) return;

      if (error) {
        setConnectionState("failed");
        setErrorMessage(error.message);
        return;
      }

      setConnectionState("connected");
      setErrorMessage(null);
    }

    checkConnection().catch((error: unknown) => {
      if (!mounted) return;
      setConnectionState("failed");
      setErrorMessage(error instanceof Error ? error.message : "Unknown Supabase connection error");
    });

    return () => {
      mounted = false;
    };
  }, []);

  return (
    <main className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-xl items-center px-4 py-12">
      <section className="glass-card w-full rounded-2xl p-8">
        <p className="font-display text-sm uppercase tracking-[0.3em] text-arena-accent">
          Development Health Check
        </p>
        <h1 className="mt-3 font-display text-4xl font-bold">Brackify Arena</h1>
        <p className="mt-3 text-arena-muted">
          This check uses Supabase Auth only. No database tables are queried.
        </p>

        <div className="mt-8 rounded-lg border border-arena-border bg-arena-bg-elevated px-4 py-4">
          {connectionState === "checking" && (
            <p className="text-arena-muted">Checking Supabase connection…</p>
          )}
          {connectionState === "connected" && (
            <p className="text-arena-success">Connected to Supabase ✅</p>
          )}
          {connectionState === "failed" && (
            <div className="text-arena-danger">
              <p>Connection Failed ❌</p>
              <p className="mt-2 text-sm text-arena-muted">{errorMessage}</p>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
