"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { getControlRoomSnapshot } from "@/lib/admin/tournaments";
import { HealthCards } from "@/components/admin/control-room/HealthCards";
import { QuickActions } from "@/components/admin/control-room/QuickActions";
import { LiveMatchBoard } from "@/components/admin/control-room/LiveMatchBoard";
import { RoundTracker } from "@/components/admin/control-room/RoundTracker";
import { ActivityFeed } from "@/components/admin/control-room/ActivityFeed";
import { BroadcastPanel } from "@/components/admin/control-room/BroadcastPanel";
import { TeamStatusBoard } from "@/components/admin/control-room/TeamStatusBoard";
import { OrganizerNotes } from "@/components/admin/control-room/OrganizerNotes";
import { useTournamentRealtime } from "@/hooks/useTournamentRealtime";

const card = "rounded-2xl border border-white/10 bg-arena-surface/80 p-5";

export function ControlRoomShell({ slug }: { slug: string }) {
  // 1. Initial snapshot fetch (No polling - pure real-time updates via useTournamentRealtime)
  const snapshot = useQuery({
    queryKey: ["control-room", slug],
    queryFn: () => getControlRoomSnapshot(slug),
  });

  const data = snapshot.data;
  const tournamentId = data?.tournament?.id;

  // 2. Realtime subscription hook with auto-reconnect and offline recovery
  const { connectionStatus, isConnected, isReconnecting, reconnect } = useTournamentRealtime({
    tournamentId,
    slug,
  });

  if (snapshot.isLoading) {
    return (
      <main className="mx-auto max-w-7xl animate-pulse px-4 py-12">
        <div className="h-12 w-1/2 rounded bg-white/5" />
        <div className="mt-6 h-64 rounded-2xl bg-white/5" />
      </main>
    );
  }

  if (snapshot.isError || !data) {
    return (
      <main className="mx-auto max-w-7xl px-4 py-12">
        <p className="text-arena-danger">Unable to load the control room.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      {/* Header Breadcrumb & Status */}
      <div className="flex items-center justify-between">
        <Link href={`/admin/tournaments/${slug}`} className="text-sm text-arena-accent hover:underline">
          ← Admin tournament
        </Link>

        {/* Real-time Status Badge & Offline Recovery */}
        <div className="flex items-center gap-2">
          {isConnected ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-400">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              Realtime Sync Active
            </span>
          ) : isReconnecting ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/40 bg-amber-400/15 px-3 py-1 text-xs font-semibold text-amber-300">
              <span className="h-2 w-2 rounded-full bg-amber-400 animate-ping" />
              Reconnecting & Syncing…
            </span>
          ) : (
            <button
              onClick={reconnect}
              className="inline-flex items-center gap-1.5 rounded-full border border-red-500/40 bg-red-500/15 px-3 py-1 text-xs font-semibold text-red-300 hover:bg-red-500/25"
            >
              <span className="h-2 w-2 rounded-full bg-red-400" />
              Offline · Click to Reconnect
            </button>
          )}
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-[0.25em] text-arena-accent">
            Tournament control room
          </p>
          <h1 className="mt-2 font-display text-4xl font-bold text-white">
            {data.tournament.title}
          </h1>
          <p className="mt-2 text-sm text-arena-muted">
            {data.tournament.game} · {data.tournament.status}
            {data.paused ? " · Paused" : ""}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link className="btn-primary px-3 py-2 text-sm" href={`/tournaments/${slug}/live`}>
            Live Center →
          </Link>
          <Link
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white hover:bg-white/10 transition-colors"
            href={`/tournaments/${slug}`}
          >
            Public page
          </Link>
        </div>
      </div>

      {/* Realtime Health Cards */}
      <div className="mt-6">
        <HealthCards snapshot={data} />
      </div>

      {/* Quick Actions */}
      <section className={`${card} mt-6`}>
        <h2 className="mb-4 font-display text-2xl font-semibold text-white">Quick actions</h2>
        <QuickActions tournament={data.tournament} paused={data.paused} />
      </section>

      {/* Round Progress Tracker */}
      <section className={`${card} mt-6`}>
        <h2 className="mb-4 font-display text-2xl font-semibold text-white">Round progress</h2>
        <RoundTracker matches={data.matches} />
      </section>

      {/* Live Match Command Center */}
      <section className={`${card} mt-6`}>
        <h2 className="mb-4 font-display text-2xl font-semibold text-white">
          Live match command center
        </h2>
        <LiveMatchBoard matches={data.matches} slug={slug} />
      </section>

      {/* Team Registration Status */}
      <section className={`${card} mt-6`}>
        <h2 className="mb-4 font-display text-2xl font-semibold text-white">Team status</h2>
        <TeamStatusBoard registrations={data.registrations} />
      </section>

      {/* Auxiliary Panels */}
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className={card}>
          <h2 className="mb-4 font-display text-2xl font-semibold text-white">Activity feed</h2>
          <ActivityFeed items={data.activity} />
        </section>

        <section className={card}>
          <h2 className="mb-4 font-display text-2xl font-semibold text-white">Broadcast</h2>
          <BroadcastPanel tournamentId={data.tournament.id} />
        </section>

        <section className={card}>
          <h2 className="mb-4 font-display text-2xl font-semibold text-white">Organizer notes</h2>
          <OrganizerNotes tournamentId={data.tournament.id} />
        </section>

        <section className={card}>
          <h2 className="mb-4 font-display text-2xl font-semibold text-white">Reports pending</h2>
          <p className="text-3xl font-display font-bold text-white">{data.reportsPending}</p>
          <Link href="/admin/reports" className="mt-3 inline-block text-sm text-arena-accent">
            Review reports →
          </Link>
        </section>
      </div>
    </main>
  );
}
