"use client";

export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-xl bg-white/[0.06] border border-arena-border ${className}`}
      aria-hidden="true"
    />
  );
}

export function TournamentCardSkeleton() {
  return (
    <div className="rounded-3xl border border-arena-border bg-white/[0.02] p-6 space-y-4 animate-pulse shadow-lg">
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-4 w-16 rounded-full" />
      </div>
      <Skeleton className="h-7 w-3/4" />
      <Skeleton className="h-4 w-1/2" />
      <div className="pt-4 border-t border-arena-border flex items-center justify-between">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-8 w-28 rounded-xl" />
      </div>
    </div>
  );
}

export function MatchCardSkeleton() {
  return (
    <div className="rounded-2xl border border-arena-border bg-white/[0.03] p-4 space-y-3 animate-pulse shadow-md">
      <div className="flex items-center justify-between">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-3 w-12 rounded-full" />
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Skeleton className="h-6 w-6 rounded-lg" />
            <Skeleton className="h-4 w-24" />
          </div>
          <Skeleton className="h-4 w-6" />
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Skeleton className="h-6 w-6 rounded-lg" />
            <Skeleton className="h-4 w-24" />
          </div>
          <Skeleton className="h-4 w-6" />
        </div>
      </div>
    </div>
  );
}

export function BracketSkeleton() {
  return (
    <div className="flex gap-8 overflow-x-auto pb-6 animate-pulse">
      {[1, 2, 3].map((round) => (
        <div key={round} className="w-72 shrink-0 space-y-4">
          <Skeleton className="h-6 w-32" />
          <div className="space-y-6">
            {[1, 2].map((match) => (
              <MatchCardSkeleton key={match} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function TableSkeleton({ rows = 5, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="w-full space-y-3 animate-pulse">
      <div className="flex gap-4 border-b border-arena-border pb-3">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className="h-4 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-4 py-3">
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} className="h-5 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}

export function StatsGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 animate-pulse">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-2xl border border-arena-border bg-white/[0.02] p-4 space-y-2">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-7 w-24" />
        </div>
      ))}
    </div>
  );
}

