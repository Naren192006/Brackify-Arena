import { LiveTournamentCenter } from "@/components/tournaments/LiveTournamentCenter";
export default async function SpectatorPage({ params }: { params: Promise<{ slug: string }> }) { return <LiveTournamentCenter slug={(await params).slug} spectator />; }
