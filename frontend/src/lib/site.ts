/** Canonical production origin — single source of truth for SEO, OG images, sitemap. */
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "https://brackify-arena-self.vercel.app";

/** Absolute URL on the site origin. */
export function siteUrl(path: string): string {
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}
