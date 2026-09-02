"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/lib/supabase/client";

export function AuthenticatedNav() {
  const { user, loading, isAuthenticated, signOut } = useAuth();
  const [unread, setUnread] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;

    if (!user) {
      setUnread(0);
      return;
    }

    // Fetch unread notifications count
    const fetchUnread = async () => {
      const { count } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .is("read_at", null);

      if (active) setUnread(count ?? 0);
    };

    void fetchUnread();

    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      active = false;
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [user]);

  if (loading) {
    return <span className="inline-block h-8 w-32 animate-pulse rounded-lg bg-white/5" aria-hidden="true" />;
  }

  if (!isAuthenticated || !user) {
    return (
      <div className="flex items-center gap-3">
        <Link href="/login" className="text-sm font-medium text-arena-muted transition-colors hover:text-white">
          Login
        </Link>
        <Link href="/register" className="btn-primary px-4 py-2 text-sm">
          Register
        </Link>
      </div>
    );
  }

  const avatar =
    (user.user_metadata?.avatar_url as string | undefined) ??
    (user.user_metadata?.picture as string | undefined) ??
    null;

  const displayName =
    (user.user_metadata?.full_name as string | undefined) ??
    (user.user_metadata?.name as string | undefined) ??
    user.email?.split("@")[0] ??
    "Player";

  return (
    <div className="flex items-center gap-4 text-sm">
      <Link href="/dashboard" className="site-nav-link">
        Dashboard
      </Link>
      <Link href="/tournaments" className="site-nav-link">
        Tournaments
      </Link>
      <Link href="/leaderboard" className="hidden site-nav-link sm:inline">
        Leaderboard
      </Link>

      <Link href="/dashboard#notifications" className="site-nav-link relative inline-flex items-center gap-1.5">
        <span>Notifications</span>
        {unread > 0 ? (
          <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-arena-danger px-1 text-[10px] font-bold text-white shadow-sm shadow-red-500/50">
            {unread}
          </span>
        ) : null}
      </Link>

      {/* Avatar Dropdown */}
      <div className="relative" ref={dropdownRef}>
        <button
          type="button"
          onClick={() => setMenuOpen(!menuOpen)}
          className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full border border-cyan-400/30 bg-cyan-400/10 font-display font-bold text-arena-accent transition-transform hover:scale-105 focus:outline-none"
          aria-label="User menu"
        >
          {avatar ? (
            <img src={avatar} alt="Profile" className="h-full w-full object-cover" />
          ) : (
            displayName.slice(0, 1).toUpperCase()
          )}
        </button>

        {menuOpen ? (
          <div className="absolute right-0 top-11 z-50 w-48 rounded-xl border border-white/10 bg-[#0d121f] p-1.5 shadow-2xl backdrop-blur-xl">
            <div className="border-b border-white/5 px-3 py-2 text-xs">
              <p className="text-arena-muted">Signed in as</p>
              <p className="truncate font-semibold text-white">{displayName}</p>
            </div>

            <div className="py-1">
              <Link
                href="/dashboard"
                onClick={() => setMenuOpen(false)}
                className="block rounded-lg px-3 py-2 text-xs text-arena-muted transition-colors hover:bg-white/5 hover:text-white"
              >
                Dashboard
              </Link>
              <Link
                href="/dashboard#teams"
                onClick={() => setMenuOpen(false)}
                className="block rounded-lg px-3 py-2 text-xs text-arena-muted transition-colors hover:bg-white/5 hover:text-white"
              >
                My Team
              </Link>
              <Link
                href="/dashboard#profile"
                onClick={() => setMenuOpen(false)}
                className="block rounded-lg px-3 py-2 text-xs text-arena-muted transition-colors hover:bg-white/5 hover:text-white"
              >
                Settings
              </Link>
            </div>

            <div className="border-t border-white/5 pt-1">
              <button
                type="button"
                className="block w-full rounded-lg px-3 py-2 text-left text-xs text-red-400 transition-colors hover:bg-red-500/10"
                onClick={() => {
                  setMenuOpen(false);
                  void signOut().then(() => {
                    window.location.href = "/login";
                  });
                }}
              >
                Logout
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
