"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAdminAuth } from "@/context/AdminAuthContext";

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { admin, isAdminAuthenticated, loading, logout } = useAdminAuth();

  const isLoginPage = pathname === "/admin/login";

  console.log(
    "[AdminShell] Render. Path:",
    pathname,
    "loading:",
    loading,
    "isAdminAuthenticated:",
    isAdminAuthenticated,
    "admin:",
    admin
  );

  // Redirect only after loading finishes and user is not authenticated as admin
  useEffect(() => {
    if (!loading && !isAdminAuthenticated && !isLoginPage) {
      console.log("[AdminShell] Not authenticated and not on login page. Redirecting to /admin/login...");
      router.replace("/admin/login");
    }
  }, [loading, isAdminAuthenticated, isLoginPage, router]);

  // 1. Never guard /admin/login - return children immediately without delay or checks
  if (isLoginPage) {
    return <>{children}</>;
  }

  // 2. Show centered loading spinner while verifying
  if (loading) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center bg-arena-bg">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-arena-accent border-t-transparent" />
          <p className="text-xs uppercase tracking-widest text-arena-muted">Verifying Admin Access…</p>
        </div>
      </div>
    );
  }

  // 3. Access denied fallback if unauthenticated
  if (!isAdminAuthenticated) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center bg-arena-bg p-6">
        <div className="max-w-md rounded-2xl border border-white/10 bg-arena-surface/80 p-8 text-center">
          <p className="text-xs uppercase tracking-widest text-arena-danger">Access Denied</p>
          <h2 className="mt-2 font-display text-2xl font-bold text-white">Admin Access Required</h2>
          <p className="mt-2 text-sm text-arena-muted">
            You must be an authorized platform administrator to access this area.
          </p>
          <button
            onClick={() => {
              if (pathname !== "/admin/login") {
                router.replace("/admin/login");
              }
            }}
            className="btn-primary mt-6 w-full"
          >
            Go to Admin Login
          </button>
        </div>
      </div>
    );
  }

  const links = [
    ["Dashboard", "/admin/dashboard"],
    ["Control Room", "/admin/control-room"],
    ["Analytics", "/admin/analytics"],
    ["Tournaments", "/admin/tournaments"],
    ["Brackets & Matches", "/admin/brackets"],
    ["Registrations", "/admin/registrations"],
    ["Reports", "/admin/reports"],
    ...(admin?.role === "super_admin" ? [["Admin Management", "/admin/users"]] : []),
  ];

  return (
    <div className="min-h-[calc(100vh-4rem)] lg:flex">
      <aside className="border-b border-white/10 bg-arena-surface/40 p-4 lg:min-h-[calc(100vh-4rem)] lg:w-60 lg:border-b-0 lg:border-r">
        <div className="flex items-center justify-between">
          <p className="font-display text-xs uppercase tracking-[0.25em] text-arena-accent font-semibold">
            Admin Portal
          </p>
          {admin?.role && (
            <span
              className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                admin.role === "super_admin"
                  ? "bg-purple-500/20 text-purple-300 border border-purple-500/30"
                  : "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30"
              }`}
            >
              {admin.role === "super_admin" ? "Super Admin" : "Sub Admin"}
            </span>
          )}
        </div>
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
        <header className="border-b border-white/10 px-6 py-3.5 flex items-center justify-between text-xs tracking-wider text-arena-muted">
          <span className="font-medium text-white/80 uppercase">Brackify Arena Operations</span>
          <div className="flex items-center gap-4">
            <span className="hidden sm:flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              <span className="text-arena-muted">{admin?.email ?? "Admin"}</span>
            </span>
            <button
              onClick={async () => {
                await logout();
                if (pathname !== "/admin/login") {
                  router.replace("/admin/login");
                }
              }}
              className="rounded-lg border border-white/10 px-2.5 py-1 text-xs text-arena-muted hover:border-arena-danger/40 hover:text-arena-danger transition-colors"
            >
              Sign Out
            </button>
          </div>
        </header>
        <main className="p-6">{children}</main>
      </div>
    </div>
  );
}
