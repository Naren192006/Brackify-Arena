import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Data Deletion Requests | Brackify Arena",
  description:
    "How to request deletion of your Brackify Arena account and personal data.",
};

export default function DataDeletionPage() {
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
            Data Deletion Requests
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
              you can delete your account yourself in under a minute
            </strong>
            , or ask us to do it. Either way, your personal data is gone within
            30 days, with a narrow set of legal exceptions listed below.
          </p>
        </div>

        <div className="space-y-8 text-arena-text-secondary leading-relaxed">
          <section className="space-y-3">
            <h2 className="text-2xl font-bold text-arena-text">
              1. Self-Service Deletion
            </h2>
            <p>
              Sign in, open{" "}
              <Link href="/dashboard" className="text-arena-accent hover:underline">
                your dashboard
              </Link>
              , go to <strong>Settings</strong>, and choose{" "}
              <strong>Delete Account</strong>. Deletion is immediate and
              irreversible: you are signed out on every device and your
              profile, avatar, and notification history are queued for removal.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-2xl font-bold text-arena-text">
              2. Assisted Deletion
            </h2>
            <p>
              Lost access to your account, or want deletion of data beyond your
              profile? Email{" "}
              <a
                href="mailto:privacy@brackify.gg"
                className="text-arena-accent hover:underline"
              >
                privacy@brackify.gg
              </a>{" "}
              from the address on the account (or include proof of ownership).
              We verify and act within 7 days; requests from parents or
              guardians about a child&apos;s account are prioritized.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-2xl font-bold text-arena-text">
              3. What Gets Deleted — and When
            </h2>
            <ul className="list-disc space-y-2 pl-6">
              <li>
                <strong>Immediately:</strong> login credentials, session
                tokens, and pending email notifications.
              </li>
              <li>
                <strong>Within 30 days:</strong> profile details, avatar files,
                notification history, and team memberships where you are not
                the captain.
              </li>
              <li>
                <strong>Anonymized, not deleted:</strong> match results,
                bracket placements, and leaderboard entries. Competitive
                records are retained in de-identified form (random ID, no name,
                no email) so historical tournaments stay fair and verifiable.
              </li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-2xl font-bold text-arena-text">
              4. Legal Exceptions
            </h2>
            <p>
              We must retain minimal records for transactions involving money —
              payment IDs, amounts, and tax-relevant details — for the period
              required by Indian law (currently 8 years for financial
              records). These records are never shared with third parties and
              are not linked to a public profile after deletion.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-2xl font-bold text-arena-text">
              5. Teams and Tournaments
            </h2>
            <p>
              If you are the <strong>captain</strong> of a team, delete the
              team first (Dashboard → My Teams) or transfer captaincy;
              otherwise the team remains with the remaining members. If you are
              registered in a <strong>live tournament</strong>, deletion takes
              effect after your elimination to avoid breaking the bracket for
              other competitors.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-2xl font-bold text-arena-text">6. Contact</h2>
            <p>
              Grievance Officer and Data Protection contact:{" "}
              <a
                href="mailto:privacy@brackify.gg"
                className="text-arena-accent hover:underline"
              >
                privacy@brackify.gg
              </a>
              . See our{" "}
              <Link href="/privacy" className="text-arena-accent hover:underline">
                Privacy Policy
              </Link>{" "}
              for the full picture of what we collect and why.
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
