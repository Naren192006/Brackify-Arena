import React from "react";
import Link from "next/link";
import type { Metadata } from "next";


export const metadata: Metadata = {
  title: "Terms of Service | Brackify Arena",
  description: "Terms of service and tournament participation agreements for Brackify Arena.",
};

export default function TermsPage() {
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
            Terms of Service
          </h1>
          <p className="mt-3 text-slate-400 text-sm">
            Last Updated: September 4, 2026 &bull; Effective Date: September 4, 2026
          </p>
        </div>

        {/* Overview Banner */}
        <div className="bg-slate-900/80 border border-cyan-500/20 rounded-xl p-6">
          <p className="text-slate-300 leading-relaxed">
            Welcome to <span className="text-cyan-400 font-semibold">Brackify Arena</span>. By accessing or using our platform, creating an account, or registering for any competitive tournament, you agree to be bound by these Terms of Service. If you do not agree to these terms, please do not use the platform.
          </p>
        </div>

        {/* Sections */}
        <div className="space-y-8 text-slate-300 leading-relaxed">
          <section className="space-y-3">
            <h2 className="text-2xl font-bold text-arena-text flex items-center gap-2">
              <span className="text-cyan-400">1.</span> User Eligibility & Accounts
            </h2>
            <p>
              To participate in tournaments, you must be at least 13 years of age (or have explicit parental/guardian permission if between 13 and 18). You agree to provide accurate, truthful, and up-to-date account details. You are solely responsible for maintaining the confidentiality of your credentials and all activity on your account.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-2xl font-bold text-arena-text flex items-center gap-2">
              <span className="text-cyan-400">2.</span> Tournament Rules & Fair Play
            </h2>
            <p>
              Every tournament hosted on Brackify Arena follows official competitive esports guidelines for the designated game (e.g., Valorant, CS2, Overwatch 2). Players and captains agree to:
            </p>
            <ul className="list-disc pl-6 space-y-1.5 text-slate-300">
              <li>Check in on time before match start deadlines.</li>
              <li>Compete in good faith without cheats, aimbots, wallhacks, or macro automation.</li>
              <li>Upload unaltered, accurate match scoreboard screenshots as evidence.</li>
              <li>Adhere strictly to our <Link href="/conduct" className="text-cyan-400 underline hover:text-cyan-300">Code of Conduct</Link>.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-2xl font-bold text-arena-text flex items-center gap-2">
              <span className="text-cyan-400">3.</span> Entry Fees, Payments & Refunds
            </h2>
            <p>
              Brackify Arena integrates with certified third-party payment gateways (Razorpay). We do not store your raw debit/credit card numbers or UPI PINs.
            </p>
            <ul className="list-disc pl-6 space-y-1.5 text-slate-300">
              <li><strong>Entry Fees:</strong> When registering for paid tournaments, your registration is confirmed once Razorpay verifies the payment order.</li>
              <li><strong>Refund Policy:</strong> Full refunds are issued if a tournament is cancelled by the organizer before matches begin. If a team drops out after the bracket is generated or forfeits a live match, entry fees are non-refundable. Full details: <Link href="/refunds" className="text-cyan-400 underline hover:text-cyan-300">Refund Policy</Link>.</li>
              <li><strong>Prize Distribution:</strong> Tournament prize pools are distributed to winning team captains in accordance with published prize breakdown tables within 7 business days following tournament completion.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-2xl font-bold text-arena-text flex items-center gap-2">
              <span className="text-cyan-400">4.</span> Disputes & Match Resolution
            </h2>
            <p>
              In the event of score disputes, disconnection issues, or rule violations, tournament referees and platform admins retain sole authority to review screenshot evidence, match histories, and chat logs. Admin dispute decisions are final and binding.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-2xl font-bold text-arena-text flex items-center gap-2">
              <span className="text-cyan-400">5.</span> Account Termination & Suspensions
            </h2>
            <p>
              We reserve the right to suspend or permanently ban any account found engaging in fraud, harassment, match fixing, smurfing, toxicity, or terms violations. Banned players forfeit pending tournament registrations and tournament rank points.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-2xl font-bold text-arena-text flex items-center gap-2">
              <span className="text-cyan-400">6.</span> Limitation of Liability
            </h2>
            <p>
              Brackify Arena is provided &ldquo;as is&rdquo; without warranties of any kind. We are not liable for third-party ISP disconnects, game server outages (e.g., Riot Games or Steam service interruptions), or incidental damages resulting from platform use.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-2xl font-bold text-arena-text flex items-center gap-2">
              <span className="text-cyan-400">7.</span> Business Details & Grievance Officer
            </h2>
            <p>
              Brackify Arena is operated by an independent developer based in Telangana, India. For all legal notices, disputes, and grievance redressal (including under the Indian IT Act, 2000 and DPDP Act, 2023):
            </p>
            <ul className="list-disc pl-6 space-y-1.5 text-slate-300">
              <li><strong>Grievance Officer:</strong> Naren Reddy</li>
              <li><strong>Email:</strong> <span className="text-cyan-400">privacy@brackify.gg</span> (grievances) · <span className="text-cyan-400">support@brackify.gg</span> (general support)</li>
              <li><strong>Response time:</strong> within 30 days as required by law; typically much sooner.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-2xl font-bold text-arena-text flex items-center gap-2">
              <span className="text-cyan-400">8.</span> Governing Law
            </h2>
            <p>
              These Terms shall be governed by the laws of India. For any inquiries regarding these terms, please contact our support team at <span className="text-cyan-400">support@brackify.gg</span>.
            </p>
          </section>
        </div>

        {/* Footer Navigation */}
        <div className="pt-8 border-t border-slate-800 flex flex-wrap gap-6 text-sm text-slate-400">
          <Link href="/privacy" className="hover:text-cyan-400 transition">Privacy Policy &rarr;</Link>
          <Link href="/conduct" className="hover:text-cyan-400 transition">Code of Conduct &rarr;</Link>
          <Link href="/tournaments" className="hover:text-cyan-400 transition">Browse Tournaments &rarr;</Link>
        </div>
      </div>
    </div>
  );
}

