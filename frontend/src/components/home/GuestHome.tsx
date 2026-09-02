import Link from "next/link";

export function GuestHome() {
  return (
    <div className="relative overflow-hidden">
      <section className="relative mx-auto max-w-7xl px-4 py-24 sm:px-6 sm:py-32">
        <div className="max-w-3xl">
          <p className="mb-4 font-display text-sm font-semibold uppercase tracking-[0.3em] text-arena-accent">
            Esports Platform
          </p>
          <h1 className="font-display text-5xl font-bold leading-tight sm:text-7xl">
            COMPETE AT THE
            <br />
            <span className="text-arena-accent">HIGHEST LEVEL</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg text-arena-muted">
            Discover premium tournaments, build your squad, and battle for glory. Starting with
            VALORANT — more games coming soon.
          </p>
          <div className="mt-10 flex flex-wrap gap-4">
            <Link href="/tournaments" className="btn-primary">
              Browse Tournaments
            </Link>
            <Link
              href="/register"
              className="inline-flex items-center rounded-lg border border-white/10 px-6 py-3 font-semibold transition-colors hover:border-arena-accent/50 hover:text-arena-accent"
            >
              Create Account
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 pb-24 sm:px-6">
        <div className="grid gap-6 sm:grid-cols-3">
          {[
            { title: "Team Up", desc: "Create squads, invite players, register together." },
            { title: "Secure Entry", desc: "Verified payments and fair slot allocation." },
            { title: "Live Brackets", desc: "Track matches and climb the leaderboard." },
          ].map((item) => (
            <article key={item.title} className="glass-card rounded-xl p-6 transition-transform hover:-translate-y-1">
              <h2 className="font-display text-xl font-semibold text-arena-accent">{item.title}</h2>
              <p className="mt-2 text-arena-muted">{item.desc}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

