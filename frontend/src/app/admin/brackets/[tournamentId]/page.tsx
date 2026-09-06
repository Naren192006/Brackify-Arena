import { AdminBracketView } from "@/components/admin/brackets/AdminBracketView";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Bracket Control Room — Brackify Arena Admin",
  description: "Manage tournament matches, real-time live scoring, and automatic bracket advancement.",
};

type Props = {
  params: Promise<{ tournamentId: string }>;
};

export default async function AdminTournamentBracketPage({ params }: Props) {
  const { tournamentId } = await params;
  return <AdminBracketView initialTournamentId={tournamentId} />;
}
