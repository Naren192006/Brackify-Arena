import { SpectatorCenter } from "@/components/tournaments/SpectatorCenter";

export default async function SpectatorPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <SpectatorCenter slug={slug} />;
}
