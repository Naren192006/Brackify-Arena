import type { Metadata } from "next";

import { TournamentDetail } from "@/components/tournaments/TournamentDetail";
import { fetchTournamentSeo } from "@/lib/tournaments/server-seo";
import { siteUrl } from "@/lib/site";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const t = await fetchTournamentSeo(slug);

  if (!t) {
    return { title: "Tournament not found", robots: { index: false, follow: false } };
  }

  const description =
    t.description?.slice(0, 160) ??
    `Compete in ${t.title} on Brackify Arena. ${
      (t.entry_fee_minor ?? 0) > 0 ? "Entry fee applies." : "Free entry."
    }`;

  return {
    title: t.title,
    description,
    alternates: { canonical: siteUrl(`/tournaments/${t.slug}`) },
    openGraph: {
      title: t.title,
      description,
      type: "article",
      url: siteUrl(`/tournaments/${t.slug}`),
    },
    twitter: { card: "summary_large_image", title: t.title, description },
  };
}

function tournamentJsonLd(t: NonNullable<Awaited<ReturnType<typeof fetchTournamentSeo>>>) {
  const feeMinor = t.entry_fee_minor ?? 0;
  return {
    "@context": "https://schema.org",
    "@type": "SportsEvent",
    name: t.title,
    description: t.description ?? undefined,
    url: siteUrl(`/tournaments/${t.slug}`),
    eventStatus:
      t.status === "completed"
        ? "https://schema.org/EventScheduled"
        : t.status === "cancelled"
          ? "https://schema.org/EventCancelled"
          : "https://schema.org/EventScheduled",
    eventAttendanceMode: "https://schema.org/OnlineEventAttendanceMode",
    startDate: t.start_time ?? undefined,
    location: {
      "@type": "VirtualLocation",
      url: siteUrl(`/tournaments/${t.slug}`),
    },
    organizer: {
      "@type": "Organization",
      name: "Brackify Arena",
      url: siteUrl("/"),
    },
    ...(feeMinor > 0
      ? {
          offers: {
            "@type": "Offer",
            price: (feeMinor / 100).toFixed(2),
            priceCurrency: t.entry_fee_currency ?? "INR",
            availability: "https://schema.org/InStock",
            url: siteUrl(`/tournaments/${t.slug}`),
          },
        }
      : {}),
  };
}

export default async function TournamentDetailPage({ params }: Props) {
  const { slug } = await params;
  const t = await fetchTournamentSeo(slug);

  return (
    <>
      {t && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(tournamentJsonLd(t)) }}
        />
      )}
      <TournamentDetail slug={slug} />
    </>
  );
}
