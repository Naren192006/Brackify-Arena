"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/lib/supabase/client";
import { NotificationBellDropdown } from "@/components/notifications/NotificationBellDropdown";

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
    return <span className="inline-block h-8 w-32 animate-pulse rounded-lg bg-arena-bg-elevated" aria-hidden="true" />;
  }

  if (!isAuthenticated || !user) {
    return (
      <div className="flex items-center gap-2 sm:gap-3">
        <Link href="/login" className="text-xs sm:text-sm font-medium text-arena-muted transition-colors hover:text-arena-text">
          Login
        </Link>
        <Link href="/register" className="btn-primary px-3 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-sm">
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
    <div className="flex items-center gap-2.5 sm:gap-4 text-xs sm:text-sm">
      <Link href="/dashboard" className="site-nav-link text-xs sm:text-sm">
        Dashboard
      </Link>
      <Link href="/leaderboard" className="hidden sm:inline site-nav-link text-xs sm:text-sm">
        Leaderboard
      </Link>

      {/* Notification Bell with Dropdown */}
      <NotificationBellDropdown userId={user.id} />

      {/* Avatar Dropdown */}
      <div className="relative" ref={dropdownRef}>
        <button
          type="button"
          onClick={() => setMenuOpen(!menuOpen)}
          className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full border border-arena-accent bg-arena-bg-elevated font-display font-bold text-arena-accent transition-transform hover:scale-105 focus:outline-none"
          aria-label="User menu"
        >
          {avatar ? (
            <Image src={avatar} alt="Profile" width={36} height={36} className="h-full w-full object-cover" />
          ) : (
            displayName.slice(0, 1).toUpperCase()
          )}
        </button>

        {menuOpen ? (
          <div className="absolute right-0 top-11 z-50 w-48 rounded-xl border border-arena-border bg-arena-surface p-1.5 shadow-2xl backdrop-blur-xl">
            <div className="border-b border-arena-border px-3 py-2 text-xs">
              <p className="text-arena-muted">Signed in as</p>
              <p className="truncate font-semibold text-arena-text">{displayName}</p>
            </div>

            <div className="py-1">
              <Link
                href="/dashboard"
                onClick={() => setMenuOpen(false)}
                className="block rounded-lg px-3 py-2 text-xs text-arena-muted transition-colors hover:bg-arena-bg-elevated hover:text-arena-text"
              >
                Dashboard
              </Link>
              <Link
                href="/dashboard#teams"
                onClick={() => setMenuOpen(false)}
                className="block rounded-lg px-3 py-2 text-xs text-arena-muted transition-colors hover:bg-arena-bg-elevated hover:text-arena-text"
              >
                My Team
              </Link>
              <Link
                href="/dashboard#profile"
                onClick={() => setMenuOpen(false)}
                className="block rounded-lg px-3 py-2 text-xs text-arena-muted transition-colors hover:bg-arena-bg-elevated hover:text-arena-text"
              >
                Settings
              </Link>
            </div>

            <div className="border-t border-arena-border pt-1">
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
