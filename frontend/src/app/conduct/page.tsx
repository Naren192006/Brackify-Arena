import React from "react";
import Link from "next/link";
import type { Metadata } from "next";


export const metadata: Metadata = {
  title: "Code of Conduct & Fair Play | Brackify Arena",
  description: "Fair play rules, sportsmanship guidelines, and anti-cheat policies on Brackify Arena.",
};

export default function ConductPage() {
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
          <h1 className="text-4xl font-extrabold tracking-tight text-white sm:text-5xl">
            Fair Play &amp; Code of Conduct
          </h1>
          <p className="mt-3 text-slate-400 text-sm">
            Last Updated: September 4, 2026 &bull; Enforced Across All Tournaments
          </p>
        </div>

        {/* Core Philosophy Banner */}
        <div className="bg-slate-900/80 border border-cyan-500/20 rounded-xl p-6">
          <p className="text-slate-300 leading-relaxed">
            Competitive integrity is the foundation of <span className="text-cyan-400 font-semibold">Brackify Arena</span>. Every player, team captain, referee, and organizer is expected to uphold the highest standards of sportsmanship, respect, and fair play.
          </p>
        </div>

        {/* Pillars */}
        <div className="space-y-8 text-slate-300 leading-relaxed">
          <section className="space-y-3">
            <h2 className="text-2xl font-bold text-white flex items-center gap-2">
              <span className="text-cyan-400">1.</span> Mutual Respect &amp; Sportsmanship
            </h2>
            <p>
              Esports competition is intense, but hostility will never be tolerated. The following behaviors result in immediate action:
            </p>
            <ul className="list-disc pl-6 space-y-1.5 text-slate-300">
              <li>Harassment, stalking, or personal threats directed at opponents or referees.</li>
              <li>Hate speech, racism, sexism, homophobia, or discrimination in chat lobbies or Discord channels.</li>
              <li>Excessive toxicity, griefing, or malicious unpausing during technical timeouts.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-2xl font-bold text-white flex items-center gap-2">
              <span className="text-cyan-400">2.</span> Anti-Cheat &amp; Exploits
            </h2>
            <p>
              We maintain a <strong>zero-tolerance policy</strong> toward unfair competitive advantages:
            </p>
            <ul className="list-disc pl-6 space-y-1.5 text-slate-300">
              <li><strong>Third-Party Software:</strong> Use of aimbots, wallhacks, triggerbots, ESP, recoil scripts, or memory injectors is prohibited.</li>
              <li><strong>Smurfing &amp; Ringers:</strong> Players must compete using their registered, authentic accounts. Ringers (substituting unapproved high-ranked players) will forfeit the entire team.</li>
              <li><strong>Bug Exploitation:</strong> Abusing known game engine glitches, map exploits, or unintended geometry is strictly prohibited.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-2xl font-bold text-white flex items-center gap-2">
              <span className="text-cyan-400">3.</span> Match Evidence &amp; Result Integrity
            </h2>
            <p>
              Captains are required to upload legitimate end-of-game scoreboard screenshots to the match center upon game conclusion.
            </p>
            <ul className="list-disc pl-6 space-y-1.5 text-slate-300">
              <li>Falsifying scores or editing screenshots using photo manipulation tools is an automatic permanent ban offense.</li>
              <li>Both teams must verify the submitted score. False disputes to waste referee time will incur penalty deductions.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-2xl font-bold text-white flex items-center gap-2">
              <span className="text-cyan-400">4.</span> Disciplinary Consequences
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
              <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
                <div className="text-yellow-400 font-bold text-sm uppercase">Level 1: Warning</div>
                <p className="text-xs text-slate-400 mt-2">Minor chat infractions, tardiness, or unverified score delay.</p>
              </div>
              <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
                <div className="text-orange-400 font-bold text-sm uppercase">Level 2: Forfeit</div>
                <p className="text-xs text-slate-400 mt-2">No-show, ringer substitution, or match disconnect without reconnect.</p>
              </div>
              <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
                <div className="text-rose-500 font-bold text-sm uppercase">Level 3: Permanent Ban</div>
                <p className="text-xs text-slate-400 mt-2">Confirmed cheating, fraud, fake evidence, or hate speech.</p>
              </div>
            </div>
          </section>
        </div>

        {/* Footer Navigation */}
        <div className="pt-8 border-t border-slate-800 flex flex-wrap gap-6 text-sm text-slate-400">
          <Link href="/terms" className="hover:text-cyan-400 transition">&larr; Terms of Service</Link>
          <Link href="/privacy" className="hover:text-cyan-400 transition">Privacy Policy &rarr;</Link>
          <Link href="/tournaments" className="hover:text-cyan-400 transition">Find Tournaments &rarr;</Link>
        </div>
      </div>
    </div>
  );
}

