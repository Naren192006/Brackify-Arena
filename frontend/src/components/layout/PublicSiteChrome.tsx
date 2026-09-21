"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AuthenticatedNav } from "@/components/layout/AuthenticatedNav";
import { Footer } from "@/components/layout/Footer";
import { ThemeToggle } from "@/components/ui/ThemeToggle";

export function PublicSiteChrome({ children }: { children: React.ReactNode }) {
  if (usePathname().startsWith("/admin")) return <>{children}</>;
  return (
    <div className="public-site-frame flex min-h-screen flex-col overflow-x-hidden">
      <header className="site-header-glass sticky top-0 z-50">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-3 sm:px-6">
          <Link href="/" className="brand-mark text-base sm:text-xl">
            BRACKIFY <span>ARENA</span>
          </Link>
          <nav className="flex items-center gap-2 sm:gap-4 text-xs sm:text-sm">
            <Link href="/tournaments" className="site-nav-link text-xs sm:text-sm">
              Tournaments
            </Link>
            <ThemeToggle />
            <AuthenticatedNav />
          </nav>
        </div>
      </header>
      <main id="main-content" className="flex-1 w-full min-w-0">{children}</main>
      <Footer />
    </div>
  );
}
