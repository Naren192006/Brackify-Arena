"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { getProfile, getTeams } from "@/lib/arena/data";
import { getTeamCurrentMatch } from "@/lib/matches/data";
import { getRegisteredTournaments, listTournaments } from "@/lib/tournaments/data";
import { getComputedTournamentStatus, formatCountdown } from "@/lib/tournaments/lifecycle";
import { supabase } from "@/lib/supabase/client";
import { StatusBadge } from "@/components/tournaments/StatusBadge";
import type { Tournament } from "@/types/tournament";

type Props = {
  userId: string;
  email: string;
  metadata: Record<string, unknown>;
};

export function AuthenticatedHome({ userId, email, metadata }: Props) {
  // 1. Profile Query
  const profileQuery = useQuery({
    queryKey: ["profile", userId],
    queryFn: () => getProfile(userId),
  });

  // 2. Teams Query
  const teamsQuery = useQuery({
    queryKey: ["teams", userId],
    queryFn: () => getTeams(userId),
  });

  const teams = teamsQuery.data ?? [];
  const primaryTeam = teams[0];
  const teamIds = teams.map((t) => t.id);

  // 3. Registered Tournaments Query
  const registeredQuery = useQuery({
    queryKey: ["registered-tournaments", userId],
    queryFn: () => getRegisteredTournaments(userId),
  });

  const registeredTournaments = registeredQuery.data ?? [];
  const activeTournament = registeredTournaments.find(
    (t) => t.status === "ongoing" || t.status === "open" || t.status === "check_in" || t.status === "registration_closed"
  ) ?? registeredTournaments[0];

  // 4. Current Match Query
  const currentMatchQuery = useQuery({
    queryKey: ["current-match", primaryTeam?.id],
    queryFn: () => getTeamCurrentMatch(primaryTeam.id),
    enabled: Boolean(primaryTeam?.id),
    refetchInterval: 10_000,
  });

  const currentMatch = currentMatchQuery.data;

  // 5. Global / Live Tournaments Query
  const tournamentsQuery = useQuery({
    queryKey: ["tournaments-home"],
    queryFn: () => listTournaments(""),
  });

  // 6. Stats Query (Matches Played, Wins, Squad Members)
  const statsQuery = useQuery({
    queryKey: ["user-home-stats", userId, teamIds.join(",")],
    queryFn: async () => {
      if (!teamIds.length) {
        return { matchesPlayed: 0, wins: 0, squadMembers: 1 };
      }

      // Matches query
      const matchesPromise = supabase
        .from("matches")
        .select("id,status,winner_team_id,team_a_id,team_b_id")
        .or(`team_a_id.in.(${teamIds.join(",")}),team_b_id.in.(${teamIds.join(",")})`);

      // Squad members query
      const squadPromise = supabase
        .from("team_members")
        .select("user_id", { count: "exact", head: true })
        .in("team_id", teamIds);

      const [matchesRes, squadRes] = await Promise.all([matchesPromise, squadPromise]);

      const matches = matchesRes.data ?? [];
      const matchesPlayed = matches.filter((m) => m.status === "completed").length;
      const wins = matches.filter(
        (m) => m.status === "completed" && m.winner_team_id && teamIds.includes(m.winner_team_id)
      ).length;
      const squadMembers = squadRes.count ?? teamIds.length;

      return { matchesPlayed, wins, squadMembers };
    },
    enabled: Boolean(userId),
  });

  const profile = profileQuery.data;
  const displayName =
    profile?.display_name ||
    (metadata.full_name as string | undefined) ||
    (metadata.name as string | undefined) ||
    email.split("@")[0] ||
    "Player";

  const stats = statsQuery.data ?? {
    matchesPlayed: 0,
    wins: 0,
    squadMembers: teams.length > 0 ? teams.length : 1,
  };

  return (
    <div className="relative mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16">
      {/* ── Welcome Hero ─────────────────────────────────────────────── */}
      <section className="glass-card relative overflow-hidden rounded-3xl p-6 sm:p-10">
        <div className="relative z-10 flex flex-col justify-between gap-6 lg:flex-row lg:items-center">
          <div>
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-arena-accent animate-ping" />
              <p className="font-display text-xs font-semibold uppercase tracking-[0.25em] text-arena-accent">
                Player Command Center
              </p>
            </div>
            <h1 className="mt-2 font-display text-4xl font-bold tracking-tight text-arena-text sm:text-5xl">
              Welcome back, <span className="text-cyan-400">{displayName}</span>
            </h1>
            <p className="mt-2 max-w-xl text-sm text-arena-muted sm:text-base">
              Track your bracket runs, check your match schedule, and jump back into the arena.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link href="/dashboard" className="btn-primary px-6 py-3 text-sm">
              Go to Dashboard
            </Link>
            <Link href="/tournaments" className="btn-secondary px-6 py-3 text-sm">
              Browse Tournaments
            </Link>
          </div>
        </div>
      </section>

      {/* ── Four Stat Cards ───────────────────────────────────────────── */}
      <section className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          icon="🏆"
          label="Registered Tournaments"
          value={registeredTournaments.length}
          subtext="Active & upcoming"
        />
        <StatCard
          icon="⚔️"
          label="Matches Played"
          value={stats.matchesPlayed}
          subtext="Total completed"
        />
        <StatCard
          icon="👑"
          label="Match Wins"
          value={stats.wins}
          subtext={stats.matchesPlayed > 0 ? `${Math.round((stats.wins / stats.matchesPlayed) * 100)}% Win rate` : "No matches yet"}
          highlight
        />
        <StatCard
          icon="👥"
          label="Squad Members"
          value={stats.squadMembers}
          subtext={primaryTeam ? `Team: ${primaryTeam.name}` : "Build your squad"}
        />
      </section>

      {/* ── Active Tournament Summary ─────────────────────────────────── */}
      {activeTournament ? (
        <section className="mt-10">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-xl font-bold text-arena-text sm:text-2xl">
              Active Tournament Summary
            </h2>
            <Link
              href={`/tournaments/${activeTournament.slug}`}
              className="text-xs font-semibold text-arena-accent hover:underline"
            >
              View Full Details →
            </Link>
          </div>

          <div className="glass-card overflow-hidden rounded-2xl border border-arena-border p-6 sm:p-8">
            <div className="flex flex-col justify-between gap-6 md:flex-row md:items-center">
              <div>
                <div className="flex flex-wrap items-center gap-2.5">
                  <p className="text-xs uppercase tracking-widest text-arena-accent font-semibold">
                    {activeTournament.game} · {activeTournament.mode}
                  </p>
                  <StatusBadge
                    status={activeTournament.status}
                    computedStatus={getComputedTournamentStatus(activeTournament)}
                    registeredCount={activeTournament.registered_count}
                    maxTeams={activeTournament.max_teams}
                    registrationOpenAt={activeTournament.registration_open_at}
                    registrationCloseAt={activeTournament.registration_close_at}
                    startTime={activeTournament.start_time}
                  />
                  {activeTournament.entry_fee_minor > 0 ? (
                    <span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-2.5 py-0.5 text-[11px] font-semibold text-amber-400">
                      ₹{activeTournament.entry_fee_minor / 100} Entry
                    </span>
                  ) : (
                    <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-400">
                      FREE
                    </span>
                  )}
                </div>

                <h3 className="mt-2 font-display text-2xl font-bold text-arena-text sm:text-3xl">
                  {activeTournament.title}
                </h3>
                <p className="mt-1 text-xs text-arena-muted">
                  Starts {new Date(activeTournament.start_time).toLocaleString()} ·{" "}
                  {formatCountdown(activeTournament.start_time)} remaining
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <Link
                  href={`/tournaments/${activeTournament.slug}/bracket`}
                  className="rounded-xl border border-arena-border bg-arena-bg-elevated px-4 py-2.5 text-xs font-semibold text-arena-text transition-colors hover:bg-arena-bg-elevated"
                >
                  View Bracket
                </Link>
                <Link
                  href={`/tournaments/${activeTournament.slug}`}
                  className="btn-primary px-5 py-2.5 text-xs font-semibold"
                >
                  Tournament Hub
                </Link>
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {/* ── Continue Playing (Current Match) ──────────────────────────── */}
      {currentMatch ? (
        <section className="mt-10">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-xl font-bold text-arena-text sm:text-2xl">
              Continue Playing
            </h2>
            <span className="rounded-full border border-red-500/30 bg-red-500/10 px-2.5 py-0.5 text-xs font-bold text-red-400 animate-pulse">
              ● Match Active
            </span>
          </div>

          <div className="glass-card rounded-2xl border border-arena-accent bg-gradient-to-r from-cyan-950/30 to-blue-950/20 p-6 sm:p-8">
            <div className="flex flex-col justify-between gap-6 md:flex-row md:items-center">
              <div>
                <p className="text-xs uppercase tracking-wider text-arena-accent font-semibold">
                  Round {currentMatch.round_number} · Match {currentMatch.match_number}
                </p>
                <div className="mt-2 flex items-center gap-4">
                  <span className="font-display text-2xl font-bold text-arena-text">
                    {currentMatch.team_a?.name ?? "Your Team"}
                  </span>
                  <span className="rounded-lg bg-arena-bg-elevated px-3 py-1 font-mono text-xl font-bold text-arena-accent">
                    {currentMatch.team1_score ?? "–"} : {currentMatch.team2_score ?? "–"}
                  </span>
                  <span className="font-display text-2xl font-bold text-arena-text">
                    {currentMatch.team_b?.name ?? "Opponent"}
                  </span>
                </div>
                <p className="mt-2 text-xs text-arena-muted">
                  Status: <span className="uppercase text-cyan-400 font-semibold">{currentMatch.status.replace("_", " ")}</span>
                </p>
              </div>

              <Link
                href={`/dashboard/matches/${currentMatch.id}`}
                className="btn-primary px-6 py-3 text-sm"
              >
                Go to Match Room →
              </Link>
            </div>
          </div>
        </section>
      ) : null}

      {/* ── Live & Featured Tournaments ───────────────────────────────── */}
      <section className="mt-12">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2 className="font-display text-2xl font-bold text-arena-text sm:text-3xl">
              Live & Featured Tournaments
            </h2>
            <p className="mt-1 text-xs text-arena-muted">
              Jump into high-stakes tournaments currently running or open for registration.
            </p>
          </div>
          <Link href="/tournaments" className="text-xs font-semibold text-arena-accent hover:underline">
            View All ({tournamentsQuery.data?.length ?? 0}) →
          </Link>
        </div>

        {tournamentsQuery.isLoading ? (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((n) => (
              <div key={n} className="h-56 animate-pulse rounded-2xl border border-arena-border bg-white/[0.02]" />
            ))}
          </div>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {(tournamentsQuery.data ?? []).slice(0, 3).map((tournament: Tournament) => {
              const remaining = Math.max(0, tournament.max_teams - tournament.registered_count);
              return (
                <Link
                  key={tournament.id}
                  href={`/tournaments/${tournament.slug}`}
                  className="glass-card group flex flex-col justify-between overflow-hidden rounded-2xl transition-all duration-300 hover:-translate-y-1 hover:border-cyan-400/40"
                >
                  <div className="p-6">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs uppercase tracking-widest text-arena-accent font-semibold">
                        {tournament.game} · {tournament.mode}
                      </span>
                      <StatusBadge
                        status={tournament.status}
                        computedStatus={getComputedTournamentStatus(tournament)}
                        registeredCount={tournament.registered_count}
                        maxTeams={tournament.max_teams}
                        registrationOpenAt={tournament.registration_open_at}
                        registrationCloseAt={tournament.registration_close_at}
                        startTime={tournament.start_time}
                      />
                    </div>

                    <h3 className="mt-3 font-display text-xl font-bold text-arena-text transition-colors group-hover:text-cyan-300">
                      {tournament.title}
                    </h3>
                    <p className="mt-2 line-clamp-2 text-xs text-arena-muted">
                      {tournament.description || "Compete for your place in the arena."}
                    </p>
                  </div>

                  <div className="border-t border-arena-border bg-white/[0.02] px-6 py-3.5 flex items-center justify-between text-xs text-arena-muted">
                    <span>Slots: <strong className="text-arena-text">{remaining} / {tournament.max_teams}</strong></span>
                    <span>{new Date(tournament.start_time).toLocaleDateString()}</span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  subtext,
  highlight = false,
}: {
  icon: string;
  label: string;
  value: number;
  subtext: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`glass-card rounded-2xl p-5 transition-all duration-300 ${
        highlight ? "border-arena-accent bg-cyan-950/20" : "border-arena-border"
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="text-2xl">{icon}</span>
        <span className="font-display text-3xl font-bold text-arena-text">{value}</span>
      </div>
      <p className="mt-3 text-xs font-semibold uppercase tracking-wider text-arena-muted">{label}</p>
      <p className="mt-0.5 text-[11px] text-arena-accent truncate">{subtext}</p>
    </div>
  );
}
