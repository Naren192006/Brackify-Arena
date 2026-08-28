"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AuthenticatedNav } from "@/components/layout/AuthenticatedNav";
import { FooterRevolver } from "@/components/layout/FooterRevolver";
import { ThemeToggle } from "@/components/ui/ThemeToggle";

export function PublicSiteChrome({ children }: { children: React.ReactNode }) {
  if (usePathname().startsWith("/admin")) return <>{children}</>;
  return <div className="public-site-frame"><header className="site-header-glass sticky top-0 z-50"><div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6"><Link href="/" className="brand-mark">BRACKIFY <span>ARENA</span></Link><nav className="flex items-center gap-4 text-sm"><Link href="/tournaments" className="site-nav-link">Tournaments</Link><ThemeToggle /><AuthenticatedNav /></nav></div></header><main>{children}</main><FooterRevolver /></div>;
}
