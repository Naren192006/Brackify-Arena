import { Metadata } from "next";
import { PublicInteractiveBracket } from "@/components/brackets/PublicInteractiveBracket";

type Props = {
  params: Promise<{ tournamentId: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { tournamentId } = await params;
  return {
    title: `Tournament Bracket — Brackify Arena`,
    description: `Spectate official tournament bracket live on Brackify Arena.`,
  };
}

export default async function PublicBracketPage({ params }: Props) {
  const { tournamentId } = await params;
  return <PublicInteractiveBracket tournamentId={tournamentId} />;
}

