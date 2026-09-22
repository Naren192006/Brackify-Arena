"use client";

import Link from "next/link";
import { useState } from "react";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase/client";
import { useLiveNotifications } from "@/hooks/useLiveNotifications";
import { getNotificationIcon, NotificationItem } from "./NotificationBellDropdown";

const PAGE_SIZE = 12;

export function NotificationsPageContent({ userId }: { userId: string }) {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // ── Realtime Notifications Subscription ──────────────────────────────────
  const { isLive } = useLiveNotifications({ userId });

  // ── 1. Infinite Query for Notifications ───────────────────────────────────
  const notificationsQuery = useInfiniteQuery({
    queryKey: ["all-notifications", userId, activeTab],
    queryFn: async ({ pageParam = 0 }) => {
      let query = supabase
        .from("notifications")
        .select("id,user_id,title,body,type,is_read,read_at,created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .range(pageParam, pageParam + PAGE_SIZE - 1);

      if (activeTab === "unread") {
        query = query.eq("is_read", false);
      } else if (activeTab === "matches") {
        query = query.in("type", ["match_assigned", "match_starting_soon", "winner_advanced"]);
      } else if (activeTab === "tournaments") {
        query = query.in("type", ["tournament_started", "tournament_completed", "registration_confirmed"]);
      } else if (activeTab === "payments") {
        query = query.eq("type", "payment_success");
      }

      const { data, error } = await query;
      if (error) throw error;

      return (data ?? []).map((n) => ({
        ...n,
        is_read: Boolean(n.is_read || n.read_at),
      })) as NotificationItem[];
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      if (lastPage.length < PAGE_SIZE) return undefined;
      return allPages.length * PAGE_SIZE;
    },
    enabled: Boolean(userId),
  });

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
      void queryClient.invalidateQueries({ queryKey: ["all-notifications"] });
      void queryClient.invalidateQueries({ queryKey: ["navbar-notifications"] });
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
      void queryClient.invalidateQueries({ queryKey: ["all-notifications"] });
      void queryClient.invalidateQueries({ queryKey: ["navbar-notifications"] });
    },
  });

  // Flatten infinite pages
  const allNotifications = notificationsQuery.data?.pages.flat() ?? [];
  const filteredNotifications = allNotifications.filter((n) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return n.title.toLowerCase().includes(q) || (n.body?.toLowerCase().includes(q) ?? false);
  });

  const unreadCount = allNotifications.filter((n) => !n.is_read).length;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 space-y-6">
      {/* ── Page Header ──────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-arena-border pb-5">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-arena-accent font-semibold">
            Player Center
          </p>
          <h1 className="mt-1 font-display text-3xl font-bold text-arena-text tracking-tight flex items-center gap-3">
            Notifications
            {isLive ? (
              <span
                className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-400 shadow-sm shadow-emerald-950/20"
                title="Live Realtime Sync Active"
              >
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                </span>
                Live Sync
              </span>
            ) : null}
            {unreadCount > 0 ? (
              <span className="rounded-full bg-cyan-400/20 px-3 py-0.5 text-xs font-semibold text-arena-accent font-mono">
                {unreadCount} unread
              </span>
            ) : null}
          </h1>
          <p className="mt-1 text-sm text-arena-muted">
            Track real-time tournament alerts, match assignments, payment confirmations, and victory updates.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {unreadCount > 0 ? (
            <button
              disabled={markAllReadMutation.isPending}
              onClick={() => markAllReadMutation.mutate()}
              className="rounded-xl border border-cyan-400/40 bg-arena-bg-elevated px-4 py-2 text-xs font-semibold text-arena-accent hover:bg-cyan-400/25 disabled:opacity-50 transition-colors shadow-sm"
            >
               Mark All as Read
            </button>
          ) : null}

          <Link
            href="/dashboard"
            className="rounded-xl border border-arena-border bg-white/[0.04] px-3.5 py-2 text-xs font-semibold text-arena-muted hover:text-arena-text transition-colors"
          >
            ← Dashboard
          </Link>
        </div>
      </div>

      {/* ── Filters & Search ─────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        {/* Filter Tabs */}
        <div className="flex rounded-xl border border-arena-border bg-white/[0.03] p-1 text-xs">
          {[
            ["all", "All"],
            ["unread", "Unread"],
            ["matches", "Matches"],
            ["tournaments", "Tournaments"],
            ["payments", "Payments"],
          ].map(([tabKey, label]) => (
            <button
              key={tabKey}
              onClick={() => setActiveTab(tabKey)}
              className={`rounded-lg px-3.5 py-1.5 font-medium transition-colors ${
                activeTab === tabKey
                  ? "bg-cyan-400/20 text-arena-accent font-semibold shadow-sm"
                  : "text-arena-muted hover:text-arena-text"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Search Input */}
        <input
          type="text"
          placeholder="Search notifications..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="rounded-xl border border-arena-border bg-white/[0.04] px-3.5 py-1.5 text-xs text-arena-text placeholder-arena-muted focus:border-cyan-400/50 focus:outline-none w-full sm:w-64"
        />
      </div>

      {/* ── Notifications List ───────────────────────────────────────────── */}
      <section className="space-y-3">
        {notificationsQuery.isLoading ? (
          <div className="space-y-3 animate-pulse">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-20 rounded-2xl bg-arena-bg-elevated border border-arena-border" />
            ))}
          </div>
        ) : filteredNotifications.length === 0 ? (
          <div className="rounded-2xl border border-arena-border bg-white/[0.02] p-12 text-center">
            <span className="text-3xl block mb-2"></span>
            <p className="text-arena-text font-semibold">No notifications found.</p>
            <p className="text-xs text-arena-muted mt-1">
              You&apos;re all caught up! Match alerts and tournament updates will appear here in real-time.
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {filteredNotifications.map((n) => (
              <div
                key={n.id}
                className={`relative flex items-start justify-between gap-4 rounded-2xl border p-4 transition-all ${
                  !n.is_read
                    ? "border-arena-accent bg-gradient-to-r from-cyan-950/20 via-black/40 to-black/20 shadow-md shadow-cyan-950/20"
                    : "border-arena-border bg-white/[0.02] hover:border-white/20"
                }`}
              >
                <div className="flex items-start gap-4">
                  {/* Icon */}
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-arena-border bg-black/50 text-xl shadow-inner">
                    {getNotificationIcon(n.type)}
                  </span>

                  {/* Body Details */}
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h3
                        className={`text-sm font-bold ${
                          !n.is_read ? "text-arena-text" : "text-arena-muted"
                        }`}
                      >
                        {n.title}
                      </h3>
                      {!n.is_read ? (
                        <span className="h-2 w-2 rounded-full bg-arena-accent animate-pulse" />
                      ) : null}
                    </div>

                    {n.body ? (
                      <p className="text-xs text-arena-muted leading-relaxed max-w-2xl">
                        {n.body}
                      </p>
                    ) : null}

                    <span className="text-[10px] text-arena-muted/70 font-mono block pt-0.5">
                      {new Date(n.created_at).toLocaleDateString([], {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                </div>

                {/* Mark as read button */}
                {!n.is_read ? (
                  <button
                    disabled={markReadMutation.isPending}
                    onClick={() => markReadMutation.mutate(n.id)}
                    className="shrink-0 rounded-lg border border-arena-border px-2.5 py-1 text-[11px] font-semibold text-arena-muted hover:border-cyan-400/40 hover:text-arena-accent transition-colors"
                    title="Mark as read"
                  >
                    Mark read
                  </button>
                ) : (
                  <span className="text-[10px] text-arena-muted/50 font-mono">Read</span>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ── Infinite Scroll / Load More Button ───────────────────────────── */}
        {notificationsQuery.hasNextPage ? (
          <div className="pt-4 text-center">
            <button
              disabled={notificationsQuery.isFetchingNextPage}
              onClick={() => notificationsQuery.fetchNextPage()}
              className="rounded-xl border border-arena-border bg-white/[0.04] px-6 py-2.5 text-xs font-semibold text-arena-text hover:bg-white/[0.08] disabled:opacity-50 transition-colors"
            >
              {notificationsQuery.isFetchingNextPage ? "Loading more…" : "Load More Notifications ↓"}
            </button>
          </div>
        ) : null}
      </section>
    </div>
  );
}
