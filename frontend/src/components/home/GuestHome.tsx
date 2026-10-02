"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

import { listTournamentsPaginated } from "@/lib/tournaments/data";
import type { Tournament } from "@/types/tournament";
import {
  ArrowRightIcon,
  CrownIcon,
  ShieldIcon,
  SwordsIcon,
  TrophyIcon,
  ZapIcon,
} from "@/components/ui/icons";

/* ── data ─────────────────────────────────────────────────────────── */

const STEPS = [
  {
    step: "01",
    title: "Build your squad",
    desc: "Create your roster, lock in a team tag, and invite players by username or email. Captains stay in control.",
  },
  {
    step: "02",
    title: "Register and check in",
    desc: "Pick an open cup, secure your slot, and check in during the window. No-shows never clog the bracket.",
  },
  {
    step: "03",
    title: "Compete and advance",
    desc: "Brackets update as results are verified. Report scores, get opponent confirmation, and push for the finals.",
  },
];

const FEATURES = [
  {
    title: "Live interactive brackets",
    desc: "Real-time updates over WebSockets and Supabase realtime. Advances appear the moment they're confirmed, with no refresh needed.",
    span: "sm:col-span-2",
  },
  {
    title: "Captain-verified reporting",
    desc: "Score submission with opponent confirmation and screenshot proof. Disputes get resolved, not ignored.",
    span: "",
  },
  {
    title: "Fair play and moderation",
    desc: "Trust scores, community reports, and admin mediation queues keep the arena clean.",
    span: "",
  },
  {
    title: "Organizer control room",
    desc: "Match resets, score corrections, manual advances, and complete audit logs. The operations toolkit a real tournament needs.",
    span: "sm:col-span-2",
  },
];

const CAPABILITIES = [
  { icon: TrophyIcon, label: "Free and paid cups" },
  { icon: ZapIcon, label: "Automated brackets" },
  { icon: ShieldIcon, label: "Verified results" },
  { icon: CrownIcon, label: "Prize tracking" },
];

