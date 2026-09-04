import dynamic from "next/dynamic";
import { BracketSkeleton } from "@/components/ui/SkeletonLoader";

const BracketPage = dynamic(
  () => import("@/components/brackets/BracketPage").then((mod) => mod.BracketPage),
  {
    loading: () => (
      <main className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
        <BracketSkeleton />
      </main>
    ),
  }
);

type Props = { params: Promise<{ slug: string }> };

export default async function TournamentBracketPage({ params }: Props) {
  const { slug } = await params;
  return <BracketPage slug={slug} />;
}
