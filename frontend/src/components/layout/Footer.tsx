"use client";

import Link from "next/link";

export function Footer() {
  return (
    <footer className="mt-auto border-t border-arena-border bg-arena-bg-elevated/80 text-arena-text-muted backdrop-blur-xl">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:py-16">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4 lg:grid-cols-5">
          {/* Brand Col */}
          <div className="col-span-2 lg:col-span-2">
            <Link href="/" className="brand-mark text-xl font-bold tracking-wider text-arena-text">
              BRACKIFY <span className="text-arena-accent">ARENA</span>
            </Link>
            <p className="mt-3 max-w-sm text-xs sm:text-sm text-arena-text-secondary leading-relaxed">
              The premier platform for competitive esports tournaments, real-time bracket tracking, and verified team rosters.
            </p>
            <div className="mt-5 flex items-center gap-2 text-xs">
              <span className="live-dot" />
              <span className="font-semibold text-arena-text-secondary">Platform Status:</span>
              <Link href="/health" className="text-emerald-400 hover:underline">
                All Systems Operational
              </Link>
            </div>
          </div>

          {/* Tournaments Col */}
          <div>
            <h3 className="font-display text-xs font-bold uppercase tracking-wider text-arena-text">
              Tournaments
            </h3>
            <ul className="mt-3 space-y-2 text-xs sm:text-sm">
              <li>
                <Link href="/tournaments" className="hover:text-arena-accent transition-colors">
                  Browse Tournaments
                </Link>
              </li>
              <li>
                <Link href="/tournaments?status=live" className="hover:text-arena-accent transition-colors">
                  Live Matches
                </Link>
              </li>
              <li>
                <Link href="/tournaments?game=valorant" className="hover:text-arena-accent transition-colors">
                  VALORANT Arena
                </Link>
              </li>
              <li>
                <Link href="/leaderboard" className="hover:text-arena-accent transition-colors">
                  Global Leaderboards
                </Link>
              </li>
            </ul>
          </div>

          {/* Player & Teams Col */}
          <div>
            <h3 className="font-display text-xs font-bold uppercase tracking-wider text-arena-text">
              Player Hub
            </h3>
            <ul className="mt-3 space-y-2 text-xs sm:text-sm">
              <li>
                <Link href="/dashboard" className="hover:text-arena-accent transition-colors">
                  Player Dashboard
                </Link>
              </li>
              <li>
                <Link href="/dashboard#create-team" className="hover:text-arena-accent transition-colors">
                  Manage Rosters
                </Link>
              </li>
              <li>
                <Link href="/conduct" className="hover:text-arena-accent transition-colors">
                  Code of Conduct
                </Link>
              </li>
              <li>
                <Link href="/admin/login" className="hover:text-arena-accent transition-colors">
                  Admin Portal
                </Link>
              </li>
            </ul>
          </div>

          {/* Legal Col */}
          <div>
            <h3 className="font-display text-xs font-bold uppercase tracking-wider text-arena-text">
              Legal & Support
            </h3>
            <ul className="mt-3 space-y-2 text-xs sm:text-sm">
              <li>
                <Link href="/terms" className="hover:text-arena-accent transition-colors">
                  Terms of Service
                </Link>
              </li>
              <li>
                <Link href="/privacy" className="hover:text-arena-accent transition-colors">
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link href="/health" className="hover:text-arena-accent transition-colors">
                  System Health
                </Link>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-arena-border pt-6 sm:flex-row text-xs">
          <p>© {new Date().getFullYear()} Brackify Arena. Built for competitive players.</p>
          <div className="flex items-center gap-4 text-arena-text-secondary">
            <span>Powered by Next.js & FastAPI</span>
            <span>•</span>
            <span className="text-arena-accent font-semibold">Brackify v2.0</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
