import type { Metadata } from "next";
import { Inter, Rajdhani } from "next/font/google";
import { ClientProviders } from "@/components/providers/ClientProviders";

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
  title: "Brackify Arena",
  description: "Discover and compete in premium esports tournaments.",
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
      </body>
    </html>
  );
}
