import type { Metadata, Viewport } from "next";
import { Inter, Rajdhani } from "next/font/google";
import { ClientProviders } from "@/components/providers/ClientProviders";
import { Plausible } from "@/components/analytics/Plausible";
import { SITE_URL } from "@/lib/site";

import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const rajdhani = Rajdhani({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-rajdhani",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Brackify Arena — Esports Tournaments for Grinders",
    template: "%s | Brackify Arena",
  },
  description:
    "Discover and compete in premium esports tournaments. Clean brackets, live scoring, real prizes — built for players who take the grind seriously.",
  keywords: ["esports tournaments", "bracket", "BGMI", "Valorant", "gaming competition", "esports India"],
  openGraph: {
    type: "website",
    siteName: "Brackify Arena",
    url: SITE_URL,
    title: "Brackify Arena — Esports Tournaments for Grinders",
    description: "Clean brackets, live scoring, real prizes. Compete in tournaments built for grinders.",
    images: [{ url: "/api/og", width: 1200, height: 630, alt: "Brackify Arena" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Brackify Arena — Esports Tournaments for Grinders",
    description: "Clean brackets, live scoring, real prizes. Compete in tournaments built for grinders.",
    images: ["/api/og"],
  },
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }, { url: "/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/icon-192.png" }],
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#060a14" },
    { media: "(prefers-color-scheme: light)", color: "#f8fafc" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${inter.variable} ${rajdhani.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: `(() => { try { const stored = localStorage.getItem("brackify-theme"); const theme = stored || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"); document.documentElement.dataset.theme = theme; } catch {} })()` }} />
      </head>
      <body className="min-h-screen font-body overflow-x-hidden">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-arena-accent focus:px-4 focus:py-2 focus:text-sm focus:font-bold focus:text-black"
        >
          Skip to main content
        </a>
        <ClientProviders>{children}</ClientProviders>
        <Plausible />
      </body>
    </html>
  );
}
