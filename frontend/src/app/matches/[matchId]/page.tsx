import { Metadata } from "next";
import { PlayerMatchCenter } from "@/components/matches/PlayerMatchCenter";

type Props = {
  params: Promise<{ matchId: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { matchId } = await params;
  return {
    title: `Match Center — Brackify Arena`,
    description: `Match center and live match execution for Brackify Arena tournaments.`,
  };
}

export default async function MatchCenterPage({ params }: Props) {
  const { matchId } = await params;
  return <PlayerMatchCenter matchId={matchId} />;
}

