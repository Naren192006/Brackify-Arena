import { Metadata } from "next";
import { LeaderboardTable } from "@/components/leaderboard/LeaderboardTable";

export const metadata: Metadata = {
  title: "Leaderboard & Season Standings — Brackify Arena",
  description: "Global, monthly, and Valorant season rankings, competitive win rates, and MVP standings.",
};

export default function LeaderboardPage() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6 space-y-6">
      <div>
        <p className="text-xs uppercase tracking-[0.25em] text-arena-accent font-semibold">
          Competitive Arena
        </p>
        <h1 className="mt-1 font-display text-4xl font-extrabold text-white tracking-tight">
          Global Leaderboard
        </h1>
        <p className="mt-1 text-sm text-arena-muted">
          Official seasonal rankings, competitive win rates, tournament titles, and MVP recognition.
        </p>
      </div>

      <LeaderboardTable />
    </main>
  );
}
