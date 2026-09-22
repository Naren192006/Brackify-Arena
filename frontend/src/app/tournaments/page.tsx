"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import { motion } from "framer-motion";

import { listTournamentsPaginated } from "@/lib/tournaments/data";
import type { Tournament } from "@/types/tournament";
import { StatusBadge } from "@/components/tournaments/StatusBadge";
import { PageHeader, Skeleton } from "@/components/ui/kit";
import {
  SearchIcon,
  TrophyIcon,
  ZapIcon,
  ClockIcon,
} from "@/components/ui/icons";

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
    <main className="ambient-bg mx-auto max-w-7xl px-4 py-8 sm:py-16 sm:px-6">
      <div className="flex flex-col justify-between gap-4 sm:gap-6 sm:flex-row sm:items-end">
        <PageHeader
          title="Tournaments"
          subtitle={`Find your next competitive run.${totalCount > 0 ? ` ${totalCount} available.` : ""}`}
          icon={<TrophyIcon size={22} />}
        />
        <div className="glass-panel relative -mt-4 flex w-full items-center rounded-xl sm:-mt-10 sm:max-w-sm">
          <span className="pl-3 text-arena-text-muted">
            <SearchIcon size={16} />
          </span>
          <input
            aria-label="Search tournaments"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            placeholder="Search tournaments"
            className="w-full bg-transparent px-3 py-2.5 text-sm text-arena-text placeholder:text-arena-text-muted focus:outline-none"
          />
        </div>
      </div>

      {/* ── Filters Bar (PART 11) ──────────────────────────────────────── */}
      <div className="mt-6 sm:mt-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-arena-border pb-4">
        {/* Status Tabs */}
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          {([
            ["all", "All Tournaments", null],
            ["live", "Live", <ZapIcon key="z" size={13} />],
            ["upcoming", "Upcoming", <ClockIcon key="c" size={13} />],
            ["completed", "Completed", <TrophyIcon key="t" size={13} />],
          ] as Array<[string, string, ReactNode]>).map(([val, label, icon]) => (
            <button
              key={val}
              onClick={() => {
                setStatusFilter(val);
                setPage(1);
              }}
              className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all duration-200 ${
                statusFilter === val
                  ? "bg-arena-accent text-black shadow-[0_0_16px_rgba(6,182,212,0.35)]"
                  : "glass-panel text-arena-muted hover:text-arena-text"
              }`}
            >
              {icon}
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
        <div className="glass-panel mt-8 rounded-2xl p-10 text-center sm:mt-12">
          <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-arena-accent-soft text-arena-accent">
            <TrophyIcon size={26} />
          </span>
          <p className="font-display text-xl font-semibold text-arena-text sm:text-2xl">No tournaments found</p>
          <p className="mt-2 text-sm text-arena-text-secondary">Try another search or check back soon.</p>
        </div>
      ) : (
        <>
          <div className="mt-8 grid grid-cols-1 gap-4 sm:mt-12 sm:gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {tournaments.map((tournament, index) => (
              <motion.div
                key={tournament.id}
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(index * 0.06, 0.42), duration: 0.45, ease: "easeOut" }}
              >
                <TournamentCard tournament={tournament} />
              </motion.div>
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
                  className="glass-panel rounded-full px-4 py-1.5 text-xs font-semibold text-arena-text-secondary hover:text-arena-text disabled:opacity-30 disabled:pointer-events-none transition-colors press-card"
                >
                  ← Previous
                </button>
                <button
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="glass-panel rounded-full px-4 py-1.5 text-xs font-semibold text-arena-text-secondary hover:text-arena-text disabled:opacity-30 disabled:pointer-events-none transition-colors press-card"
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
    <Link href={`/tournaments/${tournament.slug}`} className="glass-card press-card overflow-hidden rounded-xl transition-transform hover:-translate-y-1">
      {tournament.banner_url ? (
        <Image
          src={tournament.banner_url}
          alt={`${tournament.title} tournament banner`}
          width={640}
          height={288}
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
          className="h-32 sm:h-36 w-full object-cover"
        />
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
function TournamentSkeleton() {
  return (
    <div className="mt-8 grid grid-cols-1 gap-4 sm:mt-12 sm:gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {[1, 2, 3, 4, 5, 6].map((item) => (
        <div className="glass-panel rounded-2xl p-4 sm:p-5" key={item}>
          <Skeleton className="h-32 rounded-xl sm:h-36" />
          <Skeleton className="mt-5 h-6 w-3/4" />
          <Skeleton className="mt-4 h-4 w-full" />
          <Skeleton className="mt-2 h-4 w-2/3" />
        </div>
      ))}
    </div>
  );
}
