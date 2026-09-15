"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase/client";
import { useLiveNotifications } from "@/hooks/useLiveNotifications";

export type NotificationItem = {
  id: string;
  user_id: string;
  title: string;
  body: string | null;
  type: string;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
};

export function getNotificationIcon(type: string): string {
  switch (type) {
    case "payment_success":
      return "💳";
    case "registration_confirmed":
      return "✅";
    case "tournament_started":
      return "⚡";
    case "match_assigned":
      return "⚔️";
    case "match_starting_soon":
      return "⏰";
    case "winner_advanced":
      return "🏆";
    case "tournament_completed":
      return "👑";
    default:
      return "🔔";
  }
}

export function NotificationBellDropdown({ userId }: { userId: string }) {
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // ── 1. Real-time Notifications Subscription & Unread Count ───────────────
  const { isLive } = useLiveNotifications({ userId });

  const notificationsQuery = useQuery<NotificationItem[]>({
    queryKey: ["navbar-notifications", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("id,user_id,title,body,type,is_read,read_at,created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(8);

      if (error) throw error;
      return (data ?? []).map((n) => ({
        ...n,
        is_read: Boolean(n.is_read || n.read_at),
      }));
    },
    enabled: Boolean(userId),
    refetchOnWindowFocus: true,
  });

  const notifications = notificationsQuery.data ?? [];
  const unreadCount = notifications.filter((n) => !n.is_read).length;

  // ── 2. Mark Single Notification as Read ───────────────────────────────────
  const markReadMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("notifications")
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq("id", id)
        .eq("user_id", userId);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["navbar-notifications"] });
      void queryClient.invalidateQueries({ queryKey: ["all-notifications"] });
    },
  });

  // ── 3. Mark All as Read ───────────────────────────────────────────────────
  const markAllReadMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("notifications")
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq("user_id", userId)
        .eq("is_read", false);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("All notifications marked as read.");
      void queryClient.invalidateQueries({ queryKey: ["navbar-notifications"] });
      void queryClient.invalidateQueries({ queryKey: ["all-notifications"] });
    },
  });

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={dropdownRef}>
      {/* ── Bell Icon Trigger ──────────────────────────────────────────────── */}
      <button
        onClick={() => setIsOpen((prev) => !prev)}
        className={`relative flex h-9 w-9 items-center justify-center rounded-xl border transition-colors ${
          isOpen
            ? "border-cyan-400/40 bg-arena-bg-elevated text-arena-accent"
            : "border-arena-border bg-white/[0.04] text-arena-muted hover:border-arena-accent hover:text-arena-text"
        }`}
        aria-label="Notifications"
        title="Notifications"
      >
        <svg
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          strokeWidth="2"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
          />
        </svg>

        {/* Unread Badge */}
        {unreadCount > 0 ? (
          <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 font-mono text-[10px] font-bold text-arena-text shadow-md shadow-red-500/50 animate-pulse">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        ) : null}
      </button>

      {/* ── Dropdown Panel ─────────────────────────────────────────────────── */}
      {isOpen ? (
        <div className="absolute right-0 mt-2.5 w-80 sm:w-96 rounded-2xl border border-arena-border bg-[#0c101d] p-3 shadow-2xl backdrop-blur-xl z-50 animate-in fade-in slide-in-from-top-2 duration-150">
          {/* Dropdown Header */}
          <div className="flex items-center justify-between border-b border-arena-border px-2 pb-2.5">
            <div className="flex items-center gap-2">
              <span className="font-display text-sm font-bold text-arena-text">Notifications</span>
              {isLive ? (
                <span
                  className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-400"
                  title="Realtime Live Sync Active"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Live
                </span>
              ) : null}
              {unreadCount > 0 ? (
                <span className="rounded-full bg-cyan-400/20 px-2 py-0.5 text-[10px] font-semibold text-arena-accent font-mono">
                  {unreadCount} new
                </span>
              ) : null}
            </div>

            {unreadCount > 0 ? (
              <button
                disabled={markAllReadMutation.isPending}
                onClick={() => markAllReadMutation.mutate()}
                className="text-[11px] font-semibold text-arena-accent hover:underline disabled:opacity-50"
              >
                Mark all read
              </button>
            ) : null}
          </div>

          {/* Notifications List */}
          <div className="mt-2 max-h-80 overflow-y-auto divide-y divide-white/5 space-y-1">
            {notificationsQuery.isLoading ? (
              <div className="p-4 text-center text-xs text-arena-muted">
                Loading notifications…
              </div>
            ) : notifications.length === 0 ? (
              <div className="p-6 text-center text-xs text-arena-muted">
                <span className="text-xl block mb-1">📭</span>
                No notifications right now.
              </div>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  onClick={() => {
                    if (!n.is_read) {
                      markReadMutation.mutate(n.id);
                    }
                  }}
                  className={`group flex items-start gap-3 rounded-xl p-2.5 transition-colors cursor-pointer ${
                    !n.is_read
                      ? "bg-cyan-400/[0.06] hover:bg-arena-bg-elevated"
                      : "hover:bg-white/[0.03]"
                  }`}
                >
                  {/* Icon */}
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-arena-border bg-black/40 text-sm">
                    {getNotificationIcon(n.type)}
                  </span>

                  {/* Body */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1">
                      <p
                        className={`text-xs font-semibold line-clamp-1 ${
                          !n.is_read ? "text-arena-text" : "text-arena-muted"
                        }`}
                      >
                        {n.title}
                      </p>
                      {!n.is_read ? (
                        <span className="h-2 w-2 shrink-0 rounded-full bg-arena-accent" />
                      ) : null}
                    </div>

                    {n.body ? (
                      <p className="mt-0.5 text-[11px] text-arena-muted line-clamp-2 leading-relaxed">
                        {n.body}
                      </p>
                    ) : null}

                    <span className="mt-1 block text-[10px] text-arena-muted/70 font-mono">
                      {new Date(n.created_at).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Dropdown Footer */}
          <div className="mt-2 border-t border-arena-border pt-2 text-center">
            <Link
              href="/notifications"
              onClick={() => setIsOpen(false)}
              className="inline-block w-full rounded-xl py-1.5 text-xs font-semibold text-arena-accent hover:bg-arena-bg-elevated transition-colors"
            >
              View All Notifications →
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
