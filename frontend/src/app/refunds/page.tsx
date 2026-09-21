import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Refund Policy | Brackify Arena",
  description:
    "Refund and cancellation policy for tournament entry fees on Brackify Arena.",
};

const SECTIONS = [
  {
    title: "1. Entry Fees",
    body: [
      "Some tournaments on Brackify Arena charge an entry fee, collected through our payment partner Razorpay. The exact fee, currency, and payment schedule are always displayed on the tournament page before you confirm registration — you will never be charged a fee that was not shown to you first.",
      "Entry fees cover prize pools, platform operations, and fair-play moderation. They are not deposits and do not accrue interest.",
    ],
  },
  {
    title: "2. Full Refunds — Organizer Cancellation",
    body: [
      "If a paid tournament is cancelled by its organizer before the first match begins, every registered team receives a full refund of the entry fee to the original payment method.",
      "Refunds are initiated automatically within 5–7 business days of cancellation. Razorpay typically completes the reversal to your bank or card within an additional 5–7 business days, depending on your bank.",
    ],
  },
  {
    title: "3. Partial Refunds — Tournament Structure Changes",
    body: [
      "If the organizer materially changes a paid tournament after registration (format, capacity, schedule, or prize pool) and the change is announced before your first match, you may request a full refund up to 24 hours before the tournament starts by contacting support.",
      "Cosmetic changes (banner, title spelling, stream setup) do not qualify.",
    ],
  },
  {
    title: "4. No Refunds — Team Withdrawal or Forfeiture",
    body: [
      "If your team drops out after the bracket has been generated, misses check-in, or forfeits a live match, the entry fee is non-refundable. Bracket generation reserves a slot and operational capacity that other teams could have used.",
      "Disqualification for violations of the Fair Play Code of Conduct (cheating, match fixing, toxicity, smurfing) also forfeits the entry fee.",
    ],
  },
  {
    title: "5. Duplicate or Erroneous Payments",
    body: [
      "Charged twice for the same slot, or charged without completing registration? Contact us within 7 days and we will reverse the extra charge in full — no questions asked.",
    ],
  },
  {
    title: "6. How Refunds Are Processed",
    body: [
      "All refunds are returned to the original payment method via Razorpay. We cannot refund to a different card, UPI ID, or bank account than the one used at purchase.",
      "You receive a confirmation email when a refund is initiated. If a refund has not appeared after 14 business days, reply to that email or write to the address below with your payment ID.",
    ],
  },
  {
    title: "7. Contact",
    body: [
      "Refund questions and requests: support@brackify.gg — include your tournament name, team name, and Razorpay payment ID so we can act immediately.",
      "This policy is governed by the laws of India, as set out in our Terms of Service.",
    ],
  },
];

export default function RefundPolicyPage() {
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
            Refund Policy
          </h1>
          <p className="mt-3 text-arena-text-muted text-sm">
            Last Updated: September 21, 2026 &bull; Effective Date: September 21,
            2026
          </p>
        </div>

        <div className="border border-arena-accent/20 bg-arena-surface/80 rounded-xl p-6">
          <p className="text-arena-text-secondary leading-relaxed">
            Plain-English summary:{" "}
            <strong className="text-arena-text">
              tournaments cancelled by organizers are fully refunded
            </strong>
            , fees you paid by mistake are fully refunded, and entry fees are
            only forfeited when a team drops out or is disqualified after the
            bracket locks. When in doubt, email us — we would rather refund
            than argue.
          </p>
        </div>

        <div className="space-y-8 text-arena-text-secondary leading-relaxed">
          {SECTIONS.map((s) => (
            <section key={s.title} className="space-y-3">
              <h2 className="text-2xl font-bold text-arena-text flex items-center gap-2">
                <span className="text-arena-accent">{s.title.split(".")[0]}.</span>
                {s.title.substring(s.title.indexOf(" ") + 1)}
              </h2>
              {s.body.map((p) => (
                <p key={p.slice(0, 32)}>{p}</p>
              ))}
            </section>
          ))}
        </div>

        <div className="flex flex-wrap gap-6 border-t border-arena-border pt-8 text-sm">
          <Link href="/terms" className="text-arena-accent hover:underline">
            &larr; Terms of Service
          </Link>
          <Link href="/privacy" className="text-arena-accent hover:underline">
            Privacy Policy &rarr;
          </Link>
        </div>
      </div>
    </div>
  );
}
