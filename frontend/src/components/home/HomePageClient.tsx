"use client";

import { useAuth } from "@/hooks/useAuth";
import { AuthenticatedHome } from "@/components/home/AuthenticatedHome";
import { GuestHome } from "@/components/home/GuestHome";

export function HomePageClient() {
  const { user, isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="relative mx-auto max-w-7xl px-4 py-24 sm:px-6 sm:py-32">
        <div className="h-12 w-48 animate-pulse rounded-xl bg-white/5" />
        <div className="mt-6 h-24 w-3/4 animate-pulse rounded-2xl bg-white/5" />
      </div>
    );
  }

  if (isAuthenticated && user) {
    return (
      <AuthenticatedHome
        userId={user.id}
        email={user.email ?? ""}
        metadata={user.user_metadata ?? {}}
      />
    );
  }

  return <GuestHome />;
}

