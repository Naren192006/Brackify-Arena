import React from "react";
import Link from "next/link";
import type { Metadata } from "next";


export const metadata: Metadata = {
  title: "Privacy Policy | Brackify Arena",
  description: "Privacy policy and data protection practices for Brackify Arena users and players.",
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-[#070b14] text-slate-100 py-16 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-10">
        {/* Header */}
        <div className="border-b border-slate-800 pb-8">
          <div className="flex items-center gap-3 text-cyan-400 text-sm font-semibold uppercase tracking-wider mb-2">
            <Link href="/" className="hover:text-cyan-300">Home</Link>
            <span>/</span>
            <span>Legal</span>
          </div>
          <h1 className="text-4xl font-extrabold tracking-tight text-arena-text sm:text-5xl">
            Privacy Policy
          </h1>
          <p className="mt-3 text-slate-400 text-sm">
            Last Updated: September 4, 2026 &bull; Effective Date: September 4, 2026
          </p>
        </div>

        {/* Introduction */}
        <div className="bg-slate-900/80 border border-cyan-500/20 rounded-xl p-6">
          <p className="text-slate-300 leading-relaxed">
            Your privacy is of paramount importance to <span className="text-cyan-400 font-semibold">Brackify Arena</span>. This Privacy Policy outlines what information we collect when you use our platform, how we use and protect that information, and your rights regarding your personal data.
          </p>
        </div>

        {/* Sections */}
        <div className="space-y-8 text-slate-300 leading-relaxed">
          <section className="space-y-3">
            <h2 className="text-2xl font-bold text-arena-text flex items-center gap-2">
              <span className="text-cyan-400">1.</span> Information We Collect
            </h2>
            <ul className="list-disc pl-6 space-y-2 text-slate-300">
              <li><strong>Account Credentials:</strong> Email address, username, password hashes (managed securely with industry-standard bcrypt/Argon2 hashing), and optional gamer avatar.</li>
              <li><strong>Esports & Gameplay Data:</strong> In-game player handles (Riot ID, Steam ID), team affiliations, tournament match histories, win/loss records, and rank points (RP).</li>
              <li><strong>Match Evidence:</strong> Scoreboard screenshots, match reports, and chat logs submitted for tournament verification.</li>
              <li><strong>Payment Records:</strong> Transaction IDs, order numbers, and payment status returned by Razorpay. <em>We never store credit card numbers, CVVs, or bank login credentials.</em></li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-2xl font-bold text-arena-text flex items-center gap-2">
              <span className="text-cyan-400">2.</span> How We Use Your Information
            </h2>
            <p>We use the collected information exclusively to:</p>
            <ul className="list-disc pl-6 space-y-1.5 text-slate-300">
              <li>Manage tournament registrations, bracket generation, and match scheduling.</li>
              <li>Maintain accurate competitive leaderboards, player profiles, and rankings.</li>
              <li>Process tournament entry fees and verify prize disbursements.</li>
              <li>Deliver automated transactional notifications (e.g., match starting in 30 minutes, match results).</li>
              <li>Prevent cheating, multi-accounting, fraud, and terms violations.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-2xl font-bold text-arena-text flex items-center gap-2">
              <span className="text-cyan-400">3.</span> Third-Party Service Providers
            </h2>
            <p>
              We collaborate only with trusted, secure industry partners to power platform functionality:
            </p>
            <ul className="list-disc pl-6 space-y-1.5 text-slate-300">
              <li><strong>Supabase:</strong> Cloud database infrastructure and authentication with strict Row-Level Security (RLS).</li>
              <li><strong>Razorpay:</strong> PCI-DSS certified payment processor handling all card, UPI, and net-banking transactions.</li>
              <li><strong>Discord:</strong> Voice and text tournament match rooms for team communication.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-2xl font-bold text-arena-text flex items-center gap-2">
              <span className="text-cyan-400">4.</span> Data Security & Retention
            </h2>
            <p>
              We apply state-of-the-art security safeguards including HTTPS/TLS 1.3 encryption in transit, PostgreSQL Row-Level Security (RLS) preventing unauthorized cross-user access, and strict CORS domain isolation. We retain tournament histories indefinitely to preserve leaderboard integrity and esports ranking records.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-2xl font-bold text-arena-text flex items-center gap-2">
              <span className="text-cyan-400">5.</span> Your Rights & Account Deletion
            </h2>
            <p>
              You have the right to review the data associated with your profile, update your account information, or request permanent deletion of your account and personal identifiers by contacting us at <span className="text-cyan-400">privacy@brackify.gg</span>.
            </p>
          </section>
        </div>

        {/* Footer Navigation */}
        <div className="pt-8 border-t border-slate-800 flex flex-wrap gap-6 text-sm text-slate-400">
          <Link href="/terms" className="hover:text-cyan-400 transition">&larr; Terms of Service</Link>
          <Link href="/conduct" className="hover:text-cyan-400 transition">Code of Conduct &rarr;</Link>
        </div>
      </div>
    </div>
  );
}

