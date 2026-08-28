import { LiveTournamentCenter } from "@/components/tournaments/LiveTournamentCenter";
export default async function LiveTournamentPage({ params }: { params: Promise<{ slug: string }> }) { return <LiveTournamentCenter slug={(await params).slug} />; }
