"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname === "/admin/login") return <>{children}</>;
  const links = [["Dashboard", "/admin/dashboard"], ["Tournaments", "/admin/tournaments"], ["Registrations", "/admin/registrations"], ["Brackets & Matches", "/admin/tournaments"], ["Reports", "/admin/reports"], ["Analytics", "/admin/dashboard"], ["Admin Management", "/admin/users"], ["Settings", "/admin/dashboard"]];
  return <div className="min-h-[calc(100vh-4rem)] lg:flex"><aside className="border-b border-white/10 bg-arena-surface/40 p-4 lg:min-h-[calc(100vh-4rem)] lg:w-60 lg:border-b-0 lg:border-r"><p className="font-display text-xs uppercase tracking-[0.25em] text-arena-accent">Admin portal</p><nav className="mt-4 flex flex-wrap gap-2 lg:block lg:space-y-1">{links.map(([label, href]) => <Link key={label} href={href} className="inline-block rounded-lg px-3 py-2 text-sm text-arena-muted hover:bg-white/5 hover:text-white lg:block">{label}</Link>)}<Link href="/admin/tournaments" className="inline-block rounded-lg border border-cyan-400/20 bg-cyan-400/10 px-3 py-2 text-sm text-arena-accent hover:bg-cyan-400/15 lg:mt-3 lg:block">Control Room</Link></nav></aside><div className="min-w-0 flex-1"><header className="border-b border-white/10 px-4 py-3 text-right text-xs uppercase tracking-wider text-arena-muted sm:px-6">Brackify Arena control center</header>{children}</div></div>;
}
