import type { Metadata } from "next";

import { siteUrl } from "@/lib/site";

export const metadata: Metadata = {
  title: "Tournaments",
  description:
    "Browse open, ongoing, and completed esports tournaments on Brackify Arena. Register your team, check in, and climb the bracket.",
  alternates: { canonical: siteUrl("/tournaments") },
  openGraph: { title: "Tournaments | Brackify Arena", url: siteUrl("/tournaments") },
};

export default function TournamentsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
