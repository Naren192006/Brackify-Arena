"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase/client";
import { getNotificationIcon, NotificationItem } from "@/components/notifications/NotificationBellDropdown";

export type NotificationConnectionStatus = "connected" | "connecting" | "reconnecting" | "disconnected";

export function useLiveNotifications({ userId }: { userId: string | null | undefined }) {
  const queryClient = useQueryClient();
  const [connectionStatus, setConnectionStatus] = useState<NotificationConnectionStatus>("connecting");
  const channelRef = useRef<RealtimeChannel | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef<number>(0);
  const isMountedRef = useRef<boolean>(true);

  const setupSubscription = useCallback(() => {
    if (!userId) return;

    if (channelRef.current) {
      void supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    setConnectionStatus((prev) => (prev === "connected" ? "connected" : "connecting"));

    const channelName = `realtime-notifications-${userId}-${Date.now()}`;
    const channel = supabase.channel(channelName, {
      config: {
        broadcast: { ack: true },
      },
    });

    // Listen to INSERT, UPDATE, DELETE on notifications table for this user
    channel.on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "notifications",
        filter: `user_id=eq.${userId}`,
      },
      (payload) => {
        if (payload.eventType === "INSERT") {
          const newNotif = payload.new as NotificationItem;

          // 1. Optimistically prepend new notification to navbar cache for immediate bell counter update
          queryClient.setQueryData<NotificationItem[]>(["navbar-notifications", userId], (old) => {
            const currentList = old ? [...old] : [];
            // Prevent duplicate entries
            if (currentList.some((item) => item.id === newNotif.id)) return currentList;
            return [newNotif, ...currentList].slice(0, 10);
          });

          // 2. Invalidate queries to ensure consistent state
          void queryClient.invalidateQueries({ queryKey: ["navbar-notifications"] });
          void queryClient.invalidateQueries({ queryKey: ["all-notifications"] });

          // 3. Pop up real-time toast banner
          const icon = getNotificationIcon(newNotif.type);
          toast(newNotif.title, {
            description: newNotif.body || undefined,
            icon,
            duration: 6000,
          });
        } else if (payload.eventType === "UPDATE" || payload.eventType === "DELETE") {
          // Status marked as read or notification removed
          void queryClient.invalidateQueries({ queryKey: ["navbar-notifications"] });
          void queryClient.invalidateQueries({ queryKey: ["all-notifications"] });
        }
      }
    );

    channel.subscribe((status) => {
      if (!isMountedRef.current) return;

      if (status === "SUBSCRIBED") {
        setConnectionStatus("connected");
        reconnectAttemptsRef.current = 0;
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        setConnectionStatus("reconnecting");

        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
        }

        const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 10000);
        reconnectAttemptsRef.current += 1;

        reconnectTimeoutRef.current = setTimeout(() => {
          if (isMountedRef.current) {
            setupSubscription();
            void queryClient.invalidateQueries({ queryKey: ["navbar-notifications"] });
          }
        }, delay);
      }
    });

    channelRef.current = channel;
  }, [userId, queryClient]);

  useEffect(() => {
    isMountedRef.current = true;

    if (userId) {
      setupSubscription();
    } else {
      setConnectionStatus("disconnected");
    }

    const handleOnline = () => {
      if (isMountedRef.current && userId) {
        setConnectionStatus("reconnecting");
        setupSubscription();
        void queryClient.invalidateQueries({ queryKey: ["navbar-notifications"] });
        void queryClient.invalidateQueries({ queryKey: ["all-notifications"] });
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && isMountedRef.current && userId) {
        if (connectionStatus !== "connected") {
          setupSubscription();
        }
        void queryClient.invalidateQueries({ queryKey: ["navbar-notifications"] });
        void queryClient.invalidateQueries({ queryKey: ["all-notifications"] });
      }
    };

    window.addEventListener("online", handleOnline);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      isMountedRef.current = false;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (channelRef.current) {
        void supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      window.removeEventListener("online", handleOnline);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [userId, setupSubscription, queryClient, connectionStatus]);

  return {
    connectionStatus,
    isLive: connectionStatus === "connected",
  };
}

