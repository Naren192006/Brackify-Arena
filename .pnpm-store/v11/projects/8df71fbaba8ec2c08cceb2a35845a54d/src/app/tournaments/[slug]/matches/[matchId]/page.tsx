import { MatchPage } from "@/components/matches/MatchPage";

type Props = { params: Promise<{ slug: string; matchId: string }> };

export default async function TournamentMatchPage({ params }: Props) {
  const { slug, matchId } = await params;
  return <MatchPage slug={slug} matchId={matchId} />;
}
