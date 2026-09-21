"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import { listTournamentsPaginated } from "@/lib/tournaments/data";
import type { Tournament } from "@/types/tournament";
import { StatusBadge } from "@/components/tournaments/StatusBadge";

export default function TournamentsPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [gameFilter, setGameFilter] = useState("all");
  const [feeFilter, setFeeFilter] = useState<"all" | "free" | "paid">("all");
  const [page, setPage] = useState(1);
  const pageSize = 9;

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["tournaments", search, statusFilter, gameFilter, feeFilter, page],
    queryFn: () =>
      listTournamentsPaginated({
        search,
        status: statusFilter,
        game: gameFilter,
        entryFeeType: feeFilter,
        page,
        pageSize,
      }),
  });

  useEffect(() => {
    if (isError) toast.error(error instanceof Error ? error.message : "Unable to load tournaments right now.");
  }, [error, isError]);

  const tournaments = data?.tournaments ?? [];
  const totalPages = data?.totalPages ?? 1;
  const totalCount = data?.totalCount ?? 0;

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:py-16 sm:px-6">
      <div className="flex flex-col justify-between gap-4 sm:gap-6 sm:flex-row sm:items-end">
        <div>
          <p className="font-display text-xs sm:text-sm uppercase tracking-[0.3em] text-arena-accent">Compete</p>
          <h1 className="font-display text-2xl sm:text-4xl font-bold text-arena-text">Tournaments</h1>
          <p className="mt-1 sm:mt-2 text-xs sm:text-sm text-arena-muted">
            Find your next competitive run. {totalCount > 0 ? `(${totalCount} available)` : ""}
          </p>
        </div>
        <input
          aria-label="Search tournaments"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
          placeholder="Search tournaments…"
          className="input-field w-full sm:max-w-sm"
        />
      </div>

      {/* ── Filters Bar (PART 11) ──────────────────────────────────────── */}
      <div className="mt-6 sm:mt-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-arena-border pb-4">
        {/* Status Tabs */}
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          {[
            ["all", "All Tournaments"],
            ["live", "Live Now 🔴"],
            ["upcoming", "Upcoming ⏳"],
            ["completed", "Completed 🏆"],
          ].map(([val, label]) => (
            <button
              key={val}
              onClick={() => {
                setStatusFilter(val);
                setPage(1);
              }}
              className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition-all ${
                statusFilter === val
                  ? "bg-arena-accent text-black shadow-sm font-bold"
                  : "border border-arena-border bg-arena-bg-elevated text-arena-muted hover:text-arena-text"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Dropdowns: Game & Fee */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-xs">
          <select
            value={gameFilter}
            onChange={(e) => {
              setGameFilter(e.target.value);
              setPage(1);
            }}
            className="flex-1 sm:flex-initial rounded-xl border border-arena-border bg-black/40 px-3 py-1.5 text-xs text-arena-text focus:border-cyan-400 focus:outline-none"
          >
            <option value="all">All Games</option>
            <option value="valorant">Valorant</option>
            <option value="counter">Counter-Strike 2</option>
            <option value="overwatch">Overwatch 2</option>
          </select>

          <select
            value={feeFilter}
            onChange={(e) => {
              setFeeFilter(e.target.value as any);
              setPage(1);
            }}
            className="flex-1 sm:flex-initial rounded-xl border border-arena-border bg-black/40 px-3 py-1.5 text-xs text-arena-text focus:border-cyan-400 focus:outline-none"
          >
            <option value="all">All Entry Fees</option>
            <option value="free">Free Entry</option>
            <option value="paid">Paid Tournaments</option>
          </select>
        </div>
      </div>

      {isLoading ? (
        <TournamentSkeleton />
      ) : isError ? (
        <p className="mt-8 sm:mt-12 text-arena-danger">Unable to load tournaments right now.</p>
      ) : !tournaments.length ? (
        <div className="mt-8 sm:mt-12 rounded-xl border border-dashed border-arena-border p-6 sm:p-10 text-center">
          <p className="font-display text-xl sm:text-2xl font-semibold text-arena-text">No tournaments found</p>
          <p className="mt-2 text-xs sm:text-sm text-arena-muted">Try another search or check back soon.</p>
        </div>
      ) : (
        <>
          <div className="mt-8 sm:mt-12 grid grid-cols-1 gap-4 sm:gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {tournaments.map((tournament) => (
              <TournamentCard tournament={tournament} key={tournament.id} />
            ))}
          </div>

          {/* ── Pagination Controls ────────────────────────────────────────── */}
          {totalPages > 1 && (
            <div className="mt-8 sm:mt-12 flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-arena-border pt-6">
              <p className="text-xs text-arena-muted">
                Showing page <span className="font-semibold text-arena-text font-mono">{page}</span> of{" "}
                <span className="font-semibold text-arena-text font-mono">{totalPages}</span>
              </p>
              <div className="flex items-center gap-2">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="rounded-xl border border-arena-border bg-white/[0.04] px-3.5 py-1.5 text-xs font-semibold text-arena-text-secondary hover:text-arena-text disabled:opacity-30 disabled:pointer-events-none transition-colors"
                >
                  ← Previous
                </button>
                <button
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="rounded-xl border border-arena-border bg-white/[0.04] px-3.5 py-1.5 text-xs font-semibold text-arena-text-secondary hover:text-arena-text disabled:opacity-30 disabled:pointer-events-none transition-colors"
                >
                  Next →
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </main>
  );
}

function TournamentCard({ tournament }: { tournament: Tournament }) {
  const remaining = Math.max(0, tournament.max_teams - tournament.registered_count);
  return (
    <Link href={`/tournaments/${tournament.slug}`} className="glass-card overflow-hidden rounded-xl transition-transform hover:-translate-y-1">
      {tournament.banner_url ? (
        <img src={tournament.banner_url} alt={`${tournament.title} tournament banner`} className="h-32 sm:h-36 w-full object-cover" />
      ) : (
        <div className="arena-grid-bg h-32 sm:h-36 bg-arena-bg-elevated" />
      )}
      <div className="p-4 sm:p-6">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] sm:text-xs uppercase tracking-widest text-arena-accent truncate">
            {tournament.game} · {tournament.mode}
          </p>
          <StatusBadge
            status={tournament.status}
            registeredCount={tournament.registered_count}
            maxTeams={tournament.max_teams}
            registrationOpenAt={tournament.registration_open_at}
            registrationCloseAt={tournament.registration_close_at}
          />
        </div>
        <h2 className="mt-2 sm:mt-3 font-display text-lg sm:text-2xl font-semibold text-arena-text">{tournament.title}</h2>
        <p className="mt-2 sm:mt-3 line-clamp-2 text-xs sm:text-sm text-arena-muted">
          {tournament.description || "Compete for your place in the arena."}
        </p>
        <div className="mt-4 sm:mt-6 flex justify-between text-xs sm:text-sm text-arena-muted">
          <span>Slots: {remaining} / {tournament.max_teams}</span>
          <span>{new Date(tournament.start_time).toLocaleDateString()}</span>
        </div>
      </div>
    </Link>
  );
}
function TournamentSkeleton() { return <div className="mt-8 sm:mt-12 grid grid-cols-1 gap-4 sm:gap-6 sm:grid-cols-2 lg:grid-cols-3">{[1, 2, 3].map((item) => <div className="animate-pulse rounded-xl border border-arena-border p-4 sm:p-6" key={item}><div className="h-32 sm:h-36 rounded-lg bg-arena-bg-elevated" /><div className="mt-5 h-6 w-3/4 rounded bg-arena-bg-elevated" /><div className="mt-4 h-4 w-full rounded bg-arena-bg-elevated" /><div className="mt-2 h-4 w-2/3 rounded bg-arena-bg-elevated" /></div>)}</div>; }
