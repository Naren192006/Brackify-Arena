"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";

/* ── helpers ──────────────────────────────────────────────────────── */

const EASE = [0.22, 1, 0.36, 1] as const;

function useCountUp(target: number, duration = 1600, start = false) {
  const [value, setValue] = useState(0);
  const started = useRef(false);
  useEffect(() => {
    if (!start || started.current) return;
    started.current = true;
    const t0 = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(Math.round(target * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [start, target, duration]);
  return value;
}

function Spotlight({
  className = "",
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const onMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty("--spot-x", `${e.clientX - r.left}px`);
    el.style.setProperty("--spot-y", `${e.clientY - r.top}px`);
  }, []);
  return (
    <div
      ref={ref}
      onMouseMove={onMove}
      className={`spotlight-card ${className}`}
    >
      {children}
    </div>
  );
}

/* ── data ─────────────────────────────────────────────────────────── */

const GAMES = [
  { name: "VALORANT", mode: "5v5 Competitive", status: "Active" },
  { name: "Counter-Strike 2", mode: "5v5 MR12", status: "Active" },
  { name: "Overwatch 2", mode: "Push / Hybrid", status: "Active" },
  { name: "Apex Legends", mode: "Trios Arena", status: "Upcoming" },
  { name: "Rocket League", mode: "3v3 Standard", status: "Upcoming" },
];

const STEPS = [
  {
    step: "01",
    title: "Build Your Squad",
    desc: "Create your roster, lock in a team tag, and invite players by username or email. Captains stay in control.",
  },
  {
    step: "02",
    title: "Register & Check In",
    desc: "Pick an open cup, secure your slot, and check in during the window. No-shows never clog the bracket.",
  },
  {
    step: "03",
    title: "Compete & Advance",
    desc: "Brackets update in real time. Report scores, get opponent confirmation, and push for the finals.",
  },
];

const FEATURES = [
  {
    title: "Live Interactive Brackets",
    desc: "Real-time updates over WebSockets and Supabase realtime. Advances appear the moment they're confirmed — no refresh, ever.",
    span: "sm:col-span-2",
  },
  {
    title: "Captain-Verified Reporting",
    desc: "Score submission with opponent confirmation and photo proof. Disputes get resolved, not ignored.",
    span: "",
  },
  {
    title: "Fair Play & Anti-Cheat",
    desc: "Trust scores, community reports, and admin mediation queues keep the arena clean.",
    span: "",
  },
  {
    title: "Full Control Room",
    desc: "Organizers get match resets, score corrections, manual advances, and complete audit logs — the operations toolkit a real tournament needs.",
    span: "sm:col-span-2",
  },
];

/* ── component ────────────────────────────────────────────────────── */

export function GuestHome() {
  const reduceMotion = useReducedMotion();
  const [metricsInView, setMetricsInView] = useState(false);
  const metricsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = metricsRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => entry.isIntersecting && setMetricsInView(true),
      { threshold: 0.4 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <div className="relative overflow-hidden">
      {/* ── Hero ─────────────────────────────────────────────────── */}
      <section className="relative">
        <div className="aurora-field" aria-hidden />
        <div className="arena-grid-overlay" aria-hidden />

        <div className="relative mx-auto max-w-7xl px-4 pt-16 pb-20 sm:px-6 sm:pt-24 sm:pb-28 lg:pt-28">
          <div className="grid items-center gap-12 lg:grid-cols-[1.15fr_0.85fr]">
            {/* Left: copy */}
            <motion.div
              initial={reduceMotion ? false : { opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, ease: EASE }}
            >
              <motion.div
                initial={reduceMotion ? false : { opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.1, ease: EASE }}
                className="inline-flex items-center gap-2.5 rounded-full border border-arena-accent/40 bg-cyan-950/30 px-3.5 py-1.5 text-xs font-semibold text-arena-accent backdrop-blur-md"
              >
                <span className="live-dot" />
                <span className="tracking-wide uppercase">Season 2 — Open Cups Live</span>
              </motion.div>

              <h1 className="mt-6 font-display text-5xl font-black uppercase leading-[0.95] tracking-tight text-arena-text sm:text-7xl">
                {["WHERE", "GRIND", "MEETS"].map((word, i) => (
                  <motion.span
                    key={word}
                    className="block overflow-hidden"
                    initial={reduceMotion ? false : { opacity: 0, y: 40 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.7, delay: 0.15 + i * 0.12, ease: EASE }}
                  >
                    {word}
                  </motion.span>
                ))}
                <motion.span
                  className="headline-shimmer block"
                  initial={reduceMotion ? false : { opacity: 0, y: 40 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.7, delay: 0.51, ease: EASE }}
                >
                  GLORY
                </motion.span>
              </h1>

              <motion.p
                className="mt-6 max-w-xl text-base leading-relaxed text-arena-text-secondary sm:text-lg"
                initial={reduceMotion ? false : { opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.55, ease: EASE }}
              >
                Verified tournaments. Real-time brackets. Zero spreadsheet chaos.
                Build your squad, lock your slot, and let the arena handle
                everything else — while you focus on winning.
              </motion.p>

              <motion.div
                className="mt-8 flex flex-wrap items-center gap-4 sm:mt-10"
                initial={reduceMotion ? false : { opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.65, ease: EASE }}
              >
                <Link
                  href="/tournaments"
                  className="btn-primary hud-corners px-7 py-3.5 text-sm font-bold shadow-lg shadow-cyan-500/10 sm:text-base"
                >
                  Browse Tournaments →
                </Link>
                <Link
                  href="/register"
                  className="btn-secondary px-7 py-3.5 text-sm font-semibold sm:text-base"
                >
                  Create Player Account
                </Link>
              </motion.div>

              {/* Animated metrics */}
              <motion.div
                ref={metricsRef}
                className="mt-12 grid grid-cols-2 gap-x-6 gap-y-6 border-t border-arena-border pt-8 text-left sm:mt-16 sm:grid-cols-4"
                initial={reduceMotion ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.6, delay: 0.8 }}
              >
                {[
                  { value: 100, suffix: "%", label: "Automated Brackets" },
                  { value: 1, prefix: "<", suffix: "s", label: "Real-Time Sync" },
                  { value: 5, suffix: "v5", label: "Supported Formats" },
                  { value: 24, suffix: "/7", label: "Fair-Play Monitoring" },
                ].map((m) => (
                  <MetricCell key={m.label} {...m} active={metricsInView} />
                ))}
              </motion.div>
            </motion.div>

            {/* Right: live match HUD card */}
            <motion.div
              className="relative hidden lg:block"
              initial={reduceMotion ? false : { opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8, delay: 0.4, ease: EASE }}
            >
              <div className="float-slow">
                <LiveMatchCard />
              </div>

              {/* Bracket mini-map behind, offset */}
              <motion.div
                className="absolute -bottom-10 -left-10 w-52 rounded-xl border border-arena-border bg-arena-surface/90 p-3 shadow-2xl shadow-black/30 backdrop-blur-md"
                initial={reduceMotion ? false : { opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7, delay: 0.9, ease: EASE }}
              >
                <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-arena-text-muted">
                  Bracket · QF
                </p>
                <div className="mt-2 space-y-1.5">
                  {[
                    { a: "TSM", b: "C9", done: true },
                    { a: "FNC", b: "G2", done: false },
                  ].map((m) => (
                    <div
                      key={m.a}
                      className="flex items-center justify-between rounded-md border border-arena-border/60 bg-arena-bg-elevated px-2 py-1 text-[10px]"
                    >
                      <span className={m.done ? "font-bold text-arena-text" : "text-arena-text-muted"}>
                        {m.a}
                      </span>
                      <span className="font-mono text-arena-text-muted">vs</span>
                      <span className={m.done ? "text-arena-text-muted" : "font-bold text-arena-text"}>
                        {m.b}
                      </span>
                    </div>
                  ))}
                </div>
              </motion.div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ── Games marquee ────────────────────────────────────────── */}
      <section className="border-y border-arena-border bg-arena-bg-elevated/40 py-10">
        <p className="mb-6 text-center font-display text-xs font-semibold uppercase tracking-[0.3em] text-arena-text-muted">
          Supported Tournament Titles
        </p>
        <div className="marquee">
          <div className="marquee-track">
            {[...GAMES, ...GAMES].map((game, i) => (
              <div
                key={`${game.name}-${i}`}
                className="flex w-64 shrink-0 items-center gap-3 rounded-xl border border-arena-border bg-arena-surface/70 px-4 py-3"
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-arena-accent-soft font-display text-sm font-black text-arena-accent">
                  {game.name.charAt(0)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-display text-sm font-bold text-arena-text">
                    {game.name}
                  </p>
                  <p className="truncate text-[11px] text-arena-text-muted">{game.mode}</p>
                </div>
                <span
                  className={`rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase ${
                    game.status === "Active"
                      ? "border-emerald-500/40 text-emerald-400"
                      : "border-arena-border text-arena-text-muted"
                  }`}
                >
                  {game.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ─────────────────────────────────────────── */}
      <section className="relative mx-auto max-w-7xl px-4 py-20 sm:px-6 sm:py-28">
        <ScrollReveal>
          <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <p className="font-display text-xs font-semibold uppercase tracking-[0.25em] text-arena-accent">
                Tournament Lifecycle
              </p>
              <h2 className="mt-2 font-display text-3xl font-bold text-arena-text sm:text-4xl">
                THREE STEPS. ZERO ADMIN HELL.
              </h2>
            </div>
            <p className="max-w-sm text-sm text-arena-text-muted">
              From roster creation to finals day — automated, verified, real-time.
            </p>
          </div>
        </ScrollReveal>

        <div className="relative mt-14 grid gap-6 sm:grid-cols-3">
          {/* connector line */}
          <div
            className="absolute left-0 right-0 top-10 hidden h-px bg-gradient-to-r from-transparent via-arena-accent/40 to-transparent sm:block"
            aria-hidden
          />
          {STEPS.map((item, i) => (
            <ScrollReveal key={item.step} delay={i * 0.15}>
              <div className="glass-card hud-corners relative h-full overflow-hidden rounded-2xl p-6 sm:p-8">
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
            </ScrollReveal>
          ))}
        </div>
      </section>

      {/* ── Bento features ───────────────────────────────────────── */}
      <section className="border-t border-arena-border bg-arena-bg-elevated/30 py-20 sm:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <ScrollReveal>
            <div className="max-w-2xl">
              <p className="font-display text-xs font-semibold uppercase tracking-[0.25em] text-arena-accent">
                Platform Features
              </p>
              <h2 className="mt-2 font-display text-3xl font-bold text-arena-text sm:text-4xl">
                BUILT FOR ORGANIZERS <span className="text-arena-accent">&</span> PLAYERS
              </h2>
            </div>
          </ScrollReveal>

          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f, i) => (
              <ScrollReveal key={f.title} delay={i * 0.08} className={f.span}>
                <Spotlight className="h-full rounded-2xl">
                  <div className="glass-card h-full rounded-2xl p-6 sm:p-7">
                    <h3 className="font-display text-lg font-bold text-arena-text">
                      {f.title}
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed text-arena-text-secondary">
                      {f.desc}
                    </p>
                  </div>
                </Spotlight>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ──────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 sm:py-28">
        <ScrollReveal>
          <div className="glass-card relative overflow-hidden rounded-3xl border border-arena-accent/30 p-8 text-center sm:p-14">
            <div className="aurora-field opacity-40" aria-hidden />
            <div className="relative">
              <h2 className="font-display text-3xl font-black uppercase text-arena-text sm:text-5xl">
                READY TO ENTER <span className="headline-shimmer">THE ARENA?</span>
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
        </ScrollReveal>
      </section>
    </div>
  );
}

/* ── sub-components ───────────────────────────────────────────────── */

function MetricCell({
  value,
  prefix = "",
  suffix = "",
  label,
  active,
}: {
  value: number;
  prefix?: string;
  suffix?: string;
  label: string;
  active: boolean;
}) {
  const n = useCountUp(value, 1400, active);
  return (
    <div>
      <p className="font-mono text-2xl font-bold text-arena-text sm:text-3xl">
        {prefix}
        {n}
        {suffix}
      </p>
      <p className="mt-1 text-xs text-arena-text-muted">{label}</p>
    </div>
  );
}

function LiveMatchCard() {
  return (
    <div className="live-ring rounded-2xl border border-arena-border bg-arena-surface/95 p-6 shadow-2xl shadow-black/40 backdrop-blur-md">
      <div className="flex items-center justify-between">
        <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-arena-text-muted">
          Live · Semifinal
        </p>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-red-500/40 bg-red-500/10 px-2.5 py-0.5 text-[10px] font-bold uppercase text-red-400">
          <span className="live-dot" style={{ animationDuration: "1.2s" }} />
          On Air
        </span>
      </div>

      <div className="mt-5 flex items-center justify-between">
        <div className="text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500/30 to-cyan-500/5 font-display text-xl font-black text-arena-accent">
            T1
          </div>
          <p className="mt-2 font-display text-sm font-bold text-arena-text">Team Fusion</p>
        </div>
        <div className="text-center">
          <p className="font-mono text-3xl font-black text-arena-text">
            13<span className="mx-1 text-arena-text-muted">:</span>9
          </p>
          <p className="mt-1 font-mono text-[10px] uppercase tracking-widest text-arena-text-muted">
            Map 3 · 24:18
          </p>
        </div>
        <div className="text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500/30 to-indigo-500/5 font-display text-xl font-black text-indigo-400">
            NX
          </div>
          <p className="mt-2 font-display text-sm font-bold text-arena-text">Nexus Five</p>
        </div>
      </div>

      {/* round win bars */}
      <div className="mt-5 space-y-2">
        {[
          { label: "Map 1", a: 13, b: 7, win: "a" },
          { label: "Map 2", a: 8, b: 13, win: "b" },
          { label: "Map 3", a: 13, b: 9, win: "a" },
        ].map((m) => (
          <div key={m.label} className="flex items-center gap-2 text-[11px]">
            <span className="w-12 font-mono text-arena-text-muted">{m.label}</span>
            <div className="flex h-1.5 flex-1 gap-0.5 overflow-hidden rounded-full">
              <div
                className={`rounded-l-full ${m.win === "a" ? "bg-arena-accent" : "bg-arena-accent/30"}`}
                style={{ width: `${(m.a / (m.a + m.b)) * 100}%` }}
              />
              <div
                className={`rounded-r-full ${m.win === "b" ? "bg-indigo-400" : "bg-indigo-400/30"}`}
                style={{ width: `${(m.b / (m.a + m.b)) * 100}%` }}
              />
            </div>
            <span className="w-8 text-right font-mono text-arena-text-muted">
              {m.a}:{m.b}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ScrollReveal({
  children,
  delay = 0,
  className = "",
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduceMotion ? false : { opacity: 0, y: 28 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.65, delay, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}
