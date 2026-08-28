"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { getAdminRole } from "@/lib/admin/permissions";

export function AdminLoginForm() {
  const router = useRouter(); const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [error, setError] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const finish = async () => { const { data } = await supabase.auth.getUser(); if (!data.user || !(await getAdminRole(supabase, data.user.id))) { await supabase.auth.signOut(); setError("Access denied. This account is not an organizer."); setTimeout(() => router.replace("/dashboard"), 1200); return; } router.replace("/admin/dashboard"); };
  const login = async (event: React.FormEvent) => { event.preventDefault(); setBusy(true); setError(null); const result = await supabase.auth.signInWithPassword({ email, password }); if (result.error) setError(result.error.message); else await finish(); setBusy(false); };
  const google = async () => { setBusy(true); setError(null); const { error: oauthError } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: `${window.location.origin}/auth/callback?next=%2Fadmin%2Fdashboard` } }); if (oauthError) { setError(oauthError.message); setBusy(false); } };
  return <form onSubmit={login} className="space-y-4"><p className="text-sm text-arena-muted">Tournament organizers and platform administrators only.</p>{error ? <p className="rounded-lg border border-arena-danger/30 bg-arena-danger/10 px-4 py-3 text-sm text-arena-danger">{error}</p> : null}<input className="input-field" type="email" placeholder="Email" required value={email} onChange={(event) => setEmail(event.target.value)} /><input className="input-field" type="password" placeholder="Password" required value={password} onChange={(event) => setPassword(event.target.value)} /><button className="btn-primary w-full" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button><div className="flex items-center gap-3 text-xs text-arena-muted"><span className="h-px flex-1 bg-white/10" />OR<span className="h-px flex-1 bg-white/10" /></div><button type="button" className="w-full rounded-lg border border-white/10 px-4 py-3 font-semibold hover:border-arena-accent/50" disabled={busy} onClick={() => void google()}>Continue with Google</button><p className="text-center text-xs text-arena-muted"><Link href="/login" className="text-arena-accent">Player login</Link></p></form>;
}
