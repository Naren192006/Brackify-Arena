import Link from "next/link";
import { getPlayerLeaderboard } from "@/lib/community/data";
import type { RankingRow } from "@/types/community";

export default async function LeaderboardPage() {
  let rows: RankingRow[] = [];
  let unavailable = false;
  try { rows = await getPlayerLeaderboard(); } catch (error) { unavailable = true; console.error("[leaderboard] failed to load", error); }
  return <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6"><p className="text-sm uppercase tracking-[0.25em] text-arena-accent">Compete</p><h1 className="mt-2 font-display text-4xl font-bold text-white">Leaderboard</h1><p className="mt-2 text-arena-muted">Season rankings and competitive form.</p><section className="glass-card mt-8 overflow-hidden rounded-2xl"><div className="grid grid-cols-[4rem_1fr_5rem_5rem_5rem] gap-3 border-b border-white/10 p-4 text-xs uppercase tracking-wider text-arena-muted"><span>#</span><span>Player</span><span>RP</span><span>Wins</span><span>Titles</span></div>{unavailable ? <p className="p-8 text-center text-sm text-arena-danger">Rankings are temporarily unavailable. Please try again later.</p> : rows.length ? rows.map((row) => <div className="grid grid-cols-[4rem_1fr_5rem_5rem_5rem] gap-3 border-b border-white/5 p-4 text-sm text-white last:border-0" key={row.id}><span className="text-arena-muted">{row.rank}{row.movement ? <small className={row.movement > 0 ? "ml-1 text-emerald-300" : "ml-1 text-red-300"}>{row.movement > 0 ? `+${row.movement}` : row.movement}</small> : null}</span><Link href={`/players/${row.subtitle}`} className="font-semibold hover:text-arena-accent">{row.name}<span className="ml-2 text-xs text-arena-muted">@{row.subtitle}</span></Link><span className="text-arena-accent">{row.ranking_points}</span><span>{row.wins}</span><span>{row.championships}</span></div>) : <p className="p-8 text-center text-sm text-arena-muted">Rankings will appear after the first scored matches.</p>}</section></main>;
}
