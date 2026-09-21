import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Cookie Policy | Brackify Arena",
  description:
    "How Brackify Arena uses cookies and similar technologies, and how you can control them.",
};

const COOKIE_TABLE = [
  {
    name: "sb-* (auth tokens)",
    purpose:
      "Keeps you signed in. Supabase auth stores short-lived access tokens and a refresh token in HTTP-only cookies.",
    type: "Strictly necessary",
    expiry: "Minutes to 7 days",
  },
  {
    name: "bfa_access / bfa_refresh",
    purpose:
      "FastAPI session cookies used by tournament APIs (registration, teams, payments).",
    type: "Strictly necessary",
    expiry: "15 min / 7 days",
  },
  {
    name: "csrf_token / admin_csrf",
    purpose:
      "Cross-site request forgery protection for state-changing actions.",
    type: "Strictly necessary",
    expiry: "Session",
  },
  {
    name: "brackify-theme",
    purpose:
      "Remembers whether you chose dark or light mode. Contains no personal data.",
    type: "Preference (localStorage)",
    expiry: "Until cleared",
  },
];

export default function CookiePolicyPage() {
  return (
    <div className="min-h-screen py-16 px-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl space-y-10">
        <div className="border-b border-arena-border pb-8">
          <div className="flex items-center gap-3 text-arena-accent text-sm font-semibold uppercase tracking-wider mb-2">
            <Link href="/" className="hover:text-arena-accent">
              Home
            </Link>
            <span>/</span>
            <span>Legal</span>
          </div>
          <h1 className="font-display text-4xl font-extrabold tracking-tight text-arena-text sm:text-5xl">
            Cookie Policy
          </h1>
          <p className="mt-3 text-arena-text-muted text-sm">
            Last Updated: September 21, 2026 &bull; Effective Date: September
            21, 2026
          </p>
        </div>

        <div className="border border-arena-accent/20 bg-arena-surface/80 rounded-xl p-6">
          <p className="text-arena-text-secondary leading-relaxed">
            Plain-English summary:{" "}
            <strong className="text-arena-text">
              we use only the cookies needed to sign you in and keep the site
              secure, plus one for your theme choice
            </strong>
            . No advertising cookies, no cross-site trackers, no data brokers.
          </p>
        </div>

        <div className="space-y-8 text-arena-text-secondary leading-relaxed">
          <section className="space-y-3">
            <h2 className="text-2xl font-bold text-arena-text">
              1. What Are Cookies?
            </h2>
            <p>
              Cookies are small text files stored by your browser. We also use
              &quot;local storage,&quot; a similar browser feature, for
              non-identifying preferences. This policy covers both.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-2xl font-bold text-arena-text">
              2. Cookies We Use
            </h2>
            <div className="overflow-x-auto rounded-xl border border-arena-border">
              <table className="w-full text-left text-sm">
                <thead className="bg-arena-bg-elevated text-arena-text">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Cookie</th>
                    <th className="px-4 py-3 font-semibold">Purpose</th>
                    <th className="px-4 py-3 font-semibold">Category</th>
                    <th className="px-4 py-3 font-semibold">Lifetime</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-arena-border">
                  {COOKIE_TABLE.map((c) => (
                    <tr key={c.name}>
                      <td className="px-4 py-3 font-mono text-xs text-arena-text">
                        {c.name}
                      </td>
                      <td className="px-4 py-3">{c.purpose}</td>
                      <td className="px-4 py-3">{c.type}</td>
                      <td className="px-4 py-3 whitespace-nowrap">{c.expiry}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-2xl font-bold text-arena-text">
              3. Third-Party Processing
            </h2>
            <p>
              When you pay an entry fee, Razorpay may set cookies on its own
              checkout domain to process the payment securely and detect
              fraud. Those cookies are governed by{" "}
              <a
                href="https://razorpay.com/privacy/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-arena-accent hover:underline"
              >
                Razorpay&apos;s privacy policy
              </a>
              , not this one. We do not embed social media widgets, ad
              networks, or analytics trackers that profile you across other
              sites.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-2xl font-bold text-arena-text">
              4. Your Choices
            </h2>
            <ul className="list-disc space-y-2 pl-6">
              <li>
                <strong>Strictly necessary cookies</strong> cannot be disabled
                — without them there is no way to keep you signed in safely.
              </li>
              <li>
                You can clear or block all cookies in your browser settings at
                any time; the site will simply sign you out and forget your
                theme preference.
              </li>
              <li>
                The cookie banner shown on your first visit lets you accept
                non-essential preferences. Only strictly necessary cookies are
                set before you choose.
              </li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-2xl font-bold text-arena-text">5. Contact</h2>
            <p>
              Questions about this policy: privacy@brackify.gg. See also our{" "}
              <Link href="/privacy" className="text-arena-accent hover:underline">
                Privacy Policy
              </Link>{" "}
              for how personal data is handled.
            </p>
          </section>
        </div>

        <div className="flex flex-wrap gap-6 border-t border-arena-border pt-8 text-sm">
          <Link href="/privacy" className="text-arena-accent hover:underline">
            &larr; Privacy Policy
          </Link>
          <Link href="/terms" className="text-arena-accent hover:underline">
            Terms of Service &rarr;
          </Link>
        </div>
      </div>
    </div>
  );
}
