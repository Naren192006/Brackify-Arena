"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import { listTournaments } from "@/lib/tournaments/data";
import type { Tournament } from "@/types/tournament";
import { StatusBadge } from "@/components/tournaments/StatusBadge";

export default function TournamentsPage() {
  const [search, setSearch] = useState("");
  const { data, isLoading, isError, error } = useQuery({ queryKey: ["tournaments", search], queryFn: () => listTournaments(search) });
  useEffect(() => { if (isError) toast.error(error instanceof Error ? error.message : "Unable to load tournaments right now."); }, [error, isError]);
  return <main className="mx-auto max-w-7xl px-4 py-16 sm:px-6"><div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-end"><div><p className="font-display text-sm uppercase tracking-[0.3em] text-arena-accent">Compete</p><h1 className="font-display text-4xl font-bold text-white">Tournaments</h1><p className="mt-2 text-arena-muted">Find your next competitive run.</p></div><input aria-label="Search tournaments" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search tournaments" className="input-field max-w-sm" /></div>{isLoading ? <TournamentSkeleton /> : isError ? <p className="mt-12 text-arena-danger">Unable to load tournaments right now.</p> : !data?.length ? <div className="mt-12 rounded-xl border border-dashed border-white/10 p-10 text-center"><p className="font-display text-2xl font-semibold text-white">No tournaments found</p><p className="mt-2 text-arena-muted">Try another search or check back soon.</p></div> : <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">{data.map((tournament) => <TournamentCard tournament={tournament} key={tournament.id} />)}</div>}</main>;
}

function TournamentCard({ tournament }: { tournament: Tournament }) {
  const remaining = Math.max(0, tournament.max_teams - tournament.registered_count);
  return (
    <Link href={`/tournaments/${tournament.slug}`} className="glass-card overflow-hidden rounded-xl transition-transform hover:-translate-y-1">
      {tournament.banner_url ? (
        <img src={tournament.banner_url} alt="" className="h-36 w-full object-cover" />
      ) : (
        <div className="arena-grid-bg h-36 bg-cyan-400/10" />
      )}
      <div className="p-6">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs uppercase tracking-widest text-arena-accent">
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
        <h2 className="mt-3 font-display text-2xl font-semibold text-white">{tournament.title}</h2>
        <p className="mt-3 line-clamp-2 text-sm text-arena-muted">
          {tournament.description || "Compete for your place in the arena."}
        </p>
        <div className="mt-6 flex justify-between text-sm text-arena-muted">
          <span>Slots remaining: {remaining} / {tournament.max_teams}</span>
          <span>{new Date(tournament.start_time).toLocaleDateString()}</span>
        </div>
      </div>
    </Link>
  );
}
function TournamentSkeleton() { return <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">{[1, 2, 3].map((item) => <div className="animate-pulse rounded-xl border border-white/10 p-6" key={item}><div className="h-36 rounded-lg bg-white/5" /><div className="mt-5 h-6 w-3/4 rounded bg-white/5" /><div className="mt-4 h-4 w-full rounded bg-white/5" /><div className="mt-2 h-4 w-2/3 rounded bg-white/5" /></div>)}</div>; }
