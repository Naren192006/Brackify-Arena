"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { supabase } from "@/lib/supabase/client";

export function AuthenticatedNav() {
  const [loading, setLoading] = useState(true);
  const [signedIn, setSignedIn] = useState(false);
  const [avatar, setAvatar] = useState<string | null>(null);
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    let active = true;
    const load = async () => {
      const { data } = await supabase.auth.getUser();
      if (!active) return;
      setSignedIn(Boolean(data.user));
      setAvatar(data.user ? ((data.user.user_metadata.avatar_url as string | undefined) ?? (data.user.user_metadata.picture as string | undefined) ?? null) : null);
      if (!data.user) { setUnread(0); return; }
      const { count } = await supabase.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", data.user.id).is("read_at", null);
      if (active) setUnread(count ?? 0);
      if (active) setLoading(false);
    };
    void load().finally(() => { if (active) setLoading(false); });
    const { data: listener } = supabase.auth.onAuthStateChange(() => void load());
    return () => { active = false; listener.subscription.unsubscribe(); };
  }, []);

  if (loading) return <span className="inline-block h-8 w-32" aria-hidden="true" />;
  if (!signedIn) return <><Link href="/login" className="text-arena-muted transition-colors hover:text-arena-text">Login</Link><Link href="/register" className="btn-primary px-4 py-2 text-sm">Register</Link></>;

  return <><Link href="/dashboard" className="site-nav-link">Dashboard</Link><Link href="/tournaments" className="site-nav-link">Tournaments</Link><Link href="/leaderboard" className="hidden site-nav-link sm:inline">Leaderboard</Link><Link href="/dashboard#notifications" className="site-nav-link relative">Notifications{unread > 0 ? <span className="absolute -right-3 -top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-arena-danger px-1 text-[10px] text-white">{unread}</span> : null}</Link><details className="relative"><summary className="flex cursor-pointer list-none items-center gap-2"><span className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-cyan-400/15 font-display font-bold text-arena-accent">{avatar ? <img src={avatar} alt="Profile" className="h-full w-full object-cover" /> : "P"}</span></summary><div className="absolute right-0 top-10 z-50 w-36 rounded-xl border border-white/10 bg-arena-surface p-2 shadow-2xl"><Link href="/dashboard" className="block rounded-lg px-3 py-2 text-sm text-arena-muted hover:bg-white/5 hover:text-white">Profile</Link><button className="block w-full rounded-lg px-3 py-2 text-left text-sm text-arena-muted hover:bg-white/5 hover:text-white" onClick={() => void supabase.auth.signOut().then(() => { window.location.href = "/login"; })}>Logout</button></div></details></>;
}