function formatFee(feeMinor: number): string {
  if (!feeMinor) return "Free entry";
  return `₹${(feeMinor / 100).toLocaleString("en-IN")}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
  });
}

/* ── component ────────────────────────────────────────────────────── */

export function GuestHome() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["guest-upcoming-tournaments"],
    queryFn: () =>
      listTournamentsPaginated({ status: "upcoming", pageSize: 3, page: 1 }),
    staleTime: 60_000,
  });

  const upcoming = data?.tournaments ?? [];
  const hasUpcoming = (data?.totalCount ?? 0) > 0;

  return (
    <div className="relative overflow-hidden">
      {/* ── Hero ─────────────────────────────────────────────────── */}
      <section className="relative">
        <div className="aurora-field" aria-hidden />
        <div className="arena-grid-overlay" aria-hidden />

        <div className="relative mx-auto max-w-7xl px-4 pt-16 pb-20 sm:px-6 sm:pt-24 sm:pb-28 lg:pt-28">
          <div className="grid items-center gap-12 lg:grid-cols-[1.15fr_0.85fr]">
            {/* Left: copy */}
            <div>
              {hasUpcoming ? (
                <p className="inline-flex items-center gap-2.5 rounded-full border border-arena-accent/40 bg-cyan-950/30 px-3.5 py-1.5 text-xs font-semibold text-arena-accent">
                  <span className="live-dot" />
                  <span className="tracking-wide uppercase">New cups announced</span>
                </p>
              ) : null}

              <h1 className="mt-6 font-display text-5xl font-black uppercase leading-[0.95] tracking-tight text-arena-text sm:text-7xl">
                Esports tournaments
                <span className="block text-arena-accent">sign-ups to finals</span>
              </h1>

              <p className="mt-6 max-w-xl text-base leading-relaxed text-arena-text-secondary sm:text-lg">
                Create a team, register for open cups, and play on automated
                brackets with verified scores. Run your own tournaments with
                check-ins, moderation, and prize tracking built in.
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-4 sm:mt-10">
                <Link
                  href="/tournaments"
                  className="btn-primary px-7 py-3.5 text-sm font-bold sm:text-base"
                >
                  Browse Tournaments
                </Link>
                <Link
                  href="/register"
                  className="btn-secondary px-7 py-3.5 text-sm font-semibold sm:text-base"
                >
                  Create Player Account
                </Link>
              </div>

              {/* Static capabilities: real product features, no counters */}
              <div className="mt-12 grid grid-cols-2 gap-x-6 gap-y-5 border-t border-arena-border pt-8 sm:mt-16 sm:grid-cols-4">
                {CAPABILITIES.map(({ icon: Icon, label }) => (
                  <div key={label} className="flex items-center gap-2.5">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-arena-accent-soft text-arena-accent">
                      <Icon size={17} />
                    </span>
                    <p className="text-xs font-semibold text-arena-text-secondary sm:text-sm">
                      {label}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Right: real upcoming tournaments */}
            <div>
              <UpcomingTournamentsPanel
                tournaments={upcoming}
                loading={isLoading}
                error={isError}
              />
            </div>
          </div>
        </div>
      </section>

      {/* ── How it works ─────────────────────────────────────────── */}
      <section className="relative mx-auto max-w-7xl px-4 py-20 sm:px-6 sm:py-28">
        <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="font-display text-xs font-semibold uppercase tracking-[0.25em] text-arena-accent">
              How it works
            </p>
            <h2 className="mt-2 font-display text-3xl font-bold text-arena-text sm:text-4xl">
              FROM SIGN-UP TO FINALS
            </h2>
          </div>
          <p className="max-w-sm text-sm text-arena-text-muted">
            From roster creation to finals day: automated, verified, real-time.
          </p>
        </div>

        <div className="mt-14 grid gap-6 sm:grid-cols-3">
          {STEPS.map((item) => (
            <div
              key={item.step}
              className="glass-card hud-corners relative h-full overflow-hidden rounded-2xl p-6 sm:p-8"
            >
              <span className="absolute right-4 top-4 select-none font-mono text-5xl font-extrabold text-white/5">
                {item.step}
              </span>
              <div className="flex h-10 w-10 items-center justify-center rounded-full border border-arena-accent/50 bg-arena-accent-soft font-mono text-xs font-bold text-arena-accent">
                {item.step}
              </div>
              <h3 className="mt-4 font-display text-xl font-bold text-arena-text">
                {item.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-arena-text-secondary">
                {item.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Features ─────────────────────────────────────────────── */}
      <section className="border-t border-arena-border bg-arena-bg-elevated/30 py-20 sm:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="max-w-2xl">
            <p className="font-display text-xs font-semibold uppercase tracking-[0.25em] text-arena-accent">
              Platform features
            </p>
            <h2 className="mt-2 font-display text-3xl font-bold text-arena-text sm:text-4xl">
              BUILT FOR PLAYERS <span className="text-arena-accent">AND</span> ORGANIZERS
            </h2>
          </div>

          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className={`glass-card h-full rounded-2xl p-6 sm:p-7 ${f.span}`}
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-arena-accent-soft text-arena-accent">
                  <SwordsIcon size={18} />
                </div>
                <h3 className="mt-4 font-display text-lg font-bold text-arena-text">
                  {f.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-arena-text-secondary">
                  {f.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ──────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 sm:py-28">
        <div className="glass-card relative overflow-hidden rounded-3xl border border-arena-accent/30 p-8 text-center sm:p-14">
          <div className="aurora-field opacity-40" aria-hidden />
          <div className="relative">
            <h2 className="font-display text-3xl font-black uppercase text-arena-text sm:text-5xl">
              READY TO <span className="text-arena-accent">COMPETE?</span>
            </h2>
            <p className="mx-auto mt-4 max-w-lg text-sm text-arena-text-secondary sm:text-base">
              Create your player profile, assemble your squad, and sign up for
              open tournaments in minutes.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-4">
              <Link href="/register" className="btn-primary hud-corners px-8 py-3.5 text-sm font-bold">
                Sign Up Now
              </Link>
              <Link href="/tournaments" className="btn-secondary px-8 py-3.5 text-sm font-semibold">
                Browse Open Cups
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

/* ── real upcoming tournaments panel ──────────────────────────────── */

function UpcomingTournamentsPanel({
  tournaments,
  loading,
  error,
}: {
  tournaments: Tournament[];
  loading: boolean;
  error: boolean;
}) {
  if (error) return null;

  return (
    <div className="glass-panel rounded-2xl p-5 sm:p-6">
      <div className="flex items-center justify-between">
        <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-arena-text-muted">
          Upcoming cups
        </p>
        <Link
          href="/tournaments"
          className="inline-flex items-center gap-1 text-xs font-semibold text-arena-accent hover:underline"
        >
          View all
          <ArrowRightIcon size={13} />
        </Link>
      </div>

      <div className="mt-4 space-y-2.5">
        {loading ? (
          [1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-[72px] animate-pulse rounded-xl border border-arena-border bg-arena-bg-elevated"
            />
          ))
        ) : tournaments.length ? (
          tournaments.map((t) => {
            const remaining = Math.max(0, t.max_teams - t.registered_count);
            return (
              <Link
                key={t.id}
                href={`/tournaments/${t.slug}`}
                className="block rounded-xl border border-arena-border bg-arena-bg-elevated p-3.5 transition-colors hover:border-arena-accent/50"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="truncate text-sm font-semibold text-arena-text">
                    {t.title}
                  </p>
                  <span className="shrink-0 text-xs font-bold text-arena-accent">
                    {formatFee(t.entry_fee_minor)}
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-arena-text-muted">
                  {t.game} · {t.mode} · Starts {formatDate(t.start_time)} ·{" "}
                  {remaining} of {t.max_teams} slots left
                </p>
              </Link>
            );
          })
        ) : (
          <p className="rounded-xl border border-arena-border bg-arena-bg-elevated p-4 text-sm text-arena-text-secondary">
            No open cups right now. New tournaments are posted regularly, so
            check back soon.
          </p>
        )}
      </div>
    </div>
  );
}
