import { TournamentDetail } from "@/components/tournaments/TournamentDetail";

type Props = { params: Promise<{ slug: string }> };

export default async function TournamentDetailPage({ params }: Props) {
  const { slug } = await params;
  return <TournamentDetail slug={slug} />;
}
