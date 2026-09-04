import { redirect } from "next/navigation";
import { PlayerMatchDetail } from "@/components/matches/PlayerMatchDetail";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Match Arena — Brackify Arena",
  description: "View match details, live opponent countdown, scoreboard, and results.",
};

export default async function MatchDetailPage({
  params,
}: {
  params: Promise<{ matchId: string }>;
}) {
  const { matchId } = await params;
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    redirect(`/login?next=${encodeURIComponent(`/dashboard/matches/${matchId}`)}`);
  }

  return <PlayerMatchDetail matchId={matchId} />;
}

