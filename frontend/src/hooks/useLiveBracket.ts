"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase/client";
import type { Bracket, Match } from "@/types/bracket";

export type ConnectionStatus = "connected" | "connecting" | "reconnecting" | "disconnected";

interface UseLiveBracketOptions {
  tournamentId?: string | null;
  slug?: string;
  enableNotifications?: boolean;
}

export function useLiveBracket({
  tournamentId,
  slug,
  enableNotifications = true,
}: UseLiveBracketOptions) {
  const queryClient = useQueryClient();
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("connecting");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const channelRef = useRef<RealtimeChannel | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef<number>(0);
  const isMountedRef = useRef<boolean>(true);

  // ── Helper: Invalidate all queries tied to this tournament & bracket ─────
  const triggerBracketRefresh = useCallback(
    (reason: string) => {
      if (!tournamentId) return;

      setLastUpdated(new Date());

      // Invalidate bracket
      void queryClient.invalidateQueries({ queryKey: ["bracket", tournamentId] });
      void queryClient.invalidateQueries({ queryKey: ["admin-bracket", tournamentId] });
      void queryClient.invalidateQueries({ queryKey: ["admin-matches", tournamentId] });
      void queryClient.invalidateQueries({ queryKey: ["matches", tournamentId] });
      void queryClient.invalidateQueries({ queryKey: ["bracket-teams"] });

      // Invalidate tournament details & status
      if (slug) {
        void queryClient.invalidateQueries({ queryKey: ["tournament", slug] });
        void queryClient.invalidateQueries({ queryKey: ["complete-bracket", slug] });
      }
      void queryClient.invalidateQueries({ queryKey: ["tournament", tournamentId] });
      void queryClient.invalidateQueries({ queryKey: ["tournaments"] });
      void queryClient.invalidateQueries({ queryKey: ["public-tournaments"] });
      void queryClient.invalidateQueries({ queryKey: ["admin-tournaments"] });
      void queryClient.invalidateQueries({ queryKey: ["admin-tournaments-list"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      void queryClient.invalidateQueries({ queryKey: ["admin-control-room-tournaments"] });
      void queryClient.invalidateQueries({ queryKey: ["admin-control-room-metrics"] });
    },
    [queryClient, tournamentId, slug]
  );

  // ── Helper: Optimistic Match Update ───────────────────────────────────────
  const updateMatchInCache = useCallback(
    (updatedMatch: Partial<Match> & { id: string }) => {
      if (!tournamentId) return;

      queryClient.setQueryData<Bracket | null>(["bracket", tournamentId], (oldBracket) => {
        if (!oldBracket || !oldBracket.rounds) return oldBracket;

        const newRounds = oldBracket.rounds.map((round) => {
          const matchIndex = round.matches.findIndex((m) => m.id === updatedMatch.id);
          if (matchIndex === -1) return round;

          const updatedMatches = [...round.matches];
          updatedMatches[matchIndex] = {
            ...updatedMatches[matchIndex],
            ...updatedMatch,
          };
          return {
            ...round,
            matches: updatedMatches,
          };
        });

        return {
          ...oldBracket,
          rounds: newRounds,
        };
      });
    },
    [queryClient, tournamentId]
  );

  // ── Setup Realtime Subscription ──────────────────────────────────────────
  const setupSubscription = useCallback(() => {
    if (!tournamentId) return;

    // Clean up any existing channel before re-subscribing
    if (channelRef.current) {
      void supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    setConnectionStatus((prev) => (prev === "connected" ? "connected" : "connecting"));

    const channelName = `realtime-bracket-${tournamentId}-${Date.now()}`;
    const channel = supabase.channel(channelName, {
      config: {
        broadcast: { ack: true },
      },
    });

    // 1. Listen to MATCHES changes (status changes, winner assigned, scores)
    channel.on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "matches",
        filter: `tournament_id=eq.${tournamentId}`,
      },
      (payload) => {
        const newRecord = payload.new as (Match & { status?: string; winner_team_id?: string }) | undefined;
        const oldRecord = payload.old as (Partial<Match> & { status?: string }) | undefined;

        if (payload.eventType === "UPDATE" && newRecord) {
          const statusChanged = oldRecord?.status && oldRecord.status !== newRecord.status;
          const winnerChanged = newRecord.winner_team_id !== oldRecord?.winner_team_id;

          // Optimistically update bracket match
          updateMatchInCache(newRecord);

          // Invalidate queries to fetch full joined relationships
          triggerBracketRefresh("match_update");

          if (enableNotifications) {
            if (statusChanged && newRecord.status === "live") {
              toast.info(`Match #${newRecord.match_number} (Round ${newRecord.round_number}) is now LIVE!`, {
                icon: "⚡",
              });
            } else if (statusChanged && newRecord.status === "completed") {
              toast.success(`Match #${newRecord.match_number} completed! Winner advanced.`, {
                icon: "🏆",
              });
            } else if (winnerChanged && newRecord.winner_team_id) {
              toast.success(`Winner updated for Match #${newRecord.match_number}!`, {
                icon: "🎖️",
              });
            }
          }
        } else {
          // INSERT or DELETE (e.g. bracket generation, next round match creation)
          triggerBracketRefresh("matches_table_event");
        }
      }
    );

    // 2. Listen to TOURNAMENTS changes (status change: open -> live -> completed -> paused)
    channel.on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "tournaments",
        filter: `id=eq.${tournamentId}`,
      },
      (payload) => {
        const newRecord = payload.new as { status?: string; title?: string } | undefined;
        const oldRecord = payload.old as { status?: string } | undefined;

        triggerBracketRefresh("tournament_update");

        if (enableNotifications && newRecord?.status && oldRecord?.status !== newRecord.status) {
          const statusLabel = newRecord.status.toUpperCase().replace("_", " ");
          toast.info(`Tournament status updated: ${statusLabel}`, {
            icon: "📢",
          });
        }
      }
    );

    // 3. Listen to BRACKETS changes (champion crowned, bracket published)
    channel.on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "brackets",
        filter: `tournament_id=eq.${tournamentId}`,
      },
      (payload) => {
        triggerBracketRefresh("bracket_table_event");
        const newRecord = payload.new as { champion_team_id?: string } | undefined;
        if (enableNotifications && newRecord?.champion_team_id) {
          toast.success("A tournament champion has been crowned!", {
            icon: "👑",
          });
        }
      }
    );

    // 4. Subscribe and handle connection states
    channel.subscribe((status, err) => {
      if (!isMountedRef.current) return;

      if (status === "SUBSCRIBED") {
        setConnectionStatus("connected");
        reconnectAttemptsRef.current = 0;
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        setConnectionStatus("reconnecting");

        // Schedule exponential backoff reconnect
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
        }

        const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 10000);
        reconnectAttemptsRef.current += 1;

        reconnectTimeoutRef.current = setTimeout(() => {
          if (isMountedRef.current) {
            setupSubscription();
            triggerBracketRefresh("reconnect");
          }
        }, delay);
      }
    });

    channelRef.current = channel;
  }, [tournamentId, updateMatchInCache, triggerBracketRefresh, enableNotifications]);

  // ── Lifecycle & Reconnection Triggers ─────────────────────────────────────
  useEffect(() => {
    isMountedRef.current = true;

    if (tournamentId) {
      setupSubscription();
    } else {
      setConnectionStatus("disconnected");
    }

    // 1. Reconnect on browser online event
    const handleOnline = () => {
      if (isMountedRef.current && tournamentId) {
        setConnectionStatus("reconnecting");
        setupSubscription();
        triggerBracketRefresh("browser_online");
      }
    };

    // 2. Refresh & reconnect on tab visibility return (after sleep or backgrounding)
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && isMountedRef.current && tournamentId) {
        if (connectionStatus !== "connected") {
          setupSubscription();
        }
        triggerBracketRefresh("tab_visible");
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
  }, [tournamentId, setupSubscription, triggerBracketRefresh, connectionStatus]);

  // ── Manual Reconnect Function ─────────────────────────────────────────────
  const reconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    setupSubscription();
    triggerBracketRefresh("manual_reconnect");
  }, [setupSubscription, triggerBracketRefresh]);

  return {
    connectionStatus,
    isLive: connectionStatus === "connected",
    lastUpdated,
    reconnect,
  };
}

