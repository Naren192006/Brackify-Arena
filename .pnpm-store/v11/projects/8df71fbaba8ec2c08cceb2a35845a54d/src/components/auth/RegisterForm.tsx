"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { authApi, getAuthError } from "@/lib/api/client";

const schema = z.object({
  email: z.string().email("Invalid email"),
  username: z
    .string()
    .min(3, "Username must be at least 3 characters")
    .max(50)
    .regex(/^[a-zA-Z0-9_]+$/, "Letters, numbers, and underscores only"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  display_name: z.string().max(100).optional(),
});

type FormData = z.infer<typeof schema>;

export function RegisterForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [guidance, setGuidance] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  const onSubmit = async (data: FormData) => {
    setError(null);
    setGuidance(null);
    try {
      await authApi.register(data);
      router.push("/dashboard");
    } catch (err) {
      const result = getAuthError(err);
      setError(result.message);
      setGuidance(result.guidance);
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
        <label htmlFor="username" className="mb-1 block text-sm text-arena-muted">
          Username
        </label>
        <input id="username" className="input-field" {...register("username")} />
        {errors.username && (
          <p className="mt-1 text-sm text-arena-danger">{errors.username.message}</p>
        )}
      </div>
      <div>
        <label htmlFor="display_name" className="mb-1 block text-sm text-arena-muted">
          Display Name (optional)
        </label>
        <input id="display_name" className="input-field" {...register("display_name")} />
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
      <button type="submit" disabled={isSubmitting} className="btn-primary w-full">
        {isSubmitting ? "Creating account..." : "Create Account"}
      </button>
      <div className="flex items-center gap-3 text-xs text-arena-muted"><span className="h-px flex-1 bg-white/10" />OR<span className="h-px flex-1 bg-white/10" /></div>
      <a href={authApi.googleLoginUrl} className="flex w-full items-center justify-center gap-3 rounded-lg border border-white/10 px-4 py-3 font-semibold transition-colors hover:border-arena-accent/50 hover:text-arena-accent">
        Continue with Google
      </a>
      <p className="text-center text-sm text-arena-muted">
        Already have an account?{" "}
        <Link href="/login" className="text-arena-accent hover:underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}
