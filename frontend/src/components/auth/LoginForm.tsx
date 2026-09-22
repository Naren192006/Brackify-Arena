"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { authApi, getAuthError } from "@/lib/api/client";
import { supabase } from "@/lib/supabase";

const schema = z.object({
  email: z.string().email("Invalid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

type FormData = z.infer<typeof schema>;

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [guidance, setGuidance] = useState<string | null>(null);
  const [isGoogleSubmitting, setIsGoogleSubmitting] = useState(false);
  useEffect(() => {
    const oauthError = new URLSearchParams(window.location.search).get("error");
    const oauthDetail = new URLSearchParams(window.location.search).get("detail");
    if (oauthError) {
      const messages: Record<string, [string, string]> = {
        oauth_cancelled: ["Google sign-in was cancelled.", "Try again or use email and password."],
        oauth_failed: ["Google sign-in failed.", "Try again, or use email and password."],
        oauth_email_unverified: ["Google email could not be verified.", "Use a verified Google account or email/password."],
        oauth_not_configured: ["Google sign-in is not configured.", "Use email and password for now."],
        oauth_code_missing: ["Google sign-in could not be completed.", "Start the sign-in process again."],
        oauth_exchange_failed: ["Google sign-in could not be completed.", "Try again or use email and password."],
      };
      const [message, help] = messages[oauthError] ?? ["Google sign-in failed.", "Try again or use email and password."];
      setError(message);
      setGuidance(oauthDetail || help);
      return;
    }

    supabase.auth.getUser().then(({ data }) => {
      if (data.user) router.replace("/dashboard");
    }).catch(() => {
      // A signed-out visitor should remain on the login page.
    });
  }, [router]);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  const onSubmit = async (data: FormData) => {
    setError(null);
    setGuidance(null);
    try {
      await authApi.login(data);
      router.push("/dashboard");
    } catch (err) {
      const result = getAuthError(err);
      setError(result.message);
      setGuidance(result.guidance);
    }
  };

  const onGoogleSignIn = async () => {
    setError(null);
    setGuidance(null);
    setIsGoogleSubmitting(true);
    try {
      const { data, error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback?next=%2Fdashboard`,
        },
      });

      if (oauthError) {
        throw oauthError;
      }

      if (!data.url) throw new Error("Supabase did not return a Google sign-in URL.");
    } catch (err) {
      setIsGoogleSubmitting(false);
      setError(err instanceof Error ? err.message : "Google sign-in failed.");
      setGuidance("Check your Supabase Google provider configuration and try again.");
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {error && (
        <div className="rounded-lg border border-arena-danger/30 bg-arena-danger/10 px-4 py-3 text-sm text-arena-danger">
          {error}
          <p className="mt-1 text-xs text-arena-muted">{guidance}</p>
        </div>
      )}
      <div>
        <label htmlFor="email" className="mb-1 block text-sm text-arena-muted">
          Email
        </label>
        <input id="email" type="email" className="input-field" {...register("email")} />
        {errors.email && <p className="mt-1 text-sm text-arena-danger">{errors.email.message}</p>}
      </div>
      <div>
        <label htmlFor="password" className="mb-1 block text-sm text-arena-muted">
          Password
        </label>
        <input id="password" type="password" className="input-field" {...register("password")} />
        {errors.password && (
          <p className="mt-1 text-sm text-arena-danger">{errors.password.message}</p>
        )}
      </div>
      <div className="flex justify-end">
        <Link href="/forgot-password" className="text-xs text-arena-muted transition-colors hover:text-arena-accent">
          Forgot password?
        </Link>
      </div>
      <button type="submit" disabled={isSubmitting} className="btn-primary w-full">
        {isSubmitting ? "Signing in..." : "Sign In"}
      </button>
      <div className="flex items-center gap-3 text-xs text-arena-muted"><span className="h-px flex-1 bg-arena-bg-elevated" />OR<span className="h-px flex-1 bg-arena-bg-elevated" /></div>
      <button
        type="button"
        onClick={onGoogleSignIn}
        disabled={isSubmitting || isGoogleSubmitting}
        className="flex w-full items-center justify-center gap-3 rounded-lg border border-arena-border px-4 py-3 font-semibold transition-colors hover:border-arena-accent/50 hover:text-arena-accent disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isGoogleSubmitting ? "Connecting to Google..." : "Continue with Google"}
      </button>
      <p className="text-center text-sm text-arena-muted">
        No account?{" "}
        <Link href="/register" className="text-arena-accent hover:underline">
          Register
        </Link>
      </p>
    </form>
  );
}
