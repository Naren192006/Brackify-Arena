import { LiveTournamentCenter } from "@/components/tournaments/LiveTournamentCenter";

export default async function LiveTournamentPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <LiveTournamentCenter slug={slug} />;
}
