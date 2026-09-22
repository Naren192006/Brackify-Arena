"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase/client";

export type RealtimeConnectionStatus = "connected" | "connecting" | "reconnecting" | "disconnected";

export interface RealtimeFeedEvent {
  id: string;
  eventType: string;
  title: string;
  description: string;
  timestamp: string;
  tournamentId: string;
  matchId?: string | null;
  round?: number | null;
  score?: string | null;
  status?: string | null;
  winner?: { id?: string; name?: string; tag?: string } | null;
  icon?: string;
  badgeColor?: string;
}

interface UseTournamentRealtimeOptions {
  tournamentId?: string | null;
  slug?: string;
  matchId?: string | null;
  enableToasts?: boolean;
}

export function useTournamentRealtime({
  tournamentId,
  slug,
  matchId,
  enableToasts = true,
}: UseTournamentRealtimeOptions) {
  const queryClient = useQueryClient();
  const [connectionStatus, setConnectionStatus] = useState<RealtimeConnectionStatus>("connecting");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [liveEvents, setLiveEvents] = useState<RealtimeFeedEvent[]>([]);

  const channelRef = useRef<RealtimeChannel | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef<number>(0);
  const isMountedRef = useRef<boolean>(true);

  // Invalidate relevant React Query caches across Admin and Player views
  const invalidateQueries = useCallback(
    (reason: string) => {
      setLastUpdated(new Date());

      // 1. Slug-based queries (Public Live Center, Spectate, Admin Control Room)
      if (slug) {
        void queryClient.invalidateQueries({ queryKey: ["live-tournament", slug] });
        void queryClient.invalidateQueries({ queryKey: ["tournament", slug] });
        void queryClient.invalidateQueries({ queryKey: ["complete-bracket", slug] });
        void queryClient.invalidateQueries({ queryKey: ["control-room", slug] });
      }

      // 2. Tournament ID-based queries (Admin Brackets, Registrations, Matches, Health)
      if (tournamentId) {
        void queryClient.invalidateQueries({ queryKey: ["bracket", tournamentId] });
        void queryClient.invalidateQueries({ queryKey: ["public-bracket-tournament", tournamentId] });
        void queryClient.invalidateQueries({ queryKey: ["public-bracket-matches", tournamentId] });
        void queryClient.invalidateQueries({ queryKey: ["tournament", tournamentId] });
        void queryClient.invalidateQueries({ queryKey: ["matches", tournamentId] });
        void queryClient.invalidateQueries({ queryKey: ["admin-matches", tournamentId] });
        void queryClient.invalidateQueries({ queryKey: ["admin-registrations", tournamentId] });
        void queryClient.invalidateQueries({ queryKey: ["admin-analytics", tournamentId] });
      }

      // 3. Match-specific queries (Player Match Center, Match Details, Reports)
      if (matchId) {
        void queryClient.invalidateQueries({ queryKey: ["player-match-center", matchId] });
        void queryClient.invalidateQueries({ queryKey: ["player-match-detail", matchId] });
        void queryClient.invalidateQueries({ queryKey: ["match-reports", matchId] });
        if (slug) {
          void queryClient.invalidateQueries({ queryKey: ["match", slug, matchId] });
        }
      }

      // 4. Global Admin Control Room, Dashboard, and Tournament lists
      void queryClient.invalidateQueries({ queryKey: ["admin-control-room-metrics"] });
      void queryClient.invalidateQueries({ queryKey: ["admin-control-room-tournaments"] });
      void queryClient.invalidateQueries({ queryKey: ["admin-tournaments"] });
      void queryClient.invalidateQueries({ queryKey: ["admin-tournaments-list"] });
      void queryClient.invalidateQueries({ queryKey: ["public-tournaments"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      void queryClient.invalidateQueries({ queryKey: ["managed-tournaments"] });
      void queryClient.invalidateQueries({ queryKey: ["tournaments"] });
      void queryClient.invalidateQueries({ queryKey: ["fair-play-reports"] });
    },
    [queryClient, tournamentId, slug, matchId]
  );

  // Helper to append a feed event
  const appendFeedEvent = useCallback((event: RealtimeFeedEvent) => {
    setLiveEvents((prev) => [event, ...prev.slice(0, 49)]);
  }, []);

  // Setup Realtime Channel
  const setupSubscription = useCallback(() => {
    if (!tournamentId) return;

    if (channelRef.current) {
      void supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    setConnectionStatus((prev) => (prev === "connected" ? "connected" : "connecting"));

    const topic = `tournament:${tournamentId}`;
    const channelName = `realtime-${tournamentId}-${Date.now()}`;
    const channel = supabase.channel(channelName, {
      config: {
        broadcast: { ack: true, self: true },
      },
    });

    // 1. Listen for Broadcast Events from Realtime Event Engine (Phase 10.1 & 10.2)
    channel
      .on("broadcast", { event: "match_started" }, ({ payload }) => {
        invalidateQueries("match_started");
        const matchNo = payload?.extra?.match_number || payload?.match_id?.slice(0, 6) || "";
        const roundNo = payload?.round ? `Round ${payload.round}` : "";
        const feedEvt: RealtimeFeedEvent = {
          id: `evt-${Date.now()}-${Math.random()}`,
          eventType: "match_started",
          title: "Match Started",
          description: `Match #${matchNo} ${roundNo ? `(${roundNo})` : ""} is now LIVE!`,
          timestamp: payload?.updated_at || new Date().toISOString(),
          tournamentId,
          matchId: payload?.match_id,
          round: payload?.round,
          status: "live",
          icon: "",
          badgeColor: "emerald",
        };
        appendFeedEvent(feedEvt);
        if (enableToasts) {
          toast.info(feedEvt.description, { icon: "" });
        }
      })
      .on("broadcast", { event: "score_submitted" }, ({ payload }) => {
        invalidateQueries("score_submitted");
        const feedEvt: RealtimeFeedEvent = {
          id: `evt-${Date.now()}-${Math.random()}`,
          eventType: "score_submitted",
          title: "Score Reported",
          description: `Score submitted: ${payload?.score || "Scores updated"} (awaiting verification).`,
          timestamp: payload?.updated_at || new Date().toISOString(),
          tournamentId,
          matchId: payload?.match_id,
          score: payload?.score,
          status: "awaiting_approval",
          icon: "",
          badgeColor: "amber",
        };
        appendFeedEvent(feedEvt);
        if (enableToasts) {
          toast.info("A match score report has been submitted.", { icon: "" });
        }
      })
      .on("broadcast", { event: "score_verified" }, ({ payload }) => {
        invalidateQueries("score_verified");
        const winnerName = payload?.winner?.name || "Winner";
        const feedEvt: RealtimeFeedEvent = {
          id: `evt-${Date.now()}-${Math.random()}`,
          eventType: "score_verified",
          title: "Score Verified",
          description: `Score verified! ${winnerName} won (${payload?.score || "Final"}).`,
          timestamp: payload?.updated_at || new Date().toISOString(),
          tournamentId,
          matchId: payload?.match_id,
          winner: payload?.winner,
          score: payload?.score,
          status: "completed",
          icon: "",
          badgeColor: "cyan",
        };
        appendFeedEvent(feedEvt);
        if (enableToasts) {
          toast.success(feedEvt.description, { icon: "" });
        }
      })
      .on("broadcast", { event: "match_completed" }, ({ payload }) => {
        invalidateQueries("match_completed");
        const feedEvt: RealtimeFeedEvent = {
          id: `evt-${Date.now()}-${Math.random()}`,
          eventType: "match_completed",
          title: "Match Finished",
          description: "Match completed and winner advanced to the next round!",
          timestamp: payload?.updated_at || new Date().toISOString(),
          tournamentId,
          matchId: payload?.match_id,
          round: payload?.round,
          winner: payload?.winner,
          status: "completed",
          icon: "",
          badgeColor: "purple",
        };
        appendFeedEvent(feedEvt);
      })
      .on("broadcast", { event: "bracket_updated" }, ({ payload }) => {
        invalidateQueries("bracket_updated");
        const roundText = payload?.round ? `Round ${payload.round}` : "Bracket updated";
        const feedEvt: RealtimeFeedEvent = {
          id: `evt-${Date.now()}-${Math.random()}`,
          eventType: "bracket_updated",
          title: "Bracket Updated",
          description: `Bracket progression updated (${roundText}).`,
          timestamp: payload?.updated_at || new Date().toISOString(),
          tournamentId,
          round: payload?.round,
          icon: "",
          badgeColor: "cyan",
        };
        appendFeedEvent(feedEvt);
      })
      .on("broadcast", { event: "registration_updated" }, ({ payload }) => {
        invalidateQueries("registration_updated");
        const feedEvt: RealtimeFeedEvent = {
          id: `evt-${Date.now()}-${Math.random()}`,
          eventType: "registration_updated",
          title: "Registration Updated",
          description: `Team registration updated: ${payload?.team_a?.name || "Participant list refreshed"}.`,
          timestamp: payload?.updated_at || new Date().toISOString(),
          tournamentId,
          icon: "",
          badgeColor: "cyan",
        };
        appendFeedEvent(feedEvt);
      })
      .on("broadcast", { event: "tournament_status_updated" }, ({ payload }) => {
        invalidateQueries("tournament_status_updated");
        const statusVal = String(payload?.status || "").toUpperCase();
        const isChamp = statusVal === "COMPLETED" && payload?.winner;
        const feedEvt: RealtimeFeedEvent = {
          id: `evt-${Date.now()}-${Math.random()}`,
          eventType: "tournament_status_updated",
          title: isChamp ? "Champion Crowned!" : `Tournament ${statusVal}`,
          description: isChamp
            ? ` ${payload?.winner?.name || "The Champion"} has won the tournament!`
            : `Tournament status transitioned to ${statusVal}.`,
          timestamp: payload?.updated_at || new Date().toISOString(),
          tournamentId,
          status: payload?.status,
          winner: payload?.winner,
          icon: isChamp ? "" : "",
          badgeColor: isChamp ? "amber" : "cyan",
        };
        appendFeedEvent(feedEvt);
        if (enableToasts) {
          if (isChamp) {
            toast.success(feedEvt.description, { icon: "", duration: 8000 });
          } else {
            toast.info(`Tournament is now ${statusVal}`, { icon: "" });
          }
        }
      });

    // 2. Postgres changes fallback (table-level triggers)
    channel.on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "matches",
        filter: `tournament_id=eq.${tournamentId}`,
      },
      () => {
        invalidateQueries("matches_postgres_change");
      }
    );

    channel.on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "tournaments",
        filter: `id=eq.${tournamentId}`,
      },
      () => {
        invalidateQueries("tournaments_postgres_change");
      }
    );

    channel.on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "tournament_registrations",
        filter: `tournament_id=eq.${tournamentId}`,
      },
      () => {
        invalidateQueries("registrations_postgres_change");
      }
    );

    // 3. Channel Subscribe & Offline Recovery Logic
    channel.subscribe((status) => {
      if (!isMountedRef.current) return;

      if (status === "SUBSCRIBED") {
        setConnectionStatus("connected");
        reconnectAttemptsRef.current = 0;
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        setConnectionStatus("reconnecting");
        if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);

        // Exponential backoff with jitter
        const delay = Math.min(1000 * Math.pow(1.5, reconnectAttemptsRef.current), 10000);
        reconnectAttemptsRef.current += 1;

        reconnectTimeoutRef.current = setTimeout(() => {
          if (isMountedRef.current) {
            setupSubscription();
            // Automatically resync snapshot upon recovery
            invalidateQueries("reconnect_snapshot_sync");
          }
        }, delay);
      }
    });

    channelRef.current = channel;
  }, [tournamentId, invalidateQueries, appendFeedEvent, enableToasts]);

  // Lifecycle Management
  useEffect(() => {
    isMountedRef.current = true;
    if (tournamentId) {
      setupSubscription();
    } else {
      setConnectionStatus("disconnected");
    }

    // Network Online Event -> Immediate Reconnect & Resync
    const handleOnline = () => {
      if (isMountedRef.current && tournamentId) {
        setConnectionStatus("reconnecting");
        setupSubscription();
        invalidateQueries("browser_online_sync");
      }
    };

    // Tab Visibility Change -> Verify Connection & Resync Snapshot
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && isMountedRef.current && tournamentId) {
        if (connectionStatus !== "connected") {
          setupSubscription();
        }
        invalidateQueries("tab_visible_sync");
      }
    };

    window.addEventListener("online", handleOnline);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      isMountedRef.current = false;
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (channelRef.current) {
        void supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      window.removeEventListener("online", handleOnline);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [tournamentId, setupSubscription, invalidateQueries, connectionStatus]);

  const reconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
    setupSubscription();
    invalidateQueries("manual_reconnect_sync");
  }, [setupSubscription, invalidateQueries]);

  return {
    connectionStatus,
    isConnected: connectionStatus === "connected",
    isReconnecting: connectionStatus === "reconnecting",
    lastUpdated,
    liveEvents,
    reconnect,
    clearEvents: () => setLiveEvents([]),
  };
}
