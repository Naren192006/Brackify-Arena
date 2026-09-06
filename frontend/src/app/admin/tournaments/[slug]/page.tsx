import { AdminTournamentPage } from "@/components/admin/AdminTournamentPage";

export const dynamic = "force-dynamic";

export default async function AdminTournamentRoute({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <AdminTournamentPage slug={slug} />;
}
