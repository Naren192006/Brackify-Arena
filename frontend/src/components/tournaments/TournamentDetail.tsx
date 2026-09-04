"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useLiveBracket } from "@/hooks/useLiveBracket";
import { getTeams } from "@/lib/arena/data";
import { getBracket } from "@/lib/brackets/data";
import { getTeamCurrentMatch } from "@/lib/matches/data";
import { getTournament, getTournamentRegistrations } from "@/lib/tournaments/data";
import { getComputedTournamentStatus, formatCountdown } from "@/lib/tournaments/lifecycle";
import { supabase } from "@/lib/supabase/client";
import { CurrentMatchCard } from "@/components/tournaments/CurrentMatchCard";
import { StatusBadge } from "@/components/tournaments/StatusBadge";
import { ReportPlayerModal } from "@/components/reports/ReportPlayerModal";
import { RazorpayCheckout } from "@/components/payments/RazorpayCheckout";
import type { PaymentStatus } from "@/types/tournament";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Format paise → "₹500" */
function formatFee(paise: number): string {
  return (paise / 100).toLocaleString("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 0 });
}

/**
 * Payment status badge rendered strictly from backend payment_status.
 * Used across registered team cards and registration status panels.
 */
function PaymentBadge({ status }: { status: PaymentStatus | undefined }) {
  if (!status) return null;
  switch (status) {
    case "paid":
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-400">
          <span className="h-2 w-2 rounded-full bg-emerald-400" />
          Paid ✓
        </span>
      );
    case "pending":
    case "created":
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-yellow-400">
          <span className="h-2 w-2 rounded-full bg-yellow-400 animate-pulse" />
          Payment Pending
        </span>
      );
    case "cancelled":
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-400">
          <span className="h-2 w-2 rounded-full bg-red-400" />
          Cancelled
        </span>
      );
    case "failed":
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-400">
          <span className="h-2 w-2 rounded-full bg-red-400" />
          Payment Failed
        </span>
      );
    case "refunded":
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-arena-muted">
          <span className="h-2 w-2 rounded-full bg-gray-500" />
          Refunded
        </span>
      );
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function TournamentDetail({ slug }: { slug: string }) {
  const client = useQueryClient();
  const { user } = useAuth();
  const userId = user?.id ?? null;

  // Cancellation confirmation modal state
  const [confirmCancelTeam, setConfirmCancelTeam] = useState<{ id: string; name: string } | null>(null);

  // Periodic tick for live countdown updates
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 10_000);
    return () => clearInterval(timer);
  }, []);

  // ── Queries ────────────────────────────────────────────────────────────────
  const tournamentQuery = useQuery({
    queryKey: ["tournament", slug],
    queryFn: () => getTournament(slug),
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });

  const tournamentId = tournamentQuery.data?.id;

  const registrationsQuery = useQuery({
    queryKey: ["tournament-registrations", tournamentId],
    queryFn: () => getTournamentRegistrations(tournamentId!),
    enabled: Boolean(tournamentId),
    refetchInterval: 4_000,
  });

  const captainsQuery = useQuery({
    queryKey: ["tournament-team-captains", tournamentId, (registrationsQuery.data ?? []).map((r) => r.team_id).join(",")],
    queryFn: async () => {
      const ids = (registrationsQuery.data ?? []).map((r) => r.team_id);
      if (!ids.length) return [];
      const { data, error } = await supabase.from("teams").select("id,captain_id").in("id", ids);
      if (error) throw error;
      return data ?? [];
    },
    enabled: Boolean(tournamentId) && (registrationsQuery.data ?? []).length > 0,
  });

  const teamsQuery = useQuery({
    queryKey: ["registerable-teams", userId],
    queryFn: () => getTeams(userId!),
    enabled: Boolean(userId),
  });

  const captainTeamId = teamsQuery.data?.find((t) => t.role === "captain")?.id;

  const currentMatchQuery = useQuery({
    queryKey: ["current-match", captainTeamId],
    queryFn: () => getTeamCurrentMatch(captainTeamId!),
    enabled: Boolean(captainTeamId),
    refetchInterval: 10_000,
  });

  // Realtime subscription handles updates instantly — polling removed
  const bracketQuery = useQuery({
    queryKey: ["bracket", tournamentId],
    queryFn: () => getBracket(tournamentId!),
    enabled: Boolean(tournamentId),
    refetchOnWindowFocus: true,
  });

  // Enable live Supabase Realtime synchronization for bracket and matches
  useLiveBracket({
    tournamentId,
    slug,
    enableNotifications: false,
  });

  // ── Helpers ────────────────────────────────────────────────────────────────
  const refresh = () => {
    void client.invalidateQueries({ queryKey: ["tournament", slug] });
    void client.invalidateQueries({ queryKey: ["tournament-registrations", tournamentId] });
    void client.invalidateQueries({ queryKey: ["registered-tournaments", userId] });
    void client.refetchQueries({ queryKey: ["tournament-registrations", tournamentId] });
  };

  // ── Registration / cancellation mutation ──────────────────────────────────
  const action = useMutation({
    mutationFn: async ({ teamId, kind }: { teamId: string; kind: "register" | "cancel" }) => {
      const currentTournament = tournamentQuery.data;
      if (!currentTournament) throw new Error("tournament_not_found");

      if (kind === "register") {
        const { data, error } = await supabase.rpc("register_team_for_tournament", {
          target_tournament_id: currentTournament.id,
          target_team_id: teamId,
        });
        if (error) throw error;
        return { registrationId: data as string, teamId, isPaid: Number(currentTournament.entry_fee_minor ?? 0) > 0 };
      } else {
        const { error } = await supabase.rpc("cancel_tournament_registration", {
          target_tournament_id: currentTournament.id,
          target_team_id: teamId,
        });
        if (error) throw error;
        return { registrationId: null, teamId, isPaid: false };
      }
    },
    onSuccess: (result, { kind }) => {
      if (kind === "register") {
        const isPaid = Number(tournamentQuery.data?.entry_fee_minor ?? 0) > 0;
        if (isPaid) {
          toast.info("Registration reserved! Complete payment to confirm your slot.");
        } else {
          toast.success("Registration confirmed!");
        }
      } else {
        toast.success("Registration cancelled");
      }
      refresh();
    },
    onError: (error: Error) => {
      if (process.env.NODE_ENV !== "production") {
        console.error("[Registration/cancellation error]:", error);
      }
      const msg = error.message.toLowerCase();
      if (msg.includes("registration_closed") || msg.includes("deadline")) {
        toast.error("Tournament registration has closed.");
      } else if (msg.includes("captain_required")) {
        toast.error("Only the team captain can manage registration.");
      } else if (msg.includes("tournament_full") || msg.includes("slots")) {
        toast.error("Tournament is already full.");
      } else if (msg.includes("tournament_live") || msg.includes("live") || msg.includes("ongoing")) {
        toast.error("Tournament is already live. Registration is closed.");
      } else if (msg.includes("401") || msg.includes("403") || msg.includes("unauthorized") || msg.includes("jwt")) {
        toast.error("Please sign in again.");
      } else if (msg.includes("already")) {
        toast.error("Team is already registered.");
      } else {
        toast.error("Something went wrong. Please try again.");
      }
    },
  });

  if (tournamentQuery.isLoading) return <Loading />;

  const tournament = tournamentQuery.data;
  if (!tournament)
    return (
      <main className="mx-auto max-w-5xl px-4 py-16 sm:px-6">
        <p className="text-arena-danger">Tournament not found or unavailable.</p>
      </main>
    );

  const registrations = registrationsQuery.data ?? [];
  const entryFee = Number(tournament.entry_fee_minor ?? 0);
  const isPaidTournament = entryFee > 0;

  // Count strictly paid registrations as confirmed teams for paid tournaments (ignoring pending & cancelled)
  const confirmedRegistrations = isPaidTournament
    ? registrations.filter((r) => r.status !== "cancelled" && r.payment_status === "paid")
    : registrations.filter((r) => r.status === "registered" || r.status === "checked_in");

  const filledSlots = confirmedRegistrations.length;
  const remainingSlots = Math.max(0, tournament.max_teams - filledSlots);
  const isFull = remainingSlots <= 0;

  // Computed lifecycle status
  const computedStatus = getComputedTournamentStatus(tournament);
  const now = Date.now();
  const openTime = new Date(tournament.registration_open_at).getTime();
  const closeTime = new Date(tournament.registration_close_at).getTime();
  const startTime = new Date(tournament.start_time).getTime();

  const isLive = computedStatus === "LIVE" || tournament.status === "ongoing" || now >= startTime;
  const isCompleted = computedStatus === "COMPLETED" || tournament.status === "completed";
  const isOpen = computedStatus === "REGISTRATION_OPEN" && !isLive && !isCompleted && now >= openTime && now < closeTime && !isFull;
  const canCancelDeadline = isOpen && now < closeTime;

  // Dynamic countdown calculations
  let countdownLabel = "";
  let countdownValue = "";
  if (computedStatus === "REGISTRATION_OPEN" && now < closeTime && !isLive) {
    countdownLabel = "Registration closes in";
    countdownValue = formatCountdown(tournament.registration_close_at);
  } else if (computedStatus === "UPCOMING" && now < startTime) {
    countdownLabel = "Starts in";
    countdownValue = formatCountdown(tournament.start_time);
  }

  const activeMatch =
    currentMatchQuery.data &&
    ["pending", "scheduled", "live", "awaiting_approval", "reported"].includes(currentMatchQuery.data.status)
      ? currentMatchQuery.data
      : null;

  const finalMatch = bracketQuery.data?.rounds.at(-1)?.matches[0];
  const championId = bracketQuery.data?.champion_team_id;
  const runnerUpId =
    finalMatch && championId
      ? finalMatch.team_a_id === championId
        ? finalMatch.team_b_id
        : finalMatch.team_a_id
      : null;

  const teamName = (id: string | null | undefined) =>
    registrations.find((r) => r.team_id === id)?.teams?.name ?? "—";

  return (
    <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <Link href="/tournaments" className="text-sm text-arena-accent hover:underline">
        ← All tournaments
      </Link>

      {/* ── Banner + header ─────────────────────────────────────────────── */}
      <section className="glass-card mt-6 overflow-hidden rounded-2xl">
        {tournament.banner_url ? (
          <img src={tournament.banner_url} alt="" className="h-56 w-full object-cover" />
        ) : (
          <div className="arena-grid-bg h-56 bg-cyan-400/10" />
        )}
        <div className="p-6 sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm uppercase tracking-[0.25em] text-arena-accent">
                  {tournament.game} · {tournament.mode}
                </p>
                <span
                  className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold uppercase tracking-wider ${
                    isPaidTournament
                      ? "border border-amber-400/30 bg-amber-400/10 text-amber-400"
                      : "border border-emerald-400/30 bg-emerald-400/10 text-emerald-400"
                  }`}
                >
                  {isPaidTournament ? `${formatFee(entryFee)} Entry Fee` : "FREE"}
                </span>
              </div>
              <h1 className="mt-2 font-display text-4xl font-bold text-white">{tournament.title}</h1>
            </div>
            <StatusBadge
              status={tournament.status}
              computedStatus={computedStatus}
              registeredCount={filledSlots}
              maxTeams={tournament.max_teams}
              registrationOpenAt={tournament.registration_open_at}
              registrationCloseAt={tournament.registration_close_at}
              startTime={tournament.start_time}
            />
          </div>
          <p className="mt-5 max-w-3xl whitespace-pre-wrap text-arena-muted">
            {tournament.description || "Tournament details will be announced soon."}
          </p>

          {/* Stats row */}
          <div className="mt-6 grid gap-4 text-sm sm:grid-cols-4">
            <Stat label="Starts" value={new Date(tournament.start_time).toLocaleString()} />
            {countdownValue ? (
              <Stat label={countdownLabel} value={countdownValue} highlight />
            ) : (
              <Stat
                label="Registration closes"
                value={new Date(tournament.registration_close_at).toLocaleString()}
              />
            )}
            <Stat label="Slots remaining" value={`${remainingSlots} / ${tournament.max_teams}`} />
            <Stat
              label="Entry fee"
              value={isPaidTournament ? `${formatFee(entryFee)} Entry Fee` : "FREE"}
            />
          </div>

          {/* Champion panel */}
          {tournament.status === "completed" && championId ? (
            <div className="mt-6 rounded-xl border border-cyan-400/20 bg-cyan-400/10 p-4">
              <p className="text-xs uppercase tracking-wider text-arena-accent">Champion</p>
              <p className="mt-1 font-display text-xl font-semibold text-white">{teamName(championId)}</p>
              <div className="mt-3 grid gap-2 text-sm text-arena-muted sm:grid-cols-3">
                <span>Runner-up: {teamName(runnerUpId)}</span>
              </div>
            </div>
          ) : null}

          {/* Live match alert */}
          {activeMatch && captainTeamId ? (
            <div className="mt-6">
              <CurrentMatchCard match={activeMatch} teamId={captainTeamId} tournamentSlug={tournament.slug} />
            </div>
          ) : null}

          {/* Bracket button */}
          <div className="mt-6">
            <Link href={`/tournaments/${tournament.slug}/bracket`} className="btn-secondary">
              View Bracket
            </Link>
          </div>
        </div>
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_0.8fr]">
        {/* ── Registered teams list ──────────────────────────────────────── */}
        <section className="glass-card rounded-2xl p-6">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-2xl font-semibold text-white">Registered teams</h2>
            <span className="text-xs text-arena-muted">
              {filledSlots} / {tournament.max_teams} confirmed
            </span>
          </div>
          {registrationsQuery.isLoading ? (
            <Loading />
          ) : registrations.length ? (
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {registrations.map((registration) => {
                const captainId = captainsQuery.data?.find((c) => c.id === registration.team_id)?.captain_id;
                const isCancelled = registration.status === "cancelled" || registration.payment_status === "cancelled";

                return (
                  <div
                    className={`flex items-center gap-3 rounded-xl p-3 border transition-colors ${
                      isCancelled
                        ? "bg-red-500/[0.03] border-red-500/10 opacity-70"
                        : "bg-white/[0.04] border-white/5"
                    }`}
                    key={registration.id}
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-cyan-400/15 font-display font-bold text-arena-accent">
                      {registration.teams?.name.slice(0, 1) ?? "T"}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-white truncate">{registration.teams?.name ?? "Team"}</p>
                      <p className="text-xs text-arena-muted">
                        {registration.teams?.tag ? `[${registration.teams.tag}]` : "Registered"}
                      </p>
                      <div className="mt-1">
                        {isPaidTournament ? (
                          <PaymentBadge status={registration.payment_status} />
                        ) : isCancelled ? (
                          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-400">
                            <span className="h-2 w-2 rounded-full bg-red-400" />
                            Cancelled
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-400">
                            <span className="h-2 w-2 rounded-full bg-emerald-400" />
                            Registered ✓
                          </span>
                        )}
                      </div>
                    </div>
                    {captainId && captainId !== userId ? (
                      <ReportPlayerModal
                        reportedUserId={captainId}
                        tournamentId={tournamentId}
                        teamId={registration.team_id}
                      />
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="mt-5 text-sm text-arena-muted">No teams have registered yet.</p>
          )}
        </section>

        {/* ── Registration panel ────────────────────────────────────────── */}
        <section className="glass-card rounded-2xl p-6">
          <h2 className="font-display text-2xl font-semibold text-white">Registration</h2>

          {/* ════════════════════════════════════════════════════════════════
              CASE 1: TOURNAMENT IS LIVE (LOCKED STATE)
             ════════════════════════════════════════════════════════════════ */}
          {isLive ? (
            <div className="mt-4 space-y-4">
              {/* Locked card */}
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4">
                <span className="inline-flex items-center rounded-full bg-emerald-500/20 px-2.5 py-0.5 text-xs font-semibold text-emerald-400">
                  Registration Closed
                </span>
                <p className="mt-2 text-sm text-arena-muted">
                  Tournament is live. Registrations and payments are closed.
                </p>
              </div>

              {/* Team list under live status */}
              {userId && teamsQuery.data?.some((t) => t.role === "captain") ? (
                <div className="space-y-3">
                  {teamsQuery.data.filter((t) => t.role === "captain").map((team) => {
                    const registration = registrations.find((r) => r.team_id === team.id);
                    const paymentStatus = registration?.payment_status;
                    const isPaid = isPaidTournament
                      ? paymentStatus === "paid"
                      : Boolean(registration && registration.status !== "cancelled");

                    return (
                      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4" key={team.id}>
                        <div className="flex items-center justify-between gap-3">
                          <span className="font-semibold text-white">
                            {team.name} [{team.tag}]
                          </span>
                          {isPaid ? (
                            <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-400">
                              Registration Confirmed
                            </span>
                          ) : (
                            <span className="rounded-full border border-gray-500/30 bg-gray-500/10 px-2.5 py-0.5 text-xs font-semibold text-gray-400">
                              Registration Expired
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </div>
          ) : isCompleted ? (
            /* ════════════════════════════════════════════════════════════════
               CASE 2: TOURNAMENT IS COMPLETED
               ════════════════════════════════════════════════════════════════ */
            <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <span className="inline-flex items-center rounded-full bg-gray-500/20 px-2.5 py-0.5 text-xs font-semibold text-gray-300">
                Tournament Completed
              </span>
              <p className="mt-2 text-sm text-arena-muted">
                This tournament has ended. All registrations and matches are archived.
              </p>
            </div>
          ) : (
            /* ════════════════════════════════════════════════════════════════
               CASE 3: TOURNAMENT IS OPEN / UPCOMING
               ════════════════════════════════════════════════════════════════ */
            <>
              <p className="mt-2 text-xs uppercase tracking-wider text-arena-accent">
                {isOpen
                  ? isPaidTournament
                    ? `Registration Open · ${formatFee(entryFee)} Entry Fee`
                    : "Registration Open · FREE"
                  : isFull
                    ? "Tournament Full"
                    : now < openTime
                      ? "Registration Opens Soon"
                      : "Registration Closed"}
              </p>

              {!userId ? (
                <p className="mt-4 text-sm text-arena-muted">
                  Please{" "}
                  <Link href="/login" className="text-arena-accent hover:underline">
                    sign in
                  </Link>{" "}
                  to register.
                </p>
              ) : !teamsQuery.data?.some((t) => t.role === "captain") ? (
                <p className="mt-4 text-sm text-arena-muted">
                  You need to captain a team before registering.
                </p>
              ) : (
                <div className="mt-4 space-y-3">
                  {teamsQuery.data.filter((t) => t.role === "captain").map((team) => {
                    const registration = registrations.find((r) => r.team_id === team.id);
                    const paymentStatus = registration?.payment_status;

                    const isPaid = isPaidTournament
                      ? paymentStatus === "paid"
                      : Boolean(registration && registration.status !== "cancelled");

                    const isPending = isPaidTournament && (paymentStatus === "pending" || paymentStatus === "created");
                    const isFailed = isPaidTournament && paymentStatus === "failed";
                    const isCancelled = registration && (registration.status === "cancelled" || paymentStatus === "cancelled");
                    const isRegistered = Boolean(registration && !isCancelled);

                    return (
                      <div
                        className="rounded-xl border border-white/10 bg-white/[0.03] p-4"
                        key={team.id}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <span className="font-semibold text-white">
                            {team.name} [{team.tag}]
                          </span>
                          {isPaid ? (
                            <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-400">
                              Registration Confirmed
                            </span>
                          ) : isCancelled ? (
                            <span className="rounded border border-red-500/20 bg-red-500/5 px-2 py-0.5 text-xs text-red-400">
                              Cancelled
                            </span>
                          ) : isRegistered ? (
                            <span className="text-xs uppercase text-arena-accent">
                              Registered
                            </span>
                          ) : null}
                        </div>

                        {/* Payment status badge */}
                        {registration && isPaidTournament ? (
                          <div className="mt-2">
                            <PaymentBadge status={paymentStatus} />
                          </div>
                        ) : null}

                        {/* ── Actions for OPEN tournament ─────────────────────── */}
                        {registration && !isCancelled ? (
                          <div className="mt-3.5 flex flex-wrap items-center gap-2.5">
                            {/* Pay button for Pending payments */}
                            {isPending && isOpen && userId ? (
                              <>
                                <RazorpayCheckout
                                  registrationId={registration.id}
                                  amountPaise={entryFee}
                                  supabaseUserId={userId}
                                  buttonLabel={`Pay ${formatFee(entryFee)}`}
                                  onPaid={() => {
                                    toast.success("Payment verified — registration confirmed!");
                                    refresh();
                                  }}
                                  onError={(msg) => toast.error(msg)}
                                />
                                <button
                                  className="rounded-lg border border-white/10 px-3 py-2 text-xs text-arena-muted hover:border-red-500/40 hover:text-red-300 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                  disabled={!canCancelDeadline || action.isPending}
                                  title={!canCancelDeadline ? "Registration is closed — cancellation is unavailable." : "Cancel team registration"}
                                  onClick={() => setConfirmCancelTeam({ id: team.id, name: team.name })}
                                >
                                  Cancel registration
                                </button>
                              </>
                            ) : null}

                            {/* Pay button for Failed payments */}
                            {isFailed && isOpen && userId ? (
                              <>
                                <RazorpayCheckout
                                  registrationId={registration.id}
                                  amountPaise={entryFee}
                                  supabaseUserId={userId}
                                  buttonLabel={`Retry Payment (${formatFee(entryFee)})`}
                                  onPaid={() => {
                                    toast.success("Payment verified — registration confirmed!");
                                    refresh();
                                  }}
                                  onError={(msg) => toast.error(msg)}
                                />
                                <button
                                  className="rounded-lg border border-white/10 px-3 py-2 text-xs text-arena-muted hover:border-red-500/40 hover:text-red-300 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                  disabled={!canCancelDeadline || action.isPending}
                                  title={!canCancelDeadline ? "Registration is closed — cancellation is unavailable." : "Cancel team registration"}
                                  onClick={() => setConfirmCancelTeam({ id: team.id, name: team.name })}
                                >
                                  Cancel registration
                                </button>
                              </>
                            ) : null}

                            {/* Free tournament cancellation before deadline */}
                            {!isPaidTournament && !isPaid && canCancelDeadline ? (
                              <button
                                className="rounded-lg border border-white/10 px-3 py-2 text-xs text-arena-muted hover:border-red-500/40 hover:text-red-300 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                disabled={action.isPending}
                                onClick={() => setConfirmCancelTeam({ id: team.id, name: team.name })}
                              >
                                Cancel registration
                              </button>
                            ) : null}
                          </div>
                        ) : (
                          /* Not registered or Cancelled: Register button */
                          <button
                            className="btn-primary mt-3 w-full"
                            disabled={!isOpen || action.isPending}
                            onClick={() => action.mutate({ teamId: team.id, kind: "register" })}
                          >
                            {isCancelled
                              ? isPaidTournament
                                ? `Pay ${formatFee(entryFee)} & Re-register`
                                : "Re-register Now"
                              : action.isPending
                                ? "Working…"
                                : isFull
                                  ? "Tournament Full"
                                  : now < openTime
                                    ? "Registration Opens Soon"
                                    : now >= closeTime
                                      ? "Registration Closed"
                                      : isPaidTournament
                                        ? `Register & Pay ${formatFee(entryFee)}`
                                        : "Register Now"}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </section>
      </div>

      {/* ── Cancellation Confirmation Modal ──────────────────────────────── */}
      {confirmCancelTeam ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0d121f] p-6 shadow-2xl">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-red-500/20 bg-red-500/10 text-red-400 text-xl font-bold">
              ⚠️
            </div>
            <h3 className="mt-4 font-display text-xl font-bold text-white">
              Cancel your registration?
            </h3>
            <p className="mt-2 text-sm text-arena-muted leading-relaxed">
              Are you sure you want to cancel the registration for{" "}
              <strong className="text-white">{confirmCancelTeam.name}</strong>? Your slot will be released.
            </p>
            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                disabled={action.isPending}
                onClick={() => setConfirmCancelTeam(null)}
                className="rounded-lg border border-white/10 px-4 py-2 text-xs font-semibold text-arena-muted hover:text-white transition-colors"
              >
                Keep Registration
              </button>
              <button
                type="button"
                disabled={action.isPending}
                onClick={() => {
                  const teamId = confirmCancelTeam.id;
                  setConfirmCancelTeam(null);
                  action.mutate({ teamId, kind: "cancel" });
                }}
                className="rounded-lg border border-red-500/40 bg-red-500/20 px-4 py-2 text-xs font-semibold text-red-300 hover:bg-red-500/30 transition-colors"
              >
                {action.isPending ? "Cancelling…" : "Yes, Cancel Registration"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

function Stat({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div>
      <p className="text-arena-muted">{label}</p>
      <p className={`mt-1 font-semibold ${highlight ? "text-arena-accent font-mono" : "text-white"}`}>
        {value}
      </p>
    </div>
  );
}

function Loading() {
  return (
    <main className="mx-auto max-w-5xl animate-pulse px-4 py-16 sm:px-6">
      <div className="h-12 w-2/3 rounded bg-white/5" />
      <div className="mt-6 h-32 rounded bg-white/5" />
    </main>
  );
}