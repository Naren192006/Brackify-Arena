"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname === "/admin/login") return <>{children}</>;

  const links = [
    ["Dashboard", "/admin/dashboard"],
    ["Control Room", "/admin/control-room"],
    ["Analytics", "/admin/analytics"],
    ["Tournaments", "/admin/tournaments"],
    ["Brackets & Matches", "/admin/brackets"],
    ["Registrations", "/admin/registrations"],
    ["Reports", "/admin/reports"],
    ["Admin Management", "/admin/users"],
  ];

  return (
    <div className="min-h-[calc(100vh-4rem)] lg:flex">
      <aside className="border-b border-white/10 bg-arena-surface/40 p-4 lg:min-h-[calc(100vh-4rem)] lg:w-60 lg:border-b-0 lg:border-r">
        <p className="font-display text-xs uppercase tracking-[0.25em] text-arena-accent font-semibold">
          Admin Portal
        </p>
        <nav className="mt-4 flex flex-wrap gap-1.5 lg:block lg:space-y-1">
          {links.map(([label, href]) => {
            const isActive = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link
                key={label}
                href={href}
                className={`inline-block rounded-xl px-3 py-2 text-sm font-medium transition-colors lg:block ${
                  isActive
                    ? "bg-cyan-400/15 text-arena-accent font-semibold border border-cyan-400/20"
                    : "text-arena-muted hover:bg-white/5 hover:text-white"
                }`}
              >
                {label}
              </Link>
            );
          })}
        </nav>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="border-b border-white/10 px-6 py-3.5 flex items-center justify-between text-xs uppercase tracking-wider text-arena-muted">
          <span className="font-medium text-white/80">Brackify Arena Operations</span>
          <span className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            System Live
          </span>
        </header>
        <main className="p-6">{children}</main>
      </div>
    </div>
  );
}
