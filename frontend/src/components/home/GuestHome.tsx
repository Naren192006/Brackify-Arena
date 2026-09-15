"use client";

import Link from "next/link";

export function GuestHome() {
  return (
    <div className="relative overflow-hidden">
      {/* ── Hero Section ─────────────────────────────────────────────── */}
      <section className="relative mx-auto max-w-7xl px-4 pt-16 pb-20 sm:px-6 sm:pt-24 sm:pb-28 lg:pt-32">
        <div className="max-w-4xl">
          <div className="inline-flex items-center gap-2.5 rounded-full border border-arena-accent bg-cyan-950/30 px-3.5 py-1.5 text-xs font-semibold text-arena-accent backdrop-blur-md">
            <span className="live-dot" />
            <span className="tracking-wide uppercase">Open Tournaments Active Now</span>
          </div>

          <h1 className="mt-6 font-display text-4xl font-black uppercase tracking-tight text-arena-text sm:text-6xl lg:text-7xl leading-none">
            THE COMPETITIVE <br />
            <span className="text-arena-accent">ESPORTS ARENA</span>
          </h1>

          <p className="mt-6 max-w-2xl text-base sm:text-lg text-arena-text-secondary leading-relaxed">
            Compete in verified community and professional tournaments. Build your squad, track interactive live brackets, report scores instantly, and climb the leaderboard.
          </p>

          <div className="mt-8 sm:mt-10 flex flex-wrap items-center gap-4">
            <Link href="/tournaments" className="btn-primary px-7 py-3.5 text-sm sm:text-base font-bold shadow-lg shadow-cyan-500/10">
              Browse Tournaments →
            </Link>
            <Link
              href="/register"
              className="btn-secondary px-7 py-3.5 text-sm sm:text-base font-semibold"
            >
              Create Player Account
            </Link>
          </div>

          {/* Quick Metrics */}
          <div className="mt-12 sm:mt-16 grid grid-cols-2 gap-4 sm:grid-cols-4 border-t border-arena-border pt-8 text-left">
            <div>
              <p className="font-display text-2xl sm:text-3xl font-bold text-arena-text font-mono">100%</p>
              <p className="mt-1 text-xs text-arena-text-muted">Automated Brackets</p>
            </div>
            <div>
              <p className="font-display text-2xl sm:text-3xl font-bold text-arena-text font-mono">&lt; 1s</p>
              <p className="mt-1 text-xs text-arena-text-muted">Real-Time Sync</p>
            </div>
            <div>
              <p className="font-display text-2xl sm:text-3xl font-bold text-arena-text font-mono">5v5 / 1v1</p>
              <p className="mt-1 text-xs text-arena-text-muted">Supported Formats</p>
            </div>
            <div>
              <p className="font-display text-2xl sm:text-3xl font-bold text-arena-text font-mono">24/7</p>
              <p className="mt-1 text-xs text-arena-text-muted">Fair-Play Monitoring</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Supported Games Hub ─────────────────────────────────────── */}
      <section className="border-y border-arena-border bg-arena-bg-elevated/50 py-12">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <p className="text-center font-display text-xs font-semibold uppercase tracking-[0.25em] text-arena-text-muted">
            Supported Tournament Titles
          </p>
          <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[
              { name: "VALORANT", mode: "5v5 Competitive", status: "Active" },
              { name: "Counter-Strike 2", mode: "5v5 MR12", status: "Active" },
              { name: "Overwatch 2", mode: "5v5 Push / Hybrid", status: "Active" },
              { name: "Apex Legends", mode: "Trios Arena", status: "Upcoming" },
            ].map((game) => (
              <div
                key={game.name}
                className="glass-card flex flex-col items-center justify-center p-5 text-center transition-all hover:border-cyan-400/40"
              >
                <span className="font-display text-lg sm:text-xl font-bold text-arena-text">
                  {game.name}
                </span>
                <span className="mt-1 text-xs text-arena-text-muted">{game.mode}</span>
                <span className="mt-3 rounded-full border border-arena-accent bg-arena-bg-elevated px-2.5 py-0.5 text-[10px] font-bold text-arena-accent uppercase">
                  {game.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How It Works Section ─────────────────────────────────────── */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-24">
        <div className="text-center">
          <p className="font-display text-xs font-semibold uppercase tracking-[0.25em] text-arena-accent">
            Tournament Lifecycle
          </p>
          <h2 className="mt-2 font-display text-3xl font-bold text-arena-text sm:text-4xl">
            HOW BRACKIFY ARENA WORKS
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-xs sm:text-sm text-arena-text-muted">
            From roster creation to tournament finals — seamless and automated.
          </p>
        </div>

        <div className="mt-12 grid gap-6 sm:grid-cols-3">
          {[
            {
              step: "01",
              title: "Build Your Squad",
              desc: "Create your team roster, customize your team tag, and invite players via username or email.",
            },
            {
              step: "02",
              title: "Register & Check In",
              desc: "Select an open cup, lock your slot, and complete check-in before match start time.",
            },
            {
              step: "03",
              title: "Compete & Advance",
              desc: "View assigned opponents in real-time brackets, report match scores, and climb the ranks.",
            },
          ].map((item) => (
            <div
              key={item.step}
              className="glass-card relative overflow-hidden rounded-2xl p-6 sm:p-8"
            >
              <span className="font-mono text-4xl sm:text-5xl font-extrabold text-white/5 absolute right-4 top-4 select-none">
                {item.step}
              </span>
              <p className="font-mono text-xs font-bold text-arena-accent uppercase tracking-wider">
                Step {item.step}
              </p>
              <h3 className="mt-3 font-display text-xl font-bold text-arena-text">{item.title}</h3>
              <p className="mt-2 text-xs sm:text-sm text-arena-text-secondary leading-relaxed">
                {item.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Features Pillars ─────────────────────────────────────────── */}
      <section className="border-t border-arena-border bg-arena-bg-elevated/30 py-16 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="max-w-2xl">
            <p className="font-display text-xs font-semibold uppercase tracking-[0.25em] text-arena-accent">
              Platform Features
            </p>
            <h2 className="mt-2 font-display text-3xl font-bold text-arena-text sm:text-4xl">
              BUILT FOR TOURNAMENT ORGANIZERS & PLAYERS
            </h2>
          </div>

          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {[
              {
                title: "Live Interactive Brackets",
                desc: "Real-time updates via WebSockets and Supabase realtime. Never refresh to see who advanced.",
              },
              {
                title: "Captain-Verified Reporting",
                desc: "Captain score submission, opponent confirmation, and photo proof uploads for dispute-free tournaments.",
              },
              {
                title: "Fair Play & Anti-Cheat",
                desc: "Trust scores, Fair Play community reports, and assigned admin mediation queues.",
              },
              {
                title: "Instant Check-In Management",
                desc: "Automated countdowns and check-in windows to replace no-show teams before the bracket locks.",
              },
              {
                title: "Team & Roster Controls",
                desc: "Dedicated captain permissions, invite acceptance flows, and safe team deletion.",
              },
              {
                title: "Admin Control Room",
                desc: "Full operator control with match resets, score corrections, manual advances, and audit logs.",
              },
            ].map((f) => (
              <div key={f.title} className="glass-card rounded-2xl p-6">
                <h3 className="font-display text-lg font-bold text-arena-text">{f.title}</h3>
                <p className="mt-2 text-xs sm:text-sm text-arena-text-secondary leading-relaxed">
                  {f.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Bottom Call To Action ────────────────────────────────────── */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-24">
        <div className="glass-card relative overflow-hidden rounded-3xl border border-arena-accent bg-gradient-to-r from-cyan-950/40 via-arena-surface to-blue-950/30 p-8 sm:p-14 text-center">
          <h2 className="font-display text-3xl font-black uppercase text-arena-text sm:text-5xl">
            READY TO JOIN THE ARENA?
          </h2>
          <p className="mx-auto mt-3 max-w-lg text-xs sm:text-sm text-arena-text-secondary">
            Create your player profile, assemble your squad, and sign up for open esports tournaments.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-4">
            <Link href="/register" className="btn-primary px-8 py-3.5 text-sm font-bold">
              Sign Up Now
            </Link>
            <Link href="/tournaments" className="btn-secondary px-8 py-3.5 text-sm font-semibold">
              Browse Open Cups
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
