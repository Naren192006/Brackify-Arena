import type { MetadataRoute } from "next";

import { SITE_URL } from "@/lib/site";

const STATIC_ROUTES: Array<{ path: string; priority: number; changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"] }> = [
  { path: "", priority: 1, changeFrequency: "daily" },
  { path: "/tournaments", priority: 0.9, changeFrequency: "hourly" },
  { path: "/leaderboard", priority: 0.7, changeFrequency: "daily" },
  { path: "/players", priority: 0.6, changeFrequency: "daily" },
  { path: "/teams", priority: 0.6, changeFrequency: "daily" },
  { path: "/brackets", priority: 0.6, changeFrequency: "daily" },
  { path: "/login", priority: 0.5, changeFrequency: "yearly" },
  { path: "/register", priority: 0.6, changeFrequency: "yearly" },
  { path: "/terms", priority: 0.3, changeFrequency: "yearly" },
  { path: "/privacy", priority: 0.3, changeFrequency: "yearly" },
  { path: "/cookies", priority: 0.2, changeFrequency: "yearly" },
  { path: "/refunds", priority: 0.2, changeFrequency: "yearly" },
  { path: "/conduct", priority: 0.2, changeFrequency: "yearly" },
  { path: "/data-deletion", priority: 0.2, changeFrequency: "yearly" },
];

type TournamentRow = {
  slug: string;
  start_time: string | null;
  updated_at?: string | null;
};

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  let tournaments: MetadataRoute.Sitemap = [];
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey =
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (supabaseUrl && supabaseKey) {
      const res = await fetch(
        `${supabaseUrl}/rest/v1/tournaments?select=slug,start_time,updated_at&status=in.("open","full","ongoing","completed")&order=start_time.desc&limit=500`,
        {
          headers: { apikey: supabaseKey },
          next: { revalidate: 3600 },
        },
      );
      if (res.ok) {
        const rows = (await res.json()) as TournamentRow[];
        tournaments = rows
          .filter((r) => r.slug)
          .map((r) => ({
            url: `${SITE_URL}/tournaments/${r.slug}`,
            lastModified: r.updated_at ? new Date(r.updated_at) : r.start_time ? new Date(r.start_time) : now,
            changeFrequency: "daily" as const,
            priority: 0.8,
          }));
      }
    }
  } catch {
    // Sitemap must never fail the build; tournament URLs are best-effort.
  }

  return [
    ...STATIC_ROUTES.map((r) => ({
      url: `${SITE_URL}${r.path}`,
      lastModified: now,
      changeFrequency: r.changeFrequency,
      priority: r.priority,
    })),
    ...tournaments,
  ];
}
