"use client";

import { useQuery } from "@tanstack/react-query";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { supabase } from "@/lib/supabase/client";

type MatchRow = {
  id: string;
  team_a_id: string | null;
  team_b_id: string | null;
  winner_team_id: string | null;
  completed_at: string | null;
};

type Props = { userId: string; teamIds: string[] };

async function fetchCompletedMatches(teamIds: string[]): Promise<MatchRow[]> {
  if (!teamIds.length) return [];
  const idList = teamIds.join(",");
  const { data, error } = await supabase
    .from("matches")
    .select("id,team_a_id,team_b_id,winner_team_id,completed_at")
    .or(`team_a_id.in.(${idList}),team_b_id.in.(${idList})`)
    .eq("status", "completed")
    .order("completed_at", { ascending: true })
    .limit(60);
  if (error) throw error;
  return (data ?? []) as MatchRow[];
}

export function PlayerPerformance({ userId, teamIds }: Props) {
  const matchesQuery = useQuery({
    queryKey: ["player-performance", userId, teamIds.join(",")],
    queryFn: () => fetchCompletedMatches(teamIds),
    enabled: teamIds.length > 0,
  });

  const matches = matchesQuery.data ?? [];
  const played = matches.length;
  const wins = matches.filter((m) => m.winner_team_id && teamIds.includes(m.winner_team_id)).length;
  const winRate = played > 0 ? Math.round((wins / played) * 100) : null;

  let cumulative = 0;
  const series = matches.map((m, i) => {
    const won = Boolean(m.winner_team_id && teamIds.includes(m.winner_team_id));
    cumulative += won ? 1 : 0;
    return {
      idx: i + 1,
      wins: cumulative,
      label: m.completed_at
        ? new Date(m.completed_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })
        : `Match ${i + 1}`,
    };
  });

  if (teamIds.length === 0) return null;

  return (
    <section className="rounded-2xl border border-arena-border bg-arena-surface/80 p-4 shadow-2xl shadow-black/10 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-arena-accent">Performance</p>
          <h3 className="mt-1 font-display text-xl font-semibold text-arena-text sm:text-2xl">Match record</h3>
        </div>
        <div className="flex items-baseline gap-1.5 rounded-xl border border-arena-border bg-white/[0.04] px-4 py-2">
          <span className="font-display text-2xl font-bold text-arena-text">{winRate ?? "—"}</span>
          <span className="text-xs text-arena-muted">% wins</span>
        </div>
      </div>

      {matchesQuery.isPending ? (
        <div className="mt-4 h-36 animate-pulse rounded-xl bg-arena-bg-elevated" />
      ) : played === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-arena-border p-4 text-center text-xs text-arena-muted">
          No completed matches yet — your win curve starts with your first bracket.
        </p>
      ) : (
        <div className="mt-4 h-36 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={series} margin={{ top: 4, right: 8, bottom: 0, left: -22 }}>
              <defs>
                <linearGradient id="winFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.45} />
                  <stop offset="100%" stopColor="#22d3ee" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="rgba(148,163,184,0.15)" vertical={false} />
              <XAxis dataKey="idx" tick={{ fontSize: 10, fill: "#64748b" }} tickLine={false} axisLine={false} />
              <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: "#64748b" }} tickLine={false} axisLine={false} />
              <Tooltip
                cursor={{ stroke: "rgba(34,211,238,0.35)" }}
                contentStyle={{
                  background: "rgba(6,10,20,0.92)",
                  border: "1px solid rgba(148,163,184,0.25)",
                  borderRadius: 12,
                  fontSize: 12,
                  color: "#e2e8f0",
                }}
                labelFormatter={(_, payload) => payload?.[0]?.payload?.label ?? ""}
                formatter={(value) => [String(value), "Cumulative wins"]}
              />
              <Area type="monotone" dataKey="wins" stroke="#22d3ee" strokeWidth={2.5} fill="url(#winFill)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
      {played > 0 && (
        <p className="mt-2 text-xs text-arena-muted">
          {wins}W · {played - wins}L across your last {played} matches
        </p>
      )}
    </section>
  );
}
