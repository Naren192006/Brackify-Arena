"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { getAdminTournamentList } from "@/lib/admin/tournaments";
import { supabase } from "@/lib/supabase/client";

const card = "rounded-2xl border border-white/10 bg-arena-surface/80 p-5 shadow-lg backdrop-blur-md";

export function AdminDashboard() {
  const tournamentsQuery = useQuery({
    queryKey: ["admin-tournaments-list", "", "all", 1, 50],
    queryFn: () => getAdminTournamentList({ page: 1, pageSize: 50 }),
  });

  const playersQuery = useQuery({
    queryKey: ["admin-player-count"],
    queryFn: async () => {
      const result = await supabase.from("profiles").select("id", { count: "exact", head: true });
      if (result.error) return 0;
      return result.count ?? 0;
    },
  });

  const teamsQuery = useQuery({
    queryKey: ["admin-team-count"],
    queryFn: async () => {
      const result = await supabase.from("teams").select("id", { count: "exact", head: true });
      if (result.error) return 0;
      return result.count ?? 0;
    },
  });

  const reportsQuery = useQuery({
    queryKey: ["admin-open-reports"],
    queryFn: async () => {
      const result = await supabase
        .from("fair_play_reports")
        .select("id", { count: "exact", head: true })
        .in("status", ["open", "investigating"]);
      if (result.error) return 0;
      return result.count ?? 0;
    },
  });

  const tournamentsData = tournamentsQuery.data;
  const list = tournamentsData?.items ?? [];
  const totalTournaments = tournamentsData?.total ?? list.length;
  const liveTournaments = list.filter((item) => item.status === "live" || item.status === "ongoing").length;

  const cards = [
    ["Total tournaments", totalTournaments],
    ["Live tournaments", liveTournaments],
    ["Pending registrations", list.reduce((acc, t) => acc + (t.registered_count || 0), 0) || "—"],
    ["Total checked in", list.reduce((acc, t) => acc + (t.checked_in_count || 0), 0) || "—"],
    ["Open fair-play reports", reportsQuery.data ?? "—"],
    ["Total players", playersQuery.data ?? "—"],
    ["Total teams", teamsQuery.data ?? "—"],
  ];

  return (
    <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6 space-y-8">
      <div>
        <p className="text-sm uppercase tracking-[0.25em] text-arena-accent font-semibold">Operations</p>
        <h1 className="mt-2 font-display text-4xl font-bold text-white">Admin dashboard</h1>
        <p className="mt-1 text-sm text-arena-muted">
          Platform-wide tournament metrics, operational overview, and quick management actions.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map(([label, value]) => (
          <div className={card} key={String(label)}>
            <p className="text-xs uppercase tracking-wider font-semibold text-arena-muted">{label}</p>
            <p className="mt-2 font-display text-3xl font-bold text-white">{value}</p>
          </div>
        ))}
      </div>

      <section className={`${card} mt-6`}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/5 pb-4">
          <h2 className="font-display text-xl font-semibold text-white">Quick actions</h2>
          <div className="flex flex-wrap gap-2">
            <Link className="btn-primary px-3.5 py-2 text-xs font-semibold" href="/admin/tournaments/create">
              Create tournament
            </Link>
            <Link className="rounded-xl border border-white/10 bg-white/5 px-3.5 py-2 text-xs font-semibold text-white hover:bg-white/10 transition-colors" href="/admin/tournaments">
              View tournaments ({totalTournaments})
            </Link>
            <Link className="rounded-xl border border-white/10 bg-white/5 px-3.5 py-2 text-xs font-semibold text-arena-muted hover:text-white transition-colors" href="/admin/reports">
              Review reports
            </Link>
          </div>
        </div>

        <h2 className="mt-6 font-display text-lg font-semibold text-white">Recent tournaments</h2>
        <div className="mt-4 space-y-2">
          {tournamentsQuery.isLoading ? (
            <div className="p-8 text-center text-arena-muted">
              <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-arena-accent border-t-transparent mb-2" />
              <p className="text-xs">Loading tournament metrics…</p>
            </div>
          ) : list.length ? (
            list.slice(0, 8).map((item) => (
              <Link
                className="flex items-center justify-between rounded-xl bg-white/[0.03] p-3.5 border border-white/5 hover:bg-white/[0.06] hover:border-white/10 transition-colors"
                href={`/admin/tournaments/${item.slug || item.id}`}
                key={item.id}
              >
                <div>
                  <span className="font-medium text-white text-sm">{item.title}</span>
                  <div className="flex items-center gap-2 mt-0.5 text-xs text-arena-muted">
                    <span>{item.game}</span>
                    <span>•</span>
                    <span>{item.registered_count ?? 0}/{item.max_teams} teams</span>
                  </div>
                </div>
                <span className="rounded-lg bg-cyan-500/10 border border-cyan-500/30 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-cyan-400">
                  {item.status}
                </span>
              </Link>
            ))
          ) : (
            <div className="p-6 text-center text-arena-muted">
              <p className="text-sm">No tournaments created yet.</p>
              <Link href="/admin/tournaments/create" className="btn-primary inline-block mt-3 px-4 py-2 text-xs">
                Create First Tournament
              </Link>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
