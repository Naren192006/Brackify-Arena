import { AdminBracketView } from "@/components/admin/brackets/AdminBracketView";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Bracket & Match Operations — Brackify Arena Admin",
  description: "Manage tournament brackets, match progressions, live scoring, and winner advancement.",
};

export default function AdminBracketsPage() {
  return <AdminBracketView />;
}
